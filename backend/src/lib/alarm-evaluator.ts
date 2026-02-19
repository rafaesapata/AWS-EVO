/**
 * Avaliador de Condições de Alarme Inteligente
 * 
 * Biblioteca pura (sem side effects) que avalia resultados de scan
 * e determina quais condições de alarme devem ser disparadas.
 */

import type { ScanReport } from './report-email-templates.js';

export interface AlarmCondition {
  type: 'new_critical' | 'degradation' | 'improvement';
  priority: 'critical' | 'high' | 'low';
  threshold?: number;
  message: string;
}

/**
 * Avalia condições de alarme com base no relatório de scan.
 * 
 * Condições avaliadas:
 * 1. new_critical: novos findings com severity="critical" → priority="critical"
 * 2. degradation: changePercentage > 20 → priority="high"
 * 3. improvement: todos os findings críticos anteriores resolvidos → priority="low"
 * 
 * @returns Array de condições detectadas (pode conter múltiplas ou nenhuma)
 */
export function evaluateAlarmConditions(report: ScanReport): AlarmCondition[] {
  if (!report.comparison) {
    return [];
  }

  const conditions: AlarmCondition[] = [];
  const { comparison } = report;

  // 1. new_critical: novos findings com severidade "critical"
  const newCriticalFindings = comparison.newFindings.filter(
    (f) => f.severity === 'critical'
  );
  if (newCriticalFindings.length > 0) {
    const titles = newCriticalFindings.map((f) => f.title).join(', ');
    conditions.push({
      type: 'new_critical',
      priority: 'critical',
      message: `Encontrados ${newCriticalFindings.length} novo(s) finding(s) crítico(s): ${titles}`,
    });
  }

  // 2. degradation: aumento de mais de 20% no total de findings
  if (comparison.changePercentage > 20) {
    conditions.push({
      type: 'degradation',
      priority: 'high',
      threshold: 20,
      message: `Degradação significativa da postura de segurança: aumento de ${comparison.changePercentage.toFixed(1)}% no total de findings`,
    });
  }

  // 3. improvement: todos os findings críticos do scan anterior foram resolvidos
  const resolvedCriticalFindings = comparison.resolvedFindings.filter(
    (f) => f.severity === 'critical'
  );
  if (resolvedCriticalFindings.length > 0) {
    // summary.critical = all current criticals (new + persistent)
    // Subtract new criticals to get only persistent ones from previous scan
    const currentPersistentCriticalCount = report.summary.critical - newCriticalFindings.length;
    if (currentPersistentCriticalCount <= 0 && newCriticalFindings.length === 0) {
      conditions.push({
        type: 'improvement',
        priority: 'low',
        message: `Melhoria na postura de segurança: ${resolvedCriticalFindings.length} finding(s) crítico(s) do scan anterior foram resolvidos`,
      });
    }
  }

  return conditions;
}
