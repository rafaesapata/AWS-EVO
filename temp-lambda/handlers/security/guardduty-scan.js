"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
const middleware_js_1 = require("../../lib/middleware.js");
const response_js_1 = require("../../lib/response.js");
const auth_js_1 = require("../../lib/auth.js");
const database_js_1 = require("../../lib/database.js");
const aws_helpers_js_1 = require("../../lib/aws-helpers.js");
const client_guardduty_1 = require("@aws-sdk/client-guardduty");
const logging_js_1 = require("../../lib/logging.js");
async function handler(event, context) {
    logging_js_1.logger.info('GuardDuty scan started');
    if ((0, middleware_js_1.getHttpMethod)(event) === 'OPTIONS') {
        return (0, response_js_1.corsOptions)();
    }
    try {
        const user = (0, auth_js_1.getUserFromEvent)(event);
        const organizationId = (0, auth_js_1.getOrganizationId)(user);
        const body = event.body ? JSON.parse(event.body) : {};
        const { accountId } = body;
        const prisma = (0, database_js_1.getPrismaClient)();
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
            return (0, response_js_1.badRequest)('AWS credentials not found');
        }
        const regions = credential.regions && credential.regions.length > 0
            ? credential.regions
            : ['us-east-1', 'us-west-2'];
        logging_js_1.logger.info('Starting GuardDuty scan', { regionCount: regions.length, regions });
        const allFindings = [];
        for (const region of regions) {
            logging_js_1.logger.debug('Scanning GuardDuty region', { region });
            try {
                const creds = await (0, aws_helpers_js_1.resolveAwsCredentials)(credential, region);
                const guardDutyClient = new client_guardduty_1.GuardDutyClient({
                    region,
                    credentials: (0, aws_helpers_js_1.toAwsCredentials)(creds),
                });
                // List detectors
                const detectorsResponse = await guardDutyClient.send(new client_guardduty_1.ListDetectorsCommand({}));
                if (!detectorsResponse.DetectorIds || detectorsResponse.DetectorIds.length === 0) {
                    logging_js_1.logger.warn('No GuardDuty detectors found in region', { region });
                    continue;
                }
                const detectorId = detectorsResponse.DetectorIds[0];
                logging_js_1.logger.info('Found GuardDuty detector', { detectorId, region });
                // List findings
                const findingsResponse = await guardDutyClient.send(new client_guardduty_1.ListFindingsCommand({
                    DetectorId: detectorId,
                    MaxResults: 50,
                    FindingCriteria: {
                        Criterion: {
                            'service.archived': {
                                Eq: ['false'],
                            },
                        },
                    },
                }));
                if (!findingsResponse.FindingIds || findingsResponse.FindingIds.length === 0) {
                    logging_js_1.logger.info('No active GuardDuty findings in region', { region });
                    continue;
                }
                logging_js_1.logger.info('Found GuardDuty findings', { findingsCount: findingsResponse.FindingIds.length, region });
                // Get finding details
                const detailsResponse = await guardDutyClient.send(new client_guardduty_1.GetFindingsCommand({
                    DetectorId: detectorId,
                    FindingIds: findingsResponse.FindingIds,
                }));
                if (detailsResponse.Findings) {
                    allFindings.push(...detailsResponse.Findings.map((f) => ({ ...f, region })));
                }
            }
            catch (regionError) {
                logging_js_1.logger.error('Error scanning GuardDuty region', regionError, { region });
                continue;
            }
        }
        logging_js_1.logger.info('GuardDuty scan completed', { totalFindings: allFindings.length });
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
        logging_js_1.logger.info('GuardDuty scan completed successfully', {
            totalFindings: allFindings.length,
            criticalCount,
            highCount,
            mediumCount,
            lowCount
        });
        return (0, response_js_1.success)({
            findings_count: allFindings.length,
            critical: criticalCount,
            high: highCount,
            medium: mediumCount,
            low: lowCount,
            regions_scanned: regions.length,
        });
    }
    catch (err) {
        logging_js_1.logger.error('GuardDuty scan error', err);
        return (0, response_js_1.error)(err instanceof Error ? err.message : 'Internal server error');
    }
}
//# sourceMappingURL=guardduty-scan.js.map