import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiClient } from "@/integrations/aws/api-client";
import { Rocket, CheckCircle, Loader2, AlertCircle } from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface AutoDeployStackProps {
  stackName: string;
  templateUrl: string;
  parameters?: Record<string, string>;
  onDeployComplete?: () => void;
  onDeployError?: (error: Error) => void;
}

export default function AutoDeployStack({
  stackName,
  templateUrl,
  parameters = {},
  onDeployComplete,
  onDeployError
}: AutoDeployStackProps) {
  const [deploying, setDeploying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<'idle' | 'deploying' | 'success' | 'error'>('idle');
  const { toast } = useToast();

  const handleDeploy = async () => {
    setDeploying(true);
    setStatus('deploying');
    setProgress(10);

    try {
      // Start deployment
      const response = await apiClient.lambda<{ stackId: string; status: string }>(
        'deploy-cloudformation-stack',
        { stackName, templateUrl, parameters }
      );

      if (response.error) {
        throw new Error(response.error.message);
      }

      setProgress(50);

      // Poll for completion
      let attempts = 0;
      const maxAttempts = 60;

      while (attempts < maxAttempts) {
        const statusResponse = await apiClient.lambda<{ status: string; outputs?: any }>(
          'get-stack-status',
          { stackName }
        );

        if (statusResponse.error) {
          throw new Error(statusResponse.error.message);
        }

        const stackStatus = statusResponse.data?.status;
        setProgress(50 + (attempts / maxAttempts) * 40);

        if (stackStatus === 'CREATE_COMPLETE' || stackStatus === 'UPDATE_COMPLETE') {
          setProgress(100);
          setStatus('success');
          toast({
            title: "Stack deployed successfully",
            description: `${stackName} is now active`
          });
          onDeployComplete?.();
          break;
        }

        if (stackStatus?.includes('FAILED') || stackStatus?.includes('ROLLBACK')) {
          throw new Error(`Stack deployment failed: ${stackStatus}`);
        }

        await new Promise(resolve => setTimeout(resolve, 5000));
        attempts++;
      }

      if (attempts >= maxAttempts) {
        throw new Error('Deployment timeout - check AWS Console for status');
      }

    } catch (error: any) {
      setStatus('error');
      toast({
        title: "Deployment failed",
        description: error.message,
        variant: "destructive"
      });
      onDeployError?.(error);
    } finally {
      setDeploying(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Rocket className="h-5 w-5" />
          Auto Deploy Stack
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-sm text-muted-foreground">
          <p><strong>Stack:</strong> {stackName}</p>
          <p className="truncate"><strong>Template:</strong> {templateUrl}</p>
        </div>

        {status === 'deploying' && (
          <div className="space-y-2">
            <Progress value={progress} className="h-2" />
            <p className="text-sm text-muted-foreground">Deploying... {Math.round(progress)}%</p>
          </div>
        )}

        {status === 'success' && (
          <div className="flex items-center gap-2 text-green-600">
            <CheckCircle className="h-5 w-5" />
            <span>Deployment successful</span>
          </div>
        )}

        {status === 'error' && (
          <div className="flex items-center gap-2 text-red-600">
            <AlertCircle className="h-5 w-5" />
            <span>Deployment failed</span>
          </div>
        )}

        <Button onClick={handleDeploy} disabled={deploying} className="w-full">
          {deploying ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Deploying...
            </>
          ) : (
            <>
              <CheckCircle className="h-4 w-4 mr-2" />
              Deploy {stackName}
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
