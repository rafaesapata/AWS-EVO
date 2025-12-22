import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { bedrockAI } from '@/integrations/aws/bedrock-client';
import { useToast } from '@/hooks/use-toast';

export const BedrockTest: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<string>('');
  const { toast } = useToast();

  const testBedrock = async () => {
    setIsLoading(true);
    setResult('');
    
    try {
      const testResult = await bedrockAI.testConnection();
      
      if (testResult.success) {
        setResult(testResult.message);
        toast({
          title: "Bedrock Test Successful",
          description: "Connection to AWS Bedrock is working correctly",
        });
      } else {
        setResult(`Error: ${testResult.message} - ${testResult.error}`);
        toast({
          title: "Bedrock Test Failed",
          description: testResult.message,
          variant: "destructive",
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      setResult(`Unexpected error: ${errorMessage}`);
      toast({
        title: "Bedrock Test Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Bedrock Connection Test</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button 
          onClick={testBedrock} 
          disabled={isLoading}
          className="w-full"
        >
          {isLoading ? 'Testing...' : 'Test Bedrock Connection'}
        </Button>
        
        {result && (
          <div className="p-3 bg-gray-100 rounded-md">
            <p className="text-sm">{result}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default BedrockTest;