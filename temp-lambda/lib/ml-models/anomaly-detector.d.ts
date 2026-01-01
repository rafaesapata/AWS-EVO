/**
 * Anomaly Detector
 *
 * Detects anomalies in time series data using statistical methods.
 */
export interface Anomaly {
    index: number;
    value: number;
    expectedValue: number;
    deviation: number;
    zScore: number;
    type: 'spike' | 'drop' | 'outlier';
    severity: 'low' | 'medium' | 'high' | 'critical';
}
export interface AnomalyDetectionResult {
    anomalies: Anomaly[];
    mean: number;
    stdDev: number;
    threshold: number;
    anomalyRate: number;
}
/**
 * Detect anomalies using z-score method
 */
export declare function detectAnomalies(values: number[], options?: {
    threshold?: number;
    minDataPoints?: number;
}): AnomalyDetectionResult;
/**
 * Detect anomalies using IQR (Interquartile Range) method
 * More robust to outliers than z-score
 */
export declare function detectAnomaliesIQR(values: number[], options?: {
    multiplier?: number;
}): AnomalyDetectionResult;
/**
 * Check if a single value is anomalous given historical data
 */
export declare function isAnomaly(value: number, historicalValues: number[], threshold?: number): {
    isAnomaly: boolean;
    zScore: number;
    severity: 'low' | 'medium' | 'high' | 'critical' | null;
};
//# sourceMappingURL=anomaly-detector.d.ts.map