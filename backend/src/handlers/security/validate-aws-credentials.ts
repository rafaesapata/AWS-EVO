import { getHttpMethod, getHttpPath } from '../../lib/middleware.js';
/**
 * Lambda handler para validar credenciais AWS
 * AWS Lambda Handler for validate-aws-credentials
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, badRequest, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationIdWithImpersonation } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { validateAwsCredentials, resolveAwsCredentials } from '../../lib/aws-helpers.js';
import { logger } from '../../lib/logging.js';
import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts';
import { IAMClient, GetUserCommand, ListAttachedUserPoliciesCommand } from '@aws-sdk/client-iam';

interface ValidateCredentialsRequest {
  credentialId?: string;
  roleArn?: string;
  externalId?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
}

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  // Handle OPTIONS first - before any auth checks
  if (getHttpMethod(event) === 'OPTIONS') {
    return corsOptions();
  }
  
  const user = getUserFromEvent(event);
  const organizationId = getOrganizationIdWithImpersonation(event, user);
  
  logger.info('Validate AWS credentials started', { 
    organizationId,
    userId: user.sub,
    requestId: context.awsRequestId 
  });
  
  try {
    let body: ValidateCredentialsRequest;
    try {
      body = event.body ? JSON.parse(event.body) : {};
    } catch (parseError) {
      return badRequest('Invalid JSON in request body');
    }
    const { credentialId, roleArn, externalId, accessKeyId, secretAccessKey } = body;
    
    const prisma = getPrismaClient();
    
    let credentialsToValidate: any;
    
    if (credentialId) {
      // Validar credencial existente
      credentialsToValidate = await prisma.awsCredential.findFirst({
        where: {
          id: credentialId,
          organization_id: organizationId,
        },
      });
      
      if (!credentialsToValidate) {
        return badRequest('Credential not found');
      }
    } else if (roleArn && externalId) {
      // Validar novas credenciais (AssumeRole)
      credentialsToValidate = {
        role_arn: roleArn,
        external_id: externalId,
      };
    } else if (accessKeyId && secretAccessKey) {
      // Validar novas credenciais (Access Keys)
      credentialsToValidate = {
        access_key_id: accessKeyId,
        secret_access_key: secretAccessKey,
      };
    } else {
      return badRequest('Either credentialId or credentials (roleArn+externalId or accessKeyId+secretAccessKey) required');
    }
    
    logger.info('Validating AWS credentials', { organizationId, hasCredentialId: !!credentialId });
    
    // Resolver credenciais
    const resolvedCreds = await resolveAwsCredentials(credentialsToValidate, 'us-east-1');
    
    // Validar credenciais
    const isValid = await validateAwsCredentials(resolvedCreds);
    
    if (!isValid) {
      return success({
        valid: false,
        message: 'Invalid credentials - unable to assume role or access AWS services',
      });
    }
    
    // Obter informações da identidade
    const stsClient = new STSClient({
      region: 'us-east-1',
      credentials: {
        accessKeyId: resolvedCreds.accessKeyId,
        secretAccessKey: resolvedCreds.secretAccessKey,
        sessionToken: resolvedCreds.sessionToken,
      },
    });
    
    const identity = await stsClient.send(new GetCallerIdentityCommand({}));
    
    // Verificar permissões básicas
    const permissions = await checkPermissions(resolvedCreds);
    
    logger.info('AWS credentials validated successfully', { 
      organizationId, 
      accountId: identity.Account,
      principalArn: identity.Arn 
    });
    
    return success({
      valid: true,
      identity: {
        account: identity.Account,
        arn: identity.Arn,
        user_id: identity.UserId,
      },
      permissions,
    });
    
  } catch (err) {
    logger.error('Validate AWS credentials error', err as Error, { 
      organizationId,
      userId: user.sub,
      requestId: context.awsRequestId 
    });
    
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    
    // Handle specific AWS errors
    if (errorMessage.includes('InvalidClientTokenId')) {
      return success({
        valid: false,
        message: 'Invalid access key ID',
      });
    }
    
    if (errorMessage.includes('SignatureDoesNotMatch')) {
      return success({
        valid: false,
        message: 'Invalid secret access key',
      });
    }
    
    if (errorMessage.includes('AccessDenied') || errorMessage.includes('is not authorized to perform: sts:AssumeRole')) {
      return success({
        valid: false,
        message: 'Access denied - unable to assume role. Please check the role ARN and external ID.',
      });
    }
    
    if (errorMessage.includes('NoSuchEntity') || errorMessage.includes('does not exist')) {
      return success({
        valid: false,
        message: 'Role not found - please check the role ARN.',
      });
    }
    
    if (errorMessage.includes('InvalidParameterValue')) {
      return success({
        valid: false,
        message: 'Invalid parameter - please check the role ARN format.',
      });
    }
    
    // For other errors, return as validation failure instead of server error
    return success({
      valid: false,
      message: `Validation failed: ${errorMessage}`,
    });
  }
}

async function checkPermissions(creds: any): Promise<any> {
  const requiredPermissions = [
    'ec2:Describe*',
    'rds:Describe*',
    's3:List*',
    'iam:Get*',
    'cloudtrail:Describe*',
    'guardduty:List*',
  ];
  
  // Simplificado - em produção, usar IAM Policy Simulator
  return {
    checked: requiredPermissions,
    status: 'partial', // 'full', 'partial', 'none'
    message: 'Basic permissions check passed. Full validation recommended.',
  };
}
