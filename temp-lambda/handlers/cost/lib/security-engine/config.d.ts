/**
 * Security Engine V2 - Configuration
 */
import type { ParallelizationConfig } from './types.js';
export declare const DEFAULT_PARALLELIZATION_CONFIG: ParallelizationConfig;
export declare const GLOBAL_SERVICES: string[];
export declare const REGIONAL_SERVICES: string[];
export declare const PRIORITY_1_SERVICES: string[];
export declare const PRIORITY_2_SERVICES: string[];
export declare const CRITICAL_PORTS: Record<number, string>;
export declare const HIGH_RISK_PORTS: Record<number, string>;
export declare const MEDIUM_RISK_PORTS: Record<number, string>;
export declare const DEPRECATED_RUNTIMES: string[];
export declare const SENSITIVE_ENV_PATTERNS: RegExp[];
export declare const COMPLIANCE_VERSIONS: Record<string, string>;
export declare const SEVERITY_WEIGHTS: Record<string, number>;
export declare const CACHE_TTL = 300000;
//# sourceMappingURL=config.d.ts.map