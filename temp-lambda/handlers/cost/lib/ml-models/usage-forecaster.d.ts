/**
 * Usage Forecaster
 *
 * Implements time series analysis for usage prediction.
 */
export interface ForecastResult {
    predictedValue: number;
    confidenceInterval: {
        lower: number;
        upper: number;
    };
    trend: 'increasing' | 'stable' | 'decreasing';
    trendStrength: number;
    dataPoints: number;
}
export interface TimeSeriesDatapoint {
    timestamp: Date;
    value: number;
}
/**
 * Forecast future usage based on historical data
 */
export declare function forecastUsage(datapoints: TimeSeriesDatapoint[], periodsAhead?: number): ForecastResult;
/**
 * Detect trend in time series data
 */
export declare function detectTrend(values: number[]): {
    trend: 'increasing' | 'stable' | 'decreasing';
    strength: number;
    changePercent: number;
};
//# sourceMappingURL=usage-forecaster.d.ts.map