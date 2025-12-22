/**
 * Cron utilities for calculating next run times
 * Native implementation without external dependencies
 */

interface CronParts {
  minute: number[];
  hour: number[];
  dayOfMonth: number[];
  month: number[];
  dayOfWeek: number[];
}

/**
 * Parse a cron expression into its components
 */
function parseCronExpression(cronExpression: string): CronParts {
  const parts = cronExpression.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error('Invalid cron expression format. Expected: minute hour day month dayOfWeek');
  }

  return {
    minute: parseField(parts[0], 0, 59),
    hour: parseField(parts[1], 0, 23),
    dayOfMonth: parseField(parts[2], 1, 31),
    month: parseField(parts[3], 1, 12),
    dayOfWeek: parseField(parts[4], 0, 7), // 0 and 7 both represent Sunday
  };
}

/**
 * Parse a single cron field
 */
function parseField(field: string, min: number, max: number): number[] {
  if (field === '*') {
    return Array.from({ length: max - min + 1 }, (_, i) => min + i);
  }

  const values: number[] = [];
  const parts = field.split(',');

  for (const part of parts) {
    if (part.includes('/')) {
      // Step values (e.g., */5, 0-30/5)
      const [range, step] = part.split('/');
      const stepValue = parseInt(step, 10);
      const rangeValues = range === '*' 
        ? Array.from({ length: max - min + 1 }, (_, i) => min + i)
        : parseRange(range, min, max);
      
      for (const val of rangeValues) {
        if ((val - min) % stepValue === 0) {
          values.push(val);
        }
      }
    } else if (part.includes('-')) {
      // Range (e.g., 1-5)
      values.push(...parseRange(part, min, max));
    } else {
      // Single value
      const value = parseInt(part, 10);
      if (value >= min && value <= max) {
        values.push(value);
      }
    }
  }

  return [...new Set(values)].sort((a, b) => a - b);
}

/**
 * Parse a range (e.g., 1-5)
 */
function parseRange(range: string, min: number, max: number): number[] {
  const [start, end] = range.split('-').map(v => parseInt(v, 10));
  const values: number[] = [];
  for (let i = start; i <= end; i++) {
    if (i >= min && i <= max) {
      values.push(i);
    }
  }
  return values;
}

/**
 * Calculate the next run time for a cron expression
 */
export function calculateNextRun(cronExpression: string, currentDate?: Date): string {
  try {
    const cron = parseCronExpression(cronExpression);
    const now = currentDate || new Date();
    let next = new Date(now);
    next.setSeconds(0);
    next.setMilliseconds(0);
    
    // Start checking from the next minute
    next.setMinutes(next.getMinutes() + 1);

    // Try up to 4 years into the future (365*4 days = 1460 days)
    for (let i = 0; i < 1460 * 24 * 60; i++) {
      const minute = next.getMinutes();
      const hour = next.getHours();
      const day = next.getDate();
      const month = next.getMonth() + 1;
      const dow = next.getDay();

      if (
        cron.minute.includes(minute) &&
        cron.hour.includes(hour) &&
        cron.dayOfMonth.includes(day) &&
        cron.month.includes(month) &&
        (cron.dayOfWeek.includes(dow) || cron.dayOfWeek.includes(dow === 0 ? 7 : dow))
      ) {
        return next.toISOString();
      }

      // Move to next minute
      next.setMinutes(next.getMinutes() + 1);
    }

    // Fallback: couldn't find a match, add 24 hours
    const fallback = new Date(now);
    fallback.setHours(fallback.getHours() + 24);
    return fallback.toISOString();
  } catch (error) {
    console.error('Error calculating next run:', error);
    // Fallback: add 24 hours
    const fallback = currentDate || new Date();
    fallback.setHours(fallback.getHours() + 24);
    return fallback.toISOString();
  }
}

/**
 * Calculate multiple next run times
 */
export function calculateNextRuns(
  cronExpression: string,
  count: number,
  currentDate?: Date
): string[] {
  const dates: string[] = [];
  let current = currentDate || new Date();
  
  for (let i = 0; i < count; i++) {
    const next = calculateNextRun(cronExpression, current);
    dates.push(next);
    current = new Date(next);
  }
  
  return dates;
}

/**
 * Validate a cron expression
 */
export function isValidCron(cronExpression: string): boolean {
  try {
    parseCronExpression(cronExpression);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Get human-readable description of cron expression
 */
export function describeCron(cronExpression: string): string {
  try {
    const next1 = new Date(calculateNextRun(cronExpression));
    const next2 = new Date(calculateNextRun(cronExpression, next1));
    
    const diff = next2.getTime() - next1.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days >= 1) {
      return `Every ${days} day${days > 1 ? 's' : ''}`;
    } else if (hours >= 1) {
      return `Every ${hours} hour${hours > 1 ? 's' : ''}`;
    } else if (minutes >= 1) {
      return `Every ${minutes} minute${minutes > 1 ? 's' : ''}`;
    } else {
      return 'Every minute';
    }
  } catch (error) {
    return 'Invalid cron expression';
  }
}
