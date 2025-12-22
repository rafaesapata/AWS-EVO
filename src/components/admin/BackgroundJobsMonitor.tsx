import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/integrations/aws/api-client";
import {
  Play, Pause, RefreshCw, Clock, CheckCircle,
  XCircle, AlertTriangle, Loader2
} from "lucide-react";
import { format } from "date-fns";

interface BackgroundJob {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  type: string;
  progress: number;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  metadata?: Record<string, any>;
}

export default function BackgroundJobsMonitor() {
  const [filter, setFilter] = useState<string>('all');
  const queryClient = useQueryClient();

  const { data: jobs, isLoading, refetch } = useQuery({
    queryKey: ['background-jobs', filter],
    queryFn: async () => {
      const response = await apiClient.lambda<BackgroundJob[]>('list-background-jobs', {
        status: filter === 'all' ? undefined : filter
      });
      return response.data || [];
    },
    refetchInterval: 5000,
  });

  const cancelJob = useMutation({
    mutationFn: async (jobId: string) => {
      return apiClient.lambda('cancel-background-job', { jobId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['background-jobs'] });
    },
  });

  const retryJob = useMutation({
    mutationFn: async (jobId: string) => {
      return apiClient.lambda('retry-background-job', { jobId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['background-jobs'] });
    },
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running': return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
      case 'completed': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed': return <XCircle className="h-4 w-4 text-red-500" />;
      case 'pending': return <Clock className="h-4 w-4 text-yellow-500" />;
      default: return <AlertTriangle className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, string> = {
      running: 'bg-blue-100 text-blue-800',
      completed: 'bg-green-100 text-green-800',
      failed: 'bg-red-100 text-red-800',
      pending: 'bg-yellow-100 text-yellow-800',
      cancelled: 'bg-gray-100 text-gray-800',
    };
    return variants[status] || variants.pending;
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="ml-2">Loading jobs...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Background Jobs Monitor</CardTitle>
        <div className="flex gap-2">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="border rounded px-2 py-1 text-sm"
          >
            <option value="all">All Jobs</option>
            <option value="running">Running</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
            <option value="completed">Completed</option>
          </select>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {jobs?.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">
              No background jobs found
            </p>
          ) : (
            jobs?.map((job) => (
              <div key={job.id} className="border rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {getStatusIcon(job.status)}
                    <div>
                      <p className="font-medium">{job.name}</p>
                      <p className="text-sm text-muted-foreground">{job.type}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={getStatusBadge(job.status)}>
                      {job.status}
                    </Badge>
                    {job.status === 'running' && (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => cancelJob.mutate(job.id)}
                      >
                        <Pause className="h-3 w-3" />
                      </Button>
                    )}
                    {job.status === 'failed' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => retryJob.mutate(job.id)}
                      >
                        <Play className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>

                {job.status === 'running' && (
                  <div className="mt-3">
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-500 h-2 rounded-full transition-all"
                        style={{ width: `${job.progress}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {job.progress}% complete
                    </p>
                  </div>
                )}

                {job.error && (
                  <p className="text-sm text-red-600 mt-2">{job.error}</p>
                )}

                <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                  {job.startedAt && (
                    <span>Started: {format(new Date(job.startedAt), 'MMM d, HH:mm')}</span>
                  )}
                  {job.completedAt && (
                    <span>Completed: {format(new Date(job.completedAt), 'MMM d, HH:mm')}</span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
