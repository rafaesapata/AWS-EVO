import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ReactNode } from "react";

interface InfoTooltipProps {
  title: string;
  children: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  className?: string;
}

export function InfoTooltip({ title, children, side = "top", className }: InfoTooltipProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button 
          variant="ghost" 
          size="icon" 
          className={`h-5 w-5 text-muted-foreground hover:text-foreground ${className || ''}`}
        >
          <Info className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 text-sm" side={side}>
        <div className="space-y-2">
          <h4 className="font-semibold text-sm">{title}</h4>
          {children}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// Pre-defined tooltips for common metrics
export const tooltipContent = {
  securityScore: (
    <>
      <p className="text-muted-foreground">
        O <strong>Score de Segurança</strong> é calculado com base em todos os findings de segurança detectados.
      </p>
      <ul className="text-xs text-muted-foreground space-y-1 mt-2">
        <li>• Findings críticos têm peso 10x maior</li>
        <li>• Normalizado pelo tamanho da infraestrutura</li>
        <li>• Penalidade adicional para issues críticas</li>
      </ul>
      <div className="border-t pt-2 mt-2">
        <p className="text-xs text-muted-foreground">
          <strong>80-100:</strong> Excelente | <strong>60-79:</strong> Bom | <strong>0-59:</strong> Requer atenção
        </p>
      </div>
    </>
  ),
  
  wasteDetection: (
    <>
      <p className="text-muted-foreground">
        O sistema analisa métricas de utilização de recursos AWS para identificar desperdícios.
      </p>
      <ul className="text-xs text-muted-foreground space-y-1 mt-2">
        <li>• EC2 com baixa utilização de CPU/memória</li>
        <li>• EBS volumes não anexados</li>
        <li>• Snapshots antigos não utilizados</li>
        <li>• Elastic IPs não associados</li>
        <li>• RDS com pouca atividade</li>
      </ul>
      <div className="border-t pt-2 mt-2">
        <p className="text-xs text-muted-foreground">
          💡 O custo anual é calculado com base no custo mensal × 12 meses.
        </p>
      </div>
    </>
  ),

  anomalyDetection: (
    <>
      <p className="text-muted-foreground">
        Detecta variações anormais nos custos usando análise estatística.
      </p>
      <ul className="text-xs text-muted-foreground space-y-1 mt-2">
        <li>• <strong>Spike:</strong> Aumento súbito acima da média</li>
        <li>• <strong>Drop:</strong> Queda inesperada nos custos</li>
        <li>• Baseado em 30 dias de histórico</li>
        <li>• Severidade calculada pelo desvio %</li>
      </ul>
      <div className="border-t pt-2 mt-2">
        <p className="text-xs text-muted-foreground">
          💡 Desvios acima de 2x o desvio padrão são considerados anomalias.
        </p>
      </div>
    </>
  ),

  potentialSavings: (
    <>
      <p className="text-muted-foreground">
        Soma das economias estimadas de todas as recomendações de otimização ativas.
      </p>
      <ul className="text-xs text-muted-foreground space-y-1 mt-2">
        <li>• Recomendações de rightsizing</li>
        <li>• Reserved Instances / Savings Plans</li>
        <li>• Eliminação de recursos ociosos</li>
      </ul>
      <div className="border-t pt-2 mt-2">
        <p className="text-xs text-muted-foreground">
          💡 Valores são estimativas mensais baseadas em padrões de uso atuais.
        </p>
      </div>
    </>
  ),

  wellArchitected: (
    <>
      <p className="text-muted-foreground">
        Avaliação baseada nos 6 pilares do AWS Well-Architected Framework.
      </p>
      <ul className="text-xs text-muted-foreground space-y-1 mt-2">
        <li>• <strong>Excelência Operacional:</strong> Operações eficientes</li>
        <li>• <strong>Segurança:</strong> Proteção de dados e sistemas</li>
        <li>• <strong>Confiabilidade:</strong> Recuperação de falhas</li>
        <li>• <strong>Eficiência:</strong> Uso otimizado de recursos</li>
        <li>• <strong>Otimização de Custos:</strong> Eliminar desperdício</li>
        <li>• <strong>Sustentabilidade:</strong> Impacto ambiental</li>
      </ul>
    </>
  ),

  alertTypes: {
    cost_spike: "Alerta quando os custos aumentam além do limite definido em um curto período.",
    security_critical: "Alerta imediato quando findings de segurança críticos são detectados.",
    waste_detected: "Alerta quando desperdício de recursos acima do valor limite é identificado.",
    compliance_violation: "Alerta quando violações de compliance são detectadas nos scans.",
    job_failure_rate: "Alerta quando a taxa de falha de jobs em background excede o limite.",
    dlq_growth: "Alerta quando a Dead Letter Queue cresce além do esperado.",
    health_degraded: "Alerta quando a saúde geral do sistema está degradada.",
    high_error_rate: "Alerta quando a taxa de erros por minuto excede o limite."
  },

  remediations: (
    <>
      <p className="text-muted-foreground">
        Tickets de remediação para findings de segurança e recomendações de custo.
      </p>
      <ul className="text-xs text-muted-foreground space-y-1 mt-2">
        <li>• <strong>Pendente:</strong> Aguardando ação</li>
        <li>• <strong>Em Progresso:</strong> Sendo trabalhado</li>
        <li>• <strong>Resolvido:</strong> Correção aplicada</li>
      </ul>
      <div className="border-t pt-2 mt-2">
        <p className="text-xs text-muted-foreground">
          💡 Tickets podem ser criados automaticamente ou manualmente.
        </p>
      </div>
    </>
  ),

  endpointMonitoring: (
    <>
      <p className="text-muted-foreground">
        Monitora a disponibilidade e tempo de resposta de endpoints HTTP/HTTPS.
      </p>
      <ul className="text-xs text-muted-foreground space-y-1 mt-2">
        <li>• Verificação periódica de disponibilidade</li>
        <li>• Medição de tempo de resposta (ms)</li>
        <li>• Validação de certificados SSL</li>
        <li>• Alertas em caso de falhas</li>
      </ul>
    </>
  ),

  compliancePercentage: (
    <>
      <p className="text-muted-foreground">
        Percentual de controles de compliance que estão em conformidade.
      </p>
      <ul className="text-xs text-muted-foreground space-y-1 mt-2">
        <li>• CIS Benchmarks</li>
        <li>• SOC 2 Controls</li>
        <li>• LGPD Requirements</li>
        <li>• Best Practices AWS</li>
      </ul>
    </>
  ),

  predictiveIncidents: (
    <>
      <p className="text-muted-foreground">
        Usa Machine Learning para prever incidentes antes que ocorram.
      </p>
      <ul className="text-xs text-muted-foreground space-y-1 mt-2">
        <li>• Análise de tendências de segurança</li>
        <li>• Correlação de anomalias de custo</li>
        <li>• Padrões de degradação de recursos</li>
        <li>• Probabilidade e tempo estimado</li>
      </ul>
      <div className="border-t pt-2 mt-2">
        <p className="text-xs text-muted-foreground">
          💡 Previsões com probabilidade acima de 70% são exibidas.
        </p>
      </div>
    </>
  ),
};
