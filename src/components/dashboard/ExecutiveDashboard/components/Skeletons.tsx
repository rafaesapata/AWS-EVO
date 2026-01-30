/**
 * Granular Skeleton Components for Executive Dashboard
 * Each skeleton matches the exact layout of its corresponding component
 * for smooth progressive loading experience
 */

import { Skeleton } from '@/components/ui/skeleton';

/**
 * Skeleton for ExecutiveSummaryBar
 * Layout: Left column (Health Score) + Right column (2x2 grid)
 */
export function ExecutiveSummaryBarSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-4">
      {/* Left Column: Health Score Card */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-5 w-5 rounded-full" />
        </div>
        <div className="flex justify-center my-6">
          <Skeleton className="h-40 w-40 rounded-full" />
        </div>
        <div className="text-center mt-4">
          <Skeleton className="h-4 w-40 mx-auto" />
        </div>
      </div>

      {/* Right Column: 2x2 Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* SLA Card */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-5 w-5 rounded-full" />
          </div>
          <Skeleton className="h-12 w-24 mb-3" />
          <Skeleton className="h-4 w-20" />
        </div>

        {/* MTD Spend Card */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-5 w-5 rounded-full" />
          </div>
          <Skeleton className="h-12 w-28 mb-3" />
          <div className="space-y-2">
            <div className="flex justify-between">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-12" />
            </div>
            <Skeleton className="h-2 w-full rounded-full" />
          </div>
        </div>

        {/* Alerts Card */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-5 w-5 rounded-full" />
          </div>
          <div className="flex items-start gap-8 mb-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="text-center">
                <Skeleton className="h-8 w-8 mx-auto mb-1" />
                <Skeleton className="h-3 w-12" />
              </div>
            ))}
          </div>
          <Skeleton className="h-4 w-16" />
        </div>

        {/* Savings Card */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-5 w-5 rounded-full" />
          </div>
          <div className="flex items-baseline gap-1 mb-1">
            <Skeleton className="h-12 w-32" />
            <Skeleton className="h-6 w-10" />
          </div>
          <Skeleton className="h-4 w-24 mb-4" />
          <div className="text-right">
            <Skeleton className="h-4 w-36 ml-auto" />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Skeleton for TrendAnalysis
 * Layout: Header with period selector + 2-column chart grid + activity highlight
 */
export function TrendAnalysisSkeleton() {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-32" />
          <div className="flex items-center gap-1 p-1 bg-white border border-gray-200 rounded-xl">
            <Skeleton className="h-9 w-9 rounded-lg" />
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-9 w-16 rounded-lg" />
            ))}
          </div>
        </div>
      </div>

      <div className="p-6">
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Cost Trend Chart */}
          <div className="space-y-4">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-[220px] w-full rounded-xl" />
          </div>

          {/* Security Trend Chart */}
          <div className="space-y-4">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-[220px] w-full rounded-xl" />
          </div>
        </div>

        {/* Activity Highlight */}
        <div className="mt-6 p-5 rounded-2xl bg-[#00B2FF]/5 border border-[#00B2FF]/20">
          <div className="flex items-center justify-between">
            <div>
              <Skeleton className="h-4 w-28 mb-2" />
              <div className="flex items-baseline gap-2">
                <Skeleton className="h-12 w-20" />
                <Skeleton className="h-4 w-24" />
              </div>
            </div>
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Skeleton for FinancialHealthCard
 * Layout: Header + Cost summary grid + Budget bar + Top services + Savings
 */
export function FinancialHealthCardSkeleton() {
  return (
    <div className="h-full bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-5 w-5 rounded-full" />
        </div>
      </div>

      <div className="p-6 space-y-5">
        {/* Cost Summary Grid */}
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 rounded-xl bg-white border border-gray-200">
            <Skeleton className="h-4 w-20 mb-2" />
            <Skeleton className="h-8 w-28" />
          </div>
          <div className="p-4 rounded-xl bg-white border border-gray-200">
            <Skeleton className="h-4 w-20 mb-2" />
            <Skeleton className="h-8 w-24" />
          </div>
        </div>

        {/* Budget Utilization */}
        <div className="space-y-2">
          <div className="flex justify-between">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-5 w-12" />
          </div>
          <Skeleton className="h-2 w-full rounded-full" />
          <div className="flex justify-between">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-24" />
          </div>
        </div>

        {/* Top Services */}
        <div className="border-t border-gray-100 pt-4 space-y-3">
          <Skeleton className="h-5 w-24" />
          <div className="space-y-2.5">
            {[1, 2, 3].map((i) => (
              <div key={i} className="space-y-1.5">
                <div className="flex justify-between">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-16" />
                </div>
                <Skeleton className="h-2 w-full rounded-full" />
              </div>
            ))}
          </div>
        </div>

        {/* Savings */}
        <div className="border-t border-gray-100 pt-4 space-y-3">
          <Skeleton className="h-5 w-40" />
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-white border border-gray-200">
              <Skeleton className="h-6 w-20 mb-1" />
              <Skeleton className="h-3 w-28" />
            </div>
            <div className="p-3 rounded-xl bg-white border border-gray-200">
              <Skeleton className="h-6 w-20 mb-1" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
          <div className="p-4 rounded-xl bg-[#00B2FF]/10 border border-[#00B2FF]/20">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-28" />
              <div className="text-right">
                <Skeleton className="h-7 w-24 mb-1" />
                <Skeleton className="h-4 w-20" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Skeleton for SecurityPostureCard
 * Layout: Header + Circular score + Findings grid + Trend section
 */
export function SecurityPostureCardSkeleton() {
  return (
    <div className="h-full bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-5 w-5 rounded-full" />
        </div>
      </div>

      <div className="p-6 space-y-5">
        {/* Circular Score */}
        <div className="flex flex-col items-center justify-center py-4">
          <Skeleton className="h-48 w-48 rounded-full" />
          <Skeleton className="h-6 w-16 mt-4 rounded-full" />
        </div>

        {/* Findings Grid */}
        <div className="space-y-3">
          <Skeleton className="h-5 w-36" />
          <div className="grid grid-cols-4 gap-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="p-3 rounded-xl bg-white border border-gray-200 text-center">
                <Skeleton className="h-7 w-8 mx-auto mb-1" />
                <Skeleton className="h-3 w-12 mx-auto" />
              </div>
            ))}
          </div>
        </div>

        {/* Trend Section */}
        <div className="border-t border-gray-100 pt-4 space-y-3">
          <div className="flex items-center justify-between">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-4 w-28" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-white border border-gray-200">
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-4" />
                <div>
                  <Skeleton className="h-5 w-8 mb-1" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </div>
            </div>
            <div className="p-3 rounded-xl bg-[#00B2FF]/10 border border-[#00B2FF]/20">
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-4" />
                <div>
                  <Skeleton className="h-5 w-8 mb-1" />
                  <Skeleton className="h-3 w-16" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Total Findings */}
        <div className="flex items-center justify-between p-3 rounded-xl bg-white border border-gray-200">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-5 w-8" />
        </div>
      </div>
    </div>
  );
}

/**
 * Skeleton for OperationsCenterCard
 * Layout: Header + Endpoint grid + Uptime/Response + Alerts + Remediations
 */
export function OperationsCenterCardSkeleton() {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden h-full flex flex-col">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-5 w-5 rounded-full" />
        </div>
      </div>

      <div className="p-5 space-y-5 flex-1">
        {/* Endpoint Status */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-5 w-24 rounded-full" />
          </div>
          <div className="grid grid-cols-4 gap-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="p-3 rounded-xl bg-white border border-gray-200 text-center">
                <Skeleton className="h-4 w-4 mx-auto mb-1" />
                <Skeleton className="h-6 w-8 mx-auto mb-1" />
                <Skeleton className="h-3 w-12 mx-auto" />
              </div>
            ))}
          </div>
        </div>

        {/* Uptime & Response */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-4 rounded-xl bg-white border border-gray-200">
            <Skeleton className="h-4 w-16 mb-2" />
            <Skeleton className="h-8 w-20 mb-1" />
            <Skeleton className="h-4 w-24" />
          </div>
          <div className="p-4 rounded-xl bg-white border border-gray-200">
            <Skeleton className="h-4 w-24 mb-2" />
            <Skeleton className="h-8 w-16 mb-1" />
            <Skeleton className="h-4 w-12" />
          </div>
        </div>

        {/* Alerts */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-5 w-8 rounded-full" />
          </div>
          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-2 p-2.5 border-b border-gray-100 last:border-0">
                <Skeleton className="h-3.5 w-3.5" />
                <Skeleton className="h-4 w-full max-w-[200px]" />
                <Skeleton className="h-4 w-16 rounded-full ml-auto" />
              </div>
            ))}
          </div>
        </div>

        {/* Remediations */}
        <div className="border-t border-gray-100 pt-4 space-y-2">
          <Skeleton className="h-4 w-24" />
          <div className="grid grid-cols-3 gap-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="p-2.5 rounded-xl bg-white border border-gray-200 text-center">
                <Skeleton className="h-5 w-8 mx-auto mb-1" />
                <Skeleton className="h-3 w-16 mx-auto" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Skeleton for AICommandCenter
 * Layout: Header + AI Summary grid + Detailed insights + Quick actions
 */
export function AICommandCenterSkeleton() {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden h-full flex flex-col">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-40" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-7 w-7 rounded-lg" />
            <Skeleton className="h-5 w-5 rounded-full" />
          </div>
        </div>
      </div>

      <div className="p-5 space-y-4 flex-1">
        {/* AI Summary */}
        <div className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="p-3 rounded-xl border border-gray-200 bg-white">
                <div className="flex items-start gap-2">
                  <Skeleton className="h-4 w-4 mt-0.5" />
                  <Skeleton className="h-4 w-full" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Detailed Insights */}
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="p-3 rounded-xl border border-gray-200 bg-white">
              <div className="flex items-start gap-2.5">
                <Skeleton className="h-8 w-8 rounded-lg" />
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-4 w-16 rounded-full" />
                  </div>
                  <Skeleton className="h-3 w-full max-w-[250px]" />
                  <div className="mt-1.5 flex items-center gap-1">
                    <Skeleton className="h-3 w-3" />
                    <Skeleton className="h-3 w-40" />
                  </div>
                </div>
                <Skeleton className="h-4 w-4" />
              </div>
            </div>
          ))}
        </div>

        {/* Quick Actions */}
        <div className="border-t border-gray-100 pt-4 mt-auto">
          <Skeleton className="h-4 w-24 mb-2" />
          <div className="grid grid-cols-2 gap-2">
            <Skeleton className="h-10 w-full rounded-xl" />
            <Skeleton className="h-10 w-full rounded-xl" />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Skeleton for QuickActionsSummary
 */
export function QuickActionsSummarySkeleton() {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-md border border-gray-100">
      <Skeleton className="h-5 w-32 mb-3" />
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center justify-between p-3.5 rounded-xl border border-gray-100 bg-[#F9FAFB]">
            <div className="flex items-center gap-3">
              <Skeleton className="h-2.5 w-2.5 rounded-full" />
              <div>
                <Skeleton className="h-4 w-40 mb-1" />
                <Skeleton className="h-3 w-28" />
              </div>
            </div>
            <Skeleton className="h-4 w-4" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Section Header Skeleton
 */
export function SectionHeaderSkeleton() {
  return (
    <div className="flex items-start gap-3 mb-3">
      <Skeleton className="h-10 w-10 rounded-xl" />
      <div>
        <Skeleton className="h-6 w-48 mb-1" />
        <Skeleton className="h-4 w-64" />
      </div>
    </div>
  );
}
