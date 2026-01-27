/**
 * Self-Registration Handler
 * 
 * Allows new customers to register themselves with a trial license.
 * Creates: Organization, Profile, Cognito User, and Trial License.
 * 
 * This endpoint is PUBLIC (no authentication required).
 */

import type { APIGatewayProxyEventV2, Context, APIGatewayProxyResultV2 } from 'aws-lambda';
import { success, error, corsOptions } from '../../lib/response.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logging.js';
import { z } from 'zod';
import { 
  CognitoIdentityProviderClient, 
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  AdminGetUserCommand,
  MessageActionType
} from '@aws-sdk/client-cognito-identity-provider';
import { randomUUID } from 'crypto';

// Validation schema
const addressSchema = z.object({
  street: z.string().min(1),
  number: z.string().min(1),
  complement: z.string().optional(),
  neighborhood: z.string().optional(),
  city: z.string().min(1),
  state: z.string().min(2).max(2),
  zipCode: z.string().min(5),
  country: z.enum(['BR', 'US'])
});

const companySchema = z.object({
  name: z.string().min(2),
  taxId: z.string().min(8), // CNPJ (14) or EIN (9)
  address: addressSchema
});

const registerSchema = z.object({
  country: z.enum(['BR', 'US']),
  fullName: z.string().min(3),
  email: z.string().email(),
  phone: z.string().min(10),
  password: z.string().min(12),
  company: companySchema
});

// Cognito configuration
const COGNITO_USER_POOL_ID = process.env.COGNITO_USER_POOL_ID || 'us-east-1_cnesJ48lR';
const COGNITO_REGION = process.env.AWS_REGION || 'us-east-1';

// External License API configuration
const LICENSE_API_URL = process.env.LICENSE_API_URL || 'https://mhutjgpipiklepvjrboi.supabase.co/functions/v1/api-create-trial';
const LICENSE_API_KEY = process.env.LICENSE_API_KEY || 'nck_59707b56bf8def71dfb657bb8f2f4b9c';

const cognitoClient = new CognitoIdentityProviderClient({ region: COGNITO_REGION });

/**
 * Create trial license via external API
 */
async function createTrialLicense(
  organizationId: string,
  companyName: string,
  contactName: string,
  email: string,
  phone: string,
  country: string,
  website?: string
): Promise<{ licenseKey: string; customerId: string; validUntil: Date; externalApiSuccess: boolean }> {
  // Calculate trial end date (14 days from now)
  const validUntil = new Date();
  validUntil.setDate(validUntil.getDate() + 14);
  
  // If no external API configured, create a local trial license
  if (!LICENSE_API_KEY) {
    logger.warn('No LICENSE_API_KEY configured, creating local trial license');
    return {
      licenseKey: `TRIAL-${randomUUID().slice(0, 8).toUpperCase()}`,
      customerId: `CUST-${randomUUID().slice(0, 8).toUpperCase()}`,
      validUntil,
      externalApiSuccess: false
    };
  }

  try {
    // Format phone with country code
    const formattedPhone = country === 'BR' 
      ? `+55 ${phone.replace(/(\d{2})(\d{4,5})(\d{4})/, '$1 $2-$3')}`
      : `+1 ${phone.replace(/(\d{3})(\d{3})(\d{4})/, '($1) $2-$3')}`;

    const requestBody = {
      organization_name: companyName,
      contact_name: contactName,
      contact_email: email,
      contact_phone: formattedPhone,
      website: website || '',
      product_type: 'evo',
      estimated_seats: 1,
      notes: `Self-registration from ${country === 'BR' ? 'Brazil' : 'United States'} - Organization ID: ${organizationId}`
    };

    logger.info('Calling external license API', { 
      url: LICENSE_API_URL,
      email,
      companyName 
    });

    const response = await fetch(LICENSE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': LICENSE_API_KEY
      },
      body: JSON.stringify(requestBody)
    });

    const responseText = await response.text();
    
    // Log the raw response for debugging
    logger.info('License API response', { 
      status: response.status, 
      ok: response.ok,
      responseLength: responseText.length 
    });

    // Check HTTP status
    if (!response.ok) {
      logger.error('License API HTTP error', { 
        status: response.status, 
        statusText: response.statusText,
        response: responseText.slice(0, 500) 
      });
      // Return local license on HTTP error
      return {
        licenseKey: `TRIAL-${randomUUID().slice(0, 8).toUpperCase()}`,
        customerId: `CUST-${randomUUID().slice(0, 8).toUpperCase()}`,
        validUntil,
        externalApiSuccess: false
      };
    }

    // Parse JSON response
    let data: {
      success?: boolean;
      license_key?: string;
      licenseKey?: string;
      customer_id?: string;
      customerId?: string;
      valid_until?: string;
      validUntil?: string;
      trial_id?: string;
      error?: string;
      message?: string;
      // Nested license object from external API
      license?: {
        license_key?: string;
        customer_id?: string;
        valid_until?: string;
        valid_from?: string;
        product_type?: string;
        total_seats?: number;
      };
      // Nested user object
      user?: {
        id?: string;
        email?: string;
      };
    };

    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      logger.error('License API response is not valid JSON', { 
        response: responseText.slice(0, 500) 
      });
      return {
        licenseKey: `TRIAL-${randomUUID().slice(0, 8).toUpperCase()}`,
        customerId: `CUST-${randomUUID().slice(0, 8).toUpperCase()}`,
        validUntil,
        externalApiSuccess: false
      };
    }

    // Check if API returned success: false
    if (data.success === false) {
      logger.error('License API returned success: false', { 
        error: data.error || data.message,
        response: data 
      });
      return {
        licenseKey: `TRIAL-${randomUUID().slice(0, 8).toUpperCase()}`,
        customerId: `CUST-${randomUUID().slice(0, 8).toUpperCase()}`,
        validUntil,
        externalApiSuccess: false
      };
    }

    // Extract license data from response (check nested 'license' object first)
    const licenseKey = data.license?.license_key || data.license_key || data.licenseKey;
    const customerId = data.license?.customer_id || data.user?.id || data.customer_id || data.customerId;
    const apiValidUntil = data.license?.valid_until || data.valid_until || data.validUntil;

    // Validate that we got the required fields
    if (!licenseKey && !customerId) {
      logger.warn('License API response missing license_key and customer_id', { 
        response: data 
      });
      return {
        licenseKey: `TRIAL-${randomUUID().slice(0, 8).toUpperCase()}`,
        customerId: `CUST-${randomUUID().slice(0, 8).toUpperCase()}`,
        validUntil,
        externalApiSuccess: false
      };
    }
    
    logger.info('Trial license created via external API successfully', { 
      licenseKey: licenseKey,
      customerId: customerId,
      trialId: data.trial_id,
      hasLicenseKey: !!licenseKey
    });
    
    // Parse valid_until date if provided by API
    // IMPORTANT: Always ensure minimum 14 days trial period
    // The external API sometimes returns incorrect/short validity periods
    let parsedValidUntil = validUntil; // Default: 14 days from now
    if (apiValidUntil) {
      const parsed = new Date(apiValidUntil);
      if (!isNaN(parsed.getTime())) {
        // Only use API date if it's at least 14 days from now
        const minValidUntil = new Date();
        minValidUntil.setDate(minValidUntil.getDate() + 14);
        
        if (parsed >= minValidUntil) {
          parsedValidUntil = parsed;
        } else {
          logger.warn('External API returned short validity period, using default 14 days', {
            apiValidUntil: parsed.toISOString(),
            usingValidUntil: validUntil.toISOString()
          });
        }
      }
    }

    return {
      licenseKey: licenseKey || `TRIAL-${randomUUID().slice(0, 8).toUpperCase()}`,
      customerId: customerId || `CUST-${randomUUID().slice(0, 8).toUpperCase()}`,
      validUntil: parsedValidUntil,
      externalApiSuccess: true
    };
  } catch (err) {
    logger.error('Failed to call license API (network/timeout error)', { 
      error: (err as Error).message,
      stack: (err as Error).stack 
    });
    // Return local license on network error
    return {
      licenseKey: `TRIAL-${randomUUID().slice(0, 8).toUpperCase()}`,
      customerId: `CUST-${randomUUID().slice(0, 8).toUpperCase()}`,
      validUntil,
      externalApiSuccess: false
    };
  }
}

/**
 * Create Cognito user and return the actual Cognito sub (user ID)
 */
async function createCognitoUser(
  email: string,
  password: string,
  fullName: string,
  organizationId: string,
  organizationName: string
): Promise<string> {
  // Create user with temporary password (suppressed email)
  const createResult = await cognitoClient.send(new AdminCreateUserCommand({
    UserPoolId: COGNITO_USER_POOL_ID,
    Username: email,
    UserAttributes: [
      { Name: 'email', Value: email },
      { Name: 'email_verified', Value: 'true' },
      { Name: 'name', Value: fullName },
      { Name: 'custom:organization_id', Value: organizationId },
      { Name: 'custom:organization_name', Value: organizationName },
      { Name: 'custom:roles', Value: JSON.stringify(['org_admin']) }
    ],
    MessageAction: MessageActionType.SUPPRESS
  }));

  // Set permanent password
  await cognitoClient.send(new AdminSetUserPasswordCommand({
    UserPoolId: COGNITO_USER_POOL_ID,
    Username: email,
    Password: password,
    Permanent: true
  }));

  // Extract the actual Cognito sub (user ID) from the response
  // This is CRITICAL - we must use the Cognito-generated sub, not a random UUID
  const cognitoSub = createResult.User?.Attributes?.find(attr => attr.Name === 'sub')?.Value;
  
  if (!cognitoSub) {
    // Fallback: fetch the user to get the sub
    const getUserResult = await cognitoClient.send(new AdminGetUserCommand({
      UserPoolId: COGNITO_USER_POOL_ID,
      Username: email
    }));
    
    const fetchedSub = getUserResult.UserAttributes?.find(attr => attr.Name === 'sub')?.Value;
    if (!fetchedSub) {
      throw new Error('Failed to get Cognito user sub after creation');
    }
    return fetchedSub;
  }

  return cognitoSub;
}

/**
 * Generate organization slug from company name
 */
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50) + '-' + randomUUID().slice(0, 8);
}

export async function handler(
  event: APIGatewayProxyEventV2,
  _context: Context
): Promise<APIGatewayProxyResultV2> {
  // Handle CORS preflight
  if (event.requestContext?.http?.method === 'OPTIONS') {
    return corsOptions();
  }

  const startTime = Date.now();
  logger.info('Self-registration request received');

  try {
    // Parse and validate request body
    const body = JSON.parse(event.body || '{}');
    const validation = registerSchema.safeParse(body);

    if (!validation.success) {
      logger.warn('Validation failed', { errors: validation.error.errors });
      return error(validation.error.errors[0].message, 400);
    }

    const { country, fullName, email, phone, password, company } = validation.data;
    const prisma = getPrismaClient();

    // Check if email already exists in Cognito using AdminGetUser
    try {
      await cognitoClient.send(new AdminGetUserCommand({
        UserPoolId: COGNITO_USER_POOL_ID,
        Username: email
      }));
      // If we get here, user exists
      logger.warn('Email already exists in Cognito', { email });
      return error('This email is already registered', 409);
    } catch (cognitoError: any) {
      if (cognitoError.name !== 'UserNotFoundException') {
        // Unexpected error - log and continue (will fail later if real issue)
        logger.warn('Error checking user existence', { error: cognitoError.name });
      }
      // UserNotFoundException means user doesn't exist - continue with registration
    }

    // Check if company with same tax ID already exists
    const existingOrg = await prisma.$queryRaw<any[]>`
      SELECT id FROM organizations 
      WHERE slug LIKE ${`%${company.taxId}%`}
      LIMIT 1
    `;

    if (existingOrg && existingOrg.length > 0) {
      logger.warn('Company with tax ID already exists', { taxId: company.taxId });
      return error('A company with this tax ID is already registered', 409);
    }

    // Create organization
    const organizationId = randomUUID();
    const slug = generateSlug(company.name);

    await prisma.$executeRaw`
      INSERT INTO organizations (id, name, slug, created_at, updated_at)
      VALUES (
        ${organizationId}::uuid,
        ${company.name},
        ${slug},
        NOW(),
        NOW()
      )
    `;

    logger.info('Organization created', { organizationId, name: company.name });

    // Create Cognito user
    let userId: string;
    try {
      userId = await createCognitoUser(email, password, fullName, organizationId, company.name);
      logger.info('Cognito user created', { email });
    } catch (cognitoError: any) {
      // Rollback organization creation
      await prisma.$executeRaw`DELETE FROM organizations WHERE id = ${organizationId}::uuid`;
      
      if (cognitoError.name === 'UsernameExistsException') {
        return error('This email is already registered', 409);
      }
      throw cognitoError;
    }

    // Create profile
    await prisma.$executeRaw`
      INSERT INTO profiles (id, user_id, organization_id, full_name, role, created_at, updated_at)
      VALUES (
        ${randomUUID()}::uuid,
        ${userId}::uuid,
        ${organizationId}::uuid,
        ${fullName},
        'org_admin',
        NOW(),
        NOW()
      )
    `;

    logger.info('Profile created', { userId });

    // Create trial license
    const licenseData = await createTrialLicense(
      organizationId, 
      company.name, 
      fullName,
      email, 
      phone,
      country
    );

    const licenseId = randomUUID();

    // Create license record
    await prisma.$executeRaw`
      INSERT INTO licenses (
        id, organization_id, license_key, customer_id, plan_type, product_type,
        max_accounts, max_users, used_seats, available_seats, features,
        valid_from, valid_until, is_active, is_trial, is_expired,
        days_remaining, created_at, updated_at
      )
      VALUES (
        ${licenseId}::uuid,
        ${organizationId}::uuid,
        ${licenseData.licenseKey},
        ${licenseData.customerId},
        'trial',
        'evo',
        2,
        3,
        1,
        2,
        ARRAY['security_scan', 'cost_analysis', 'compliance_basic'],
        NOW(),
        ${licenseData.validUntil},
        true,
        true,
        false,
        14,
        NOW(),
        NOW()
      )
    `;

    logger.info('Trial license created', { licenseId, licenseKey: licenseData.licenseKey, customerId: licenseData.customerId });

    // Create organization_license_config (required for validate-license to work)
    await prisma.$executeRaw`
      INSERT INTO organization_license_configs (
        id, organization_id, customer_id, sync_status, last_sync_at, created_at, updated_at
      )
      VALUES (
        ${randomUUID()}::uuid,
        ${organizationId}::uuid,
        ${licenseData.customerId},
        'synced',
        NOW(),
        NOW(),
        NOW()
      )
      ON CONFLICT (organization_id) DO UPDATE SET
        customer_id = EXCLUDED.customer_id,
        sync_status = 'synced',
        last_sync_at = NOW(),
        updated_at = NOW()
    `;

    logger.info('Organization license config created', { organizationId, customerId: licenseData.customerId });

    // Assign seat to the new user
    await prisma.$executeRaw`
      INSERT INTO license_seat_assignments (
        id, license_id, user_id, assigned_at, assigned_by
      )
      VALUES (
        ${randomUUID()}::uuid,
        ${licenseId}::uuid,
        ${userId}::uuid,
        NOW(),
        ${userId}::uuid
      )
    `;

    logger.info('License seat assigned to user', { userId, licenseId });

    // Store company details (could be in a separate table, for now in organization metadata)
    // This could be extended to store in a dedicated company_details table

    const duration = Date.now() - startTime;
    logger.info('Self-registration completed successfully', { 
      organizationId, 
      email, 
      customerId: licenseData.customerId,
      licenseKey: licenseData.licenseKey,
      duration_ms: duration 
    });

    return success({
      message: 'Registration successful',
      organizationId,
      email,
      trialEndsAt: licenseData.validUntil.toISOString(),
      licenseKey: licenseData.licenseKey
    });

  } catch (err) {
    logger.error('Self-registration failed', err as Error);
    return error('Registration failed. Please try again or contact support.', 500);
  }
}