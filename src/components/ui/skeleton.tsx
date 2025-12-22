/**
 * Enhanced Skeleton Components
 * Provides consistent loading states across the application
 */

import { cn } from "@/lib/utils"

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  )
}

/**
 * Card skeleton for dashboard cards
 */
function CardSkeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("rounded-lg border bg-card p-6", className)} {...props}>
      <div className="space-y-3">
        <Skeleton className="h-4 w-[250px]" />
        <Skeleton className="h-4 w-[200px]" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-[80%]" />
        </div>
      </div>
    </div>
  )
}

/**
 * Table skeleton for data tables
 */
function TableSkeleton({ 
  rows = 5, 
  columns = 4,
  className,
  ...props 
}: React.HTMLAttributes<HTMLDivElement> & {
  rows?: number;
  columns?: number;
}) {
  return (
    <div className={cn("space-y-3", className)} {...props}>
      {/* Header */}
      <div className="flex space-x-4">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} className="h-4 flex-1" />
        ))}
      </div>
      
      {/* Rows */}
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="flex space-x-4">
          {Array.from({ length: columns }).map((_, colIndex) => (
            <Skeleton key={colIndex} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
  )
}

/**
 * Chart skeleton for analytics
 */
function ChartSkeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("space-y-3", className)} {...props}>
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-[200px]" />
        <Skeleton className="h-4 w-[100px]" />
      </div>
      <Skeleton className="h-[300px] w-full" />
      <div className="flex justify-center space-x-4">
        <Skeleton className="h-3 w-[60px]" />
        <Skeleton className="h-3 w-[80px]" />
        <Skeleton className="h-3 w-[70px]" />
      </div>
    </div>
  )
}

/**
 * List skeleton for findings, scans, etc.
 */
function ListSkeleton({ 
  items = 5,
  className,
  ...props 
}: React.HTMLAttributes<HTMLDivElement> & {
  items?: number;
}) {
  return (
    <div className={cn("space-y-4", className)} {...props}>
      {Array.from({ length: items }).map((_, i) => (
        <div key={i} className="flex items-center space-x-4 rounded-lg border p-4">
          <Skeleton className="h-12 w-12 rounded-full" />
          <div className="space-y-2 flex-1">
            <Skeleton className="h-4 w-[250px]" />
            <Skeleton className="h-4 w-[200px]" />
          </div>
          <Skeleton className="h-8 w-[80px]" />
        </div>
      ))}
    </div>
  )
}

/**
 * Form skeleton for loading forms
 */
function FormSkeleton({ 
  fields = 4,
  className,
  ...props 
}: React.HTMLAttributes<HTMLDivElement> & {
  fields?: number;
}) {
  return (
    <div className={cn("space-y-6", className)} {...props}>
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-4 w-[120px]" />
          <Skeleton className="h-10 w-full" />
        </div>
      ))}
      <div className="flex justify-end space-x-2">
        <Skeleton className="h-10 w-[100px]" />
        <Skeleton className="h-10 w-[100px]" />
      </div>
    </div>
  )
}

/**
 * Avatar skeleton
 */
function AvatarSkeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <Skeleton className={cn("h-10 w-10 rounded-full", className)} {...props} />
  )
}

/**
 * Text skeleton with multiple lines
 */
function TextSkeleton({ 
  lines = 3,
  className,
  ...props 
}: React.HTMLAttributes<HTMLDivElement> & {
  lines?: number;
}) {
  return (
    <div className={cn("space-y-2", className)} {...props}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton 
          key={i} 
          className={cn(
            "h-4",
            i === lines - 1 ? "w-[70%]" : "w-full"
          )} 
        />
      ))}
    </div>
  )
}

/**
 * Page skeleton for full page loading
 */
function PageSkeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("space-y-6 p-6", className)} {...props}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-[300px]" />
          <Skeleton className="h-4 w-[200px]" />
        </div>
        <Skeleton className="h-10 w-[120px]" />
      </div>
      
      {/* Stats cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
      
      {/* Main content */}
      <div className="grid gap-6 md:grid-cols-2">
        <ChartSkeleton />
        <ListSkeleton />
      </div>
    </div>
  )
}

export { 
  Skeleton,
  CardSkeleton,
  TableSkeleton,
  ChartSkeleton,
  ListSkeleton,
  FormSkeleton,
  AvatarSkeleton,
  TextSkeleton,
  PageSkeleton
}