import React from 'react';
import { BedrockTestSuite } from '@/components/BedrockTestSuite';
import { BedrockTest } from '@/components/BedrockTest';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Brain, TestTube, Settings } from 'lucide-react';
import { Layout } from '@/components/Layout';

export const BedrockTestPage: React.FC = () => {
 return (
 <Layout 
 title="Dev Tools - Bedrock AI" 
 description="Teste e validação de funcionalidades AWS Bedrock AI"
 icon={<Brain className="h-7 w-7 text-white" />}
 >
 <div className="space-y-6">
 <Tabs defaultValue="suite" className="w-full">
 <TabsList className="glass-card-float grid w-full grid-cols-3">
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
 <Card >
 <CardHeader>
 <CardTitle>Configuração Atual</CardTitle>
 </CardHeader>
 <CardContent className="space-y-2">
 <div className="flex justify-between">
 <span className="font-medium">Region:</span>
 <span className="text-muted-foreground">us-east-1</span>
 </div>
 <div className="flex justify-between">
 <span className="font-medium">Haiku Model:</span>
 <span className="text-muted-foreground text-sm">claude-3-haiku-20240307-v1:0</span>
 </div>
 <div className="flex justify-between">
 <span className="font-medium">Sonnet Model:</span>
 <span className="text-muted-foreground text-sm">claude-3-5-sonnet-20241022-v2:0</span>
 </div>
 <div className="flex justify-between">
 <span className="font-medium">Credential Source:</span>
 <span className="text-muted-foreground">AWS CLI / Default Chain</span>
 </div>
 </CardContent>
 </Card>

 <Card >
 <CardHeader>
 <CardTitle>Funcionalidades Disponíveis</CardTitle>
 </CardHeader>
 <CardContent className="space-y-2">
 <div className="flex items-center gap-2">
 <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
 <span>Connection Testing</span>
 </div>
 <div className="flex items-center gap-2">
 <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
 <span>Quick Responses</span>
 </div>
 <div className="flex items-center gap-2">
 <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
 <span>Complex Analysis</span>
 </div>
 <div className="flex items-center gap-2">
 <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
 <span>Tag Suggestions</span>
 </div>
 <div className="flex items-center gap-2">
 <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
 <span>Content Summarization</span>
 </div>
 <div className="flex items-center gap-2">
 <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
 <span>Content Translation</span>
 </div>
 <div className="flex items-center gap-2">
 <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
 <span>Cost Optimization Analysis</span>
 </div>
 <div className="flex items-center gap-2">
 <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
 <span>Security Analysis</span>
 </div>
 </CardContent>
 </Card>

 <Card className="md:col-span-2 ">
 <CardHeader>
 <CardTitle>Correções Recentes</CardTitle>
 </CardHeader>
 <CardContent>
 <div className="space-y-3">
 <div className="flex items-start gap-3">
 <div className="w-2 h-2 bg-emerald-500 rounded-full mt-2"></div>
 <div>
 <div className="font-medium">Validação de Credenciais Corrigida</div>
 <div className="text-sm text-muted-foreground">
 Resolvido erro "Resolved credential object is not valid" implementando tratamento adequado de credenciais.
 </div>
 </div>
 </div>
 <div className="flex items-start gap-3">
 <div className="w-2 h-2 bg-emerald-500 rounded-full mt-2"></div>
 <div>
 <div className="font-medium">Model IDs Atualizados</div>
 <div className="text-sm text-muted-foreground">
 Atualizado para usar IDs de modelo suportados: claude-3-5-sonnet-20240620-v1:0.
 </div>
 </div>
 </div>
 <div className="flex items-start gap-3">
 <div className="w-2 h-2 bg-emerald-500 rounded-full mt-2"></div>
 <div>
 <div className="font-medium">Configuração de Ambiente</div>
 <div className="text-sm text-muted-foreground">
 Gerenciamento centralizado de variáveis de ambiente com validação adequada.
 </div>
 </div>
 </div>
 <div className="flex items-start gap-3">
 <div className="w-2 h-2 bg-emerald-500 rounded-full mt-2"></div>
 <div>
 <div className="font-medium">Infraestrutura de Testes</div>
 <div className="text-sm text-muted-foreground">
 Adicionado suite de testes abrangente e ferramentas de debugging.
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
 </Layout>
 );
};

export default BedrockTestPage;
