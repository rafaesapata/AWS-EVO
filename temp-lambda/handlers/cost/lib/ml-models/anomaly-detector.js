"use strict";
/**
 * Anomaly Detector
 *
 * Detects anomalies in time series data using statistical methods.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectAnomalies = detectAnomalies;
exports.detectAnomaliesIQR = detectAnomaliesIQR;
exports.isAnomaly = isAnomaly;
/**
 * Calculate mean of values
 */
function mean(values) {
    if (values.length === 0)
        return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
}
/**
 * Calculate standard deviation
 */
function stdDev(values, meanValue) {
    if (values.length < 2)
        return 0;
    const m = meanValue ?? mean(values);
    const squaredDiffs = values.map(v => (v - m) ** 2);
    return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / (values.length - 1));
}
/**
 * Calculate z-score for a value
 */
function zScore(value, meanValue, stdDevValue) {
    if (stdDevValue === 0)
        return 0;
    return (value - meanValue) / stdDevValue;
}
/**
 * Determine anomaly severity based on z-score
 */
function getSeverity(absZScore) {
    if (absZScore >= 4)
        return 'critical';
    if (absZScore >= 3)
        return 'high';
    if (absZScore >= 2.5)
        return 'medium';
    return 'low';
}
/**
 * Determine anomaly type
 */
function getAnomalyType(value, expectedValue) {
    const diff = value - expectedValue;
    if (diff > 0)
        return 'spike';
    if (diff < 0)
        return 'drop';
    return 'outlier';
}
/**
 * Detect anomalies using z-score method
 */
function detectAnomalies(values, options = {}) {
    const { threshold = 2.5, minDataPoints = 5 } = options;
    if (values.length < minDataPoints) {
        return {
            anomalies: [],
            mean: mean(values),
            stdDev: stdDev(values),
            threshold,
            anomalyRate: 0,
        };
    }
    const meanValue = mean(values);
    const stdDevValue = stdDev(values, meanValue);
    const anomalies = [];
    for (let i = 0; i < values.length; i++) {
        const z = zScore(values[i], meanValue, stdDevValue);
        const absZ = Math.abs(z);
        if (absZ >= threshold) {
            anomalies.push({
                index: i,
                value: values[i],
                expectedValue: meanValue,
                deviation: values[i] - meanValue,
                zScore: z,
                type: getAnomalyType(values[i], meanValue),
                severity: getSeverity(absZ),
            });
        }
    }
    return {
        anomalies,
        mean: meanValue,
        stdDev: stdDevValue,
        threshold,
        anomalyRate: values.length > 0 ? anomalies.length / values.length : 0,
    };
}
/**
 * Detect anomalies using IQR (Interquartile Range) method
 * More robust to outliers than z-score
 */
function detectAnomaliesIQR(values, options = {}) {
    const { multiplier = 1.5 } = options;
    if (values.length < 4) {
        return {
            anomalies: [],
            mean: mean(values),
            stdDev: stdDev(values),
            threshold: multiplier,
            anomalyRate: 0,
        };
    }
    // Sort values for quartile calculation
    const sorted = [...values].sort((a, b) => a - b);
    const n = sorted.length;
    // Calculate quartiles
    const q1Index = Math.floor(n * 0.25);
    const q3Index = Math.floor(n * 0.75);
    const q1 = sorted[q1Index];
    const q3 = sorted[q3Index];
    const iqr = q3 - q1;
    // Calculate bounds
    const lowerBound = q1 - multiplier * iqr;
    const upperBound = q3 + multiplier * iqr;
    const meanValue = mean(values);
    const stdDevValue = stdDev(values, meanValue);
    const anomalies = [];
    for (let i = 0; i < values.length; i++) {
        if (values[i] < lowerBound || values[i] > upperBound) {
            const z = zScore(values[i], meanValue, stdDevValue);
            anomalies.push({
                index: i,
                value: values[i],
                expectedValue: meanValue,
                deviation: values[i] - meanValue,
                zScore: z,
                type: getAnomalyType(values[i], meanValue),
                severity: getSeverity(Math.abs(z)),
            });
        }
    }
    return {
        anomalies,
        mean: meanValue,
        stdDev: stdDevValue,
        threshold: multiplier,
        anomalyRate: values.length > 0 ? anomalies.length / values.length : 0,
    };
}
/**
 * Check if a single value is anomalous given historical data
 */
function isAnomaly(value, historicalValues, threshold = 2.5) {
    if (historicalValues.length < 3) {
        return { isAnomaly: false, zScore: 0, severity: null };
    }
    const meanValue = mean(historicalValues);
    const stdDevValue = stdDev(historicalValues, meanValue);
    const z = zScore(value, meanValue, stdDevValue);
    const absZ = Math.abs(z);
    return {
        isAnomaly: absZ >= threshold,
        zScore: z,
        severity: absZ >= threshold ? getSeverity(absZ) : null,
    };
}
//# sourceMappingURL=anomaly-detector.js.map