/**
 * Security Report PDF Generator
 * Generates PDF reports for security scan results using pdf-lib.
 * pdf-lib works with esbuild bundling (no external font files needed).
 */

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

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

function hexToRgb(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return rgb(r, g, b);
}

const C = {
  critical: '#dc2626',
  high: '#ea580c',
  medium: '#ca8a04',
  low: '#2563eb',
  text: '#1f2937',
  muted: '#6b7280',
  success: '#166534',
  header: '#1e40af',
  white: '#ffffff',
  lightBg: '#f3f4f6',
};

function sevColor(sev: string): string {
  const s = sev.toLowerCase();
  if (s === 'critical') return C.critical;
  if (s === 'high') return C.high;
  if (s === 'medium') return C.medium;
  return C.low;
}

function fmtDate(d: Date): string {
  try {
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return new Date(d).toISOString().replace('T', ' ').substring(0, 16);
  }
}

// Truncate text to fit within maxWidth
function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.substring(0, maxChars - 3) + '...';
}

/**
 * Gera PDF do relatório de segurança usando pdf-lib.
 * Compatível com esbuild bundling (sem arquivos .afm externos).
 */
export async function generateReportPdf(input: PdfReportInput): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.setTitle('EVO - Relatório de Segurança');
  doc.setAuthor('EVO Platform');
  doc.setSubject('Análise de Segurança Cloud');
  doc.setCreator('EVO Platform v3.2');

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const PAGE_W = 595.28; // A4
  const PAGE_H = 841.89;
  const MARGIN = 50;
  const CONTENT_W = PAGE_W - 2 * MARGIN;

  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  function newPage() {
    page = doc.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - MARGIN;
  }

  function checkPage(needed: number) {
    if (y - needed < MARGIN + 30) newPage();
  }

  function drawText(text: string, x: number, size: number, color: string, bold = false) {
    const f = bold ? fontBold : font;
    // Sanitize: remove chars not in WinAnsi
    const safe = text.replace(/[^\x20-\x7E\xA0-\xFF]/g, '');
    page.drawText(safe, { x, y, size, font: f, color: hexToRgb(color) });
  }

  function drawLine(x1: number, x2: number, yPos: number) {
    page.drawLine({ start: { x: x1, y: yPos }, end: { x: x2, y: yPos }, thickness: 0.5, color: hexToRgb('#e5e7eb') });
  }

  // ── Header ──
  drawText('EVO', PAGE_W / 2 - fontBold.widthOfTextAtSize('EVO', 26) / 2, 26, C.header, true);
  y -= 16;
  drawText('PLATFORM', PAGE_W / 2 - font.widthOfTextAtSize('PLATFORM', 10) / 2, 10, C.muted);
  y -= 22;
  const title = 'Relatorio de Seguranca';
  drawText(title, PAGE_W / 2 - font.widthOfTextAtSize(title, 16) / 2, 16, C.text);
  y -= 16;
  const orgName = truncate(input.organizationName, 60);
  drawText(orgName, PAGE_W / 2 - font.widthOfTextAtSize(orgName, 11) / 2, 11, C.muted);
  y -= 20;

  drawLine(MARGIN, PAGE_W - MARGIN, y);
  y -= 20;

  // ── Scan Info ──
  drawText('Informacoes do Scan', MARGIN, 14, C.header, true);
  y -= 18;
  const scanInfo = [
    `Conta: ${input.accountName} (${input.cloudProvider})`,
    `Tipo: ${input.scanType === 'security' ? 'Seguranca' : input.scanType}`,
    `Data: ${fmtDate(input.executedAt)}`,
    `Scan ID: ${input.scanId}`,
  ];
  for (const line of scanInfo) {
    drawText(truncate(line, 90), MARGIN, 10, C.muted);
    y -= 14;
  }
  y -= 10;

  // ── Severity Summary ──
  drawText('Resumo por Severidade', MARGIN, 14, C.header, true);
  y -= 20;

  const sevRows = [
    { label: 'Critico', count: input.summary.critical, color: C.critical },
    { label: 'Alto', count: input.summary.high, color: C.high },
    { label: 'Medio', count: input.summary.medium, color: C.medium },
    { label: 'Baixo', count: input.summary.low, color: C.low },
  ];

  // Table header
  drawText('Severidade', MARGIN, 11, C.text, true);
  drawText('Quantidade', MARGIN + 200, 11, C.text, true);
  y -= 14;
  drawLine(MARGIN, MARGIN + 300, y);
  y -= 10;

  for (const row of sevRows) {
    drawText(row.label, MARGIN, 10, row.color);
    drawText(String(row.count), MARGIN + 200, 10, C.text);
    y -= 14;
  }

  drawLine(MARGIN, MARGIN + 300, y);
  y -= 12;
  drawText('Total', MARGIN, 11, C.text, true);
  drawText(String(input.summary.total), MARGIN + 200, 11, C.text, true);
  y -= 24;

  // ── Comparison ──
  if (input.comparison) {
    const cmp = input.comparison;
    checkPage(100);
    drawText('Comparacao com Scan Anterior', MARGIN, 14, C.header, true);
    y -= 18;
    drawText(`Novos findings: +${cmp.newFindings.length}`, MARGIN, 10, C.text);
    y -= 14;
    drawText(`Findings resolvidos: -${cmp.resolvedFindings.length}`, MARGIN, 10, C.text);
    y -= 14;
    drawText(`Persistentes: ${cmp.persistentCount}`, MARGIN, 10, C.text);
    y -= 14;
    const sign = cmp.changePercentage > 0 ? '+' : '';
    drawText(`Variacao: ${sign}${cmp.changePercentage.toFixed(1)}%`, MARGIN, 10, C.text);
    y -= 20;

    // New findings list
    if (cmp.newFindings.length > 0) {
      checkPage(30);
      drawText(`Novos Findings (${cmp.newFindings.length})`, MARGIN, 12, C.critical, true);
      y -= 16;
      for (const f of cmp.newFindings.slice(0, 30)) {
        checkPage(16);
        const line = `[${f.severity.toUpperCase()}] ${truncate(f.title, 70)}${f.resourceId ? ' - ' + truncate(f.resourceId, 30) : ''}`;
        drawText(truncate(line, 100), MARGIN + 10, 9, sevColor(f.severity));
        y -= 12;
      }
      if (cmp.newFindings.length > 30) {
        drawText(`... e mais ${cmp.newFindings.length - 30} novos findings`, MARGIN + 10, 9, C.muted);
        y -= 12;
      }
      y -= 10;
    }

    // Resolved findings list
    if (cmp.resolvedFindings.length > 0) {
      checkPage(30);
      drawText(`Findings Resolvidos (${cmp.resolvedFindings.length})`, MARGIN, 12, C.success, true);
      y -= 16;
      for (const f of cmp.resolvedFindings.slice(0, 30)) {
        checkPage(16);
        const line = `[${f.severity.toUpperCase()}] ${truncate(f.title, 70)}${f.resourceId ? ' - ' + truncate(f.resourceId, 30) : ''}`;
        drawText(truncate(line, 100), MARGIN + 10, 9, sevColor(f.severity));
        y -= 12;
      }
      if (cmp.resolvedFindings.length > 30) {
        drawText(`... e mais ${cmp.resolvedFindings.length - 30} findings resolvidos`, MARGIN + 10, 9, C.muted);
        y -= 12;
      }
      y -= 10;
    }
  }

  // ── All Findings Detail ──
  if (input.findings.length > 0) {
    newPage();
    drawText('Detalhamento de Findings', MARGIN, 14, C.header, true);
    y -= 22;

    for (let i = 0; i < input.findings.length; i++) {
      checkPage(60);
      const f = input.findings[i];
      const sev = (f.severity || 'low').toLowerCase();
      const titleText = `${i + 1}. ${truncate(f.title || f.description || 'Finding', 80)}`;

      drawText(titleText, MARGIN, 10, C.text, true);
      y -= 13;
      drawText(`[${sev.toUpperCase()}]`, MARGIN, 8, sevColor(sev));
      y -= 11;

      if (f.service) {
        drawText(`Servico: ${truncate(f.service, 60)}`, MARGIN + 10, 8, C.muted);
        y -= 11;
      }
      if (f.resourceId) {
        drawText(`Recurso: ${truncate(f.resourceId, 70)}`, MARGIN + 10, 8, C.muted);
        y -= 11;
      }
      if (f.category) {
        drawText(`Categoria: ${truncate(f.category, 50)}`, MARGIN + 10, 8, C.muted);
        y -= 11;
      }
      if (f.remediation) {
        drawText(`Remediacao: ${truncate(f.remediation, 80)}`, MARGIN + 10, 8, C.success);
        y -= 11;
      }
      y -= 8;
    }
  }

  // ── Footer on last page ──
  const footerText = `Gerado por EVO Platform - ${fmtDate(new Date())}`;
  page.drawText(footerText.replace(/[^\x20-\x7E\xA0-\xFF]/g, ''), {
    x: MARGIN,
    y: MARGIN - 10,
    size: 8,
    font,
    color: hexToRgb(C.muted),
  });

  const pdfBytes = await doc.save();
  return Buffer.from(pdfBytes);
}
