import React from 'react';
import { BedrockTestSuite } from '@/components/BedrockTestSuite';
import { BedrockTest } from '@/components/BedrockTest';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Brain, TestTube, Settings } from 'lucide-react';

export const BedrockTestPage: React.FC = () => {
  return (
    <div className="w-full py-8 px-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2 flex items-center gap-2">
          <Brain className="h-8 w-8 text-blue-600" />
          Bedrock AI Testing
        </h1>
        <p className="text-gray-600">
          Test and validate AWS Bedrock AI functionality and performance
        </p>
      </div>

      <Tabs defaultValue="suite" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="suite" className="flex items-center gap-2">
            <TestTube className="h-4 w-4" />
            Test Suite
          </TabsTrigger>
          <TabsTrigger value="simple" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Simple Test
          </TabsTrigger>
          <TabsTrigger value="info" className="flex items-center gap-2">
            <Brain className="h-4 w-4" />
            Info
          </TabsTrigger>
        </TabsList>

        <TabsContent value="suite" className="mt-6">
          <BedrockTestSuite />
        </TabsContent>

        <TabsContent value="simple" className="mt-6">
          <div className="flex justify-center">
            <BedrockTest />
          </div>
        </TabsContent>

        <TabsContent value="info" className="mt-6">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Current Configuration</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between">
                  <span className="font-medium">Region:</span>
                  <span className="text-gray-600">us-east-1</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium">Haiku Model:</span>
                  <span className="text-gray-600 text-sm">claude-3-haiku-20240307-v1:0</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium">Sonnet Model:</span>
                  <span className="text-gray-600 text-sm">claude-3-5-sonnet-20240620-v1:0</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium">Credential Source:</span>
                  <span className="text-gray-600">AWS CLI / Default Chain</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Available Features</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span>Connection Testing</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span>Quick Responses</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span>Complex Analysis</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span>Tag Suggestions</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span>Content Summarization</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span>Content Translation</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span>Cost Optimization Analysis</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span>Security Analysis</span>
                </div>
              </CardContent>
            </Card>

            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle>Recent Fixes</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="w-2 h-2 bg-green-500 rounded-full mt-2"></div>
                    <div>
                      <div className="font-medium">Credential Validation Fixed</div>
                      <div className="text-sm text-gray-600">
                        Resolved "Resolved credential object is not valid" error by implementing proper credential handling and fallback to AWS CLI credentials.
                      </div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-2 h-2 bg-green-500 rounded-full mt-2"></div>
                    <div>
                      <div className="font-medium">Model IDs Updated</div>
                      <div className="text-sm text-gray-600">
                        Updated to use supported model IDs: claude-3-5-sonnet-20240620-v1:0 (supports ON_DEMAND inference).
                      </div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-2 h-2 bg-green-500 rounded-full mt-2"></div>
                    <div>
                      <div className="font-medium">Environment Configuration</div>
                      <div className="text-sm text-gray-600">
                        Centralized environment variable management and added proper validation.
                      </div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-2 h-2 bg-green-500 rounded-full mt-2"></div>
                    <div>
                      <div className="font-medium">Testing Infrastructure</div>
                      <div className="text-sm text-gray-600">
                        Added comprehensive test suite and debugging tools for easier troubleshooting.
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default BedrockTestPage;