/**
 * Health Monitor — Scheduled Job
 *
 * Polls the AWS Health API for all organizations with active AWS credentials,
 * classifies events by severity, persists them, and triggers automatic
 * ticket creation / notifications for qualifying events.
 *
 * Triggered by EventBridge every 15 minutes.
 * Follows the same pattern as scheduled-scan-executor.ts.
 *
 * @schedule rate(15 minutes)
 */

import type { LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logger.js';
import { resolveAwsCredentials, toAwsCredentials } from '../../lib/aws-helpers.js';
import { classifySeverity, isCredentialExposure } from '../../lib/health-event-classifier.js';
import { processHealthEvent } from '../../lib/health-event-processor.js';
import { HealthClient, DescribeEventsCommand, DescribeEventDetailsCommand } from '@aws-sdk/client-health';

// ==================== TYPES ====================

interface ScheduledEvent {
  'detail-type'?: string;
  source?: string;
  time?: string;
  region?: string;
  resources?: string[];
  detail?: Record<string, unknown>;
  requestContext?: {
    http?: { method: string };
  };
}

interface OrgResult {
  organizationId: string;
  accountsProcessed: number;
  eventsFound: number;
  eventsNew: number;
  eventsUpdated: number;
  ticketsCreated: number;
  errors: string[];
}

// ==================== CONSTANTS ====================

const HEALTH_API_REGION = 'us-east-1'; // AWS Health API is global, always us-east-1
const DESCRIBE_EVENT_DETAILS_BATCH_SIZE = 10; // API limit per call
const MAX_EVENTS_PER_DESCRIBE = 100;

// ==================== HANDLER ====================

export async function handler(
  event: ScheduledEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  if (event.requestContext?.http?.method === 'OPTIONS') {
    return corsOptions();
  }

  const startTime = Date.now();
  logger.info('Health Monitor started', {
    requestId: context.awsRequestId,
    source: event.source || 'api-gateway',
    time: event.time || new Date().toISOString(),
  });

  try {
    const prisma = getPrismaClient();
    const orgResults: OrgResult[] = [];

    // Fetch all organizations that have HealthMonitoringConfig with enabled = true
    // If no config exists for an org, we skip it (config is created via manage-health-monitoring-config)
    const configs = await prisma.healthMonitoringConfig.findMany({
      where: { enabled: true },
      include: { organization: { select: { id: true, name: true } } },
    });

    logger.info('Found organizations with health monitoring enabled', { count: configs.length });

    if (configs.length === 0) {
      return success({
        success: true,
        message: 'No organizations with health monitoring enabled',
        organizationsProcessed: 0,
        results: [],
        durationMs: Date.now() - startTime,
      });
    }

    for (const config of configs) {
      const orgId = config.organization_id;
      const orgResult: OrgResult = {
        organizationId: orgId,
        accountsProcessed: 0,
        eventsFound: 0,
        eventsNew: 0,
        eventsUpdated: 0,
        ticketsCreated: 0,
        errors: [],
      };

      try {
        // Get all active AWS credentials for this organization
        const credentials = await prisma.awsCredential.findMany({
          where: { organization_id: orgId, is_active: true },
        });

        if (credentials.length === 0) {
          logger.info('No active AWS credentials for organization', { organizationId: orgId });
          orgResults.push(orgResult);
          continue;
        }

        for (const credential of credentials) {
          try {
            orgResult.accountsProcessed++;

            // Resolve credentials — AWS Health API is global, always use us-east-1
            const awsCreds = await resolveAwsCredentials(credential, HEALTH_API_REGION);

            // Create Health client
            const healthClient = new HealthClient({
              region: HEALTH_API_REGION,
              credentials: toAwsCredentials(awsCreds),
            });

            // Describe events (with pagination)
            const events: any[] = [];
            let nextToken: string | undefined;
            do {
              const describeEventsResponse = await healthClient.send(
                new DescribeEventsCommand({
                  filter: {
                    eventTypeCategories: ['accountNotification', 'issue'],
                    eventStatusCodes: ['open', 'upcoming', 'closed'],
                  },
                  maxResults: MAX_EVENTS_PER_DESCRIBE,
                  nextToken,
                })
              );
              if (describeEventsResponse.events) {
                events.push(...describeEventsResponse.events);
              }
              nextToken = describeEventsResponse.nextToken;
            } while (nextToken);

            orgResult.eventsFound += events.length;

            if (events.length === 0) continue;

            // Fetch event details in batches of 10
            const eventArns = events
              .map((e) => e.arn)
              .filter((arn): arn is string => !!arn);

            const eventDetailsMap = new Map<string, string>();
            for (let i = 0; i < eventArns.length; i += DESCRIBE_EVENT_DETAILS_BATCH_SIZE) {
              const batch = eventArns.slice(i, i + DESCRIBE_EVENT_DETAILS_BATCH_SIZE);
              try {
                const detailsResponse = await healthClient.send(
                  new DescribeEventDetailsCommand({ eventArns: batch })
                );
                for (const detail of detailsResponse.successfulSet || []) {
                  if (detail.event?.arn && detail.eventDescription?.latestDescription) {
                    eventDetailsMap.set(detail.event.arn, detail.eventDescription.latestDescription);
                  }
                }
              } catch (detailErr) {
                logger.warn('Failed to fetch event details batch', {
                  organizationId: orgId,
                  accountId: credential.account_id,
                  error: (detailErr as Error).message,
                });
              }
            }

            // Process each event
            for (const healthEvent of events) {
              try {
                if (!healthEvent.arn || !healthEvent.eventTypeCode) continue;

                const severity = classifySeverity({
                  typeCode: healthEvent.eventTypeCode,
                  category: healthEvent.eventTypeCategory || '',
                  statusCode: healthEvent.statusCode || '',
                });

                const credentialExposure = isCredentialExposure(healthEvent.eventTypeCode);
                const description = eventDetailsMap.get(healthEvent.arn) || null;

                // Upsert the event
                const existingEvent = await prisma.awsHealthEvent.findUnique({
                  where: {
                    event_arn_organization_id: {
                      event_arn: healthEvent.arn,
                      organization_id: orgId,
                    },
                  },
                  select: { id: true, remediation_ticket_id: true },
                });

                const isNewEvent = !existingEvent;

                const upsertedEvent = await prisma.awsHealthEvent.upsert({
                  where: {
                    event_arn_organization_id: {
                      event_arn: healthEvent.arn,
                      organization_id: orgId,
                    },
                  },
                  create: {
                    organization_id: orgId,
                    event_arn: healthEvent.arn,
                    type_code: healthEvent.eventTypeCode,
                    category: healthEvent.eventTypeCategory || 'unknown',
                    region: healthEvent.region || 'global',
                    start_time: healthEvent.startTime || new Date(),
                    end_time: healthEvent.endTime || null,
                    status_code: healthEvent.statusCode || 'unknown',
                    description,
                    aws_account_id: credential.account_id,
                    severity,
                    is_credential_exposure: credentialExposure,
                    metadata: {
                      event_type_code: healthEvent.eventTypeCode,
                      event_type_category: healthEvent.eventTypeCategory,
                      service: healthEvent.service,
                      availability_zone: healthEvent.availabilityZone,
                    },
                  },
                  update: {
                    status_code: healthEvent.statusCode || 'unknown',
                    end_time: healthEvent.endTime || null,
                    description,
                    updated_at: new Date(),
                  },
                });

                if (isNewEvent) {
                  orgResult.eventsNew++;

                  // Process new event (ticket creation, alerts, notifications)
                  try {
                    const processingResult = await processHealthEvent(prisma, {
                      id: upsertedEvent.id,
                      eventArn: healthEvent.arn,
                      typeCode: healthEvent.eventTypeCode,
                      category: healthEvent.eventTypeCategory || 'unknown',
                      region: healthEvent.region || 'global',
                      description: description || '',
                      severity,
                      isCredentialExposure: credentialExposure,
                      awsAccountId: credential.account_id,
                      organizationId: orgId,
                      remediationTicketId: null,
                    }, {
                      autoTicketSeverities: config.auto_ticket_severities,
                      organizationId: orgId,
                    });

                    if (processingResult.ticketCreated) {
                      orgResult.ticketsCreated++;
                    }
                  } catch (processErr) {
                    logger.error('Failed to process health event', processErr as Error, {
                      organizationId: orgId,
                      eventArn: healthEvent.arn,
                    });
                  }
                } else {
                  orgResult.eventsUpdated++;
                }
              } catch (eventErr) {
                const errMsg = eventErr instanceof Error ? eventErr.message : 'Unknown error';
                orgResult.errors.push(`Event ${healthEvent.arn}: ${errMsg}`);
                logger.error('Failed to process individual health event', eventErr as Error, {
                  organizationId: orgId,
                  eventArn: healthEvent.arn,
                });
              }
            }
          } catch (credErr) {
            const errMsg = credErr instanceof Error ? credErr.message : 'Unknown error';
            orgResult.errors.push(`Account ${credential.account_id}: ${errMsg}`);

            // SubscriptionRequiredException means no Business/Enterprise support plan
            if (errMsg.includes('SubscriptionRequired') || errMsg.includes('not subscribed')) {
              logger.warn('AWS Health API not available for account (no Business/Enterprise support)', {
                organizationId: orgId,
                accountId: credential.account_id,
              });
            } else {
              logger.error('Failed to process AWS credential', credErr as Error, {
                organizationId: orgId,
                accountId: credential.account_id,
              });
            }
          }
        }
      } catch (orgErr) {
        const errMsg = orgErr instanceof Error ? orgErr.message : 'Unknown error';
        orgResult.errors.push(`Organization error: ${errMsg}`);
        logger.error('Failed to process organization', orgErr as Error, { organizationId: orgId });
      }

      orgResults.push(orgResult);
    }

    const totalEvents = orgResults.reduce((sum, r) => sum + r.eventsFound, 0);
    const totalNew = orgResults.reduce((sum, r) => sum + r.eventsNew, 0);
    const totalTickets = orgResults.reduce((sum, r) => sum + r.ticketsCreated, 0);
    const totalErrors = orgResults.reduce((sum, r) => sum + r.errors.length, 0);

    logger.info('Health Monitor completed', {
      organizationsProcessed: orgResults.length,
      totalEvents,
      totalNew,
      totalTickets,
      totalErrors,
      durationMs: Date.now() - startTime,
    });

    return success({
      success: true,
      organizationsProcessed: orgResults.length,
      summary: {
        totalEvents,
        totalNew,
        totalTickets,
        totalErrors,
      },
      results: orgResults,
      durationMs: Date.now() - startTime,
    });
  } catch (err) {
    logger.error('Health Monitor error', err as Error, { requestId: context.awsRequestId });
    return error('An unexpected error occurred. Please try again.', 500);
  }
}
