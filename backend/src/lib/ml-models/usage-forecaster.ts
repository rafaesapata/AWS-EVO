/**
 * Usage Forecaster
 * 
 * Implements time series analysis for usage prediction.
 */

export interface ForecastResult {
  predictedValue: number;
  confidenceInterval: { lower: number; upper: number };
  trend: 'increasing' | 'stable' | 'decreasing';
  trendStrength: number; // 0-1
  dataPoints: number;
}

export interface TimeSeriesDatapoint {
  timestamp: Date;
  value: number;
}

/**
 * Calculate simple moving average
 */
function calculateSMA(values: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = period - 1; i < values.length; i++) {
    const sum = values.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
    result.push(sum / period);
  }
  return result;
}

/**
 * Calculate linear regression
 */
function linearRegression(values: number[]): { slope: number; intercept: number; r2: number } {
  const n = values.length;
  if (n < 2) return { slope: 0, intercept: values[0] || 0, r2: 0 };
  
  const xMean = (n - 1) / 2;
  const yMean = values.reduce((a, b) => a + b, 0) / n;
  
  let numerator = 0;
  let denominator = 0;
  let ssTotal = 0;
  
  for (let i = 0; i < n; i++) {
    numerator += (i - xMean) * (values[i] - yMean);
    denominator += (i - xMean) ** 2;
    ssTotal += (values[i] - yMean) ** 2;
  }
  
  const slope = denominator !== 0 ? numerator / denominator : 0;
  const intercept = yMean - slope * xMean;
  
  // Calculate R-squared
  let ssResidual = 0;
  for (let i = 0; i < n; i++) {
    const predicted = intercept + slope * i;
    ssResidual += (values[i] - predicted) ** 2;
  }
  const r2 = ssTotal !== 0 ? 1 - ssResidual / ssTotal : 0;
  
  return { slope, intercept, r2 };
}

/**
 * Calculate standard deviation
 */
function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const squaredDiffs = values.map(v => (v - mean) ** 2);
  return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / (values.length - 1));
}

/**
 * Forecast future usage based on historical data
 */
export function forecastUsage(
  datapoints: TimeSeriesDatapoint[],
  periodsAhead: number = 7
): ForecastResult {
  if (datapoints.length < 3) {
    const avgValue = datapoints.length > 0 
      ? datapoints.reduce((sum, dp) => sum + dp.value, 0) / datapoints.length 
      : 0;
    return {
      predictedValue: avgValue,
      confidenceInterval: { lower: avgValue * 0.8, upper: avgValue * 1.2 },
      trend: 'stable',
      trendStrength: 0,
      dataPoints: datapoints.length,
    };
  }
  
  const values = datapoints.map(dp => dp.value);
  const { slope, intercept, r2 } = linearRegression(values);
  
  // Predict future value
  const predictedValue = Math.max(0, intercept + slope * (values.length + periodsAhead - 1));
  
  // Calculate confidence interval
  const stdDev = standardDeviation(values);
  const confidenceMultiplier = 1.96; // 95% confidence
  const lower = Math.max(0, predictedValue - confidenceMultiplier * stdDev);
  const upper = predictedValue + confidenceMultiplier * stdDev;
  
  // Determine trend
  let trend: 'increasing' | 'stable' | 'decreasing';
  const avgValue = values.reduce((a, b) => a + b, 0) / values.length;
  const slopePercentage = avgValue !== 0 ? (slope / avgValue) * 100 : 0;
  
  if (slopePercentage > 5) {
    trend = 'increasing';
  } else if (slopePercentage < -5) {
    trend = 'decreasing';
  } else {
    trend = 'stable';
  }
  
  return {
    predictedValue,
    confidenceInterval: { lower, upper },
    trend,
    trendStrength: Math.min(1, Math.abs(r2)),
    dataPoints: datapoints.length,
  };
}

/**
 * Detect trend in time series data
 */
export function detectTrend(values: number[]): {
  trend: 'increasing' | 'stable' | 'decreasing';
  strength: number;
  changePercent: number;
} {
  if (values.length < 2) {
    return { trend: 'stable', strength: 0, changePercent: 0 };
  }
  
  const { slope, r2 } = linearRegression(values);
  const avgValue = values.reduce((a, b) => a + b, 0) / values.length;
  const changePercent = avgValue !== 0 ? (slope * values.length / avgValue) * 100 : 0;
  
  let trend: 'increasing' | 'stable' | 'decreasing';
  if (changePercent > 10) {
    trend = 'increasing';
  } else if (changePercent < -10) {
    trend = 'decreasing';
  } else {
    trend = 'stable';
  }
  
  return {
    trend,
    strength: Math.abs(r2),
    changePercent,
  };
}
