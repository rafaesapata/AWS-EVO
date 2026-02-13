/**
 * Lazy Loading Components
 * Implements code splitting for better performance
 */

import { lazy, Suspense, ComponentType, useState, useEffect } from 'react';
import { LoadingSkeleton } from '@/components/LoadingSkeleton';
import ErrorBoundary from '@/components/ErrorBoundary';

// Loading fallback component
const LazyLoadingFallback = ({ name }: { name?: string }) => (
  <div className="flex items-center justify-center min-h-[200px]">
    <LoadingSkeleton />
    {name && (
      <span className="ml-2 text-sm text-muted-foreground">
        Carregando {name}...
      </span>
    )}
  </div>
);

// Higher-order component for lazy loading with error boundary
function withLazyLoading<P extends object>(
  importFn: () => Promise<{ default: ComponentType<P> }>,
  fallbackName?: string
) {
  const LazyComponent = lazy(importFn);
  
  return (props: P) => (
    <ErrorBoundary level="component" context={fallbackName}>
      <Suspense fallback={<LazyLoadingFallback name={fallbackName} />}>
        <LazyComponent {...props} />
      </Suspense>
    </ErrorBoundary>
  );
}

// Lazy loaded pages
export const LazyMLWasteDetection = withLazyLoading(
  () => import('@/pages/MLWasteDetection'),
  'ML Waste Detection'
);

export const LazySecurityScan = withLazyLoading(
  () => import('@/pages/SecurityScan'),
  'Security Scan'
);

export const LazyWellArchitected = withLazyLoading(
  () => import('@/pages/WellArchitected'),
  'Well Architected'
);

export const LazyKnowledgeBase = withLazyLoading(
  () => import('@/pages/KnowledgeBase'),
  'Knowledge Base'
);

export const LazyAnomalyDetection = withLazyLoading(
  () => import('@/pages/AnomalyDetection'),
  'Anomaly Detection'
);

export const LazyAttackDetection = withLazyLoading(
  () => import('@/pages/WafMonitoring'),
  'Attack Detection'
);

export const LazyThreatDetection = withLazyLoading(
  () => import('@/pages/ThreatDetection'),
  'Threat Detection'
);

export const LazyPredictiveIncidents = withLazyLoading(
  () => import('@/pages/PredictiveIncidents'),
  'Predictive Incidents'
);

export const LazyResourceMonitoring = withLazyLoading(
  () => import('@/pages/ResourceMonitoring'),
  'Resource Monitoring'
);

export const LazySystemMonitoring = withLazyLoading(
  () => import('@/pages/SystemMonitoring'),
  'System Monitoring'
);

export const LazyBackgroundJobs = withLazyLoading(
  () => import('@/pages/BackgroundJobs'),
  'Background Jobs'
);

export const LazyLicenseManagement = withLazyLoading(
  () => import('@/pages/LicenseManagement'),
  'License Management'
);

export const LazyCommunicationCenter = withLazyLoading(
  () => import('@/pages/CommunicationCenter'),
  'Communication Center'
);

export const LazyTVDashboard = withLazyLoading(
  () => import('@/pages/TVDashboard'),
  'TV Dashboard'
);

// Lazy loaded dashboard components
export const LazyExecutiveDashboard = withLazyLoading(
  () => import('@/components/dashboard/ExecutiveDashboard'),
  'Executive Dashboard'
);

export const LazySecurityPosture = withLazyLoading(
  () => import('@/components/dashboard/SecurityPosture'),
  'Security Posture'
);

export const LazyCostOptimization = withLazyLoading(
  () => import('@/components/dashboard/CostOptimization'),
  'Cost Optimization'
);

export const LazyWellArchitectedScorecard = withLazyLoading(
  () => import('@/components/dashboard/WellArchitectedScorecard'),
  'Well Architected Scorecard'
);

export const LazyFindingsTable = withLazyLoading(
  () => import('@/components/dashboard/FindingsTable'),
  'Findings Table'
);

export const LazyCloudTrailAudit = withLazyLoading(
  () => import('@/components/dashboard/CloudTrailAudit'),
  'Audit Logs'
);

// Lazy loaded admin components
export const LazySuperAdminPanel = withLazyLoading(
  () => import('@/components/SuperAdminPanel'),
  'Super Admin Panel'
);

export const LazyOrganizationSettings = withLazyLoading(
  () => import('@/components/OrganizationSettings'),
  'Organization Settings'
);

export const LazyUserSettings = withLazyLoading(
  () => import('@/components/UserSettings'),
  'User Settings'
);

export const LazyMFASettings = withLazyLoading(
  () => import('@/components/MFASettings'),
  'MFA Settings'
);

// Lazy loaded wizard components
export const LazyOnboardingWizard = withLazyLoading(
  () => import('@/components/wizard/OnboardingWizard'),
  'Onboarding Wizard'
);

export const LazyAWSSetupWizard = withLazyLoading(
  () => import('@/components/wizard/AWSSetupWizard'),
  'AWS Setup Wizard'
);

// Preload critical components
export const preloadCriticalComponents = () => {
  // Preload components that are likely to be used soon
  const criticalComponents = [
    () => import('@/pages/Index'),
    () => import('@/components/dashboard/SecurityScan'),
    () => import('@/components/dashboard/CostOptimization'),
    () => import('@/components/AppSidebar'),
    () => import('@/components/UserMenu'),
  ];

  // Preload during idle time
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(() => {
      criticalComponents.forEach(importFn => {
        importFn().catch(() => {
          // Silently fail - preloading is not critical
        });
      });
    });
  } else {
    // Fallback for browsers without requestIdleCallback
    setTimeout(() => {
      criticalComponents.forEach(importFn => {
        importFn().catch(() => {
          // Silently fail - preloading is not critical
        });
      });
    }, 2000);
  }
};

// Route-based code splitting helper
export const createLazyRoute = (
  importFn: () => Promise<{ default: ComponentType<any> }>,
  fallbackName?: string
) => {
  const LazyComponent = lazy(importFn);
  
  return () => (
    <ErrorBoundary level="page" context={fallbackName}>
      <Suspense fallback={<LazyLoadingFallback name={fallbackName} />}>
        <LazyComponent />
      </Suspense>
    </ErrorBoundary>
  );
};

// Chunk loading error handler
export const handleChunkLoadError = (error: Error) => {
  if (error.name === 'ChunkLoadError') {
    // Reload the page to get the latest chunks
    window.location.reload();
  }
};

// Initialize chunk error handling
if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    if (event.error && event.error.name === 'ChunkLoadError') {
      handleChunkLoadError(event.error);
    }
  });
}

// Progressive loading for heavy components
export const useProgressiveLoading = (
  components: Array<() => Promise<{ default: ComponentType<any> }>>,
  delay: number = 100
) => {
  const [loadedComponents, setLoadedComponents] = useState<ComponentType<any>[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const loadedComps: ComponentType<any>[] = [];

    const loadComponents = async () => {
      for (let i = 0; i < components.length; i++) {
        if (!isMounted) break;

        try {
          const { default: Component } = await components[i]();
          loadedComps.push(Component);
          
          if (isMounted) {
            setLoadedComponents([...loadedComps]);
            
            // Add delay between loads to prevent blocking
            if (i < components.length - 1) {
              await new Promise(resolve => setTimeout(resolve, delay));
            }
          }
        } catch (error) {
          console.warn(`Failed to load component ${i}:`, error);
        }
      }

      if (isMounted) {
        setLoading(false);
      }
    };

    loadComponents();

    return () => {
      isMounted = false;
    };
  }, [components, delay]);

  return { loadedComponents, loading };
};

// Bundle analyzer helper (development only)
export const analyzeBundleSize = () => {
  if (process.env.NODE_ENV === 'development') {
    // This would integrate with webpack-bundle-analyzer
    console.log('Bundle analysis available in development mode');
    
    // Log current chunk sizes
    if ('performance' in window && 'getEntriesByType' in window.performance) {
      const resources = window.performance.getEntriesByType('resource') as PerformanceResourceTiming[];
      const jsResources = resources.filter(r => r.name.endsWith('.js'));
      
      console.table(
        jsResources.map(r => ({
          name: r.name.split('/').pop(),
          size: `${Math.round(r.transferSize / 1024)}KB`,
          loadTime: `${Math.round(r.duration)}ms`
        }))
      );
    }
  }
};