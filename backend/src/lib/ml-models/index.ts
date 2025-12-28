/**
 * ML Models module exports
 */

export {
  forecastUsage,
  detectTrend,
  type ForecastResult,
  type TimeSeriesDatapoint,
} from './usage-forecaster.js';

export {
  detectAnomalies,
  detectAnomaliesIQR,
  isAnomaly,
  type Anomaly,
  type AnomalyDetectionResult,
} from './anomaly-detector.js';

export {
  detectSeasonality,
  identifyPeakHours,
  getOptimalSchedulingWindows,
  type SeasonalityResult,
  type HourlyDatapoint,
} from './seasonality-detector.js';
