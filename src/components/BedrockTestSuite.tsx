import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { bedrockAI } from '@/integrations/aws/bedrock-client';
import { useKnowledgeBaseAI } from '@/hooks/useKnowledgeBaseAI';
import { useToast } from '@/hooks/use-toast';
import { Loader2, CheckCircle, XCircle, Brain, Tags, FileText, Languages, Zap } from 'lucide-react';

interface TestResult {
  name: string;
  status: 'idle' | 'running' | 'success' | 'error';
  result?: string;
  error?: string;
  duration?: number;
}

export const BedrockTestSuite: React.FC = () => {
  const [testResults, setTestResults] = useState<TestResult[]>([
    { name: 'Connection Test', status: 'idle' },
    { name: 'Quick Response', status: 'idle' },
    { name: 'Analysis Generation', status: 'idle' },
    { name: 'Tag Suggestion', status: 'idle' },
    { name: 'Summary Generation', status: 'idle' },
    { name: 'Content Translation', status: 'idle' },
  ]);
  
  const [testContent, setTestContent] = useState(
    'AWS Cost Optimization is a critical practice for organizations using cloud services. It involves analyzing usage patterns, rightsizing resources, and implementing automated scaling to reduce unnecessary expenses while maintaining performance.'
  );
  
  const { suggestTags, generateSummary, translateContent } = useKnowledgeBaseAI();
  const { toast } = useToast();

  const updateTestResult = (index: number, update: Partial<TestResult>) => {
    setTestResults(prev => prev.map((result, i) => 
      i === index ? { ...result, ...update } : result
    ));
  };

  const runTest = async (testIndex: number, testFn: () => Promise<string>) => {
    const startTime = Date.now();
    updateTestResult(testIndex, { status: 'running' });
    
    try {
      const result = await testFn();
      const duration = Date.now() - startTime;
      updateTestResult(testIndex, { 
        status: 'success', 
        result: result.substring(0, 200) + (result.length > 200 ? '...' : ''),
        duration 
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      updateTestResult(testIndex, { 
        status: 'error', 
        error: error instanceof Error ? error.message : String(error),
        duration 
      });
    }
  };

  const runAllTests = async () => {
    // Reset all tests
    setTestResults(prev => prev.map(result => ({ ...result, status: 'idle', result: undefined, error: undefined })));
    
    // Test 1: Connection Test
    await runTest(0, async () => {
      const result = await bedrockAI.testConnection();
      if (!result.success) throw new Error(result.message);
      return result.message;
    });

    // Test 2: Quick Response
    await runTest(1, async () => {
      return await bedrockAI.generateQuickResponse('What is AWS? Respond in one sentence.');
    });

    // Test 3: Analysis Generation
    await runTest(2, async () => {
      return await bedrockAI.generateAnalysis('Analyze the benefits of cloud computing', 'Focus on cost and scalability aspects');
    });

    // Test 4: Tag Suggestion
    await runTest(3, async () => {
      const tags = await suggestTags(testContent);
      return `Generated tags: ${tags.join(', ')}`;
    });

    // Test 5: Summary Generation
    await runTest(4, async () => {
      return await generateSummary(testContent);
    });

    // Test 6: Content Translation
    await runTest(5, async () => {
      return await translateContent('Hello, this is a test message.', 'Portuguese');
    });

    toast({
      title: "Test Suite Completed",
      description: "All Bedrock tests have been executed",
    });
  };

  const getStatusIcon = (status: TestResult['status']) => {
    switch (status) {
      case 'running':
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
      case 'success':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <div className="h-4 w-4 rounded-full bg-gray-300" />;
    }
  };

  const getTestIcon = (index: number) => {
    const icons = [Brain, Zap, FileText, Tags, FileText, Languages];
    const Icon = icons[index];
    return <Icon className="h-4 w-4" />;
  };

  const successCount = testResults.filter(r => r.status === 'success').length;
  const errorCount = testResults.filter(r => r.status === 'error').length;
  const runningCount = testResults.filter(r => r.status === 'running').length;

  return (
    <div className="w-full max-w-4xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            Bedrock AI Test Suite
          </CardTitle>
          <div className="flex gap-2">
            <Badge variant="outline" className="text-green-600">
              ✓ {successCount} Passed
            </Badge>
            <Badge variant="outline" className="text-red-600">
              ✗ {errorCount} Failed
            </Badge>
            {runningCount > 0 && (
              <Badge variant="outline" className="text-blue-600">
                ⟳ {runningCount} Running
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-2 block">Test Content:</label>
            <Textarea
              value={testContent}
              onChange={(e) => setTestContent(e.target.value)}
              placeholder="Enter content for testing AI functions..."
              className="min-h-[100px]"
            />
          </div>
          
          <Button 
            onClick={runAllTests} 
            disabled={runningCount > 0}
            className="w-full"
          >
            {runningCount > 0 ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Running Tests...
              </>
            ) : (
              'Run All Tests'
            )}
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-4">
        {testResults.map((test, index) => (
          <Card key={index}>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {getTestIcon(index)}
                  <span className="font-medium">{test.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  {test.duration && (
                    <span className="text-xs text-gray-500">{test.duration}ms</span>
                  )}
                  {getStatusIcon(test.status)}
                </div>
              </div>
              
              {test.result && (
                <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded text-sm">
                  <strong>Result:</strong> {test.result}
                </div>
              )}
              
              {test.error && (
                <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-sm">
                  <strong>Error:</strong> {test.error}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default BedrockTestSuite;