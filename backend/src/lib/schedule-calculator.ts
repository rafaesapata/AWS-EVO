/**
 * Schedule Calculator
 * 
 * Funções utilitárias para cálculo de próxima execução de agendamentos
 * e validação de limites diários.
 * 
 * Extraído de scheduled-scan-executor.ts para reutilização em múltiplos handlers.
 */

/**
 * Verifica se duas datas estão no mesmo dia UTC.
 * Usado para validação de limite de uma execução diária por conta.
 */
export function isSameDayUTC(date1: Date, date2: Date): boolean {
  return (
    date1.getUTCFullYear() === date2.getUTCFullYear() &&
    date1.getUTCMonth() === date2.getUTCMonth() &&
    date1.getUTCDate() === date2.getUTCDate()
  );
}

/**
 * Calcula a próxima execução baseado no tipo de schedule.
 * 
 * - hourly: próxima hora
 * - daily: próximo dia no horário configurado (default 02:00 UTC)
 * - weekly: próximo dia da semana configurado no horário (default segunda 02:00 UTC)
 * - monthly: próximo dia do mês configurado no horário (default dia 1 02:00 UTC)
 */
export function calculateNextRun(scheduleType: string, scheduleConfig: unknown): Date | null {
  const config = scheduleConfig as Record<string, number> | null;
  const now = new Date();
  
  switch (scheduleType.toLowerCase()) {
    case 'hourly':
      return new Date(now.getTime() + 60 * 60 * 1000);
      
    case 'daily': {
      const dailyHour = config?.hour ?? 2;
      const nextDaily = new Date(Date.UTC(
        now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(),
        dailyHour, 0, 0, 0
      ));
      if (nextDaily <= now) nextDaily.setUTCDate(nextDaily.getUTCDate() + 1);
      return nextDaily;
    }
    
    case 'weekly': {
      const weeklyDay = config?.dayOfWeek ?? 1; // Monday
      const weeklyHour = config?.hour ?? 2;
      const nextWeekly = new Date(Date.UTC(
        now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(),
        weeklyHour, 0, 0, 0
      ));
      const dayDiff = (weeklyDay - now.getUTCDay() + 7) % 7;
      // If today is the target day but time already passed, schedule next week
      const daysUntilNext = dayDiff === 0 && nextWeekly <= now ? 7 : dayDiff || 7;
      nextWeekly.setUTCDate(nextWeekly.getUTCDate() + daysUntilNext);
      return nextWeekly;
    }
    
    case 'monthly': {
      const monthlyDay = config?.dayOfMonth ?? 1;
      const monthlyHour = config?.hour ?? 2;
      const nextMonthly = new Date(Date.UTC(
        now.getUTCFullYear(), now.getUTCMonth(), monthlyDay,
        monthlyHour, 0, 0, 0
      ));
      if (nextMonthly <= now) nextMonthly.setUTCMonth(nextMonthly.getUTCMonth() + 1);
      return nextMonthly;
    }
    
    default: {
      // Default: próximo dia às 2h UTC
      const defaultNext = new Date(Date.UTC(
        now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1,
        2, 0, 0, 0
      ));
      return defaultNext;
    }
  }
}
