/**
 * License Seat Management Handler
 * Handles seat allocation/deallocation with strict organization isolation
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, badRequest, corsOptions, unauthorized } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logger.js';
import { parseEventBody } from '../../lib/request-parser.js';

interface ManageSeatsRequest {
  action: 'list' | 'allocate' | 'deallocate' | 'cleanup';
  licenseKey?: string;
  userId?: string;
  seatId?: string;
}

function getOriginFromEvent(event: AuthorizedEvent): string {
  const headers = event.headers || {};
  return headers['origin'] || headers['Origin'] || '*';
}

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  const origin = getOriginFromEvent(event);
  const httpMethod = event.httpMethod || event.requestContext?.http?.method;
  
  if (httpMethod === 'OPTIONS') {
    return corsOptions(origin);
  }

  let organizationId: string;
  let userId: string;
  let userRoles: string[] = [];

  try {
    const user = getUserFromEvent(event);
    userId = user.sub || user.id || 'unknown';
    organizationId = getOrganizationIdWithImpersonation(event, user);
    
    // Parse roles from user claims
    const rolesStr = user['custom:roles'] || user.roles || '[]';
    try {
      userRoles = typeof rolesStr === 'string' ? JSON.parse(rolesStr) : rolesStr;
    } catch {
      userRoles = [];
    }
  } catch (authError: any) {
    logger.error('Authentication error', authError);
    return error('Authentication failed. Please login again.', 401, undefined, origin);
  }
  
  // Check admin permission
  const isAdmin = userRoles.includes('admin') || userRoles.includes('org_admin') || userRoles.includes('super_admin');
  if (!isAdmin) {
    logger.warn('Unauthorized seat management attempt', { userId, userRoles });
    return unauthorized('Admin permission required for seat management', origin);
  }
  
  try {
    const body = parseEventBody<ManageSeatsRequest>(event, {} as ManageSeatsRequest, 'manage-seats');
    
    if (!body.action) {
      return badRequest('Missing required field: action', undefined, origin);
    }
    
    logger.info('Seat management started', { 
      action: body.action,
      organizationId,
      userId,
      requestId: context.awsRequestId 
    });
    
    const prisma = getPrismaClient();
    let result: any;
    
    switch (body.action) {
      case 'list': {
        // List all seats for the organization's licenses
        const licenses = await prisma.license.findMany({
          where: {
            organization_id: organizationId,
            is_active: true,
            product_type: {
              contains: 'evo',
              mode: 'insensitive'
            }
          },
          include: {
            seat_assignments: {
              include: {
                // We need to join with profiles to get user info
              }
            }
          }
        });

        // Get all profiles for the organization to enrich seat data
        const profiles = await prisma.profile.findMany({
          where: { organization_id: organizationId }
        });

        const profileMap = new Map(profiles.map((p: any) => [p.user_id, p]));
        
        // Get super admin user IDs - they don't count towards seat usage
        const superAdminUserIds = new Set(
          profiles
            .filter((p: any) => p.role === 'super_admin' || p.role === 'SUPER_ADMIN')
            .map((p: any) => p.user_id)
        );

        // Build response with enriched seat data
        const licensesWithSeats = licenses.map((license: any) => {
          // Filter out super admins from seat count
          const nonSuperAdminSeats = license.seat_assignments.filter(
            (s: any) => !superAdminUserIds.has(s.user_id)
          );
          
          return {
            id: license.id,
            license_key: license.license_key,
            product_type: license.product_type,
            max_users: license.max_users,
            used_seats: nonSuperAdminSeats.length,
            available_seats: license.max_users - nonSuperAdminSeats.length,
            is_trial: license.is_trial,
            valid_until: license.valid_until,
            seats: license.seat_assignments.map((seat: any) => {
              const profile = profileMap.get(seat.user_id);
              const isSuperAdmin = superAdminUserIds.has(seat.user_id);
              return {
                id: seat.id,
                user_id: seat.user_id,
                user_name: profile?.full_name || 'Unknown User',
                user_role: profile?.role || 'unknown',
                assigned_at: seat.assigned_at,
                assigned_by: seat.assigned_by,
                // Flag if user doesn't have a profile (orphan seat)
                is_orphan: !profile,
                // Flag if super admin (doesn't count towards seat usage)
                is_super_admin: isSuperAdmin
              };
            })
          };
        });

        // Get users without seats (available for allocation) - exclude super admins
        const usersWithSeats = new Set(
          licenses.flatMap((l: any) => l.seat_assignments.map((s: any) => s.user_id))
        );
        
        const usersWithoutSeats = profiles
          .filter((p: any) => !usersWithSeats.has(p.user_id) && p.role !== 'super_admin' && p.role !== 'SUPER_ADMIN')
          .map((p: any) => ({
            user_id: p.user_id,
            full_name: p.full_name,
            role: p.role
          }));

        // Calculate totals excluding super admins
        const totalSeatsUsed = licenses.reduce((sum: number, l: any) => {
          const nonSuperAdminCount = l.seat_assignments.filter(
            (s: any) => !superAdminUserIds.has(s.user_id)
          ).length;
          return sum + nonSuperAdminCount;
        }, 0);

        result = {
          licenses: licensesWithSeats,
          users_without_seats: usersWithoutSeats,
          total_users: profiles.length,
          total_super_admins: superAdminUserIds.size,
          total_seats_used: totalSeatsUsed,
          total_seats_available: licenses.reduce((sum: number, l: any) => {
            const nonSuperAdminCount = l.seat_assignments.filter(
              (s: any) => !superAdminUserIds.has(s.user_id)
            ).length;
            return sum + (l.max_users - nonSuperAdminCount);
          }, 0)
        };

        logger.info('Seat list retrieved', { 
          organizationId,
          licensesCount: licenses.length,
          totalSeatsUsed: result.total_seats_used,
          superAdminsExcluded: superAdminUserIds.size
        });

        break;
      }

      case 'allocate': {
        if (!body.licenseKey || !body.userId) {
          return badRequest('Missing required fields: licenseKey and userId for allocate action', undefined, origin);
        }
        
        // 1. Verify license belongs to organization
        const license = await prisma.license.findFirst({
          where: {
            license_key: body.licenseKey,
            organization_id: organizationId
          }
        });
        
        if (!license) {
          return badRequest('License not found or does not belong to your organization', undefined, origin);
        }
        
        // 2. Verify user belongs to organization
        const userProfile = await prisma.profile.findFirst({
          where: {
            user_id: body.userId,
            organization_id: organizationId
          }
        });
        
        if (!userProfile) {
          return badRequest('User not found or does not belong to your organization', undefined, origin);
        }
        
        // 2.5. Super admins don't need seat allocation - they have unlimited access
        if (userProfile.role === 'super_admin' || userProfile.role === 'SUPER_ADMIN') {
          logger.info('Super admin does not need seat allocation', { userId: body.userId });
          return success({ 
            message: 'Super admins have unlimited access and do not require seat allocation',
            is_super_admin: true 
          }, 200, origin);
        }
        
        // 3. Check if user already has a seat for this license
        const existingSeat = await prisma.licenseSeatAssignment.findFirst({
          where: {
            license_id: license.id,
            user_id: body.userId
          }
        });
        
        if (existingSeat) {
          return badRequest('User already has a seat assigned for this license', undefined, origin);
        }
        
        // 4. Check available seats (excluding super admins from count)
        const allSeats = await prisma.licenseSeatAssignment.findMany({
          where: { license_id: license.id },
          select: { user_id: true }
        });
        
        // Get super admin user IDs for this organization
        const orgSuperAdmins = await prisma.profile.findMany({
          where: {
            organization_id: organizationId,
            role: { in: ['super_admin', 'SUPER_ADMIN'] }
          },
          select: { user_id: true }
        });
        const superAdminIds = new Set(orgSuperAdmins.map((p: any) => p.user_id));
        
        const currentSeats = allSeats.filter((s: any) => !superAdminIds.has(s.user_id)).length;
        
        if (currentSeats >= (license.max_users ?? 0)) {
          return badRequest('No available seats. All seats are allocated.', undefined, origin);
        }
        
        // 5. Allocate seat
        result = await prisma.licenseSeatAssignment.create({
          data: {
            license_id: license.id,
            user_id: body.userId,
            assigned_at: new Date(),
            assigned_by: userId
          }
        });
        
        // 6. Update license seat counts (excluding super admins)
        await prisma.license.update({
          where: { id: license.id },
          data: {
            used_seats: currentSeats + 1,
            available_seats: (license.max_users ?? 0) - (currentSeats + 1)
          }
        });
        
        logger.info('Seat allocated successfully', { 
          licenseId: license.id,
          userId: body.userId,
          seatId: result.id
        });
        
        break;
      }
      
      case 'deallocate': {
        if (!body.seatId) {
          return badRequest('Missing required field: seatId for deallocate action', undefined, origin);
        }
        
        // 1. Find seat assignment and verify it belongs to organization's license
        const seatAssignment = await prisma.licenseSeatAssignment.findFirst({
          where: { id: body.seatId },
          include: {
            license: {
              select: {
                id: true,
                organization_id: true,
                max_users: true
              }
            }
          }
        });
        
        if (!seatAssignment) {
          return badRequest('Seat assignment not found', undefined, origin);
        }
        
        if (seatAssignment.license.organization_id !== organizationId) {
          return unauthorized('Seat assignment does not belong to your organization', origin);
        }
        
        // 2. Delete seat assignment
        await prisma.licenseSeatAssignment.delete({
          where: { id: body.seatId }
        });
        
        // 3. Update license seat counts (excluding super admins)
        const remainingAssignments = await prisma.licenseSeatAssignment.findMany({
          where: { license_id: seatAssignment.license.id },
          select: { user_id: true }
        });
        
        // Get super admin user IDs for this organization
        const orgSuperAdminsForDealloc = await prisma.profile.findMany({
          where: {
            organization_id: seatAssignment.license.organization_id,
            role: { in: ['super_admin', 'SUPER_ADMIN'] }
          },
          select: { user_id: true }
        });
        const superAdminIdsForDealloc = new Set(orgSuperAdminsForDealloc.map((p: any) => p.user_id));
        
        const nonSuperAdminRemaining = remainingAssignments.filter(
          (s: any) => !superAdminIdsForDealloc.has(s.user_id)
        ).length;
        
        await prisma.license.update({
          where: { id: seatAssignment.license.id },
          data: {
            used_seats: nonSuperAdminRemaining,
            available_seats: (seatAssignment.license.max_users ?? 0) - nonSuperAdminRemaining
          }
        });
        
        result = { success: true, deallocated: true };
        
        logger.info('Seat deallocated successfully', { 
          seatId: body.seatId,
          licenseId: seatAssignment.license.id
        });
        
        break;
      }
      
      case 'cleanup': {
        // Remove seat assignments for users not in the organization
        if (!body.licenseKey) {
          return badRequest('Missing required field: licenseKey for cleanup action', undefined, origin);
        }
        
        // 1. Get license
        const license = await prisma.license.findFirst({
          where: {
            license_key: body.licenseKey,
            organization_id: organizationId
          }
        });
        
        if (!license) {
          return badRequest('License not found or does not belong to your organization', undefined, origin);
        }
        
        // 2. Find seat assignments for users not in the organization
        const invalidSeats = await prisma.licenseSeatAssignment.findMany({
          where: {
            license_id: license.id,
            user_id: {
              notIn: await prisma.profile.findMany({
                where: { organization_id: organizationId },
                select: { user_id: true }
              }).then(profiles => profiles.map(p => p.user_id))
            }
          }
        });
        
        // 3. Delete invalid seat assignments
        if (invalidSeats.length > 0) {
          await prisma.licenseSeatAssignment.deleteMany({
            where: {
              id: { in: invalidSeats.map(s => s.id) }
            }
          });
          
          // 4. Update license seat counts (excluding super admins)
          const remainingSeats = await prisma.licenseSeatAssignment.findMany({
            where: { license_id: license.id },
            select: { user_id: true }
          });
          
          const orgSuperAdmins = await prisma.profile.findMany({
            where: {
              organization_id: organizationId,
              role: { in: ['super_admin', 'SUPER_ADMIN'] }
            },
            select: { user_id: true }
          });
          const superAdminIds = new Set(orgSuperAdmins.map((p: any) => p.user_id));
          
          const nonSuperAdminCount = remainingSeats.filter(
            (s: any) => !superAdminIds.has(s.user_id)
          ).length;
          
          await prisma.license.update({
            where: { id: license.id },
            data: {
              used_seats: nonSuperAdminCount,
              available_seats: (license.max_users ?? 0) - nonSuperAdminCount
            }
          });
        }
        
        result = { 
          success: true, 
          cleaned: true, 
          removedSeats: invalidSeats.length,
          invalidSeatIds: invalidSeats.map(s => s.id)
        };
        
        logger.info('Seat cleanup completed', { 
          licenseId: license.id,
          removedSeats: invalidSeats.length
        });
        
        break;
      }
      
      default:
        return badRequest(`Invalid action: ${body.action}. Use list, allocate, deallocate, or cleanup`, undefined, origin);
    }
    
    logger.info('Seat management completed', { 
      action: body.action,
      organizationId,
      success: true
    });
    
    return success(result, 200, origin);
    
  } catch (err: any) {
    logger.error('Seat management error', err, { 
      organizationId,
      userId,
      requestId: context.awsRequestId,
    });
    
    // Handle Prisma errors
    if (err.code === 'P2002') {
      return badRequest('Seat assignment already exists (unique constraint violation)', undefined, origin);
    }
    if (err.code === 'P2025') {
      return badRequest('Record not found', undefined, origin);
    }
    
    return error('Failed to manage seats. Please try again.', 500, undefined, origin);
  }
}