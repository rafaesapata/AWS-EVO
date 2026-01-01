"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
const middleware_js_1 = require("../../lib/middleware.js");
const response_js_1 = require("../../lib/response.js");
const auth_js_1 = require("../../lib/auth.js");
const database_js_1 = require("../../lib/database.js");
const aws_helpers_js_1 = require("../../lib/aws-helpers.js");
const logging_js_1 = require("../../lib/logging.js");
const client_ec2_1 = require("@aws-sdk/client-ec2");
const client_rds_1 = require("@aws-sdk/client-rds");
const client_s3_1 = require("@aws-sdk/client-s3");
const client_iam_1 = require("@aws-sdk/client-iam");
const client_cloudwatch_1 = require("@aws-sdk/client-cloudwatch");
async function handler(event, context) {
    const user = (0, auth_js_1.getUserFromEvent)(event);
    const organizationId = (0, auth_js_1.getOrganizationId)(user);
    if ((0, middleware_js_1.getHttpMethod)(event) === 'OPTIONS')
        return (0, response_js_1.corsOptions)();
    const prisma = (0, database_js_1.getPrismaClient)();
    try {
        const body = event.body ? JSON.parse(event.body) : {};
        const accountId = body.accountId;
        const requestedRegion = body.region;
        if (!accountId)
            return (0, response_js_1.error)('Missing required parameter: accountId');
        const account = await prisma.awsCredential.findFirst({
            where: { id: accountId, organization_id: organizationId, is_active: true },
        });
        if (!account)
            return (0, response_js_1.error)('AWS account not found');
        // Usar região solicitada, ou primeira região da conta, ou padrão
        const accountRegions = account.regions;
        const region = requestedRegion ||
            (accountRegions && accountRegions.length > 0 ? accountRegions[0] : 'us-east-1');
        const resolvedCreds = await (0, aws_helpers_js_1.resolveAwsCredentials)(account, region);
        const credentials = (0, aws_helpers_js_1.toAwsCredentials)(resolvedCreds);
        const scan = await prisma.securityScan.create({
            data: { organization_id: organizationId, aws_account_id: accountId, scan_type: 'well_architected', status: 'running' },
        });
        const ec2 = new client_ec2_1.EC2Client({ region, credentials });
        const rds = new client_rds_1.RDSClient({ region, credentials });
        const s3 = new client_s3_1.S3Client({ region, credentials });
        const iam = new client_iam_1.IAMClient({ region: 'us-east-1', credentials });
        const cw = new client_cloudwatch_1.CloudWatchClient({ region, credentials });
        const [ec2Data, rdsData, s3Data, iamData, cwData, sgData] = await Promise.all([
            ec2.send(new client_ec2_1.DescribeInstancesCommand({})).catch(() => ({ Reservations: [] })),
            rds.send(new client_rds_1.DescribeDBInstancesCommand({})).catch(() => ({ DBInstances: [] })),
            s3.send(new client_s3_1.ListBucketsCommand({})).catch(() => ({ Buckets: [] })),
            iam.send(new client_iam_1.ListUsersCommand({})).catch(() => ({ Users: [] })),
            cw.send(new client_cloudwatch_1.DescribeAlarmsCommand({})).catch(() => ({ MetricAlarms: [] })),
            ec2.send(new client_ec2_1.DescribeSecurityGroupsCommand({})).catch(() => ({ SecurityGroups: [] })),
        ]);
        const instances = (ec2Data.Reservations || []).flatMap((r) => r.Instances || []);
        const dbInstances = (rdsData.DBInstances || []);
        const buckets = (s3Data.Buckets || []);
        const users = (iamData.Users || []);
        const alarms = (cwData.MetricAlarms || []);
        const sgs = (sgData.SecurityGroups || []);
        const pillarScores = [
            analyzeOps(instances, alarms),
            await analyzeSec(users, sgs, buckets, s3, iam),
            analyzeRel(instances, dbInstances),
            analyzePerf(instances, dbInstances),
            analyzeCost(instances),
            analyzeSust(instances),
        ];
        const overallScore = Math.round(pillarScores.reduce((s, p) => s + p.score, 0) / pillarScores.length);
        for (const p of pillarScores) {
            await prisma.$executeRaw `INSERT INTO well_architected_scores (id, organization_id, scan_id, pillar, score, checks_passed, checks_failed, critical_issues, recommendations, created_at) VALUES (gen_random_uuid(), ${organizationId}::uuid, ${scan.id}::uuid, ${p.pillar}, ${p.score}, ${p.checks_passed}, ${p.checks_failed}, ${p.critical_issues}, ${JSON.stringify(p.recommendations)}::jsonb, NOW())`;
        }
        await prisma.securityScan.update({ where: { id: scan.id }, data: { status: 'completed', completed_at: new Date() } });
        logging_js_1.logger.info('Well-Architected scan completed', { organizationId, accountId, overallScore });
        return (0, response_js_1.success)({ success: true, scan_id: scan.id, overall_score: overallScore, pillars: pillarScores });
    }
    catch (err) {
        logging_js_1.logger.error('Well-Architected Scan error', err, { organizationId });
        return (0, response_js_1.error)(err instanceof Error ? err.message : 'Internal server error');
    }
}
function analyzeOps(instances, alarms) {
    const recs = [];
    let pass = 0, fail = 0, crit = 0;
    if (alarms.length === 0) {
        fail++;
        crit++;
        recs.push({ check_name: 'CloudWatch Alarms', description: 'Nenhum alarme configurado', recommendation: 'Configure alarmes para CPU e erros', severity: 'critical' });
    }
    else {
        pass++;
    }
    const untagged = instances.filter((i) => !i.Tags || i.Tags.length < 3);
    if (untagged.length > 0) {
        fail++;
        recs.push({ check_name: 'Resource Tagging', description: `${untagged.length} instâncias sem tags`, recommendation: 'Adicione tags', severity: 'low' });
    }
    else if (instances.length > 0) {
        pass++;
    }
    const total = pass + fail;
    return { pillar: 'operational_excellence', score: total > 0 ? Math.round((pass / total) * 100) : 100, checks_passed: pass, checks_failed: fail, critical_issues: crit, recommendations: recs };
}
async function analyzeSec(users, sgs, buckets, s3, iam) {
    const recs = [];
    let pass = 0, fail = 0, crit = 0;
    const openSGs = sgs.filter((sg) => sg.IpPermissions?.some((p) => p.IpRanges?.some((r) => r.CidrIp === '0.0.0.0/0') && p.FromPort !== 443 && p.FromPort !== 80));
    if (openSGs.length > 0) {
        fail++;
        crit++;
        recs.push({ check_name: 'Security Groups Abertos', description: `${openSGs.length} SGs com 0.0.0.0/0`, recommendation: 'Restrinja acesso', severity: 'critical' });
    }
    else {
        pass++;
    }
    let noMFA = 0;
    for (const u of users.slice(0, 5)) {
        try {
            const m = await iam.send(new client_iam_1.ListMFADevicesCommand({ UserName: u.UserName }));
            if (!m.MFADevices?.length)
                noMFA++;
        }
        catch { /* skip */ }
    }
    if (noMFA > 0) {
        fail++;
        crit++;
        recs.push({ check_name: 'MFA', description: `${noMFA} usuários sem MFA`, recommendation: 'Habilite MFA', severity: 'critical' });
    }
    else {
        pass++;
    }
    let noEnc = 0;
    for (const b of buckets.slice(0, 5)) {
        try {
            await s3.send(new client_s3_1.GetBucketEncryptionCommand({ Bucket: b.Name }));
        }
        catch {
            noEnc++;
        }
    }
    if (noEnc > 0) {
        fail++;
        recs.push({ check_name: 'S3 Encryption', description: `${noEnc} buckets sem criptografia`, recommendation: 'Habilite SSE', severity: 'high' });
    }
    else {
        pass++;
    }
    const total = pass + fail;
    return { pillar: 'security', score: total > 0 ? Math.round((pass / total) * 100) : 100, checks_passed: pass, checks_failed: fail, critical_issues: crit, recommendations: recs };
}
function analyzeRel(instances, dbs) {
    const recs = [];
    let pass = 0, fail = 0, crit = 0;
    const singleAZ = dbs.filter((d) => !d.MultiAZ);
    if (singleAZ.length > 0) {
        fail++;
        crit++;
        recs.push({ check_name: 'RDS Multi-AZ', description: `${singleAZ.length} bancos sem Multi-AZ`, recommendation: 'Habilite Multi-AZ', severity: 'critical' });
    }
    else if (dbs.length > 0) {
        pass++;
    }
    const noBackup = dbs.filter((d) => d.BackupRetentionPeriod === 0);
    if (noBackup.length > 0) {
        fail++;
        crit++;
        recs.push({ check_name: 'RDS Backups', description: `${noBackup.length} bancos sem backup`, recommendation: 'Configure backup', severity: 'critical' });
    }
    else if (dbs.length > 0) {
        pass++;
    }
    const azs = new Set(instances.map((i) => i.Placement?.AvailabilityZone));
    if (instances.length > 1 && azs.size === 1) {
        fail++;
        recs.push({ check_name: 'Multi-AZ', description: 'Instâncias em única AZ', recommendation: 'Distribua em AZs', severity: 'high' });
    }
    else if (instances.length > 1) {
        pass++;
    }
    const total = pass + fail;
    return { pillar: 'reliability', score: total > 0 ? Math.round((pass / total) * 100) : 100, checks_passed: pass, checks_failed: fail, critical_issues: crit, recommendations: recs };
}
function analyzePerf(instances, dbs) {
    const recs = [];
    let pass = 0, fail = 0;
    const oldGen = instances.filter((i) => i.InstanceType?.match(/^(t2|m4|c4|r4)\./));
    if (oldGen.length > 0) {
        fail++;
        recs.push({ check_name: 'Instance Generation', description: `${oldGen.length} instâncias antigas`, recommendation: 'Migre para t3/m5', severity: 'medium' });
    }
    else if (instances.length > 0) {
        pass++;
    }
    const magnetic = dbs.filter((d) => d.StorageType === 'standard');
    if (magnetic.length > 0) {
        fail++;
        recs.push({ check_name: 'RDS Storage', description: `${magnetic.length} bancos magnéticos`, recommendation: 'Migre para gp3', severity: 'high' });
    }
    else if (dbs.length > 0) {
        pass++;
    }
    const total = pass + fail;
    return { pillar: 'performance_efficiency', score: total > 0 ? Math.round((pass / total) * 100) : 100, checks_passed: pass, checks_failed: fail, critical_issues: 0, recommendations: recs };
}
function analyzeCost(instances) {
    const recs = [];
    let pass = 0, fail = 0;
    const stopped = instances.filter((i) => i.State?.Name === 'stopped');
    if (stopped.length > 0) {
        fail++;
        recs.push({ check_name: 'Stopped Instances', description: `${stopped.length} paradas`, recommendation: 'Termine ou crie AMIs', severity: 'medium' });
    }
    else {
        pass++;
    }
    const running = instances.filter((i) => i.State?.Name === 'running');
    if (running.length > 3) {
        fail++;
        recs.push({ check_name: 'Reserved Instances', description: `${running.length} on-demand`, recommendation: 'Considere RI', severity: 'medium' });
    }
    else {
        pass++;
    }
    const total = pass + fail;
    return { pillar: 'cost_optimization', score: total > 0 ? Math.round((pass / total) * 100) : 100, checks_passed: pass, checks_failed: fail, critical_issues: 0, recommendations: recs };
}
function analyzeSust(instances) {
    const recs = [];
    let pass = 1, fail = 0; // Region OK by default
    const nonGrav = instances.filter((i) => !i.InstanceType?.includes('g') && i.State?.Name === 'running');
    if (nonGrav.length > 0) {
        fail++;
        recs.push({ check_name: 'Graviton', description: `${nonGrav.length} sem Graviton`, recommendation: 'Considere t4g/m6g', severity: 'low' });
    }
    else if (instances.length > 0) {
        pass++;
    }
    const total = pass + fail;
    return { pillar: 'sustainability', score: total > 0 ? Math.round((pass / total) * 100) : 100, checks_passed: pass, checks_failed: fail, critical_issues: 0, recommendations: recs };
}
//# sourceMappingURL=well-architected-scan.js.map