import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Shield, Activity, Bell, TrendingUp, Lock, ShieldAlert } from "lucide-react";
import { Layout } from "@/components/Layout";

const AttackDetection = () => {
  return (
    <Layout
      title="Detecção de Ataques em Tempo Real"
      description="Monitoramento contínuo de logs do AWS WAF para identificação proativa de tentativas de ataque"
      icon={<ShieldAlert className="h-7 w-7 text-white" />}
    >
      <div className="space-y-6">

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <Activity className="h-8 w-8 text-primary mb-2" />
            <CardTitle>Análise em Tempo Real</CardTitle>
            <CardDescription>
              Processamento contínuo de logs
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Sistema processa logs do AWS WAF em tempo real, analisando cada requisição bloqueada ou permitida
              para identificar padrões de ataque como SQL Injection, XSS, DDoS, e tentativas de força bruta.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <AlertTriangle className="h-8 w-8 text-destructive mb-2" />
            <CardTitle>Detecção de Padrões</CardTitle>
            <CardDescription>
              Identificação de comportamentos maliciosos
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Algoritmos de machine learning identificam padrões suspeitos: múltiplas requisições de um mesmo IP,
              tentativas de exploração de vulnerabilidades conhecidas, e atividades anômalas baseadas em 
              histórico de comportamento normal.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <Bell className="h-8 w-8 text-warning mb-2" />
            <CardTitle>Alertas Inteligentes</CardTitle>
            <CardDescription>
              Notificações configuráveis
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Sistema de alertas multi-canal (email, Slack, PagerDuty) com severidade configurável.
              Alertas críticos são priorizados e incluem contexto completo do ataque detectado
              para resposta rápida da equipe de segurança.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <TrendingUp className="h-8 w-8 text-info mb-2" />
            <CardTitle>Analytics Avançado</CardTitle>
            <CardDescription>
              Métricas e tendências
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Dashboard com visualizações de ataques por tipo, origem geográfica, regras WAF acionadas,
              e tendências ao longo do tempo. Exportação de relatórios para compliance e auditoria.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <Lock className="h-8 w-8 text-success mb-2" />
            <CardTitle>Resposta Automatizada</CardTitle>
            <CardDescription>
              Bloqueio preventivo
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Ações automatizadas para mitigar ataques: bloqueio temporário de IPs suspeitos via WAF,
              rate limiting dinâmico, e integração com AWS Shield para proteção contra DDoS em escala.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <Shield className="h-8 w-8 text-primary mb-2" />
            <CardTitle>Inteligência de Ameaças</CardTitle>
            <CardDescription>
              Feeds de threat intelligence
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Integração com bases de dados de ameaças conhecidas, listas de IPs maliciosos,
              e assinaturas de ataques atualizadas. Correlação com CVEs e indicadores de comprometimento (IOCs).
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-warning/30 bg-warning/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Badge variant="outline" className="bg-warning/20 text-warning-foreground border-warning/30">
              <Lock className="h-3 w-3 mr-1" />
              Licença Necessária
            </Badge>
            Funcionalidade Disponível
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <p className="text-muted-foreground">
              A funcionalidade de <strong>Detecção de Ataques em Tempo Real</strong> está pronta e disponível, 
              porém não está incluída na sua licença atual.
            </p>
            
            <div className="bg-background/50 rounded-lg p-4 border border-border/50">
              <h3 className="font-semibold mb-2">Recursos incluídos nesta funcionalidade:</h3>
              <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                <li>Análise em tempo real de logs do AWS WAF</li>
                <li>Detecção de padrões de ataque com Machine Learning</li>
                <li>Alertas inteligentes multi-canal configuráveis</li>
                <li>Dashboard analytics com métricas e tendências</li>
                <li>Resposta automatizada e bloqueio preventivo</li>
                <li>Integração com feeds de threat intelligence</li>
                <li>Relatórios de compliance (PCI-DSS, SOC 2, ISO 27001)</li>
              </ul>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <a 
                href="https://www.nuevacore.com/contact" 
                target="_blank" 
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Falar com Comercial
              </a>
              <a 
                href="mailto:comercial@nuevacore.com" 
                className="inline-flex items-center justify-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                comercial@nuevacore.com
              </a>
            </div>
          </div>
        </CardContent>
      </Card>
      </div>
    </Layout>
  );
};

export default AttackDetection;
