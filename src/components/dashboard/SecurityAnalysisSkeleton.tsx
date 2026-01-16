import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Shield } from "lucide-react";

export function SecurityPostureSkeleton() {
 return (
 <Card className=" animate-fade-in">
 <CardHeader>
 <CardTitle className="flex items-center justify-between">
 <div className="flex items-center gap-2">
 <Shield className="h-6 w-6 text-primary animate-pulse" />
 Security Posture Score
 </div>
 <Skeleton className="h-5 w-16" />
 </CardTitle>
 <div className="text-sm text-muted-foreground">
 <Skeleton className="h-4 w-48" />
 </div>
 </CardHeader>
 <CardContent>
 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
 <div className="text-center space-y-4">
 <Skeleton className="h-20 w-32 mx-auto rounded-lg" />
 <Skeleton className="h-4 w-20 mx-auto" />
 <Skeleton className="h-6 w-24 mx-auto rounded-full" />
 <Skeleton className="h-2 w-full" />
 </div>

 <div className="grid grid-cols-2 gap-4">
 {[1, 2, 3, 4].map((i) => (
 <div key={i} className="p-4 bg-muted/50 rounded-lg border border-border animate-pulse">
 <Skeleton className="h-10 w-16 mx-auto mb-2" />
 <Skeleton className="h-4 w-20 mx-auto" />
 </div>
 ))}
 </div>
 </div>
 </CardContent>
 </Card>
 );
}

export function CategoryBreakdownSkeleton() {
 return (
 <Card className=" animate-fade-in">
 <CardHeader>
 <CardTitle>Breakdown por Categoria</CardTitle>
 <div className="text-sm text-muted-foreground">
 <Skeleton className="h-4 w-64" />
 </div>
 </CardHeader>
 <CardContent className="space-y-6">
 {[1, 2, 3, 4, 5].map((i) => (
 <div key={i} className="space-y-2 animate-pulse">
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-2">
 <Skeleton className="h-4 w-4 rounded" />
 <Skeleton className="h-5 w-40" />
 </div>
 <div className="flex items-center gap-2">
 <Skeleton className="h-6 w-12" />
 <Skeleton className="h-6 w-20 rounded-full" />
 </div>
 </div>
 <Skeleton className="h-2 w-full" />
 </div>
 ))}
 </CardContent>
 </Card>
 );
}

export function FindingsTableSkeleton() {
 return (
 <Card className="animate-fade-in">
 <CardHeader>
 <div className="flex items-center justify-between">
 <CardTitle className="flex items-center gap-2">
 <Skeleton className="h-5 w-5" />
 <Skeleton className="h-6 w-32" />
 </CardTitle>
 </div>
 <div className="text-sm text-muted-foreground">
 <Skeleton className="h-4 w-96" />
 </div>
 </CardHeader>
 <CardContent>
 <div className="space-y-4">
 {/* Filters Skeleton */}
 <div className="flex gap-4 flex-wrap">
 <Skeleton className="h-10 w-64" />
 <Skeleton className="h-10 w-40" />
 <Skeleton className="h-10 w-40" />
 <Skeleton className="h-10 w-40" />
 </div>

 {/* Table Skeleton */}
 <div className="border rounded-lg">
 <div className="p-4 border-b bg-muted/50">
 <div className="flex items-center gap-4">
 <Skeleton className="h-5 w-5" />
 <Skeleton className="h-5 w-32" />
 <Skeleton className="h-5 flex-1" />
 <Skeleton className="h-5 w-24" />
 <Skeleton className="h-5 w-24" />
 <Skeleton className="h-5 w-16" />
 </div>
 </div>
 {[1, 2, 3, 4, 5].map((i) => (
 <div key={i} className="p-4 border-b last:border-b-0 animate-pulse">
 <div className="flex items-center gap-4">
 <Skeleton className="h-5 w-5" />
 <Skeleton className="h-5 w-32" />
 <Skeleton className="h-5 flex-1" />
 <Skeleton className="h-5 w-24" />
 <Skeleton className="h-5 w-24" />
 <Skeleton className="h-8 w-16 rounded-md" />
 </div>
 </div>
 ))}
 </div>
 </div>
 </CardContent>
 </Card>
 );
}
