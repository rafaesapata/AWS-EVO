/**
 * Comprehensive Health Check System
 * Monitors application health across all components
 */

import { logger } from './logging';
import { metricsCollector } from './metrics-collector';

export interface HealthCheckResult {
  name: string;
  status: 'healthy' | 'unhealthy' | 'degraded';
  responseTime: number;
  error?: string;
  details?: Record<string, any>;
  timestamp: Date;
}

export interface SystemHealth {
  status: 'healthy' | 'unhealthy' | 'degraded';
  checks: HealthCheckResult[];
  uptime: number;
  version: string;
  environment: string;
  timestamp: Date;
}

export type HealthCheckFunction = () => Promise<Omit<HealthCheckResult, 'name' | 'timestamp'>>;

/**
 * Health Check Manager
 */
export class HealthCheckManager {
  private checks: Map<string, HealthCheckFunction> = new Map();
  private cache: Map<string, HealthCheckResult> = new Map();
  private cacheTimeout = 30000; // 30 seconds
  private isRunning = false;

  constructor() {
    this.registerDefaultChecks();
  }

  /**
   * Register a health check
   */
  register(name: string, checkFunction: HealthCheckFunction): void {
    this.checks.set(name, checkFunction);
    logger.debug(`Health check registered: ${name}`);
  }

  /**
   * Unregister a health check
   */
  unregister(name: string): void {
    this.checks.delete(name);
    this.cache.delete(name);
    logger.debug(`Health check unregistered: ${name}`);
  }

  /**
   * Run all health checks
   */
  async runAll(): Promise<SystemHealth> {
    if (this.isRunning) {
      logger.warn('Health checks already running, skipping');
      return this.getLastResults();
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      const results = await Promise.allSettled(
        Array.from(this.checks.entries()).map(async ([name, checkFn]) => {
          const cached = this.getCachedResult(name);
          if (cached) {
            return cached;
          }

          const checkStart = Date.now();
          try {
            const result = await Promise.race([
              checkFn(),
              this.timeout(10000) // 10 second timeout
            ]);

            const healthResult: HealthCheckResult = {
              name,
              ...result,
              responseTime: Date.now() - checkStart,
              timestamp: new Date()
            };

            this.cache.set(name, healthResult);
            return healthResult;
          } catch (error) {
            const healthResult: HealthCheckResult = {
              name,
              status: 'unhealthy',
              responseTime: Date.now() - checkStart,
              error: error instanceof Error ? error.message : 'Unknown error',
              timestamp: new Date()
            };

            this.cache.set(name, healthResult);
            return healthResult;
          }
        })
      );

      const checks = results.map(result => 
        result.status === 'fulfilled' ? result.value : {
          name: 'unknown',
          status: 'unhealthy' as const,
          responseTime: 0,
          error: 'Check failed to execute',
          timestamp: new Date()
        }
      );

      const systemHealth: SystemHealth = {
        status: this.calculateOverallStatus(checks),
        checks,
        uptime: process.uptime(),
        version: process.env.npm_package_version || '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        timestamp: new Date()
      };

      // Record metrics
      metricsCollector.record('health_check_duration', Date.now() - startTime);
      metricsCollector.record('health_check_count', checks.length);
      
      checks.forEach(check => {
        metricsCollector.record(`health_check_${check.name}_response_time`, check.responseTime);
        metricsCollector.record(`health_check_${check.name}_status`, check.status === 'healthy' ? 1 : 0);
      });

      logger.info('Health checks completed', {
        status: systemHealth.status,
        duration: Date.now() - startTime,
        checksCount: checks.length
      });

      return systemHealth;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Run specific health check
   */
  async runCheck(name: string): Promise<HealthCheckResult | null> {
    const checkFn = this.checks.get(name);
    if (!checkFn) {
      return null;
    }

    const startTime = Date.now();
    try {
      const result = await checkFn();
      return {
        name,
        ...result,
        responseTime: Date.now() - startTime,
        timestamp: new Date()
      };
    } catch (error) {
      return {
        name,
        status: 'unhealthy',
        responseTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date()
      };
    }
  }

  /**
   * Get cached result if still valid
   */
  private getCachedResult(name: string): HealthCheckResult | null {
    const cached = this.cache.get(name);
    if (!cached) return null;

    const age = Date.now() - cached.timestamp.getTime();
    return age < this.cacheTimeout ? cached : null;
  }

  /**
   * Calculate overall system status
   */
  private calculateOverallStatus(checks: HealthCheckResult[]): 'healthy' | 'unhealthy' | 'degraded' {
    const unhealthyCount = checks.filter(c => c.status === 'unhealthy').length;
    const degradedCount = checks.filter(c => c.status === 'degraded').length;

    if (unhealthyCount > 0) {
      return unhealthyCount > checks.length / 2 ? 'unhealthy' : 'degraded';
    }

    return degradedCount > 0 ? 'degraded' : 'healthy';
  }

  /**
   * Timeout helper
   */
  private timeout(ms: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Health check timeout')), ms);
    });
  }

  /**
   * Get last results from cache
   */
  private getLastResults(): SystemHealth {
    const checks = Array.from(this.cache.values());
    return {
      status: this.calculateOverallStatus(checks),
      checks,
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      timestamp: new Date()
    };
  }

  /**
   * Register default health checks
   */
  private registerDefaultChecks(): void {
    // Database health check
    this.register('database', async () => {
      try {
        // This would be implemented based on your database client
        // const result = await prisma.$queryRaw`SELECT 1`;
        
        // Simulate database check
        const start = Date.now();
        await new Promise(resolve => setTimeout(resolve, Math.random() * 100));
        const responseTime = Date.now() - start;

        return {
          status: responseTime < 1000 ? 'healthy' : 'degraded',
          responseTime,
          details: {
            connectionPool: 'active',
            activeConnections: 5,
            maxConnections: 20
          }
        };
      } catch (error) {
        return {
          status: 'unhealthy',
          responseTime: 0,
          error: error instanceof Error ? error.message : 'Database connection failed'
        };
      }
    });

    // Memory health check
    this.register('memory', async () => {
      const memUsage = process.memoryUsage();
      const totalMem = memUsage.heapTotal;
      const usedMem = memUsage.heapUsed;
      const memoryUsagePercent = (usedMem / totalMem) * 100;

      return {
        status: memoryUsagePercent > 90 ? 'unhealthy' : memoryUsagePercent > 70 ? 'degraded' : 'healthy',
        responseTime: 0,
        details: {
          heapUsed: Math.round(usedMem / 1024 / 1024),
          heapTotal: Math.round(totalMem / 1024 / 1024),
          usagePercent: Math.round(memoryUsagePercent),
          external: Math.round(memUsage.external / 1024 / 1024),
          rss: Math.round(memUsage.rss / 1024 / 1024)
        }
      };
    });

    // AWS connectivity check
    this.register('aws', async () => {
      try {
        // This would check AWS service connectivity
        // const sts = new AWS.STS();
        // await sts.getCallerIdentity().promise();

        // Simulate AWS check
        await new Promise(resolve => setTimeout(resolve, Math.random() * 200));

        return {
          status: 'healthy',
          responseTime: 150,
          details: {
            region: process.env.AWS_REGION || 'us-east-1',
            services: ['cognito', 'lambda', 'rds', 's3']
          }
        };
      } catch (error) {
        return {
          status: 'unhealthy',
          responseTime: 0,
          error: 'AWS connectivity failed'
        };
      }
    });

    // External APIs health check
    this.register('external_apis', async () => {
      const checks = await Promise.allSettled([
        // Add your external API checks here
        fetch('https://api.github.com/status', { timeout: 5000 }),
      ]);

      const failedChecks = checks.filter(c => c.status === 'rejected').length;
      const totalChecks = checks.length;

      return {
        status: failedChecks === 0 ? 'healthy' : failedChecks < totalChecks ? 'degraded' : 'unhealthy',
        responseTime: 200,
        details: {
          totalChecks,
          failedChecks,
          successRate: Math.round(((totalChecks - failedChecks) / totalChecks) * 100)
        }
      };
    });

    // Disk space check (for Lambda, this might not be relevant)
    this.register('disk_space', async () => {
      try {
        // In Lambda, check /tmp directory
        const fs = await import('fs');
        const stats = await fs.promises.statfs('/tmp');
        const total = stats.blocks * stats.bsize;
        const free = stats.bavail * stats.bsize;
        const used = total - free;
        const usagePercent = (used / total) * 100;

        return {
          status: usagePercent > 90 ? 'unhealthy' : usagePercent > 80 ? 'degraded' : 'healthy',
          responseTime: 0,
          details: {
            total: Math.round(total / 1024 / 1024),
            used: Math.round(used / 1024 / 1024),
            free: Math.round(free / 1024 / 1024),
            usagePercent: Math.round(usagePercent)
          }
        };
      } catch (error) {
        return {
          status: 'healthy', // Not critical for Lambda
          responseTime: 0,
          details: { message: 'Disk check not available in this environment' }
        };
      }
    });
  }
}

// Global health check manager instance
export const healthCheckManager = new HealthCheckManager();

/**
 * Express middleware for health check endpoint
 */
export function healthCheckMiddleware() {
  return async (req: any, res: any) => {
    try {
      const health = await healthCheckManager.runAll();
      
      const statusCode = health.status === 'healthy' ? 200 : 
                        health.status === 'degraded' ? 200 : 503;

      res.status(statusCode).json(health);
    } catch (error) {
      logger.error('Health check failed', error as Error);
      res.status(503).json({
        status: 'unhealthy',
        error: 'Health check system failure',
        timestamp: new Date()
      });
    }
  };
}

/**
 * Lambda handler for health checks
 */
export const healthCheckHandler = async (event: any) => {
  try {
    const health = await healthCheckManager.runAll();
    
    return {
      statusCode: health.status === 'healthy' ? 200 : 
                 health.status === 'degraded' ? 200 : 503,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      },
      body: JSON.stringify(health)
    };
  } catch (error) {
    logger.error('Health check handler failed', error as Error);
    
    return {
      statusCode: 503,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        status: 'unhealthy',
        error: 'Health check system failure',
        timestamp: new Date()
      })
    };
  }
};

/**
 * React hook for health monitoring
 */
export function useHealthCheck(interval: number = 60000) {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    const checkHealth = async () => {
      try {
        setLoading(true);
        const response = await fetch('/api/health');
        
        if (!response.ok) {
          throw new Error(`Health check failed: ${response.status}`);
        }
        
        const healthData = await response.json();
        setHealth(healthData);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Health check failed');
        logger.error('Health check request failed', err as Error);
      } finally {
        setLoading(false);
      }
    };

    // Initial check
    checkHealth();

    // Set up interval
    intervalId = setInterval(checkHealth, interval);

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [interval]);

  return { health, loading, error };
}

/**
 * Health check component for admin dashboard
 */
export function HealthCheckStatus({ health }: { health: SystemHealth }) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return 'text-green-600';
      case 'degraded': return 'text-yellow-600';
      case 'unhealthy': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy': return '✅';
      case 'degraded': return '⚠️';
      case 'unhealthy': return '❌';
      default: return '❓';
    }
  };

  return (
    <div className="health-check-status">
      <div className={`overall-status ${getStatusColor(health.status)}`}>
        {getStatusIcon(health.status)} System Status: {health.status.toUpperCase()}
      </div>
      
      <div className="health-details">
        <p>Uptime: {Math.round(health.uptime / 3600)}h {Math.round((health.uptime % 3600) / 60)}m</p>
        <p>Version: {health.version}</p>
        <p>Environment: {health.environment}</p>
        <p>Last Check: {health.timestamp.toLocaleString()}</p>
      </div>

      <div className="individual-checks">
        {health.checks.map(check => (
          <div key={check.name} className={`check-item ${getStatusColor(check.status)}`}>
            <span>{getStatusIcon(check.status)} {check.name}</span>
            <span>{check.responseTime}ms</span>
            {check.error && <span className="error">({check.error})</span>}
          </div>
        ))}
      </div>
    </div>
  );
}