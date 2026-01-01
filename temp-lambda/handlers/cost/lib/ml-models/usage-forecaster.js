"use strict";
/**
 * Usage Forecaster
 *
 * Implements time series analysis for usage prediction.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.forecastUsage = forecastUsage;
exports.detectTrend = detectTrend;
/**
 * Calculate simple moving average
 */
function calculateSMA(values, period) {
    const result = [];
    for (let i = period - 1; i < values.length; i++) {
        const sum = values.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
        result.push(sum / period);
    }
    return result;
}
/**
 * Calculate linear regression
 */
function linearRegression(values) {
    const n = values.length;
    if (n < 2)
        return { slope: 0, intercept: values[0] || 0, r2: 0 };
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
function standardDeviation(values) {
    if (values.length < 2)
        return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const squaredDiffs = values.map(v => (v - mean) ** 2);
    return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / (values.length - 1));
}
/**
 * Forecast future usage based on historical data
 */
function forecastUsage(datapoints, periodsAhead = 7) {
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
    let trend;
    const avgValue = values.reduce((a, b) => a + b, 0) / values.length;
    const slopePercentage = avgValue !== 0 ? (slope / avgValue) * 100 : 0;
    if (slopePercentage > 5) {
        trend = 'increasing';
    }
    else if (slopePercentage < -5) {
        trend = 'decreasing';
    }
    else {
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
function detectTrend(values) {
    if (values.length < 2) {
        return { trend: 'stable', strength: 0, changePercent: 0 };
    }
    const { slope, r2 } = linearRegression(values);
    const avgValue = values.reduce((a, b) => a + b, 0) / values.length;
    const changePercent = avgValue !== 0 ? (slope * values.length / avgValue) * 100 : 0;
    let trend;
    if (changePercent > 10) {
        trend = 'increasing';
    }
    else if (changePercent < -10) {
        trend = 'decreasing';
    }
    else {
        trend = 'stable';
    }
    return {
        trend,
        strength: Math.abs(r2),
        changePercent,
    };
}
//# sourceMappingURL=usage-forecaster.js.map