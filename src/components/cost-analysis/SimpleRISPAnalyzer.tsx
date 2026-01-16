import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BarChart3 } from 'lucide-react';

interface SimpleRISPAnalyzerProps {
  accountId: string;
  region?: string;
}

export function SimpleRISPAnalyzer({ accountId, region = 'us-east-1' }: SimpleRISPAnalyzerProps) {
  const [loading, setLoading] = useState(false);

  const runAnalysis = async () => {
    setLoading(true);
    try {
      // Simulação simples
      await new Promise(resolve => setTimeout(resolve, 2000));
      alert('Análise concluída! Esta é uma versão simplificada.');
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Análise de Reserved Instances & Savings Plans</h2>
          <p className="text-muted-foreground">
            Análise de oportunidades de otimização de custos
          </p>
        </div>
        <Button onClick={runAnalysis} disabled={loading}>
          {loading ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
              Analisando...
            </>
          ) : (
            <>
              <BarChart3 className="h-4 w-4 mr-2" />
              Executar Análise
            </>
          )}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Status da Análise</CardTitle>
          <CardDescription>
            Clique em "Executar Análise" para começar
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <BarChart3 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">
              Conta: {accountId} | Região: {region}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}