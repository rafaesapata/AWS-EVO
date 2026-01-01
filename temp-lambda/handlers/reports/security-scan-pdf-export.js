"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
const logging_js_1 = require("../../lib/logging.js");
const database_js_1 = require("../../lib/database.js");
const auth_js_1 = require("../../lib/auth.js");
const response_js_1 = require("../../lib/response.js");
const middleware_js_1 = require("../../lib/middleware.js");
const client_s3_1 = require("@aws-sdk/client-s3");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
const pdfkit_1 = __importDefault(require("pdfkit"));
const s3Client = new client_s3_1.S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
async function handler(event, context) {
    const origin = (0, middleware_js_1.getOrigin)(event);
    const httpMethod = event.httpMethod || event.requestContext?.http?.method;
    if (httpMethod === 'OPTIONS') {
        return (0, response_js_1.corsOptions)(origin);
    }
    let organizationId;
    let userId;
    try {
        const user = (0, auth_js_1.getUserFromEvent)(event);
        userId = user.sub || user.id || 'unknown';
        organizationId = (0, auth_js_1.getOrganizationId)(user);
    }
    catch (authError) {
        logging_js_1.logger.error('Authentication error', authError);
        return (0, response_js_1.error)('Unauthorized', 401, undefined, origin);
    }
    try {
        const prisma = (0, database_js_1.getPrismaClient)();
        const body = JSON.parse(event.body || '{}');
        const { scanId, format = 'detailed', includeRemediation = true, language = 'pt-BR' } = body;
        if (!scanId) {
            return (0, response_js_1.badRequest)('scanId is required', undefined, origin);
        }
        // Buscar scan - FILTRAR POR ORGANIZATION_ID
        const scan = await prisma.securityScan.findFirst({
            where: {
                id: scanId,
                organization_id: organizationId
            }
        });
        if (!scan) {
            return (0, response_js_1.notFound)('Scan not found', origin);
        }
        // Buscar findings do scan
        const findings = await prisma.finding.findMany({
            where: {
                organization_id: organizationId,
                ...(scan.aws_account_id ? { aws_account_id: scan.aws_account_id } : {})
            },
            orderBy: { severity: 'desc' }
        });
        logging_js_1.logger.info('Generating PDF report', {
            scanId,
            organizationId,
            findingsCount: findings.length
        });
        // Gerar PDF
        const pdfBuffer = await generatePDF(scan, findings, format, includeRemediation, language);
        // Upload para S3
        const bucket = process.env.REPORTS_BUCKET || 'evo-uds-reports-383234048592';
        const timestamp = Date.now();
        const key = `security-reports/${organizationId}/${scanId}/${timestamp}-report.pdf`;
        await s3Client.send(new client_s3_1.PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: pdfBuffer,
            ContentType: 'application/pdf',
            ContentDisposition: `attachment; filename="evo-security-report-${scanId.slice(0, 8)}.pdf"`,
            Metadata: {
                scanId,
                format,
                generatedBy: userId,
                generatedAt: new Date().toISOString(),
                organizationId
            }
        }));
        // Gerar URL assinada para download (válida por 1 hora)
        const signedUrl = await (0, s3_request_presigner_1.getSignedUrl)(s3Client, new client_s3_1.GetObjectCommand({
            Bucket: bucket,
            Key: key,
            ResponseContentDisposition: `attachment; filename="evo-security-report-${scanId.slice(0, 8)}.pdf"`
        }), { expiresIn: 3600 });
        logging_js_1.logger.info('PDF report generated', { scanId, organizationId, key, size: pdfBuffer.length });
        return (0, response_js_1.success)({
            downloadUrl: signedUrl,
            expiresIn: 3600,
            fileSize: pdfBuffer.length,
            format,
            filename: `evo-security-report-${scanId.slice(0, 8)}-${new Date().toISOString().split('T')[0]}.pdf`
        }, 200, origin);
    }
    catch (err) {
        logging_js_1.logger.error('Security scan PDF export error:', err);
        return (0, response_js_1.error)('Internal server error', 500, undefined, origin);
    }
}
async function generatePDF(scan, findings, format, includeRemediation, language) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        const doc = new pdfkit_1.default({
            size: 'A4',
            margin: 50,
            info: {
                Title: 'EVO Security Report',
                Author: 'EVO UDS Platform',
                Subject: 'AWS Security Analysis',
                Creator: 'EVO UDS v3.2'
            }
        });
        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
        const t = language === 'pt-BR' ? {
            title: 'Relatório de Segurança AWS',
            subtitle: 'Análise de Vulnerabilidades e Conformidade',
            summary: 'Resumo Executivo',
            scanInfo: 'Informações do Scan',
            findings: 'Descobertas de Segurança',
            remediation: 'Remediação Sugerida',
            generatedBy: 'Gerado por EVO UDS Platform',
            critical: 'Crítico',
            high: 'Alto',
            medium: 'Médio',
            low: 'Baixo',
            total: 'Total',
            resource: 'Recurso',
            severity: 'Severidade',
            noFindings: 'Nenhuma vulnerabilidade encontrada'
        } : {
            title: 'AWS Security Report',
            subtitle: 'Vulnerability and Compliance Analysis',
            summary: 'Executive Summary',
            scanInfo: 'Scan Information',
            findings: 'Security Findings',
            remediation: 'Suggested Remediation',
            generatedBy: 'Generated by EVO UDS Platform',
            critical: 'Critical',
            high: 'High',
            medium: 'Medium',
            low: 'Low',
            total: 'Total',
            resource: 'Resource',
            severity: 'Severity',
            noFindings: 'No vulnerabilities found'
        };
        // Contagem por severidade
        const counts = {
            critical: findings.filter(f => f.severity?.toLowerCase() === 'critical').length,
            high: findings.filter(f => f.severity?.toLowerCase() === 'high').length,
            medium: findings.filter(f => f.severity?.toLowerCase() === 'medium').length,
            low: findings.filter(f => f.severity?.toLowerCase() === 'low').length
        };
        // Header com logo/título
        doc.fontSize(28).fillColor('#1e40af').text(t.title, { align: 'center' });
        doc.fontSize(14).fillColor('#6b7280').text(t.subtitle, { align: 'center' });
        doc.moveDown(2);
        // Linha separadora
        doc.strokeColor('#e5e7eb').lineWidth(1)
            .moveTo(50, doc.y).lineTo(545, doc.y).stroke();
        doc.moveDown();
        // Informações do Scan
        doc.fontSize(16).fillColor('#1f2937').text(t.scanInfo);
        doc.moveDown(0.5);
        doc.fontSize(10).fillColor('#6b7280');
        doc.text(`Scan ID: ${scan.id}`);
        doc.text(`Tipo: ${scan.scan_type || 'security'}`);
        doc.text(`Status: ${scan.status}`);
        doc.text(`Data: ${new Date(scan.created_at).toLocaleString(language)}`);
        doc.moveDown(1.5);
        // Resumo Executivo
        doc.fontSize(16).fillColor('#1f2937').text(t.summary);
        doc.moveDown(0.5);
        // Tabela de resumo
        const tableTop = doc.y;
        const col1 = 50, col2 = 200, col3 = 350;
        // Header da tabela
        doc.fontSize(11).fillColor('#374151');
        doc.text(t.severity, col1, tableTop);
        doc.text('Quantidade', col2, tableTop);
        doc.moveDown(0.5);
        // Linha
        doc.strokeColor('#e5e7eb').lineWidth(0.5)
            .moveTo(col1, doc.y).lineTo(400, doc.y).stroke();
        doc.moveDown(0.3);
        // Dados
        const severities = [
            { label: t.critical, count: counts.critical, color: '#dc2626' },
            { label: t.high, count: counts.high, color: '#ea580c' },
            { label: t.medium, count: counts.medium, color: '#ca8a04' },
            { label: t.low, count: counts.low, color: '#2563eb' }
        ];
        severities.forEach(sev => {
            doc.fontSize(10).fillColor(sev.color).text(sev.label, col1, doc.y);
            doc.fillColor('#1f2937').text(sev.count.toString(), col2, doc.y - 12);
            doc.moveDown(0.5);
        });
        // Total
        doc.strokeColor('#e5e7eb').lineWidth(0.5)
            .moveTo(col1, doc.y).lineTo(400, doc.y).stroke();
        doc.moveDown(0.3);
        doc.fontSize(11).fillColor('#1f2937').font('Helvetica-Bold');
        doc.text(t.total, col1, doc.y);
        doc.text(findings.length.toString(), col2, doc.y - 12);
        doc.font('Helvetica');
        doc.moveDown(2);
        // Findings detalhados (se não for executive)
        if (format !== 'executive' && findings.length > 0) {
            doc.addPage();
            doc.fontSize(16).fillColor('#1f2937').text(t.findings);
            doc.moveDown();
            findings.slice(0, 50).forEach((finding, index) => {
                // Verificar se precisa de nova página
                if (doc.y > 700) {
                    doc.addPage();
                }
                const severity = (finding.severity || 'low').toLowerCase();
                const severityColor = severity === 'critical' ? '#dc2626' :
                    severity === 'high' ? '#ea580c' :
                        severity === 'medium' ? '#ca8a04' : '#2563eb';
                // Número e título
                doc.fontSize(11).fillColor('#1f2937').font('Helvetica-Bold');
                doc.text(`${index + 1}. ${finding.description || finding.event_name || 'Finding'}`, {
                    width: 450
                });
                doc.font('Helvetica');
                // Badge de severidade
                doc.fontSize(9).fillColor(severityColor);
                doc.text(`[${severity.toUpperCase()}]`, { continued: false });
                // Detalhes
                doc.fontSize(9).fillColor('#6b7280');
                if (finding.resource_id) {
                    doc.text(`${t.resource}: ${finding.resource_id}`);
                }
                if (finding.service) {
                    doc.text(`Service: ${finding.service}`);
                }
                // Remediação
                if (includeRemediation && finding.remediation) {
                    doc.fontSize(9).fillColor('#166534');
                    doc.text(`${t.remediation}: ${finding.remediation}`, { width: 450 });
                }
                doc.moveDown(1);
            });
            if (findings.length > 50) {
                doc.fontSize(10).fillColor('#6b7280');
                doc.text(`... e mais ${findings.length - 50} findings não mostrados neste relatório.`);
            }
        }
        else if (findings.length === 0) {
            doc.fontSize(12).fillColor('#166534').text(t.noFindings);
        }
        // Footer
        doc.fontSize(8).fillColor('#9ca3af');
        const footerY = doc.page.height - 50;
        doc.text(`${t.generatedBy} • ${new Date().toLocaleString(language)}`, 50, footerY, { align: 'center', width: 495 });
        doc.end();
    });
}
//# sourceMappingURL=security-scan-pdf-export.js.map