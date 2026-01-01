/**
 * Seasonality Detector
 *
 * Detects hourly, daily, and weekly patterns in time series data.
 */
export interface SeasonalityResult {
    hasSeasonality: boolean;
    type: 'hourly' | 'daily' | 'weekly' | 'none';
    strength: number;
    peakHours: number[];
    offPeakHours: number[];
    weekdayPattern: number[];
    autocorrelation: number;
}
export interface HourlyDatapoint {
    hour: number;
    dayOfWeek: number;
    value: number;
}
/**
 * Detect seasonality in time series data
 */
export declare function detectSeasonality(datapoints: HourlyDatapoint[]): SeasonalityResult;
/**
 * Identify peak hours from hourly data
 */
export declare function identifyPeakHours(hourlyValues: number[], topN?: number): {
    peakHours: number[];
    offPeakHours: number[];
};
/**
 * Calculate optimal scheduling windows based on usage patterns
 */
export declare function getOptimalSchedulingWindows(seasonality: SeasonalityResult): {
    maintenanceWindows: number[];
    scaleUpHours: number[];
    scaleDownHours: number[];
};
//# sourceMappingURL=seasonality-detector.d.ts.map