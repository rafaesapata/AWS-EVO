/**
 * Azure ML Waste Analyzer
 * 
 * Statistical analysis and ML-based classification for Azure resource waste detection.
 * Uses Azure Monitor metrics for real utilization data.
 * Mirrors the AWS waste-analyzer.ts approach with Azure-specific adaptations.
 */

import {
  getAzureVMMonthlyCost,
  getAzureVMDownsizeRecommendation,
  calculateAzureVMDownsizeSavings,
} from '../cost/azure-pricing.js';

export interface AzureMetricDatapoint {
  timeStamp?: Date;
  average?: number;
  maximum?: number;
  minimum?: number;
  total?: number;
  count?: number;
}

export interface AzureUtilizationMetrics {
  avgCpu: number;
  maxCpu: number;
  minCpu: number;
  stdDevCpu: number;
  avgMemory: number;
  maxMemory: number;
  avgNetwork: number;
  avgDiskOps: number;
  peakHours: number[];
  weekdayPattern: number[];
  dataCompleteness: number;
  datapointCount: number;
}

export interface AzureMLRecommendation {
  type: 'terminate' | 'downsize' | 'auto-scale' | 'optimize' | 'migrate';
  confidence: number;
  recommendedSize?: string;
  savings: number;
  complexity: 'low' | 'medium' | 'high';
  reason: string;
}

// Statistical helpers
function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const squareDiffs = values.map(v => Math.pow(v - avg, 2));
  return Math.sqrt(mean(squareDiffs));
}

function groupByHour(datapoints: AzureMetricDatapoint[]): Record<number, number> {
  const hourlyData: Record<number, number[]> = {};
  for (const dp of datapoints) {
    if (dp.timeStamp && dp.average !== undefined) {
      const hour = new Date(dp.timeStamp).getUTCHours();
      if (!hourlyData[hour]) hourlyData[hour] = [];
      hourlyData[hour].push(dp.average);
    }
  }
  const hourlyAvg: Record<number, number> = {};
  for (const [hour, values] of Object.entries(hourlyData)) {
    hourlyAvg[parseInt(hour)] = mean(values);
  }
  return hourlyAvg;
}

function calculateWeekdayPattern(datapoints: AzureMetricDatapoint[]): number[] {
  const weekdayData: Record<number, number[]> = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
  for (const dp of datapoints) {
    if (dp.timeStamp && dp.average !== undefined) {
      const dayOfWeek = new Date(dp.timeStamp).getUTCDay();
      weekdayData[dayOfWeek].push(dp.average);
    }
  }
  return [1, 2, 3, 4, 5, 6, 0].map(day => mean(weekdayData[day]));
}

/**
 * Analyze Azure Monitor metrics and extract utilization patterns
 */
export function analyzeAzureUtilization(
  cpuMetrics: AzureMetricDatapoint[],
  memoryMetrics?: AzureMetricDatapoint[],
  networkMetrics?: AzureMetricDatapoint[],
  diskMetrics?: AzureMetricDatapoint[],
  analysisDays: number = 7
): AzureUtilizationMetrics {
  const cpuValues = cpuMetrics.filter(dp => dp.average !== undefined).map(dp => dp.average!);
  const maxCpuValues = cpuMetrics.filter(dp => dp.maximum !== undefined).map(dp => dp.maximum!);

  const avgCpu = mean(cpuValues);
  const maxCpu = maxCpuValues.length > 0 ? Math.max(...maxCpuValues) : Math.max(...cpuValues, 0);
  const minCpu = cpuValues.length > 0 ? Math.min(...cpuValues) : 0;
  const stdDevCpu = standardDeviation(cpuValues);

  const memoryValues = memoryMetrics?.filter(dp => dp.average !== undefined).map(dp => dp.average!) || [];
  const avgMemory = mean(memoryValues);
  const maxMemory = memoryValues.length > 0 ? Math.max(...memoryValues) : 0;

  const networkValues = networkMetrics?.filter(dp => dp.average !== undefined).map(dp => dp.average!) || [];
  const avgNetwork = mean(networkValues);

  const diskValues = diskMetrics?.filter(dp => dp.average !== undefined).map(dp => dp.average!) || [];
  const avgDiskOps = mean(diskValues);

  const hourlyAvg = groupByHour(cpuMetrics);
  const peakHours = Object.entries(hourlyAvg)
    .filter(([_, avg]) => avg > avgCpu * 1.2)
    .map(([hour]) => parseInt(hour))
    .sort((a, b) => a - b);

  const weekdayPattern = calculateWeekdayPattern(cpuMetrics);
  const expectedDatapoints = analysisDays * 24 * 12;
  const dataCompleteness = Math.min(1, cpuMetrics.length / expectedDatapoints);

  return {
    avgCpu: parseFloat(avgCpu.toFixed(2)),
    maxCpu: parseFloat(maxCpu.toFixed(2)),
    minCpu: parseFloat(minCpu.toFixed(2)),
    stdDevCpu: parseFloat(stdDevCpu.toFixed(2)),
    avgMemory: parseFloat(avgMemory.toFixed(2)),
    maxMemory: parseFloat(maxMemory.toFixed(2)),
    avgNetwork: parseFloat(avgNetwork.toFixed(2)),
    avgDiskOps: parseFloat(avgDiskOps.toFixed(2)),
    peakHours,
    weekdayPattern: weekdayPattern.map(v => parseFloat(v.toFixed(2))),
    dataCompleteness: parseFloat(dataCompleteness.toFixed(2)),
    datapointCount: cpuMetrics.length,
  };
}

/**
 * Calculate confidence score based on data quality
 */
function calculateConfidence(metrics: AzureUtilizationMetrics, baseConfidence: number): number {
  let confidence = baseConfidence;
  confidence *= Math.max(0.5, metrics.dataCompleteness);
  if (metrics.stdDevCpu > 30) confidence *= 0.8;
  else if (metrics.stdDevCpu > 20) confidence *= 0.9;
  if (metrics.datapointCount > 500) confidence *= 1.1;
  return Math.max(0, Math.min(1, confidence));
}

/**
 * Classify Azure VM waste using ML analysis
 */
export function classifyAzureVMWaste(
  metrics: AzureUtilizationMetrics,
  vmSize: string
): AzureMLRecommendation {
  const currentCost = getAzureVMMonthlyCost(vmSize);

  // Essentially idle — near-zero CPU
  if (metrics.avgCpu < 1 && metrics.maxCpu < 5) {
    const recommendedSize = getAzureVMDownsizeRecommendation(vmSize, metrics.maxCpu);
    const savings = calculateAzureVMDownsizeSavings(vmSize, recommendedSize);
    return {
      type: 'downsize',
      confidence: calculateConfidence(metrics, 0.95),
      recommendedSize,
      savings: savings > 0 ? savings : currentCost * 0.7,
      complexity: 'low',
      reason: `VM is essentially idle (avg CPU ${metrics.avgCpu}%, max ${metrics.maxCpu}%). Recommend downsizing to ${recommendedSize}.`,
    };
  }

  // Zombie — minimal activity with no variance
  if (metrics.avgCpu < 2 && metrics.maxCpu < 10 && metrics.stdDevCpu < 2) {
    const recommendedSize = getAzureVMDownsizeRecommendation(vmSize, metrics.maxCpu);
    const savings = calculateAzureVMDownsizeSavings(vmSize, recommendedSize);
    return {
      type: 'downsize',
      confidence: calculateConfidence(metrics, 0.90),
      recommendedSize,
      savings: savings > 0 ? savings : currentCost * 0.6,
      complexity: 'low',
      reason: `VM shows zombie pattern (avg CPU ${metrics.avgCpu}%, stdDev ${metrics.stdDevCpu}%). Minimal real workload detected.`,
    };
  }

  // Consistently low usage — predictable downsize candidate
  if (metrics.avgCpu < 30 && metrics.maxCpu < 60 && metrics.stdDevCpu < 15) {
    const recommendedSize = getAzureVMDownsizeRecommendation(vmSize, metrics.maxCpu);
    const savings = calculateAzureVMDownsizeSavings(vmSize, recommendedSize);
    if (savings > 0) {
      return {
        type: 'downsize',
        confidence: calculateConfidence(metrics, 0.85),
        recommendedSize,
        savings,
        complexity: 'medium',
        reason: `VM is underutilized (avg CPU ${metrics.avgCpu}%, max ${metrics.maxCpu}%). Can safely downsize to ${recommendedSize}.`,
      };
    }
  }

  // High variance with predictable peaks — auto-scale candidate
  if (metrics.stdDevCpu > 20 && metrics.peakHours.length > 0 && metrics.peakHours.length < 12) {
    const estimatedSavings = currentCost * 0.3;
    return {
      type: 'auto-scale',
      confidence: calculateConfidence(metrics, 0.75),
      savings: estimatedSavings,
      complexity: 'high',
      reason: `VM shows variable load (stdDev ${metrics.stdDevCpu}%) with ${metrics.peakHours.length} peak hours. VMSS auto-scaling recommended.`,
    };
  }

  // Moderate underutilization
  if (metrics.avgCpu < 40 && metrics.maxCpu < 70) {
    const recommendedSize = getAzureVMDownsizeRecommendation(vmSize, metrics.maxCpu);
    const savings = calculateAzureVMDownsizeSavings(vmSize, recommendedSize);
    if (savings > 0) {
      return {
        type: 'downsize',
        confidence: calculateConfidence(metrics, 0.70),
        recommendedSize,
        savings,
        complexity: 'medium',
        reason: `VM moderately underutilized (avg CPU ${metrics.avgCpu}%). Downsize to ${recommendedSize} for savings.`,
      };
    }
  }

  return {
    type: 'optimize',
    confidence: calculateConfidence(metrics, 0.50),
    savings: 0,
    complexity: 'medium',
    reason: 'VM utilization is within acceptable range. Monitor for optimization opportunities.',
  };
}

/**
 * Generate utilization patterns for storage
 */
export function generateAzureUtilizationPatterns(metrics: AzureUtilizationMetrics) {
  return {
    avgCpuUsage: metrics.avgCpu,
    maxCpuUsage: metrics.maxCpu,
    avgMemoryUsage: metrics.avgMemory,
    maxMemoryUsage: metrics.maxMemory,
    avgNetworkUsage: metrics.avgNetwork,
    avgDiskOps: metrics.avgDiskOps,
    peakHours: metrics.peakHours,
    weekdayPattern: metrics.weekdayPattern,
    hasRealMetrics: metrics.datapointCount > 0,
    dataCompleteness: metrics.dataCompleteness,
  };
}
