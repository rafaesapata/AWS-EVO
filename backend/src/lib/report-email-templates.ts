/**
 * Templates de Email para Relatórios de Scan
 * 
 * Biblioteca pura (sem side effects) para geração de HTML de emails de relatório.
 * Usa table-based layout e inline CSS para compatibilidade com clientes de email.
 */

import type { FindingSummary } from './report-comparison-engine.js';

export interface ScanReport {
  scanId: string;
  organizationName: string;
  accountName: string;
  cloudProvider: string;
  scanType: string;
  executedAt: Date;
  isFirstScan: boolean;
  summary: {
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  comparison: {
    newFindings: FindingSummary[];
    resolvedFindings: FindingSummary[];
    persistentCount: number;
    previousTotal: number;
    changePercentage: number;
  } | null;
}

export interface ReportEmailData {
  report: ScanReport;
  platformUrl: string;
}

const COLORS = {
  critical: '#dc3545',
  high: '#fd7e14',
  medium: '#ffc107',
  low: '#17a2b8',
  headerBg: '#1a2332',
  ctaButton: '#007bff',
  textPrimary: '#333333',
  textSecondary: '#666666',
  border: '#e9ecef',
  bgLight: '#f8f9fa',
  bgBody: '#f5f5f5',
  white: '#ffffff',
  success: '#28a745',
} as const;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(date: Date): string {
  const d = date instanceof Date ? date : new Date(date);
  const day = String(d.getUTCDate()).padStart(2, '0');
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const year = d.getUTCFullYear();
  const hours = String(d.getUTCHours()).padStart(2, '0');
  const minutes = String(d.getUTCMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${minutes} UTC`;
}

function formatDateShort(date: Date): string {
  const d = date instanceof Date ? date : new Date(date);
  const day = String(d.getUTCDate()).padStart(2, '0');
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const year = d.getUTCFullYear();
  return `${day}/${month}/${year}`;
}

function getSeverityColor(severity: string): string {
  return COLORS[severity as keyof typeof COLORS] || COLORS.low;
}

function getCloudProviderBadge(provider: string): string {
  const isAws = provider.toUpperCase() === 'AWS';
  const bgColor = isAws ? '#FF9900' : '#0078D4';
  const label = isAws ? 'AWS' : 'Azure';
  return `<span style="display:inline-block;background-color:${bgColor};color:${COLORS.white};padding:4px 12px;border-radius:12px;font-size:12px;font-weight:bold;letter-spacing:0.5px;">${label}</span>`;
}

function renderSeverityBox(label: string, count: number, color: string): string {
  return `<td style="padding:0 6px;" align="center">
    <table cellpadding="0" cellspacing="0" border="0" style="min-width:100px;">
      <tr><td align="center" style="background-color:${color};color:${COLORS.white};padding:12px 16px;border-radius:8px 8px 0 0;font-size:28px;font-weight:bold;">${count}</td></tr>
      <tr><td align="center" style="background-color:${COLORS.bgLight};padding:8px 16px;border-radius:0 0 8px 8px;font-size:12px;font-weight:600;color:${COLORS.textPrimary};text-transform:uppercase;letter-spacing:0.5px;">${label}</td></tr>
    </table>
  </td>`;
}

function renderFindingRow(finding: FindingSummary, icon: string): string {
  const color = getSeverityColor(finding.severity);
  const resource = finding.resourceId ? ` &mdash; ${escapeHtml(finding.resourceId)}` : '';
  const category = finding.category ? `<span style="display:inline-block;background-color:${COLORS.bgLight};padding:2px 8px;border-radius:4px;font-size:11px;color:${COLORS.textSecondary};margin-left:8px;">${escapeHtml(finding.category)}</span>` : '';
  return `<tr>
    <td style="padding:12px 16px;border-bottom:1px solid ${COLORS.border};">
      <table cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
        <td width="32" valign="top" style="padding-right:12px;font-size:18px;">${icon}</td>
        <td>
          <span style="display:inline-block;background-color:${color};color:${COLORS.white};padding:2px 8px;border-radius:4px;font-size:11px;font-weight:bold;text-transform:uppercase;margin-right:8px;">${escapeHtml(finding.severity)}</span>
          ${category}
          <div style="margin-top:4px;font-size:14px;color:${COLORS.textPrimary};font-weight:500;">${escapeHtml(finding.title)}${resource}</div>
        </td>
      </tr></table>
    </td>
  </tr>`;
}

function renderComparisonDelta(comparison: NonNullable<ScanReport['comparison']>): string {
  const newCount = comparison.newFindings.length;
  const resolvedCount = comparison.resolvedFindings.length;
  const changeSign = comparison.changePercentage > 0 ? '+' : '';
  const changeColor = comparison.changePercentage > 0 ? COLORS.critical : comparison.changePercentage < 0 ? COLORS.success : COLORS.textSecondary;

  return `<table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:24px;">
    <tr>
      <td align="center" style="padding:16px;background-color:${COLORS.bgLight};border-radius:8px;">
        <table cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="padding:0 16px;" align="center">
            <span style="font-size:24px;font-weight:bold;color:${COLORS.critical};">+${newCount}</span>
            <div style="font-size:12px;color:${COLORS.textSecondary};margin-top:2px;">novos</div>
          </td>
          <td style="padding:0 16px;border-left:1px solid ${COLORS.border};border-right:1px solid ${COLORS.border};" align="center">
            <span style="font-size:24px;font-weight:bold;color:${COLORS.success};">-${resolvedCount}</span>
            <div style="font-size:12px;color:${COLORS.textSecondary};margin-top:2px;">resolvidos</div>
          </td>
          <td style="padding:0 16px;" align="center">
            <span style="font-size:24px;font-weight:bold;color:${COLORS.textSecondary};">${comparison.persistentCount}</span>
            <div style="font-size:12px;color:${COLORS.textSecondary};margin-top:2px;">persistentes</div>
          </td>
          <td style="padding:0 16px;border-left:1px solid ${COLORS.border};" align="center">
            <span style="font-size:24px;font-weight:bold;color:${changeColor};">${changeSign}${comparison.changePercentage.toFixed(1)}%</span>
            <div style="font-size:12px;color:${COLORS.textSecondary};margin-top:2px;">variação</div>
          </td>
        </tr></table>
      </td>
    </tr>
  </table>`;
}

function renderFindingsSection(title: string, icon: string, findings: FindingSummary[], emptyMessage: string): string {
  if (findings.length === 0) {
    return `<table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:24px;">
      <tr><td style="padding:12px 16px;font-size:16px;font-weight:600;color:${COLORS.textPrimary};">${icon} ${title}</td></tr>
      <tr><td style="padding:12px 16px;color:${COLORS.textSecondary};font-style:italic;font-size:14px;">${emptyMessage}</td></tr>
    </table>`;
  }

  const rows = findings.map(f => renderFindingRow(f, icon)).join('');
  return `<table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:24px;">
    <tr><td style="padding:12px 16px;font-size:16px;font-weight:600;color:${COLORS.textPrimary};">${icon} ${title} (${findings.length})</td></tr>
    <tr><td>
      <table cellpadding="0" cellspacing="0" border="0" width="100%" style="border:1px solid ${COLORS.border};border-radius:8px;">
        ${rows}
      </table>
    </td></tr>
  </table>`;
}

/**
 * Gera o HTML completo do email de relatório de segurança.
 * Usa table-based layout e inline CSS para compatibilidade com clientes de email.
 */
export function generateSecurityReportHtml(data: ReportEmailData): string {
  const { report, platformUrl } = data;
  const { summary, comparison } = report;
  const dateFormatted = formatDate(report.executedAt);
  const scanTypeLabel = report.scanType === 'security' ? 'Segurança' : report.scanType;
  const firstScanBadge = report.isFirstScan
    ? `<span style="display:inline-block;background-color:${COLORS.ctaButton};color:${COLORS.white};padding:2px 10px;border-radius:12px;font-size:11px;margin-left:8px;">Primeiro Scan</span>`
    : '';

  const comparisonSection = comparison
    ? `${renderComparisonDelta(comparison)}
       ${renderFindingsSection('Novos Findings', '&#9888;&#65039;', comparison.newFindings, 'Nenhum novo finding identificado neste scan.')}
       ${renderFindingsSection('Findings Resolvidos', '&#9989;', comparison.resolvedFindings, 'Nenhum finding foi resolvido desde o último scan.')}
       <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:24px;">
         <tr><td style="padding:12px 16px;background-color:${COLORS.bgLight};border-radius:8px;font-size:14px;color:${COLORS.textSecondary};">
           &#128203; <strong>${comparison.persistentCount}</strong> findings persistentes desde o scan anterior
         </td></tr>
       </table>`
    : `<table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:24px;">
         <tr><td style="padding:16px;background-color:#e8f4fd;border-radius:8px;border-left:4px solid ${COLORS.ctaButton};font-size:14px;color:${COLORS.textPrimary};">
           &#8505;&#65039; Este é o primeiro scan desta conta. A comparação com scans anteriores estará disponível a partir do próximo relatório.
         </td></tr>
       </table>`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Relatório de Segurança - EVO</title></head>
<body style="margin:0;padding:0;background-color:${COLORS.bgBody};font-family:Arial,Helvetica,sans-serif;-webkit-font-smoothing:antialiased;">
<table cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${COLORS.bgBody};">
<tr><td align="center" style="padding:24px 16px;">
<table cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;background-color:${COLORS.white};border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">

<!-- Header -->
<tr><td style="background-color:${COLORS.headerBg};padding:32px 40px;text-align:center;">
  <table cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
    <td align="center">
      <div style="font-size:28px;font-weight:bold;color:${COLORS.white};letter-spacing:2px;">EVO</div>
      <div style="font-size:12px;color:#8899aa;margin-top:4px;letter-spacing:1px;">PLATFORM</div>
    </td>
  </tr></table>
  <div style="margin-top:20px;font-size:18px;color:${COLORS.white};font-weight:600;">Relatório de ${escapeHtml(scanTypeLabel)}</div>
  <div style="margin-top:8px;color:#8899aa;font-size:14px;">${escapeHtml(report.organizationName)}</div>
</td></tr>

<!-- Account Info -->
<tr><td style="padding:24px 40px 0 40px;">
  <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${COLORS.bgLight};border-radius:8px;padding:16px;">
    <tr><td style="padding:16px;">
      <table cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr>
          <td style="font-size:14px;color:${COLORS.textSecondary};">Conta Cloud</td>
          <td align="right">${getCloudProviderBadge(report.cloudProvider)}${firstScanBadge}</td>
        </tr>
        <tr><td colspan="2" style="font-size:18px;font-weight:600;color:${COLORS.textPrimary};padding-top:4px;">${escapeHtml(report.accountName)}</td></tr>
        <tr><td colspan="2" style="font-size:13px;color:${COLORS.textSecondary};padding-top:8px;">Executado em ${dateFormatted}</td></tr>
      </table>
    </td></tr>
  </table>
</td></tr>

<!-- Severity Summary -->
<tr><td style="padding:24px 40px;">
  <div style="font-size:16px;font-weight:600;color:${COLORS.textPrimary};margin-bottom:16px;">Resumo por Severidade</div>
  <table cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
    ${renderSeverityBox('Crítico', summary.critical, COLORS.critical)}
    ${renderSeverityBox('Alto', summary.high, COLORS.high)}
    ${renderSeverityBox('Médio', summary.medium, COLORS.medium)}
    ${renderSeverityBox('Baixo', summary.low, COLORS.low)}
  </tr></table>
  <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:12px;">
    <tr><td align="center" style="font-size:14px;color:${COLORS.textSecondary};">Total: <strong style="color:${COLORS.textPrimary};">${summary.total}</strong> findings</td></tr>
  </table>
</td></tr>

<!-- Comparison / First Scan -->
<tr><td style="padding:0 40px 24px 40px;">
  ${comparisonSection}
</td></tr>

<!-- CTA Button -->
<tr><td style="padding:0 40px 32px 40px;" align="center">
  <table cellpadding="0" cellspacing="0" border="0"><tr>
    <td align="center" style="background-color:${COLORS.ctaButton};border-radius:8px;">
      <a href="${escapeHtml(platformUrl)}" target="_blank" style="display:inline-block;padding:14px 32px;color:${COLORS.white};text-decoration:none;font-size:16px;font-weight:600;">Ver Detalhes na Plataforma</a>
    </td>
  </tr></table>
</td></tr>

<!-- Footer -->
<tr><td style="background-color:${COLORS.bgLight};padding:24px 40px;border-top:1px solid ${COLORS.border};">
  <table cellpadding="0" cellspacing="0" border="0" width="100%">
    <tr><td align="center" style="font-size:12px;color:${COLORS.textSecondary};line-height:1.6;">
      Este email foi enviado automaticamente pela plataforma EVO.<br>
      Para alterar suas preferências de notificação, acesse as configurações da sua conta.<br>
      <span style="color:#999999;">Se não deseja mais receber estes relatórios, desative as notificações por email nas configurações.</span>
    </td></tr>
  </table>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

/**
 * Gera o assunto do email de relatório.
 * Formato: [EVO] Relatório de Segurança - {accountName} - {date}
 */
export function generateReportSubject(report: ScanReport): string {
  const dateStr = formatDateShort(report.executedAt);
  return `[EVO] Relatório de Segurança - ${report.accountName} - ${dateStr}`;
}
