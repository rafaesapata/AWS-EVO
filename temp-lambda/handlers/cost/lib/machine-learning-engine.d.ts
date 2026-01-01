/**
 * Machine Learning Engine
 * Military-grade ML system for predictive analytics, anomaly detection, and intelligent automation
 */
import { EventEmitter } from 'events';
export interface MLModel {
    id: string;
    name: string;
    type: 'classification' | 'regression' | 'clustering' | 'anomaly_detection' | 'time_series';
    algorithm: string;
    version: string;
    status: 'training' | 'trained' | 'deployed' | 'deprecated';
    accuracy: number;
    trainingData: {
        features: string[];
        targetVariable?: string;
        dataPoints: number;
        lastTraining: Date;
    };
    hyperparameters: Record<string, any>;
    organizationId?: string;
}
export interface MLPrediction {
    modelId: string;
    input: Record<string, any>;
    prediction: any;
    confidence: number;
    probability?: number[];
    explanation?: string;
    timestamp: Date;
    organizationId?: string;
}
export interface AnomalyDetectionResult {
    isAnomaly: boolean;
    anomalyScore: number;
    threshold: number;
    features: Record<string, number>;
    explanation: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    recommendations: string[];
}
export interface TimeSeriesForecast {
    predictions: Array<{
        timestamp: Date;
        value: number;
        confidence_lower: number;
        confidence_upper: number;
    }>;
    accuracy: number;
    seasonality: {
        detected: boolean;
        period?: number;
        strength?: number;
    };
    trend: {
        direction: 'up' | 'down' | 'stable';
        strength: number;
    };
}
export interface MLTrainingJob {
    id: string;
    modelId: string;
    status: 'queued' | 'running' | 'completed' | 'failed';
    progress: number;
    startTime: Date;
    endTime?: Date;
    metrics: {
        accuracy?: number;
        precision?: number;
        recall?: number;
        f1Score?: number;
        mse?: number;
        rmse?: number;
    };
    logs: string[];
}
export declare class MachineLearningEngine extends EventEmitter {
    private prisma;
    private models;
    private trainingJobs;
    private predictionCache;
    private readonly CACHE_TTL;
    constructor();
    /**
     * Initialize pre-trained ML models
     */
    private initializeModels;
    /**
     * Register a new ML model
     */
    registerModel(model: MLModel): void;
    /**
     * Make prediction using specified model
     */
    predict(modelId: string, input: Record<string, any>, organizationId?: string): Promise<MLPrediction>;
    /**
     * Detect anomalies in data
     */
    detectAnomalies(data: Record<string, number>, organizationId?: string): Promise<AnomalyDetectionResult>;
    /**
     * Generate time series forecast
     */
    generateForecast(historicalData: Array<{
        timestamp: Date;
        value: number;
    }>, forecastPeriods: number, organizationId?: string): Promise<TimeSeriesForecast>;
    /**
     * Train or retrain a model
     */
    trainModel(modelId: string, trainingData: any[], organizationId?: string): Promise<MLTrainingJob>;
    /**
     * Execute training job
     */
    private executeTrainingJob;
    /**
     * Model prediction implementations
     */
    private performClassification;
    private performRegression;
    private performClustering;
    private performAnomalyDetection;
    private performTimeSeriesForecasting;
    /**
     * Helper methods
     */
    private calculateSecurityRiskScore;
    private calculateTrend;
    private detectSeasonality;
    /**
     * Start model monitoring
     */
    private startModelMonitoring;
    /**
     * Cleanup expired cache entries
     */
    private cleanupCache;
    /**
     * Monitor model performance
     */
    private monitorModelPerformance;
    /**
     * Get model information
     */
    getModel(modelId: string): MLModel | null;
    /**
     * Get all models
     */
    getModels(organizationId?: string): MLModel[];
    /**
     * Get training job status
     */
    getTrainingJob(jobId: string): MLTrainingJob | null;
}
export declare const machineLearningEngine: MachineLearningEngine;
//# sourceMappingURL=machine-learning-engine.d.ts.map