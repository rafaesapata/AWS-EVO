/**
 * RI/Savings Plans Skeleton Components
 * Provides phased loading states for the RI/SP analyzer
 */

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface SkeletonProps {
  className?: string;
}

/**
 * Skeleton for the summary stats cards (4 cards grid)
 */
export function SummaryStatsSkeleton({ className }: SkeletonProps) {
  return (
    <div className={cn("grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4", className)}>
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i} className="glass border-primary/20">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-4 rounded-full" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-8 w-32 mb-2" />
            <Skeleton className="h-3 w-40" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/**
 * Skeleton for key insights section
 */
export function InsightsSkeleton({ className }: SkeletonProps) {
  return (
    <Card className={cn("glass border-primary/20", className)}>
      <CardHeader>
        <Skeleton className="h-6 w-40 mb-2" />
        <Skeleton className="h-4 w-64" />
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-start gap-3">
              <Skeleton className="h-4 w-4 mt-0.5 flex-shrink-0 rounded-full" />
              <Skeleton className="h-4 flex-1" style={{ width: `${85 - i * 10}%` }} />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Skeleton for resources summary section
 */
export function ResourcesSummarySkeleton({ className }: SkeletonProps) {
  return (
    <Card className={cn("glass border-primary/20", className)}>
      <CardHeader>
        <Skeleton className="h-6 w-44 mb-2" />
        <Skeleton className="h-4 w-56" />
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="text-center p-4 bg-muted/50 rounded-lg">
              <Skeleton className="h-8 w-12 mx-auto mb-2" />
              <Skeleton className="h-3 w-16 mx-auto" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Skeleton for recommendations list
 */
export function RecommendationsSkeleton({ className, count = 3 }: SkeletonProps & { count?: number }) {
  return (
    <div className={cn("space-y-4", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} className="glass border-primary/20 border-l-4 border-l-blue-500">
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="space-y-2 flex-1">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-5 w-48" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                  <Skeleton className="h-5 w-12 rounded-full" />
                </div>
                <Skeleton className="h-4 w-3/4" />
              </div>
              <div className="text-right space-y-1">
                <Skeleton className="h-7 w-28" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-4 w-32" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-6 w-24" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/**
 * Skeleton for coverage cards (3 cards)
 */
export function CoverageSkeleton({ className }: SkeletonProps) {
  return (
    <div className={cn("grid grid-cols-1 md:grid-cols-3 gap-6", className)}>
      {Array.from({ length: 3 }).map((_, i) => (
        <Card key={i} className="glass border-primary/20">
          <CardHeader>
            <Skeleton className="h-5 w-36 mb-1" />
            <Skeleton className="h-4 w-48" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-9 w-20 mb-2" />
            <Skeleton className="h-2 w-full rounded-full mb-2" />
            <Skeleton className="h-3 w-24" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/**
 * Skeleton for tabs header
 */
export function TabsSkeleton({ className }: SkeletonProps) {
  return (
    <div className={cn("grid w-full grid-cols-3 gap-1 p-1 bg-muted rounded-lg", className)}>
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-9 rounded-md" />
      ))}
    </div>
  );
}

/**
 * Full page skeleton for initial load
 */
export function RISPFullPageSkeleton({ className }: SkeletonProps) {
  return (
    <div className={cn("space-y-6", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-96" />
          <Skeleton className="h-4 w-80" />
        </div>
        <Skeleton className="h-10 w-36" />
      </div>

      {/* Tabs */}
      <TabsSkeleton />

      {/* Stats Cards */}
      <SummaryStatsSkeleton />

      {/* Insights */}
      <InsightsSkeleton />

      {/* Resources */}
      <ResourcesSummarySkeleton />
    </div>
  );
}

/**
 * Animated loading indicator with phase info
 */
export function PhaseLoadingIndicator({ 
  phase, 
  totalPhases,
  message,
  className 
}: { 
  phase: number; 
  totalPhases: number;
  message: string;
  className?: string;
}) {
  const progress = (phase / totalPhases) * 100;
  
  return (
    <div className={cn("flex items-center gap-3 text-sm text-muted-foreground", className)}>
      <div className="relative h-1.5 w-24 bg-muted rounded-full overflow-hidden">
        <div 
          className="absolute inset-y-0 left-0 bg-primary rounded-full transition-all duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>
      <span className="animate-pulse">{message}</span>
    </div>
  );
}
