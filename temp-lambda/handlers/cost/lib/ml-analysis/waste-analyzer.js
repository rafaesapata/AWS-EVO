"use strict";
/**
 * ML Waste Analyzer Module
 *
 * Provides statistical analysis and ML-based classification for AWS resource waste detection.
 * Uses pattern recognition to identify idle, underutilized, and oversized resources.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeUtilization = analyzeUtilization;
exports.calculateAutoScalingConfig = calculateAutoScalingConfig;
exports.classifyWaste = classifyWaste;
exports.generateUtilizationPatterns = generateUtilizationPatterns;
exports.getImplementationComplexity = getImplementationComplexity;
const pricing_js_1 = require("../cost/pricing.js");
// Statistical helper functions
function mean(values) {
    if (values.length === 0)
        return 0;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
}
function standardDeviation(values) {
    if (values.length < 2)
        return 0;
    const avg = mean(values);
    const squareDiffs = values.map(v => Math.pow(v - avg, 2));
    return Math.sqrt(mean(squareDiffs));
}
function percentile(values, p) {
    if (values.length === 0)
        return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
}
/**
 * Group datapoints by hour and calculate average
 */
function groupByHour(datapoints) {
    const hourlyData = {};
    for (const dp of datapoints) {
        if (dp.Timestamp && dp.Average !== undefined) {
            const hour = new Date(dp.Timestamp).getUTCHours();
            if (!hourlyData[hour])
                hourlyData[hour] = [];
            hourlyData[hour].push(dp.Average);
        }
    }
    const hourlyAvg = {};
    for (const [hour, values] of Object.entries(hourlyData)) {
        hourlyAvg[parseInt(hour)] = mean(values);
    }
    return hourlyAvg;
}
/**
 * Calculate weekday pattern (average usage per day of week)
 */
function calculateWeekdayPattern(datapoints) {
    const weekdayData = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
    for (const dp of datapoints) {
        if (dp.Timestamp && dp.Average !== undefined) {
            const dayOfWeek = new Date(dp.Timestamp).getUTCDay();
            weekdayData[dayOfWeek].push(dp.Average);
        }
    }
    // Return array for Mon-Sun (shift Sunday to end)
    return [1, 2, 3, 4, 5, 6, 0].map(day => mean(weekdayData[day]));
}
/**
 * Analyze CloudWatch metrics and extract utilization patterns
 */
function analyzeUtilization(cpuMetrics, memoryMetrics, analysisDays = 7) {
    // Extract CPU values
    const cpuValues = cpuMetrics
        .filter(dp => dp.Average !== undefined)
        .map(dp => dp.Average);
    const maxCpuValues = cpuMetrics
        .filter(dp => dp.Maximum !== undefined)
        .map(dp => dp.Maximum);
    // Calculate CPU statistics
    const avgCpu = mean(cpuValues);
    const maxCpu = maxCpuValues.length > 0 ? Math.max(...maxCpuValues) : Math.max(...cpuValues, 0);
    const minCpu = cpuValues.length > 0 ? Math.min(...cpuValues) : 0;
    const stdDevCpu = standardDeviation(cpuValues);
    // Calculate memory statistics (if available)
    const memoryValues = memoryMetrics
        ?.filter(dp => dp.Average !== undefined)
        .map(dp => dp.Average) || [];
    const avgMemory = mean(memoryValues);
    const maxMemory = memoryValues.length > 0 ? Math.max(...memoryValues) : 0;
    // Identify peak hours (hours with above-average usage)
    const hourlyAvg = groupByHour(cpuMetrics);
    const overallAvg = avgCpu;
    const peakHours = Object.entries(hourlyAvg)
        .filter(([_, avg]) => avg > overallAvg * 1.2)
        .map(([hour]) => parseInt(hour))
        .sort((a, b) => a - b);
    // Calculate weekday pattern
    const weekdayPattern = calculateWeekdayPattern(cpuMetrics);
    // Calculate data completeness
    // Expected: 1 datapoint per 5 minutes for analysisDays
    const expectedDatapoints = analysisDays * 24 * 12;
    const dataCompleteness = Math.min(1, cpuMetrics.length / expectedDatapoints);
    return {
        avgCpu: parseFloat(avgCpu.toFixed(2)),
        maxCpu: parseFloat(maxCpu.toFixed(2)),
        minCpu: parseFloat(minCpu.toFixed(2)),
        stdDevCpu: parseFloat(stdDevCpu.toFixed(2)),
        avgMemory: parseFloat(avgMemory.toFixed(2)),
        maxMemory: parseFloat(maxMemory.toFixed(2)),
        peakHours,
        weekdayPattern: weekdayPattern.map(v => parseFloat(v.toFixed(2))),
        dataCompleteness: parseFloat(dataCompleteness.toFixed(2)),
        datapointCount: cpuMetrics.length,
    };
}
/**
 * Calculate confidence score based on data quality and pattern consistency
 */
function calculateConfidence(metrics, baseConfidence) {
    let confidence = baseConfidence;
    // Reduce confidence if data is incomplete
    confidence *= Math.max(0.5, metrics.dataCompleteness);
    // Reduce confidence if high variance (unpredictable patterns)
    if (metrics.stdDevCpu > 30) {
        confidence *= 0.8;
    }
    else if (metrics.stdDevCpu > 20) {
        confidence *= 0.9;
    }
    // Increase confidence if we have enough datapoints
    if (metrics.datapointCount > 500) {
        confidence *= 1.1;
    }
    return Math.max(0, Math.min(1, confidence));
}
/**
 * Calculate optimal auto-scaling configuration based on utilization patterns
 */
function calculateAutoScalingConfig(metrics) {
    // Target CPU should be above average but below peak
    const targetCpu = Math.min(70, Math.max(50, metrics.avgCpu + metrics.stdDevCpu));
    // Min capacity: 1 (or more if minimum usage is high)
    const minCapacity = metrics.minCpu > 30 ? 2 : 1;
    // Max capacity: based on peak usage relative to target
    const maxCapacity = Math.max(2, Math.ceil(metrics.maxCpu / targetCpu) + 1);
    // Cooldown periods
    const scaleOutCooldown = 60; // Quick scale out
    const scaleInCooldown = metrics.stdDevCpu > 20 ? 600 : 300; // Slower scale in if variable
    return {
        min_capacity: minCapacity,
        max_capacity: Math.min(maxCapacity, 10), // Cap at 10
        target_cpu: Math.round(targetCpu),
        scale_in_cooldown: scaleInCooldown,
        scale_out_cooldown: scaleOutCooldown,
    };
}
/**
 * Classify waste and generate ML recommendation
 */
function classifyWaste(metrics, resourceType, currentSize) {
    const currentCost = (0, pricing_js_1.getMonthlyCost)(resourceType, currentSize);
    // TERMINATE: Very low usage, essentially idle
    if (metrics.avgCpu < 1 && metrics.maxCpu < 5) {
        return {
            type: 'terminate',
            confidence: calculateConfidence(metrics, 0.95),
            savings: currentCost,
            complexity: 'low',
        };
    }
    // TERMINATE: Zombie resource (no meaningful activity)
    if (metrics.avgCpu < 2 && metrics.maxCpu < 10 && metrics.stdDevCpu < 2) {
        return {
            type: 'terminate',
            confidence: calculateConfidence(metrics, 0.90),
            savings: currentCost,
            complexity: 'low',
        };
    }
    // DOWNSIZE: Consistently low usage with predictable patterns
    if (metrics.avgCpu < 30 && metrics.maxCpu < 60 && metrics.stdDevCpu < 15) {
        const recommendedSize = (0, pricing_js_1.getDownsizeRecommendation)(resourceType, currentSize, metrics.maxCpu);
        const savings = (0, pricing_js_1.calculateDownsizeSavings)(resourceType, currentSize, recommendedSize);
        if (savings > 0) {
            return {
                type: 'downsize',
                confidence: calculateConfidence(metrics, 0.85),
                recommendedSize,
                savings,
                complexity: 'medium',
            };
        }
    }
    // AUTO-SCALE: High variance with predictable peak patterns
    if (metrics.stdDevCpu > 20 && metrics.peakHours.length > 0 && metrics.peakHours.length < 12) {
        const autoScalingConfig = calculateAutoScalingConfig(metrics);
        // Estimate 30% savings from auto-scaling
        const estimatedSavings = currentCost * 0.3;
        return {
            type: 'auto-scale',
            confidence: calculateConfidence(metrics, 0.75),
            savings: estimatedSavings,
            autoScalingConfig,
            complexity: 'high',
        };
    }
    // DOWNSIZE: Moderate underutilization
    if (metrics.avgCpu < 40 && metrics.maxCpu < 70) {
        const recommendedSize = (0, pricing_js_1.getDownsizeRecommendation)(resourceType, currentSize, metrics.maxCpu);
        const savings = (0, pricing_js_1.calculateDownsizeSavings)(resourceType, currentSize, recommendedSize);
        if (savings > 0) {
            return {
                type: 'downsize',
                confidence: calculateConfidence(metrics, 0.70),
                recommendedSize,
                savings,
                complexity: 'medium',
            };
        }
    }
    // OPTIMIZE: General optimization opportunity
    return {
        type: 'optimize',
        confidence: calculateConfidence(metrics, 0.50),
        savings: 0,
        complexity: 'medium',
    };
}
/**
 * Generate utilization patterns object for storage
 */
function generateUtilizationPatterns(metrics) {
    return {
        avgCpuUsage: metrics.avgCpu,
        avgMemoryUsage: metrics.avgMemory,
        peakHours: metrics.peakHours,
        weekdayPattern: metrics.weekdayPattern,
        hasRealMetrics: metrics.datapointCount > 0,
    };
}
/**
 * Determine implementation complexity based on recommendation type and resource
 */
function getImplementationComplexity(recommendationType, resourceType) {
    if (recommendationType === 'terminate') {
        return 'low';
    }
    if (recommendationType === 'auto-scale') {
        return 'high';
    }
    if (recommendationType === 'downsize') {
        // RDS downsizing is more complex due to potential downtime
        if (resourceType.toLowerCase().includes('rds')) {
            return 'medium';
        }
        return 'medium';
    }
    return 'medium';
}
//# sourceMappingURL=waste-analyzer.js.map