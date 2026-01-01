"use strict";
/**
 * Analyzer Types and Interfaces
 *
 * Defines all types used by resource analyzers for ML waste detection.
 *
 * @module analyzers/types
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.toLegacyResult = toLegacyResult;
exports.calculatePriority = calculatePriority;
/**
 * Convert full MLResult to legacy format
 */
function toLegacyResult(result) {
    return {
        resourceId: result.resourceId,
        resourceName: result.resourceName,
        resourceType: result.resourceType,
        region: result.region,
        currentSize: result.currentSize,
        currentMonthlyCost: result.currentMonthlyCost,
        recommendationType: result.recommendationType === 'migrate' ? 'optimize' : result.recommendationType,
        recommendedSize: result.recommendedSize,
        potentialMonthlySavings: result.potentialMonthlySavings,
        mlConfidence: result.mlConfidence,
        utilizationPatterns: result.utilizationPatterns,
        autoScalingEligible: result.autoScalingEligible,
        autoScalingConfig: result.autoScalingConfig,
        implementationComplexity: result.implementationComplexity,
    };
}
/**
 * Calculate recommendation priority based on savings
 */
function calculatePriority(monthlySavings, confidence) {
    // Priority 5: > $500/month with high confidence
    if (monthlySavings > 500 && confidence > 0.8)
        return 5;
    // Priority 4: > $200/month or > $500 with medium confidence
    if (monthlySavings > 200 || (monthlySavings > 500 && confidence > 0.6))
        return 4;
    // Priority 3: > $50/month
    if (monthlySavings > 50)
        return 3;
    // Priority 2: > $10/month
    if (monthlySavings > 10)
        return 2;
    // Priority 1: Any savings
    return 1;
}
//# sourceMappingURL=types.js.map