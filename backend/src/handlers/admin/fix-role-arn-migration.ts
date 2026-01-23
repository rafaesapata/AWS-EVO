/**
 * Migration script to fix AWS credentials that have access_key_id starting with "ROLE:"
 * but don't have role_arn field populated.
 * 
 * This handles accounts that were created before the role_arn extraction logic was implemented.
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logging.js';

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  if (event.requestContext?.http?.method === 'OPTIONS') {
    return corsOptions();
  }

  try {
    const user = getUserFromEvent(event);
    const roles = user['custom:roles'] || user.roles || '[]';
    const parsedRoles = typeof roles === 'string' ? JSON.parse(roles) : roles;
    
    // Only super_admin can run this migration
    if (!parsedRoles.includes('super_admin')) {
      return error('Unauthorized: super_admin role required', 403);
    }

    const prisma = getPrismaClient();
    
    // Find all credentials that have access_key_id starting with "ROLE:" but no role_arn
    const credentialsToFix = await prisma.awsCredential.findMany({
      where: {
        access_key_id: {
          startsWith: 'ROLE:',
        },
        role_arn: null,
      },
      select: {
        id: true,
        account_id: true,
        account_name: true,
        access_key_id: true,
        organization_id: true,
      },
    });

    logger.info('Found credentials to fix', { count: credentialsToFix.length });

    const results: Array<{
      id: string;
      account_id: string | null;
      account_name: string | null;
      status: 'fixed' | 'error';
      role_arn?: string;
      error?: string;
    }> = [];

    for (const cred of credentialsToFix) {
      try {
        // Extract role_arn from access_key_id
        const roleArn = cred.access_key_id!.substring(5); // Remove "ROLE:" prefix
        
        // Update the credential
        await prisma.awsCredential.update({
          where: { id: cred.id },
          data: {
            role_arn: roleArn,
            access_key_id: '', // Clear access_key_id since we're using role
          },
        });

        results.push({
          id: cred.id,
          account_id: cred.account_id,
          account_name: cred.account_name,
          status: 'fixed',
          role_arn: roleArn,
        });

        logger.info('Fixed credential', { 
          id: cred.id, 
          account_id: cred.account_id,
          role_arn: roleArn,
        });
      } catch (err: any) {
        results.push({
          id: cred.id,
          account_id: cred.account_id,
          account_name: cred.account_name,
          status: 'error',
          error: err.message,
        });

        logger.error('Error fixing credential', err, { id: cred.id });
      }
    }

    // Also check for credentials that might have role_arn in external_id field
    // (some older implementations stored it there)
    const credentialsWithExternalId = await prisma.awsCredential.findMany({
      where: {
        role_arn: null,
        external_id: {
          startsWith: 'arn:aws:iam::',
        },
      },
      select: {
        id: true,
        account_id: true,
        account_name: true,
        external_id: true,
        organization_id: true,
      },
    });

    logger.info('Found credentials with role_arn in external_id', { count: credentialsWithExternalId.length });

    for (const cred of credentialsWithExternalId) {
      try {
        // The external_id contains the role_arn
        const roleArn = cred.external_id!;
        
        // Update the credential
        await prisma.awsCredential.update({
          where: { id: cred.id },
          data: {
            role_arn: roleArn,
            // Keep external_id as is - it might be needed for other purposes
          },
        });

        results.push({
          id: cred.id,
          account_id: cred.account_id,
          account_name: cred.account_name,
          status: 'fixed',
          role_arn: roleArn,
        });

        logger.info('Fixed credential (from external_id)', { 
          id: cred.id, 
          account_id: cred.account_id,
          role_arn: roleArn,
        });
      } catch (err: any) {
        results.push({
          id: cred.id,
          account_id: cred.account_id,
          account_name: cred.account_name,
          status: 'error',
          error: err.message,
        });

        logger.error('Error fixing credential (from external_id)', err, { id: cred.id });
      }
    }

    const fixed = results.filter(r => r.status === 'fixed').length;
    const errors = results.filter(r => r.status === 'error').length;

    return success({
      message: `Migration completed. Fixed: ${fixed}, Errors: ${errors}`,
      total_found: credentialsToFix.length + credentialsWithExternalId.length,
      fixed,
      errors,
      results,
    });

  } catch (err: any) {
    logger.error('Migration error', err);
    return error(err.message || 'Migration failed', 500);
  }
}
