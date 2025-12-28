/**
 * Seasonality Detector
 * 
 * Detects hourly, daily, and weekly patterns in time series data.
 */

export interface SeasonalityResult {
  hasSeasonality: boolean;
  type: 'hourly' | 'daily' | 'weekly' | 'none';
  strength: number; // 0-1
  peakHours: number[]; // Hours with highest activity (0-23)
  offPeakHours: number[]; // Hours with lowest activity
  weekdayPattern: number[]; // Average activity by day of week (0=Sunday)
  autocorrelation: number;
}

export interface HourlyDatapoint {
  hour: number; // 0-23
  dayOfWeek: number; // 0-6 (Sunday=0)
  value: number;
}

/**
 * Calculate autocorrelation at a given lag
 */
function autocorrelation(values: number[], lag: number): number {
  if (values.length <= lag) return 0;
  
  const n = values.length;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  
  let numerator = 0;
  let denominator = 0;
  
  for (let i = 0; i < n - lag; i++) {
    numerator += (values[i] - mean) * (values[i + lag] - mean);
  }
  
  for (let i = 0; i < n; i++) {
    denominator += (values[i] - mean) ** 2;
  }
  
  return denominator !== 0 ? numerator / denominator : 0;
}

/**
 * Detect seasonality in time series data
 */
export function detectSeasonality(
  datapoints: HourlyDatapoint[]
): SeasonalityResult {
  if (datapoints.length < 24) {
    return {
      hasSeasonality: false,
      type: 'none',
      strength: 0,
      peakHours: [],
      offPeakHours: [],
      weekdayPattern: [0, 0, 0, 0, 0, 0, 0],
      autocorrelation: 0,
    };
  }
  
  // Calculate hourly averages
  const hourlyTotals: number[] = new Array(24).fill(0);
  const hourlyCounts: number[] = new Array(24).fill(0);
  
  // Calculate weekday averages
  const weekdayTotals: number[] = new Array(7).fill(0);
  const weekdayCounts: number[] = new Array(7).fill(0);
  
  for (const dp of datapoints) {
    hourlyTotals[dp.hour] += dp.value;
    hourlyCounts[dp.hour]++;
    weekdayTotals[dp.dayOfWeek] += dp.value;
    weekdayCounts[dp.dayOfWeek]++;
  }
  
  const hourlyAverages = hourlyTotals.map((total, i) => 
    hourlyCounts[i] > 0 ? total / hourlyCounts[i] : 0
  );
  
  const weekdayAverages = weekdayTotals.map((total, i) => 
    weekdayCounts[i] > 0 ? total / weekdayCounts[i] : 0
  );
  
  // Find peak and off-peak hours
  const sortedHours = hourlyAverages
    .map((avg, hour) => ({ hour, avg }))
    .sort((a, b) => b.avg - a.avg);
  
  const maxAvg = Math.max(...hourlyAverages);
  const minAvg = Math.min(...hourlyAverages);
  const threshold = (maxAvg + minAvg) / 2;
  
  const peakHours = sortedHours
    .filter(h => h.avg > threshold)
    .slice(0, 6)
    .map(h => h.hour);
  
  const offPeakHours = sortedHours
    .filter(h => h.avg <= threshold)
    .slice(-6)
    .map(h => h.hour);
  
  // Calculate autocorrelation for different lags
  const values = datapoints.map(dp => dp.value);
  const hourlyAutocorr = autocorrelation(values, 24); // Daily pattern
  const weeklyAutocorr = autocorrelation(values, 168); // Weekly pattern (24*7)
  
  // Determine seasonality type and strength
  let type: 'hourly' | 'daily' | 'weekly' | 'none' = 'none';
  let strength = 0;
  let autocorr = 0;
  
  // Calculate coefficient of variation for hourly pattern
  const hourlyMean = hourlyAverages.reduce((a, b) => a + b, 0) / 24;
  const hourlyStdDev = Math.sqrt(
    hourlyAverages.reduce((sum, v) => sum + (v - hourlyMean) ** 2, 0) / 24
  );
  const hourlyCV = hourlyMean !== 0 ? hourlyStdDev / hourlyMean : 0;
  
  // Calculate coefficient of variation for weekday pattern
  const weekdayMean = weekdayAverages.reduce((a, b) => a + b, 0) / 7;
  const weekdayStdDev = Math.sqrt(
    weekdayAverages.reduce((sum, v) => sum + (v - weekdayMean) ** 2, 0) / 7
  );
  const weekdayCV = weekdayMean !== 0 ? weekdayStdDev / weekdayMean : 0;
  
  if (Math.abs(weeklyAutocorr) > 0.3 && weekdayCV > 0.2) {
    type = 'weekly';
    strength = Math.min(1, Math.abs(weeklyAutocorr) + weekdayCV);
    autocorr = weeklyAutocorr;
  } else if (Math.abs(hourlyAutocorr) > 0.3 && hourlyCV > 0.2) {
    type = 'daily';
    strength = Math.min(1, Math.abs(hourlyAutocorr) + hourlyCV);
    autocorr = hourlyAutocorr;
  } else if (hourlyCV > 0.3) {
    type = 'hourly';
    strength = Math.min(1, hourlyCV);
    autocorr = hourlyAutocorr;
  }
  
  return {
    hasSeasonality: type !== 'none',
    type,
    strength,
    peakHours,
    offPeakHours,
    weekdayPattern: weekdayAverages.map(v => parseFloat(v.toFixed(2))),
    autocorrelation: parseFloat(autocorr.toFixed(4)),
  };
}

/**
 * Identify peak hours from hourly data
 */
export function identifyPeakHours(
  hourlyValues: number[],
  topN: number = 4
): { peakHours: number[]; offPeakHours: number[] } {
  if (hourlyValues.length !== 24) {
    return { peakHours: [], offPeakHours: [] };
  }
  
  const indexed = hourlyValues.map((value, hour) => ({ hour, value }));
  const sorted = [...indexed].sort((a, b) => b.value - a.value);
  
  return {
    peakHours: sorted.slice(0, topN).map(h => h.hour),
    offPeakHours: sorted.slice(-topN).map(h => h.hour),
  };
}

/**
 * Calculate optimal scheduling windows based on usage patterns
 */
export function getOptimalSchedulingWindows(
  seasonality: SeasonalityResult
): { maintenanceWindows: number[]; scaleUpHours: number[]; scaleDownHours: number[] } {
  if (!seasonality.hasSeasonality) {
    return {
      maintenanceWindows: [2, 3, 4], // Default: 2-5 AM
      scaleUpHours: [],
      scaleDownHours: [],
    };
  }
  
  // Maintenance windows are off-peak hours
  const maintenanceWindows = seasonality.offPeakHours.slice(0, 3);
  
  // Scale up 1 hour before peak
  const scaleUpHours = seasonality.peakHours
    .map(h => (h - 1 + 24) % 24)
    .filter(h => !seasonality.peakHours.includes(h));
  
  // Scale down 1 hour after peak
  const scaleDownHours = seasonality.peakHours
    .map(h => (h + 1) % 24)
    .filter(h => !seasonality.peakHours.includes(h));
  
  return {
    maintenanceWindows,
    scaleUpHours: [...new Set(scaleUpHours)],
    scaleDownHours: [...new Set(scaleDownHours)],
  };
}
