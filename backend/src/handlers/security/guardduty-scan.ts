/**
 * Lambda handler para GuardDuty scan
 * AWS Lambda Handler for guardduty-scan
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, badRequest, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationId } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { resolveAwsCredentials, toAwsCredentials } from '../../lib/aws-helpers.js';
import { GuardDutyClient, ListDetectorsCommand, ListFindingsCommand, GetFindingsCommand } from '@aws-sdk/client-guardduty';
import { logger } from '../../lib/logging.js';

interface GuardDutyScanRequest {
  accountId?: string;
}

interface GuardDutyFinding {
  Id: string;
  Type: string;
  Severity: number;
  Title: string;
  Description: string;
  Resource?: {
    ResourceType?: string;
    InstanceDetails?: any;
  };
  Service?: {
    Action?: any;
    Evidence?: any;
    Archived?: boolean;
    Count?: number;
    EventFirstSeen?: string;
    EventLastSeen?: string;
  };
}

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  logger.info('GuardDuty scan started');
  
  if (event.requestContext.http.method === 'OPTIONS') {
    return corsOptions();
  }
  
  try {
    const user = getUserFromEvent(event);
    const organizationId = getOrganizationId(user);
    
    const body: GuardDutyScanRequest = event.body ? JSON.parse(event.body) : {};
    const { accountId } = body;
    
    const prisma = getPrismaClient();
    
    // Get AWS credentials
    const credential = await prisma.awsCredential.findFirst({
      where: {
        organization_id: organizationId,
        is_active: true,
        ...(accountId && { id: accountId }),
      },
      orderBy: { created_at: 'desc' },
    });
    
    if (!credential) {
      return badRequest('AWS credentials not found');
    }
    
    const regions = credential.regions && credential.regions.length > 0
      ? credential.regions
      : ['us-east-1', 'us-west-2'];
    
    logger.info('Starting GuardDuty scan', { regionCount: regions.length, regions });
    
    const allFindings: (GuardDutyFinding & { region: string })[] = [];
    
    for (const region of regions) {
      logger.debug('Scanning GuardDuty region', { region });
      
      try {
        const creds = await resolveAwsCredentials(credential, region);
        const guardDutyClient = new GuardDutyClient({
          region,
          credentials: toAwsCredentials(creds),
        });
        
        // List detectors
        const detectorsResponse = await guardDutyClient.send(new ListDetectorsCommand({}));
        
        if (!detectorsResponse.DetectorIds || detectorsResponse.DetectorIds.length === 0) {
          logger.warn('No GuardDuty detectors found in region', { region });
          continue;
        }
        
        const detectorId = detectorsResponse.DetectorIds[0];
        logger.info('Found GuardDuty detector', { detectorId, region });
        
        // List findings
        const findingsResponse = await guardDutyClient.send(
          new ListFindingsCommand({
            DetectorId: detectorId,
            MaxResults: 50,
            FindingCriteria: {
              Criterion: {
                'service.archived': {
                  Eq: ['false'],
                },
              },
            },
          })
        );
        
        if (!findingsResponse.FindingIds || findingsResponse.FindingIds.length === 0) {
          logger.info('No active GuardDuty findings in region', { region });
          continue;
        }
        
        logger.info('Found GuardDuty findings', { findingsCount: findingsResponse.FindingIds.length, region });
        
        // Get finding details
        const detailsResponse = await guardDutyClient.send(
          new GetFindingsCommand({
            DetectorId: detectorId,
            FindingIds: findingsResponse.FindingIds,
          })
        );
        
        if (detailsResponse.Findings) {
          allFindings.push(
            ...detailsResponse.Findings.map((f: any) => ({ ...f, region }))
          );
        }
        
      } catch (regionError) {
        logger.error('Error scanning GuardDuty region', regionError as Error, { region });
        continue;
      }
    }
    
    logger.info('GuardDuty scan completed', { totalFindings: allFindings.length });
    
    // Store findings in database
    if (allFindings.length > 0) {
      const findingsToInsert = allFindings.map(finding => {
        const severityLabel = finding.Severity >= 7 ? 'Critical' :
                             finding.Severity >= 4 ? 'High' :
                             finding.Severity >= 1 ? 'Medium' : 'Low';
        
        return {
          organization_id: organizationId,
          aws_account_id: credential.id,
          finding_id: finding.Id,
          finding_type: finding.Type,
          severity: finding.Severity,
          severity_label: severityLabel,
          title: finding.Title,
          description: finding.Description,
          resource_type: finding.Resource?.ResourceType,
          resource_id: finding.Resource?.InstanceDetails?.InstanceId,
          region: finding.region,
          service: 'GuardDuty',
          action: finding.Service?.Action,
          evidence: finding.Service?.Evidence,
          first_seen: finding.Service?.EventFirstSeen,
          last_seen: finding.Service?.EventLastSeen,
          count: finding.Service?.Count || 1,
          status: finding.Service?.Archived ? 'archived' : 'active',
        };
      });
      
      // Upsert findings
      for (const finding of findingsToInsert) {
        await prisma.guardDutyFinding.upsert({
          where: {
            aws_account_id_finding_id: {
              aws_account_id: finding.aws_account_id,
              finding_id: finding.finding_id,
            },
          },
          update: {
            severity: finding.severity,
            severity_label: finding.severity_label,
            title: finding.title,
            description: finding.description,
            action: finding.action,
            evidence: finding.evidence,
            last_seen: finding.last_seen,
            count: finding.count,
            status: finding.status,
            updated_at: new Date(),
          },
          create: finding,
        });
      }
    }
    
    const criticalCount = allFindings.filter(f => f.Severity >= 7).length;
    const highCount = allFindings.filter(f => f.Severity >= 4 && f.Severity < 7).length;
    const mediumCount = allFindings.filter(f => f.Severity >= 1 && f.Severity < 4).length;
    const lowCount = allFindings.filter(f => f.Severity < 1).length;
    
    logger.info('GuardDuty scan completed successfully', { 
      totalFindings: allFindings.length,
      criticalCount, 
      highCount, 
      mediumCount, 
      lowCount 
    });
    
    return success({
      findings_count: allFindings.length,
      critical: criticalCount,
      high: highCount,
      medium: mediumCount,
      low: lowCount,
      regions_scanned: regions.length,
    });
    
  } catch (err) {
    logger.error('GuardDuty scan error', err as Error);
    return error(err instanceof Error ? err.message : 'Internal server error');
  }
}
