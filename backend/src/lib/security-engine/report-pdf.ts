/**
 * Security Report PDF Generator
 * Generates PDF reports for security scan results using pdfkit.
 */

import PDFDocument from 'pdfkit';

export interface PdfReportInput {
  scanId: string;
  scanType: string;
  organizationName: string;
  accountName: string;
  cloudProvider: string;
  executedAt: Date;
  summary: { critical: number; high: number; medium: number; low: number; total: number };
  findings: PdfFinding[];
  comparison?: {
    newFindings: PdfFindingSummary[];
    resolvedFindings: PdfFindingSummary[];
    persistentCount: number;
    changePercentage: number;
  } | null;
}

export interface PdfFinding {
  severity: string;
  title?: string;
  description?: string;
  resourceId?: string;
  service?: string;
  category?: string;
  remediation?: string;
}

export interface PdfFindingSummary {
  title: string;
  severity: string;
  resourceId?: string;
  category?: string;
}

const COLORS = {
  critical: '#dc2626',
  high: '#ea580c',
  medium: '#ca8a04',
  low: '#2563eb',
  text: '#1f2937',
  muted: '#6b7280',
  border: '#e5e7eb',
  success: '#166534',
  header: '#1e40af',
};

function severityColor(sev: string): string {
  const s = sev.toLowerCase();
  if (s === 'critical') return COLORS.critical;
  if (s === 'high') return COLORS.high;
  if (s === 'medium') return COLORS.medium;
  return COLORS.low;
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/**
 * Gera PDF do relatório de segurança usando pdfkit.
 * Baseado no padrão de security-scan-pdf-export.ts.
 */
export function generateReportPdf(input: PdfReportInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({
      size: 'A4',
      margin: 50,
      info: {
        Title: 'EVO - Relatório de Segurança',
        Author: 'EVO Platform',
        Subject: 'Análise de Segurança Cloud',
        Creator: 'EVO Platform v3.2',
      },
    });

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // ── Header ──
    doc.fontSize(26).fillColor(COLORS.header).text('EVO', { align: 'center' });
    doc.fontSize(10).fillColor(COLORS.muted).text('PLATFORM', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(16).fillColor(COLORS.text).text('Relatório de Segurança', { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(11).fillColor(COLORS.muted).text(input.organizationName, { align: 'center' });
    doc.moveDown(1);

    // Linha separadora
    doc.strokeColor(COLORS.border).lineWidth(1).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(1);

    // ── Scan Info ──
    doc.fontSize(14).fillColor(COLORS.header).text('Informações do Scan');
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor(COLORS.muted);
    doc.text(`Conta: ${input.accountName} (${input.cloudProvider})`);
    doc.text(`Tipo: ${input.scanType === 'security' ? 'Segurança' : input.scanType}`);
    doc.text(`Data: ${fmtDate(input.executedAt)}`);
    doc.text(`Scan ID: ${input.scanId}`);
    doc.moveDown(1.5);

    // ── Resumo por Severidade ──
    doc.fontSize(14).fillColor(COLORS.header).text('Resumo por Severidade');
    doc.moveDown(0.5);

    const tableTop = doc.y;
    const col1 = 50;
    const col2 = 200;

    const sevRows = [
      { label: 'Crítico', count: input.summary.critical, color: COLORS.critical },
      { label: 'Alto', count: input.summary.high, color: COLORS.high },
      { label: 'Médio', count: input.summary.medium, color: COLORS.medium },
      { label: 'Baixo', count: input.summary.low, color: COLORS.low },
    ];

    doc.fontSize(11).fillColor(COLORS.text);
    doc.text('Severidade', col1, tableTop);
    doc.text('Quantidade', col2, tableTop);
    doc.moveDown(0.4);
    doc.strokeColor(COLORS.border).lineWidth(0.5).moveTo(col1, doc.y).lineTo(350, doc.y).stroke();
    doc.moveDown(0.3);

    for (const row of sevRows) {
      const y = doc.y;
      doc.fontSize(10).fillColor(row.color).text(row.label, col1, y);
      doc.fillColor(COLORS.text).text(String(row.count), col2, y);
      doc.moveDown(0.4);
    }

    doc.strokeColor(COLORS.border).lineWidth(0.5).moveTo(col1, doc.y).lineTo(350, doc.y).stroke();
    doc.moveDown(0.3);
    doc.fontSize(11).fillColor(COLORS.text).font('Helvetica-Bold');
    doc.text('Total', col1, doc.y);
    doc.text(String(input.summary.total), col2, doc.y - 13);
    doc.font('Helvetica');
    doc.moveDown(1.5);

    // ── Comparação com scan anterior ──
    if (input.comparison) {
      const cmp = input.comparison;
      doc.fontSize(14).fillColor(COLORS.header).text('Comparação com Scan Anterior');
      doc.moveDown(0.5);
      doc.fontSize(10).fillColor(COLORS.text);
      doc.text(`Novos findings: +${cmp.newFindings.length}`);
      doc.text(`Findings resolvidos: -${cmp.resolvedFindings.length}`);
      doc.text(`Persistentes: ${cmp.persistentCount}`);
      const sign = cmp.changePercentage > 0 ? '+' : '';
      doc.text(`Variação: ${sign}${cmp.changePercentage.toFixed(1)}%`);
      doc.moveDown(1);

      // Novos findings
      if (cmp.newFindings.length > 0) {
        doc.fontSize(12).fillColor(COLORS.critical).text(`Novos Findings (${cmp.newFindings.length})`);
        doc.moveDown(0.3);
        for (const f of cmp.newFindings.slice(0, 30)) {
          if (doc.y > 720) doc.addPage();
          doc.fontSize(9).fillColor(severityColor(f.severity)).text(`[${f.severity.toUpperCase()}]`, { continued: true });
          doc.fillColor(COLORS.text).text(` ${f.title}${f.resourceId ? ' - ' + f.resourceId : ''}`);
        }
        if (cmp.newFindings.length > 30) {
          doc.fontSize(9).fillColor(COLORS.muted).text(`... e mais ${cmp.newFindings.length - 30} novos findings`);
        }
        doc.moveDown(1);
      }

      // Resolvidos
      if (cmp.resolvedFindings.length > 0) {
        if (doc.y > 700) doc.addPage();
        doc.fontSize(12).fillColor(COLORS.success).text(`Findings Resolvidos (${cmp.resolvedFindings.length})`);
        doc.moveDown(0.3);
        for (const f of cmp.resolvedFindings.slice(0, 30)) {
          if (doc.y > 720) doc.addPage();
          doc.fontSize(9).fillColor(severityColor(f.severity)).text(`[${f.severity.toUpperCase()}]`, { continued: true });
          doc.fillColor(COLORS.text).text(` ${f.title}${f.resourceId ? ' - ' + f.resourceId : ''}`);
        }
        if (cmp.resolvedFindings.length > 30) {
          doc.fontSize(9).fillColor(COLORS.muted).text(`... e mais ${cmp.resolvedFindings.length - 30} findings resolvidos`);
        }
        doc.moveDown(1);
      }
    }

    // ── Todos os Findings ──
    if (input.findings.length > 0) {
      doc.addPage();
      doc.fontSize(14).fillColor(COLORS.header).text('Detalhamento de Findings');
      doc.moveDown(0.5);

      for (let i = 0; i < input.findings.length; i++) {
        if (doc.y > 700) doc.addPage();
        const f = input.findings[i];
        const sev = (f.severity || 'low').toLowerCase();

        doc.fontSize(10).fillColor(COLORS.text).font('Helvetica-Bold');
        doc.text(`${i + 1}. ${f.title || f.description || 'Finding'}`, { width: 460 });
        doc.font('Helvetica');

        doc.fontSize(8).fillColor(severityColor(sev)).text(`[${sev.toUpperCase()}]`);

        doc.fontSize(8).fillColor(COLORS.muted);
        if (f.service) doc.text(`Serviço: ${f.service}`);
        if (f.resourceId) doc.text(`Recurso: ${f.resourceId}`);
        if (f.category) doc.text(`Categoria: ${f.category}`);
        if (f.remediation) {
          doc.fontSize(8).fillColor(COLORS.success).text(`Remediação: ${f.remediation}`, { width: 460 });
        }
        doc.moveDown(0.8);
      }
    }

    // ── Footer ──
    doc.fontSize(8).fillColor(COLORS.muted);
    const footerText = `Gerado por EVO Platform - ${fmtDate(new Date())}`;
    doc.text(footerText, 50, doc.page.height - 50, { align: 'center', width: 495 });

    doc.end();
  });
}

