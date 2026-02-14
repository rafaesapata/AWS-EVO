import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Layout } from "@/components/Layout";
import { apiClient, getErrorMessage } from "@/integrations/aws/api-client";
import { useCloudAccount, useAccountFilter } from "@/contexts/CloudAccountContext";
import { useOrganization } from "@/hooks/useOrganization";
import { useAuthSafe } from "@/hooks/useAuthSafe";
import { useDemoAwareQuery } from "@/hooks/useDemoAwareQuery";
import { 
  Zap, 
  TrendingDown, 
  DollarSign, 
  Server,
  Database,
  HardDrive,
  Cpu,
  BarChart3,
  CheckCircle,
  AlertTriangle,
  Clock,
  RefreshCw,
  Download,
  Lightbulb,
  Target,
  TrendingUp,
  Copy,
  Terminal,
  MessageSquare,
  ExternalLink,
  Search,
  Filter,
  Ticket,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight
} from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell } from "recharts";

// Helper function to generate specific implementation steps and scripts based on optimization type
const OPTIMIZATION_TYPE_MAP: Record<string, string> = {
  'terminate_stopped_instance': 'unused_resources',
  'delete_unattached_volume': 'unused_resources',
  'release_unused_eip': 'unused_resources',
  'cleanup_old_snapshots': 'unused_resources',
  'rightsize_instance': 'rightsizing',
  'rightsize_lambda_memory': 'rightsizing',
  'upgrade_instance_generation': 'rightsizing',
  'upgrade_rds_generation': 'rightsizing',
  'migrate_gp2_to_gp3': 'storage_optimization',
  'rds_storage_gp3': 'storage_optimization',
  'savings_plan_candidate': 'reserved_instances',
  'reserved_instance': 'reserved_instances',
  'disable_multiaz_nonprod': 'scheduling',
  'schedule_instance': 'scheduling',
};

function normalizeOptimizationType(backendType: string): string {
  return OPTIMIZATION_TYPE_MAP[backendType] || backendType;
}

function normalizeResourceType(backendType: string, resourceType: string): string {
  const type = backendType.toLowerCase();
  const rt = resourceType.toLowerCase();
  if (type.includes('rds') || rt.includes('rds')) return 'RDS';
  if (type.includes('eip') || rt.includes('elastic ip')) return 'Elastic IP';
  if (type.includes('ebs') || type.includes('volume') || type.includes('snapshot') || rt.includes('ebs')) return 'EBS Volume';
  if (type.includes('s3') || rt.includes('s3')) return 'S3';
  if (type.includes('lambda') || rt.includes('lambda')) return 'Lambda';
  return resourceType;
}

function getSpecificImplementation(type: string, resourceType: string, resourceId: string): {
  steps: string[];
  scripts: { title: string; command: string; description: string }[];
  copilotPrompt: string;
} {
  const baseResourceType = resourceType.toLowerCase();
  
  switch (type) {
    case 'rightsizing':
      if (baseResourceType.includes('ec2') || baseResourceType.includes('instance')) {
        return {
          steps: [
            `Analise as métricas de CPU e memória da instância ${resourceId} no CloudWatch (últimos 14 dias)`,
            'Identifique o tipo de instância recomendado baseado no uso real',
            'Crie um snapshot do volume EBS como backup',
            'Agende uma janela de manutenção para o resize',
            'Pare a instância e altere o tipo de instância',
            'Inicie a instância e valide a aplicação',
            'Monitore por 48h para garantir estabilidade'
          ],
          scripts: [
            {
              title: 'Verificar métricas de CPU',
              command: `aws cloudwatch get-metric-statistics \\
  --namespace AWS/EC2 \\
  --metric-name CPUUtilization \\
  --dimensions Name=InstanceId,Value=${resourceId} \\
  --start-time $(date -u -d '14 days ago' +%Y-%m-%dT%H:%M:%SZ) \\
  --end-time $(date -u +%Y-%m-%dT%H:%M:%SZ) \\
  --period 3600 \\
  --statistics Average Maximum`,
              description: 'Obtém estatísticas de CPU dos últimos 14 dias'
            },
            {
              title: 'Criar snapshot de backup',
              command: `# Primeiro, obtenha o volume ID
VOLUME_ID=$(aws ec2 describe-instances --instance-ids ${resourceId} --query 'Reservations[0].Instances[0].BlockDeviceMappings[0].Ebs.VolumeId' --output text)

# Criar snapshot
aws ec2 create-snapshot --volume-id $VOLUME_ID --description "Backup antes de rightsizing ${resourceId}"`,
              description: 'Cria um snapshot do volume antes de fazer alterações'
            },
            {
              title: 'Alterar tipo de instância',
              command: `# Parar a instância
aws ec2 stop-instances --instance-ids ${resourceId}
aws ec2 wait instance-stopped --instance-ids ${resourceId}

# Alterar tipo (substitua NOVO_TIPO pelo tipo desejado)
aws ec2 modify-instance-attribute --instance-id ${resourceId} --instance-type "{\\\"Value\\\": \\\"NOVO_TIPO\\\"}"

# Iniciar a instância
aws ec2 start-instances --instance-ids ${resourceId}`,
              description: 'Para, altera o tipo e reinicia a instância'
            }
          ],
          copilotPrompt: `Preciso fazer rightsizing da instância EC2 ${resourceId}. Analise as métricas de uso e recomende o tipo de instância mais adequado considerando custo-benefício. Também me ajude a criar um plano de migração seguro.`
        };
      } else if (baseResourceType.includes('rds')) {
        return {
          steps: [
            `Analise as métricas de CPU, memória e conexões do RDS ${resourceId}`,
            'Verifique o uso de storage e IOPS provisionados',
            'Identifique a classe de instância recomendada',
            'Crie um snapshot manual do banco de dados',
            'Agende a modificação para janela de manutenção',
            'Aplique a modificação (pode causar breve indisponibilidade)',
            'Valide a performance das queries após a mudança'
          ],
          scripts: [
            {
              title: 'Verificar métricas do RDS',
              command: `aws cloudwatch get-metric-statistics \\
  --namespace AWS/RDS \\
  --metric-name CPUUtilization \\
  --dimensions Name=DBInstanceIdentifier,Value=${resourceId} \\
  --start-time $(date -u -d '7 days ago' +%Y-%m-%dT%H:%M:%SZ) \\
  --end-time $(date -u +%Y-%m-%dT%H:%M:%SZ) \\
  --period 3600 \\
  --statistics Average Maximum`,
              description: 'Obtém estatísticas de CPU do RDS'
            },
            {
              title: 'Criar snapshot do RDS',
              command: `aws rds create-db-snapshot \\
  --db-instance-identifier ${resourceId} \\
  --db-snapshot-identifier ${resourceId}-pre-rightsizing-$(date +%Y%m%d)`,
              description: 'Cria snapshot antes da modificação'
            },
            {
              title: 'Modificar classe da instância',
              command: `aws rds modify-db-instance \\
  --db-instance-identifier ${resourceId} \\
  --db-instance-class NOVA_CLASSE \\
  --apply-immediately`,
              description: 'Altera a classe da instância RDS'
            }
          ],
          copilotPrompt: `Preciso fazer rightsizing do banco RDS ${resourceId}. Analise o uso atual e recomende a classe de instância mais adequada. Considere também se Multi-AZ é necessário e se posso usar Reserved Instances.`
        };
      }
      break;

    case 'unused_resources':
      if (baseResourceType.includes('ebs') || baseResourceType.includes('volume')) {
        return {
          steps: [
            `Confirme que o volume ${resourceId} não está anexado a nenhuma instância`,
            'Verifique se há snapshots importantes deste volume',
            'Crie um snapshot final como backup (se necessário)',
            'Documente o volume para auditoria',
            'Delete o volume não utilizado',
            'Verifique se há snapshots órfãos relacionados'
          ],
          scripts: [
            {
              title: 'Verificar status do volume',
              command: `aws ec2 describe-volumes --volume-ids ${resourceId} --query 'Volumes[0].{State:State,Attachments:Attachments,Size:Size,VolumeType:VolumeType}'`,
              description: 'Verifica se o volume está disponível (não anexado)'
            },
            {
              title: 'Criar snapshot final',
              command: `aws ec2 create-snapshot \\
  --volume-id ${resourceId} \\
  --description "Snapshot final antes de deletar volume não utilizado" \\
  --tag-specifications 'ResourceType=snapshot,Tags=[{Key=Purpose,Value=FinalBackup}]'`,
              description: 'Cria snapshot de backup antes de deletar'
            },
            {
              title: 'Deletar volume',
              command: `# ATENÇÃO: Esta ação é irreversível!
aws ec2 delete-volume --volume-id ${resourceId}`,
              description: 'Remove o volume EBS não utilizado'
            }
          ],
          copilotPrompt: `Tenho um volume EBS não utilizado ${resourceId}. Me ajude a verificar se é seguro deletá-lo, se há dados importantes e qual o melhor procedimento para remover recursos órfãos.`
        };
      } else if (baseResourceType.includes('eip') || baseResourceType.includes('elastic')) {
        return {
          steps: [
            `Verifique se o Elastic IP ${resourceId} está associado a algum recurso`,
            'Confirme que não há DNS ou aplicações apontando para este IP',
            'Documente o IP para referência futura',
            'Libere o Elastic IP não utilizado'
          ],
          scripts: [
            {
              title: 'Verificar associação do EIP',
              command: `aws ec2 describe-addresses --allocation-ids ${resourceId} --query 'Addresses[0].{PublicIp:PublicIp,AssociationId:AssociationId,InstanceId:InstanceId}'`,
              description: 'Verifica se o EIP está associado'
            },
            {
              title: 'Liberar Elastic IP',
              command: `# ATENÇÃO: O IP será perdido permanentemente!
aws ec2 release-address --allocation-id ${resourceId}`,
              description: 'Libera o Elastic IP não utilizado'
            }
          ],
          copilotPrompt: `Tenho um Elastic IP não utilizado ${resourceId}. Me ajude a verificar se é seguro liberá-lo e se há alguma dependência que eu deveria verificar antes.`
        };
      } else if (baseResourceType.includes('snapshot')) {
        return {
          steps: [
            `Identifique a origem do snapshot ${resourceId}`,
            'Verifique se o volume/AMI de origem ainda existe',
            'Confirme que não há AMIs dependentes deste snapshot',
            'Documente o snapshot para auditoria',
            'Delete o snapshot órfão'
          ],
          scripts: [
            {
              title: 'Verificar detalhes do snapshot',
              command: `aws ec2 describe-snapshots --snapshot-ids ${resourceId} --query 'Snapshots[0].{VolumeId:VolumeId,StartTime:StartTime,Description:Description,State:State}'`,
              description: 'Obtém informações do snapshot'
            },
            {
              title: 'Verificar AMIs dependentes',
              command: `aws ec2 describe-images --filters "Name=block-device-mapping.snapshot-id,Values=${resourceId}" --query 'Images[*].ImageId'`,
              description: 'Verifica se há AMIs usando este snapshot'
            },
            {
              title: 'Deletar snapshot',
              command: `aws ec2 delete-snapshot --snapshot-id ${resourceId}`,
              description: 'Remove o snapshot órfão'
            }
          ],
          copilotPrompt: `Tenho um snapshot EBS órfão ${resourceId}. Me ajude a verificar se é seguro deletá-lo e se há AMIs ou outros recursos dependentes.`
        };
      }
      break;

    case 'storage_optimization':
      if (baseResourceType.includes('s3')) {
        return {
          steps: [
            `Analise os padrões de acesso do bucket ${resourceId}`,
            'Identifique objetos que podem ser movidos para classes mais baratas',
            'Configure Lifecycle Rules para transição automática',
            'Habilite S3 Intelligent-Tiering para objetos com acesso variável',
            'Configure expiração para objetos temporários',
            'Monitore os custos após as mudanças'
          ],
          scripts: [
            {
              title: 'Analisar métricas do bucket',
              command: `aws s3api get-bucket-analytics-configuration --bucket ${resourceId} --id EntireBucket 2>/dev/null || echo "Analytics não configurado"

# Ver tamanho e quantidade de objetos
aws s3 ls s3://${resourceId} --recursive --summarize | tail -2`,
              description: 'Obtém métricas e tamanho do bucket'
            },
            {
              title: 'Configurar Lifecycle Rule',
              command: `cat > /tmp/lifecycle.json << 'EOF'
{
  "Rules": [
    {
      "ID": "MoveToIA",
      "Status": "Enabled",
      "Filter": {"Prefix": ""},
      "Transitions": [
        {"Days": 30, "StorageClass": "STANDARD_IA"},
        {"Days": 90, "StorageClass": "GLACIER"}
      ]
    }
  ]
}
EOF

aws s3api put-bucket-lifecycle-configuration --bucket ${resourceId} --lifecycle-configuration file:///tmp/lifecycle.json`,
              description: 'Configura transição automática de classes de storage'
            },
            {
              title: 'Habilitar Intelligent-Tiering',
              command: `aws s3api put-bucket-intelligent-tiering-configuration \\
  --bucket ${resourceId} \\
  --id "AutoTiering" \\
  --intelligent-tiering-configuration '{
    "Id": "AutoTiering",
    "Status": "Enabled",
    "Tierings": [
      {"Days": 90, "AccessTier": "ARCHIVE_ACCESS"},
      {"Days": 180, "AccessTier": "DEEP_ARCHIVE_ACCESS"}
    ]
  }'`,
              description: 'Habilita tiering inteligente automático'
            }
          ],
          copilotPrompt: `Preciso otimizar os custos de storage do bucket S3 ${resourceId}. Analise os padrões de acesso e me ajude a configurar Lifecycle Rules e Intelligent-Tiering adequados.`
        };
      } else if (baseResourceType.includes('ebs') || baseResourceType.includes('volume')) {
        return {
          steps: [
            `Analise o tipo e IOPS do volume ${resourceId}`,
            'Verifique se gp3 seria mais econômico que gp2',
            'Avalie se o volume pode ser reduzido',
            'Crie snapshot antes de modificar',
            'Modifique o tipo do volume',
            'Monitore a performance após a mudança'
          ],
          scripts: [
            {
              title: 'Verificar tipo atual do volume',
              command: `aws ec2 describe-volumes --volume-ids ${resourceId} --query 'Volumes[0].{Type:VolumeType,Size:Size,Iops:Iops,Throughput:Throughput}'`,
              description: 'Obtém configuração atual do volume'
            },
            {
              title: 'Migrar de gp2 para gp3',
              command: `# gp3 é geralmente mais barato que gp2
aws ec2 modify-volume \\
  --volume-id ${resourceId} \\
  --volume-type gp3 \\
  --iops 3000 \\
  --throughput 125`,
              description: 'Converte volume para gp3 (mais econômico)'
            }
          ],
          copilotPrompt: `Preciso otimizar o volume EBS ${resourceId}. Me ajude a avaliar se devo migrar para gp3, ajustar IOPS ou fazer outras otimizações de storage.`
        };
      }
      break;

    case 'reserved_instances':
      return {
        steps: [
          `Analise o histórico de uso dos últimos 30 dias para ${resourceId}`,
          'Verifique a estabilidade do workload (uso consistente)',
          'Compare preços de RI 1 ano vs 3 anos vs Savings Plans',
          'Avalie opções de pagamento (All Upfront, Partial, No Upfront)',
          'Considere RIs conversíveis para flexibilidade',
          'Faça a compra pelo AWS Cost Management Console',
          'Configure alertas de utilização de RI'
        ],
        scripts: [
          {
            title: 'Verificar recomendações de RI',
            command: `aws ce get-reservation-purchase-recommendation \\
  --service EC2 \\
  --lookback-period-in-days SIXTY_DAYS \\
  --term-in-years ONE_YEAR \\
  --payment-option NO_UPFRONT`,
            description: 'Obtém recomendações de compra de RI da AWS'
          },
          {
            title: 'Verificar utilização atual de RIs',
            command: `aws ce get-reservation-utilization \\
  --time-period Start=$(date -d '30 days ago' +%Y-%m-%d),End=$(date +%Y-%m-%d) \\
  --granularity MONTHLY`,
            description: 'Verifica utilização das RIs existentes'
          }
        ],
        copilotPrompt: `Estou considerando comprar Reserved Instances para ${resourceId}. Me ajude a analisar se é a melhor opção, comparar com Savings Plans e calcular o ROI esperado.`
      };

    case 'scheduling':
      return {
        steps: [
          `Identifique os horários de uso do recurso ${resourceId}`,
          'Defina janelas de operação (ex: 8h-20h dias úteis)',
          'Configure tags para identificar recursos agendáveis',
          'Implemente AWS Instance Scheduler ou Lambda personalizada',
          'Configure CloudWatch Events/EventBridge para triggers',
          'Teste o agendamento em ambiente de desenvolvimento',
          'Monitore economia após implementação'
        ],
        scripts: [
          {
            title: 'Adicionar tags de agendamento',
            command: `aws ec2 create-tags --resources ${resourceId} --tags \\
  Key=Schedule,Value="office-hours" \\
  Key=AutoStop,Value="true" \\
  Key=AutoStart,Value="true"`,
            description: 'Adiciona tags para controle de agendamento'
          },
          {
            title: 'Criar regra EventBridge para parar',
            command: `# Criar regra para parar às 20h (UTC)
aws events put-rule \\
  --name "StopInstance-${resourceId}" \\
  --schedule-expression "cron(0 20 ? * MON-FRI *)" \\
  --state ENABLED

# Nota: Você precisará criar uma Lambda ou usar SSM para executar a ação`,
            description: 'Cria regra para parar instância automaticamente'
          },
          {
            title: 'Script Lambda para stop/start',
            command: `# Exemplo de código Lambda (Python)
cat << 'EOF'
import boto3

def lambda_handler(event, context):
    ec2 = boto3.client('ec2')
    action = event.get('action', 'stop')
    instance_id = '${resourceId}'
    
    if action == 'stop':
        ec2.stop_instances(InstanceIds=[instance_id])
    else:
        ec2.start_instances(InstanceIds=[instance_id])
    
    return {'status': 'success', 'action': action}
EOF`,
            description: 'Código Lambda para automação de start/stop'
          }
        ],
        copilotPrompt: `Preciso implementar agendamento automático para ${resourceId}. Me ajude a configurar start/stop automático baseado em horário comercial e calcular a economia esperada.`
      };

    default:
      break;
  }

  // Default fallback
  return {
    steps: [
      `Analise o recurso ${resourceId} em detalhes`,
      'Identifique oportunidades de otimização específicas',
      'Crie um plano de implementação',
      'Execute as mudanças em ambiente de teste primeiro',
      'Aplique em produção com monitoramento',
      'Valide a economia obtida'
    ],
    scripts: [
      {
        title: 'Descrever recurso',
        command: `aws ${resourceType.toLowerCase().replace('aws::', '').split(':')[0]} describe-* --help`,
        description: 'Consulte a documentação AWS para comandos específicos'
      }
    ],
    copilotPrompt: `Preciso otimizar o recurso ${resourceType} ${resourceId}. Me ajude a identificar as melhores práticas e criar um plano de otimização.`
  };
}

interface OptimizationRecommendation {
  id: string;
  type: 'rightsizing' | 'reserved_instances' | 'storage_optimization' | 'unused_resources' | 'scheduling';
  resource_type: string;
  resource_id: string;
  resource_name: string;
  current_cost: number;
  optimized_cost: number;
  potential_savings: number;
  savings_percentage: number;
  confidence: 'high' | 'medium' | 'low';
  effort: 'low' | 'medium' | 'high';
  impact: 'low' | 'medium' | 'high';
  description: string;
  recommendation: string;
  implementation_steps: string[];
  implementation_scripts?: { title: string; command: string; description: string }[];
  copilot_prompt?: string;
  risk_level: 'low' | 'medium' | 'high';
  created_at: string;
  status: 'pending' | 'implemented' | 'dismissed';
  remediation_ticket_id?: string;  // Link to remediation ticket
}

// Score calculation weights
const SCORE_WEIGHTS = { high: 10, medium: 5, low: 2 } as const;
const MAX_SAVINGS_PENALTY = 30;

// Demo fallback metrics
const DEMO_FALLBACK_METRICS: CostMetrics = {
  total_monthly_cost: 15000,
  total_potential_savings: 2541.12,
  optimization_score: 52,
  recommendations_count: 12,
  implemented_savings: 0
};

/** Sum cost values from daily_costs records, handling multiple field name conventions */
function sumCosts(costs: Array<Record<string, unknown>>): number {
  return costs.reduce((sum, cost) => {
    const costValue = Number(cost.cost) || Number(cost.total_cost) || Number(cost.amount) || 0;
    return sum + (isNaN(costValue) ? 0 : costValue);
  }, 0);
}

interface CostMetrics {
  total_monthly_cost: number;
  total_potential_savings: number;
  optimization_score: number;
  recommendations_count: number;
  implemented_savings: number;
}

export default function CostOptimization() {
  const { toast } = useToast();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { selectedAccountId, selectedProvider } = useCloudAccount();
  const { getAccountFilter } = useAccountFilter();
  const { data: organizationId } = useOrganization();
  const { user } = useAuthSafe();
  const { shouldEnableAccountQuery, isInDemoMode } = useDemoAwareQuery();
  const [selectedRecommendation, setSelectedRecommendation] = useState<OptimizationRecommendation | null>(null);
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedConfidence, setSelectedConfidence] = useState<string>('all');
  const [selectedEffort, setSelectedEffort] = useState<string>('all');
  
  // Search, selection and pagination state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRecommendations, setSelectedRecommendations] = useState<string[]>([]);
  const [creatingTicketId, setCreatingTicketId] = useState<string | null>(null);
  const [creatingBatchTickets, setCreatingBatchTickets] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [expandedSteps, setExpandedSteps] = useState<Record<string, boolean>>({});

  // Get optimization recommendations - enabled in demo mode
  const { data: recommendations, isLoading, refetch } = useQuery<OptimizationRecommendation[]>({
    queryKey: ['cost-optimization', organizationId, selectedAccountId, selectedType, selectedConfidence, isInDemoMode],
    enabled: shouldEnableAccountQuery(),
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      // In demo mode, call the Lambda handler which returns demo data
      if (isInDemoMode) {
        const response = await apiClient.invoke<any>('cost-optimization', {
          body: { accountId: 'demo' }
        });
        
        if (response.data?.optimizations) {
          return response.data.optimizations.map((opt: any) => {
            const rawType = opt.type || opt.optimization_type || 'rightsizing';
            const normalizedType = normalizeOptimizationType(rawType);
            const normalizedResourceType = normalizeResourceType(rawType, opt.resource_type || 'EC2');
            const implementation = getSpecificImplementation(
              normalizedType,
              normalizedResourceType,
              opt.resource_id || 'demo-resource'
            );
            
            return {
              id: opt.id || `demo-${Math.random().toString(36).substr(2, 9)}`,
              type: normalizedType,
              resource_type: opt.resource_type || 'EC2',
              resource_id: opt.resource_id || 'demo-resource',
              resource_name: opt.resource_name || opt.resource_id || 'Demo Resource',
              current_cost: opt.current_cost || 100,
              optimized_cost: opt.optimized_cost || 50,
              potential_savings: opt.savings || opt.potential_savings || 50,
              savings_percentage: opt.savings_percentage || 50,
              confidence: (opt.confidence || 'high') as 'high' | 'medium' | 'low',
              effort: (opt.effort || 'medium') as 'low' | 'medium' | 'high',
              impact: (opt.impact || 'high') as 'low' | 'medium' | 'high',
              description: opt.details || opt.description || `Optimize ${opt.resource_type || 'resource'}`,
              recommendation: opt.recommendation || `Consider optimizing this resource to reduce costs`,
              implementation_steps: implementation.steps,
              implementation_scripts: implementation.scripts,
              copilot_prompt: implementation.copilotPrompt,
              risk_level: (opt.risk_level || 'low') as 'low' | 'medium' | 'high',
              created_at: opt.created_at || new Date().toISOString(),
              status: (opt.status || 'pending') as 'pending' | 'implemented' | 'dismissed'
            };
          });
        }
        return [];
      }
      
      let filters: any = { 
        organization_id: organizationId,
        ...getAccountFilter() // Multi-cloud compatible filter
      };

      if (selectedType !== 'all') {
        filters.optimization_type = selectedType;
      }

      const response = await apiClient.select('cost_optimizations', {
        select: '*',
        eq: filters,
        order: { column: 'potential_savings', ascending: false }
      });

      if (response.error) {
        throw new Error(getErrorMessage(response.error));
      }

      // Transform database records to match frontend interface
      // IMPORTANT: Only use real data from database - NO fallbacks or estimates
      // Filter out incomplete records (old data without new fields)
      const transformedData = (response.data || [])
        .filter((record: any) => {
          // Only include records with complete data
          return record.current_cost != null && 
                 record.savings_percentage != null &&
                 record.recommendation != null;
        })
        .map((record: any) => {
          const implementation = getSpecificImplementation(
            record.optimization_type,
            record.resource_type,
            record.resource_id
          );
          
          return {
            id: record.id,
            type: record.optimization_type,
            resource_type: record.resource_type,
            resource_id: record.resource_id,
            resource_name: record.resource_name,
            current_cost: record.current_cost,
            optimized_cost: record.optimized_cost,
            potential_savings: record.potential_savings,
            savings_percentage: record.savings_percentage,
            confidence: record.priority as 'high' | 'medium' | 'low',
            effort: record.effort as 'low' | 'medium' | 'high',
            impact: record.priority as 'low' | 'medium' | 'high',
            description: record.details,
            recommendation: record.recommendation,
            implementation_steps: implementation.steps,
            implementation_scripts: implementation.scripts,
            copilot_prompt: implementation.copilotPrompt,
            risk_level: record.priority as 'low' | 'medium' | 'high',
            created_at: record.created_at,
            status: record.status,
            remediation_ticket_id: record.remediation_ticket_id
          };
        });

      return transformedData;
    },
  });

  // Get cost metrics - enabled in demo mode
  const { data: metrics, isLoading: metricsLoading, refetch: refetchMetrics } = useQuery<CostMetrics>({
    queryKey: ['cost-metrics', organizationId, selectedAccountId, isInDemoMode],
    enabled: shouldEnableAccountQuery(),
    staleTime: 30 * 1000, // 30 seconds - refresh more often
    queryFn: async () => {
      // In demo mode, return demo metrics
      if (isInDemoMode) {
        const response = await apiClient.invoke<any>('cost-optimization', {
          body: { accountId: 'demo' }
        });
        
        if (response.data?.summary) {
          return {
            total_monthly_cost: response.data.summary.total_monthly_cost || DEMO_FALLBACK_METRICS.total_monthly_cost,
            total_potential_savings: response.data.summary.monthly_savings || DEMO_FALLBACK_METRICS.total_potential_savings,
            optimization_score: response.data.summary.optimization_score || DEMO_FALLBACK_METRICS.optimization_score,
            recommendations_count: response.data.optimizations?.length || DEMO_FALLBACK_METRICS.recommendations_count,
            implemented_savings: 0
          };
        }
        
        return DEMO_FALLBACK_METRICS;
      }
      
      // Fetch recommendations directly for metrics calculation
      const orgFilter = { organization_id: organizationId, ...getAccountFilter() };
      
      const recsResponse = await apiClient.select('cost_optimizations', {
        select: '*',
        eq: orgFilter
      });
      
      const recs = recsResponse.data || [];
      
      // Get costs: use previous full month for accurate comparison
      const currentDate = new Date();
      const startOfPrevMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
      const startOfCurrentMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      
      // Fetch previous month costs (complete month)
      const prevMonthResponse = await apiClient.select('daily_costs', {
        select: '*',
        eq: orgFilter,
        gte: { date: startOfPrevMonth.toISOString().split('T')[0] },
        lt: { date: startOfCurrentMonth.toISOString().split('T')[0] }
      });

      // Fetch current month costs (partial)
      const currentMonthResponse = await apiClient.select('daily_costs', {
        select: '*',
        eq: orgFilter,
        gte: { date: startOfCurrentMonth.toISOString().split('T')[0] }
      });

      const prevCosts = prevMonthResponse.data || [];
      const currentCosts = currentMonthResponse.data || [];

      const prevMonthTotal = sumCosts(prevCosts);
      const currentMonthPartial = sumCosts(currentCosts);
      
      // Use previous month if available, otherwise project current partial month
      const dayOfMonth = currentDate.getDate();
      const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
      const projectedCurrentMonth = dayOfMonth > 1 ? (currentMonthPartial / (dayOfMonth - 1)) * daysInMonth : 0;
      
      // Prefer previous full month; fallback to projected current month
      const totalMonthlyCost = prevMonthTotal > 0 ? prevMonthTotal : projectedCurrentMonth;
      
      // Calculate metrics from recommendations
      const totalPotentialSavings = recs.reduce((sum: number, rec: any) => sum + (Number(rec.potential_savings) || 0), 0);
      const implementedSavings = recs.filter((rec: any) => rec.status === 'implemented').reduce((sum: number, rec: any) => sum + (Number(rec.potential_savings) || 0), 0);
      
      // Calculate optimization score based on recommendations
      let optimizationScore = 100;
      
      if (recs.length > 0) {
        // Deduct points based on type: delete/terminate=-10, upgrade=-5, others=-3
        const highImpact = recs.filter((r: any) => 
          r.optimization_type?.includes('delete') || 
          r.optimization_type?.includes('terminate') ||
          r.optimization_type?.includes('release')
        ).length;
        const mediumImpact = recs.filter((r: any) => 
          r.optimization_type?.includes('upgrade') || 
          r.optimization_type?.includes('migrate') ||
          r.optimization_type?.includes('rightsize')
        ).length;
        const lowImpact = recs.length - highImpact - mediumImpact;
        
        const deduction = (highImpact * SCORE_WEIGHTS.high) + (mediumImpact * SCORE_WEIGHTS.medium) + (lowImpact * SCORE_WEIGHTS.low);
        optimizationScore = Math.max(0, Math.min(100, 100 - deduction));
        
        // Also factor in savings percentage if we have cost data
        if (totalMonthlyCost > 0 && totalPotentialSavings > 0) {
          const savingsPercentage = (totalPotentialSavings / totalMonthlyCost) * 100;
          optimizationScore = Math.max(0, Math.min(100, optimizationScore - Math.min(savingsPercentage, MAX_SAVINGS_PENALTY)));
        }
      }

      return {
        total_monthly_cost: isNaN(totalMonthlyCost) ? 0 : totalMonthlyCost,
        total_potential_savings: isNaN(totalPotentialSavings) ? 0 : totalPotentialSavings,
        optimization_score: isNaN(optimizationScore) ? 0 : Math.round(optimizationScore),
        recommendations_count: recs.length,
        implemented_savings: isNaN(implementedSavings) ? 0 : implementedSavings
      };
    },
  });

  // Run cost optimization analysis
  const runOptimizationMutation = useMutation({
    mutationFn: async () => {
      // Route to correct handler based on cloud provider
      if (selectedProvider === 'AZURE') {
        const response = await apiClient.invoke('azure-cost-optimization', {
          body: {
            credentialId: selectedAccountId,
            categories: ['Cost']
          }
        });

        if (response.error) {
          throw new Error(getErrorMessage(response.error));
        }

        return response.data;
      }

      // AWS handler
      const response = await apiClient.invoke('cost-optimization', {
        body: {
          ...(selectedAccountId ? { accountId: selectedAccountId } : {})
        }
      });

      if (response.error) {
        throw new Error(getErrorMessage(response.error));
      }

      return response.data;
    },
    onSuccess: async (data) => {
      toast({
        title: t('costOptimization.analysisCompleted'),
        description: t('costOptimization.optimizationsFound', 'Found {{count}} optimization opportunities with potential savings of {{amount}}/month.', { count: data.optimizations?.length || 0, amount: data.summary?.monthly_savings || 0 }),
      });
      // Invalidate all related queries to force refetch from database
      await queryClient.invalidateQueries({ queryKey: ['cost-optimization'] });
      await queryClient.invalidateQueries({ queryKey: ['cost-metrics'] });
    },
    onError: (error) => {
      toast({
        title: t('costOptimization.errorAnalysis'),
        description: error instanceof Error ? error.message : t('costOptimization.unknownError'),
        variant: "destructive"
      });
    }
  });

  // Mark recommendation as implemented
  const markAsImplementedMutation = useMutation({
    mutationFn: async (recommendationId: string) => {
      const response = await apiClient.update('cost_optimizations', 
        { status: 'implemented' },
        { id: recommendationId }
      );

      if (response.error) {
        throw new Error(getErrorMessage(response.error));
      }

      return response.data;
    },
    onSuccess: async () => {
      toast({
        title: t('costOptimization.recommendationImplemented'),
        description: t('costOptimization.recommendationImplementedDesc'),
      });
      setSelectedRecommendation(null);
      await queryClient.invalidateQueries({ queryKey: ['cost-optimization'] });
      await queryClient.invalidateQueries({ queryKey: ['cost-metrics'] });
    },
    onError: (error) => {
      toast({
        title: t('costOptimization.errorUpdating'),
        description: error instanceof Error ? error.message : t('costOptimization.unknownError'),
        variant: "destructive"
      });
    }
  });

  // Filter and search recommendations
  const filteredRecommendations = useMemo(() => {
    if (!recommendations) return [];
    
    let filtered = [...recommendations];
    
    // Apply search filter
    if (searchQuery.trim()) {
      const searchLower = searchQuery.toLowerCase().trim();
      filtered = filtered.filter((rec) => 
        rec.resource_name?.toLowerCase().includes(searchLower) ||
        rec.resource_id?.toLowerCase().includes(searchLower) ||
        rec.resource_type?.toLowerCase().includes(searchLower) ||
        rec.description?.toLowerCase().includes(searchLower) ||
        rec.recommendation?.toLowerCase().includes(searchLower)
      );
    }
    
    // Apply type filter
    if (selectedType !== 'all') {
      filtered = filtered.filter((rec) => rec.type === selectedType);
    }
    
    // Apply confidence filter
    if (selectedConfidence !== 'all') {
      filtered = filtered.filter((rec) => rec.confidence === selectedConfidence);
    }
    
    // Apply effort filter
    if (selectedEffort !== 'all') {
      filtered = filtered.filter((rec) => rec.effort === selectedEffort);
    }
    
    return filtered;
  }, [recommendations, searchQuery, selectedType, selectedConfidence, selectedEffort]);

  // Paginated recommendations
  const paginatedRecommendations = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredRecommendations.slice(startIndex, endIndex);
  }, [filteredRecommendations, currentPage, itemsPerPage]);

  // Pagination info
  const totalPages = Math.ceil(filteredRecommendations.length / itemsPerPage);
  const totalFilteredCount = filteredRecommendations.length;
  const showingFrom = totalFilteredCount === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
  const showingTo = Math.min(currentPage * itemsPerPage, totalFilteredCount);

  // Reset to page 1 when filters change
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setCurrentPage(1);
  };

  const handleTypeChange = (value: string) => {
    setSelectedType(value);
    setCurrentPage(1);
  };

  const handleConfidenceChange = (value: string) => {
    setSelectedConfidence(value);
    setCurrentPage(1);
  };

  const handleEffortChange = (value: string) => {
    setSelectedEffort(value);
    setCurrentPage(1);
  };

  const handleItemsPerPageChange = (value: string) => {
    setItemsPerPage(Number(value));
    setCurrentPage(1);
  };

  // Clear all filters
  const clearFilters = () => {
    setSearchQuery('');
    setSelectedType('all');
    setSelectedConfidence('all');
    setSelectedEffort('all');
    setCurrentPage(1);
  };

  const hasActiveFilters = searchQuery || selectedType !== 'all' || selectedConfidence !== 'all' || selectedEffort !== 'all';

  // Toggle recommendation selection
  const toggleRecommendationSelection = (recId: string) => {
    setSelectedRecommendations(prev => 
      prev.includes(recId) 
        ? prev.filter(id => id !== recId)
        : [...prev, recId]
    );
  };

  // Select all recommendations on current page
  const selectAllRecommendations = () => {
    if (!paginatedRecommendations || paginatedRecommendations.length === 0) return;
    const pageIds = paginatedRecommendations.map((rec) => rec.id);
    const allSelected = pageIds.every((id) => selectedRecommendations.includes(id));
    
    if (allSelected) {
      setSelectedRecommendations(prev => prev.filter(id => !pageIds.includes(id)));
    } else {
      setSelectedRecommendations(prev => [...new Set([...prev, ...pageIds])]);
    }
  };

  // Create ticket for a single recommendation
  const createTicketForRecommendation = async (rec: OptimizationRecommendation) => {
    if (creatingTicketId === rec.id) return;
    
    // Check if recommendation already has a ticket
    if (rec.remediation_ticket_id) {
      toast({ 
        title: t('costOptimization.ticketAlreadyExists', 'Ticket already exists'),
        description: t('costOptimization.ticketAlreadyExistsDesc', 'This recommendation already has a linked remediation ticket'),
        variant: "destructive" 
      });
      return;
    }
    
    setCreatingTicketId(rec.id);
    
    try {
      const accountFilter = getAccountFilter();
      
      const response = await apiClient.insert('remediation_tickets', {
        organization_id: organizationId,
        ...accountFilter,
        title: `[${t('costOptimization.title', 'Cost Optimization')}] ${rec.resource_name}`,
        description: `${rec.description}\n\n${t('costOptimization.recommendation', 'Recommendation')}: ${rec.recommendation}\n\n${t('costOptimization.potentialSavings', 'Potential Savings')}: $${rec.potential_savings.toFixed(2)}/mês (${rec.savings_percentage.toFixed(1)}%)`,
        severity: rec.confidence === 'high' ? 'high' : rec.confidence === 'medium' ? 'medium' : 'low',
        priority: rec.impact === 'high' ? 'high' : rec.impact === 'medium' ? 'medium' : 'low',
        status: 'open',
        category: 'cost_optimization',
        created_by: user?.email || 'system',
        finding_ids: [],
        affected_resources: [rec.resource_id],
        metadata: {
          optimization_type: rec.type,
          resource_type: rec.resource_type,
          current_cost: rec.current_cost,
          optimized_cost: rec.optimized_cost,
          potential_savings: rec.potential_savings,
          savings_percentage: rec.savings_percentage,
          confidence: rec.confidence,
          effort: rec.effort,
          impact: rec.impact
        }
      });

      if ('error' in response && response.error) {
        throw new Error(response.error.message || 'Failed to create ticket');
      }

      // Get the created ticket ID and update the recommendation to create the link
      const ticketId = response.data?.id;
      if (ticketId) {
        // Update the recommendation with the ticket ID to create bidirectional link
        await apiClient.update('cost_optimizations', { remediation_ticket_id: ticketId }, { id: rec.id });
      }

      toast({ 
        title: t('costOptimization.ticketCreated', 'Ticket created'),
        description: t('costOptimization.ticketCreatedDesc', 'Remediation ticket created successfully')
      });
      
      // Invalidate both queries to refresh the data
      queryClient.invalidateQueries({ queryKey: ['remediation-tickets'], refetchType: 'all' });
      queryClient.invalidateQueries({ queryKey: ['cost-optimization'] });
      queryClient.invalidateQueries({ queryKey: ['cost-recommendations'] });
    } catch (err) {
      console.error('Error creating ticket:', err);
      toast({ 
        title: t('costOptimization.ticketError', 'Error creating ticket'), 
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: "destructive" 
      });
    } finally {
      setCreatingTicketId(null);
    }
  };

  // Create tickets for selected recommendations
  const createTicketsForSelected = async () => {
    if (selectedRecommendations.length === 0) {
      toast({ 
        title: t('costOptimization.selectRecommendations', 'Select at least one recommendation'), 
        variant: "destructive" 
      });
      return;
    }

    setCreatingBatchTickets(true);
    
    try {
      const recsToCreate = recommendations?.filter((rec: OptimizationRecommendation) => 
        selectedRecommendations.includes(rec.id) && !rec.remediation_ticket_id  // Skip recommendations that already have tickets
      ) || [];

      if (recsToCreate.length === 0) {
        toast({ 
          title: t('costOptimization.allHaveTickets', 'All selected recommendations already have tickets'),
          variant: "destructive" 
        });
        setCreatingBatchTickets(false);
        return;
      }

      let createdCount = 0;
      for (const rec of recsToCreate) {
        await createTicketForRecommendation(rec);
        createdCount++;
      }

      toast({ 
        title: t('costOptimization.ticketsCreatedCount', '{{count}} ticket(s) created successfully', { count: createdCount })
      });
      setSelectedRecommendations([]);
    } catch (error) {
      toast({ 
        title: t('costOptimization.ticketsError', 'Error creating tickets'), 
        variant: "destructive" 
      });
    } finally {
      setCreatingBatchTickets(false);
    }
  };

  const handleRefresh = async () => {
    try {
      // Execute the cost optimization analysis
      await runOptimizationMutation.mutateAsync();
      // Refetch metrics after analysis
      await refetchMetrics();
    } catch (error) {
      // Error is already handled by mutation onError
    }
  };

  const exportRecommendations = () => {
    if (!recommendations) return;

    const csvContent = [
      `${t('costOptimization.csvType', 'Type')},${t('costOptimization.resource', 'Resource')},${t('costOptimization.currentCost', 'Current Cost')},${t('costOptimization.optimizedCost', 'Optimized Cost')},${t('costOptimization.potentialSavings', 'Potential Savings')},${t('costOptimization.confidence', 'Confidence')},${t('costOptimization.effort', 'Effort')},${t('costOptimization.impact', 'Impact')},${t('costOptimization.descriptionLabel', 'Description')}`,
      ...recommendations.map((rec: OptimizationRecommendation) => [
        rec.type,
        rec.resource_name,
        rec.current_cost.toFixed(2),
        rec.optimized_cost.toFixed(2),
        rec.potential_savings.toFixed(2),
        rec.confidence,
        rec.effort,
        rec.impact,
        `"${rec.description}"`
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `cost_optimization_${selectedAccountId}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();

    toast({
      title: t('costOptimization.reportExported', 'Report exported'),
      description: t('costOptimization.recommendationsExported', 'Recommendations were exported successfully.'),
    });
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'rightsizing': return Cpu;
      case 'reserved_instances': return Server;
      case 'storage_optimization': return HardDrive;
      case 'unused_resources': return AlertTriangle;
      case 'scheduling': return Clock;
      default: return Zap;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'rightsizing': return 'text-blue-500';
      case 'reserved_instances': return 'text-green-500';
      case 'storage_optimization': return 'text-purple-500';
      case 'unused_resources': return 'text-red-500';
      case 'scheduling': return 'text-orange-500';
      default: return 'text-gray-500';
    }
  };

  const getConfidenceBadge = (confidence: string) => {
    switch (confidence) {
      case 'high': return <Badge className="bg-green-500">{t('costOptimization.confidenceHigh', 'High')}</Badge>;
      case 'medium': return <Badge variant="secondary">{t('costOptimization.confidenceMedium', 'Medium')}</Badge>;
      case 'low': return <Badge variant="outline">{t('costOptimization.confidenceLow', 'Low')}</Badge>;
      default: return <Badge variant="outline">{confidence}</Badge>;
    }
  };

  const getEffortBadge = (effort: string) => {
    switch (effort) {
      case 'low': return <Badge className="bg-green-500">{t('costOptimization.effortLow', 'Low')}</Badge>;
      case 'medium': return <Badge variant="secondary">{t('costOptimization.effortMedium', 'Medium')}</Badge>;
      case 'high': return <Badge variant="destructive">{t('costOptimization.effortHigh', 'High')}</Badge>;
      default: return <Badge variant="outline">{effort}</Badge>;
    }
  };

  const getImpactBadge = (impact: string) => {
    switch (impact) {
      case 'high': return <Badge className="bg-blue-500">{t('costOptimization.impactHigh', 'High')}</Badge>;
      case 'medium': return <Badge variant="secondary">{t('costOptimization.impactMedium', 'Medium')}</Badge>;
      case 'low': return <Badge variant="outline">{t('costOptimization.impactLow', 'Low')}</Badge>;
      default: return <Badge variant="outline">{impact}</Badge>;
    }
  };

  // Prepare chart data
  const typeDistribution = recommendations?.reduce((acc: Record<string, number>, rec) => {
    acc[rec.type] = (acc[rec.type] || 0) + rec.potential_savings;
    return acc;
  }, {} as Record<string, number>) || {};

  const chartData = Object.entries(typeDistribution).map(([type, savings]) => ({
    type: type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()),
    savings: Math.round(savings as number),
    color: getTypeColor(type)
  }));

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

  return (
    <Layout 
      title={t('sidebar.costOptimization', 'Otimização de Custos')} 
      description={t('costOptimization.description', 'Recomendações inteligentes baseadas em ML para reduzir custos AWS')}
      icon={<Zap className="h-4 w-4" />}
    >
      <div className="space-y-6">
      {/* Action Buttons */}
      <div className="flex items-center justify-end gap-2">
        <Button 
          variant="default" 
          size="sm" 
          onClick={() => runOptimizationMutation.mutate()}
          disabled={runOptimizationMutation.isPending || !selectedAccountId}
          className="glass hover-glow"
        >
          <Target className={`h-4 w-4 mr-2 ${runOptimizationMutation.isPending ? 'animate-spin' : ''}`} />
          {runOptimizationMutation.isPending ? t('costOptimization.analyzing', 'Analyzing...') : t('costOptimization.runAnalysis', 'Run Analysis')}
        </Button>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={handleRefresh}
          disabled={isLoading}
          className="glass hover-glow"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          {t('common.refresh', 'Refresh')}
        </Button>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={exportRecommendations}
          className="glass hover-glow"
          disabled={!recommendations || recommendations.length === 0}
        >
          <Download className="h-4 w-4 mr-2" />
          {t('common.export', 'Export')}
        </Button>
      </div>

      {/* Metrics Overview */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card className="glass border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t('costOptimization.monthlyCost', 'Monthly Cost')}</CardTitle>
          </CardHeader>
          <CardContent>
            {metricsLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-semibold">
                ${(metrics?.total_monthly_cost ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="glass border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t('costOptimization.potentialSavings', 'Potential Savings')}</CardTitle>
          </CardHeader>
          <CardContent>
            {metricsLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="space-y-1">
                <div className="text-2xl font-semibold text-green-500">
                  ${(metrics?.total_potential_savings ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className="text-xs text-muted-foreground">
                  {metrics?.total_monthly_cost && metrics.total_monthly_cost > 0 && metrics?.total_potential_savings 
                    ? `${((metrics.total_potential_savings / metrics.total_monthly_cost) * 100).toFixed(1)}% ${t('costOptimization.ofTotal', 'of total')}`
                    : `0% ${t('costOptimization.ofTotal', 'of total')}`
                  }
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="glass border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t('costOptimization.optimizationScore', 'Optimization Score')}</CardTitle>
          </CardHeader>
          <CardContent>
            {metricsLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="space-y-2">
                {recommendations && recommendations.length > 0 ? (
                  <>
                    <div className="text-2xl font-semibold">
                      {Math.round(metrics?.optimization_score || 0)}/100
                    </div>
                    <Progress value={metrics?.optimization_score || 0} className="h-2" />
                  </>
                ) : (
                  <>
                    <div className="text-2xl font-semibold text-muted-foreground">
                      N/A
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {t('costOptimization.runAnalysisFirst', 'Run an analysis first')}
                    </div>
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="glass border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t('costOptimization.recommendations', 'Recommendations')}</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-12" />
            ) : (
              <div className="text-2xl font-semibold">
                {recommendations?.length || 0}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="glass border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t('costOptimization.implementedSavings', 'Implemented Savings')}</CardTitle>
          </CardHeader>
          <CardContent>
            {metricsLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-semibold text-blue-500">
                ${(metrics?.implemented_savings ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="glass border-primary/20">
        <CardContent className="pt-6">
          <div className="space-y-4">
            {/* Search Bar */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t('costOptimization.searchPlaceholder', 'Search by resource name, ID, type or description...')}
                value={searchQuery}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleSearchChange(e.target.value)}
                className="pl-10 glass"
              />
            </div>
            
            {/* Filters Row */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">{t('common.filters', 'Filters')}:</span>
              </div>
              
              <Select value={selectedType} onValueChange={handleTypeChange}>
                <SelectTrigger className="w-[180px] h-9 glass">
                  <SelectValue placeholder={t('costOptimization.optimizationType', 'Optimization Type')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('common.all', 'All Types')}</SelectItem>
                  <SelectItem value="rightsizing">Right-sizing</SelectItem>
                  <SelectItem value="reserved_instances">Reserved Instances</SelectItem>
                  <SelectItem value="storage_optimization">{t('costOptimization.storageOptimization', 'Storage Optimization')}</SelectItem>
                  <SelectItem value="unused_resources">{t('costOptimization.unusedResources', 'Unused Resources')}</SelectItem>
                  <SelectItem value="scheduling">{t('costOptimization.scheduling', 'Scheduling')}</SelectItem>
                </SelectContent>
              </Select>
              
              <Select value={selectedConfidence} onValueChange={handleConfidenceChange}>
                <SelectTrigger className="w-[150px] h-9 glass">
                  <SelectValue placeholder={t('costOptimization.confidence', 'Confidence')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('common.all', 'All')}</SelectItem>
                  <SelectItem value="high">{t('costOptimization.confidenceHigh', 'High')}</SelectItem>
                  <SelectItem value="medium">{t('costOptimization.confidenceMedium', 'Medium')}</SelectItem>
                  <SelectItem value="low">{t('costOptimization.confidenceLow', 'Low')}</SelectItem>
                </SelectContent>
              </Select>
              
              <Select value={selectedEffort} onValueChange={handleEffortChange}>
                <SelectTrigger className="w-[140px] h-9 glass">
                  <SelectValue placeholder={t('costOptimization.effort', 'Effort')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('common.all', 'All')}</SelectItem>
                  <SelectItem value="low">{t('costOptimization.effortLow', 'Low')}</SelectItem>
                  <SelectItem value="medium">{t('costOptimization.effortMedium', 'Medium')}</SelectItem>
                  <SelectItem value="high">{t('costOptimization.effortHigh', 'High')}</SelectItem>
                </SelectContent>
              </Select>
              
              {/* Clear Filters Button */}
              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearFilters}
                  className="h-9 text-muted-foreground hover:text-foreground"
                >
                  {t('common.clearFilters', 'Clear filters')}
                </Button>
              )}
              
              {/* Results count */}
              <div className="ml-auto text-sm text-muted-foreground">
                {hasActiveFilters ? (
                  <span>
                    {t('costOptimization.showingFiltered', '{{filtered}} of {{total}} recommendations', {
                      filtered: totalFilteredCount,
                      total: recommendations?.length || 0
                    })}
                  </span>
                ) : (
                  <span>
                    {t('costOptimization.totalRecommendations', '{{count}} recommendations', { count: recommendations?.length || 0 })}
                  </span>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Content */}
      <Tabs defaultValue="recommendations" className="w-full">
        <TabsList className="glass">
          <TabsTrigger value="recommendations">{t('costOptimization.recommendations', 'Recommendations')}</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="implemented">{t('costOptimization.implemented', 'Implemented')}</TabsTrigger>
        </TabsList>

        <TabsContent value="recommendations" className="space-y-4">
          <Card className="glass border-primary/20">
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                  <CardTitle>{t('costOptimization.optimizationRecommendations', 'Optimization Recommendations')}</CardTitle>
                  <CardDescription>{t('costOptimization.opportunitiesIdentified', 'Opportunities identified for cost reduction')}</CardDescription>
                </div>
                {paginatedRecommendations && paginatedRecommendations.length > 0 && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={selectAllRecommendations}
                      className="gap-2 glass hover-glow"
                    >
                      <CheckSquare className="h-4 w-4" />
                      {paginatedRecommendations.every((rec) => selectedRecommendations.includes(rec.id))
                        ? t('common.deselectAll', 'Deselect All')
                        : t('common.selectAll', 'Select All')}
                    </Button>
                    {selectedRecommendations.length > 0 && (
                      <Button
                        onClick={createTicketsForSelected}
                        disabled={creatingBatchTickets}
                        size="sm"
                        className="gap-2 glass hover-glow"
                      >
                        <Ticket className="h-4 w-4" />
                        {creatingBatchTickets 
                          ? t('common.creating', 'Creating...')
                          : t('costOptimization.createTicketsCount', 'Create {{count}} Ticket(s)', { count: selectedRecommendations.length })}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {isLoading ? (
                <div className="space-y-4">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-32 w-full" />
                  ))}
                </div>
              ) : paginatedRecommendations && paginatedRecommendations.length > 0 ? (
                <div className="space-y-4">
                  {paginatedRecommendations.map((rec) => {
                    const TypeIcon = getTypeIcon(rec.type);
                    const isSelected = selectedRecommendations.includes(rec.id);
                    return (
                      <div key={rec.id} className={`border rounded-lg p-6 space-y-4 transition-colors ${
                        isSelected ? 'border-primary bg-primary/5' : ''
                      }`}>
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-4">
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleRecommendationSelection(rec.id)}
                              className="mt-1"
                            />
                            <TypeIcon className={`h-6 w-6 mt-1 ${getTypeColor(rec.type)}`} />
                            <div className="space-y-2">
                              <div className="flex items-center gap-2">
                                <h4 className="font-semibold text-sm">{rec.resource_name}</h4>
                                <Badge variant="outline">{rec.resource_type}</Badge>
                              </div>
                              <p className="text-muted-foreground">{rec.description}</p>
                              <div className="flex items-center gap-4 text-sm flex-wrap">
                                <span>{t('costOptimization.confidence', 'Confidence')}: {getConfidenceBadge(rec.confidence)}</span>
                                <span>{t('costOptimization.effort', 'Effort')}: {getEffortBadge(rec.effort)}</span>
                                <span>{t('costOptimization.impact', 'Impact')}: {getImpactBadge(rec.impact)}</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-start gap-3">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => createTicketForRecommendation(rec)}
                              disabled={creatingTicketId === rec.id}
                              title={t('costOptimization.createTicket', 'Create remediation ticket')}
                              className="h-8 w-8 p-0"
                            >
                              <Ticket className={`h-4 w-4 ${creatingTicketId === rec.id ? 'animate-pulse' : ''}`} />
                            </Button>
                            <div className="text-right space-y-1">
                              <div className="text-2xl font-semibold text-green-500">
                                ${rec.potential_savings.toFixed(2)}
                              </div>
                              <div className="text-sm text-muted-foreground">
                                {rec.savings_percentage.toFixed(1)}% {t('costOptimization.savings', 'savings')}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                ${rec.current_cost.toFixed(2)} → ${rec.optimized_cost.toFixed(2)}
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="bg-muted/30 rounded-lg p-4">
                          <h5 className="font-medium mb-2 flex items-center gap-2">
                            <Lightbulb className="h-4 w-4" />
                            {t('costOptimization.recommendation', 'Recommendation')}
                          </h5>
                          <p className="text-sm text-muted-foreground mb-3">{rec.recommendation}</p>
                          
                          {rec.implementation_steps && rec.implementation_steps.length > 0 && (
                            <div className="mb-4">
                              <h6 className="font-medium text-sm mb-2">{t('costOptimization.implementationSteps', 'Implementation Steps')}:</h6>
                              <ol className="text-sm text-muted-foreground space-y-1">
                                {(expandedSteps[rec.id] ? rec.implementation_steps : rec.implementation_steps.slice(0, 3)).map((step: string, idx: number) => (
                                  <li key={idx} className="flex gap-2">
                                    <span className="font-medium text-primary">{idx + 1}.</span>
                                    <span>{step}</span>
                                  </li>
                                ))}
                                {rec.implementation_steps.length > 3 && (
                                  <li>
                                    <button
                                      type="button"
                                      className="text-xs text-primary hover:text-primary/80 hover:underline cursor-pointer transition-colors"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setExpandedSteps(prev => ({ ...prev, [rec.id]: !prev[rec.id] }));
                                      }}
                                    >
                                      {expandedSteps[rec.id]
                                        ? t('costOptimization.showLessSteps', 'Show less')
                                        : `+ ${rec.implementation_steps.length - 3} ${t('costOptimization.additionalSteps', 'additional steps')}...`
                                      }
                                    </button>
                                  </li>
                                )}
                              </ol>
                            </div>
                          )}

                          {/* Quick Actions */}
                          <div className="flex flex-wrap gap-2 pt-2 border-t border-muted">
                            {rec.implementation_scripts && rec.implementation_scripts.length > 0 && (
                              <Button 
                                variant="outline" 
                                size="sm"
                                className="text-xs glass hover-glow"
                                onClick={() => setSelectedRecommendation(rec)}
                              >
                                <Terminal className="h-3 w-3 mr-1" />
                                {t('costOptimization.viewScripts', 'View Scripts')} ({rec.implementation_scripts.length})
                              </Button>
                            )}
                            {rec.copilot_prompt && (
                              <Button 
                                variant="outline" 
                                size="sm"
                                className="text-xs glass hover-glow"
                                onClick={() => {
                                  navigator.clipboard.writeText(rec.copilot_prompt || '');
                                  toast({
                                    title: t('costOptimization.promptCopied', 'Prompt copied!'),
                                    description: t('costOptimization.goToCopilot', 'Now go to FinOps Copilot and paste the prompt.'),
                                  });
                                }}
                              >
                                <MessageSquare className="h-3 w-3 mr-1" />
                                {t('costOptimization.copyToCopilot', 'Copy to Copilot')}
                              </Button>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <AlertTriangle className="h-4 w-4" />
                            <span>{t('costOptimization.risk', 'Risk')}: {rec.risk_level}</span>
                          </div>
                          <Button variant="outline" size="sm" className="glass hover-glow" onClick={() => setSelectedRecommendation(rec)}>
                            {t('costOptimization.moreDetails', 'More Details')}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : recommendations && recommendations.length > 0 && hasActiveFilters ? (
                <div className="text-center py-12">
                  <Search className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-xl font-semibold mb-2">{t('costOptimization.noMatchingRecommendations', 'No matching recommendations')}</h3>
                  <p className="text-muted-foreground mb-4">
                    {t('costOptimization.tryDifferentFilters', 'Try adjusting the filters or search terms.')}
                  </p>
                  <Button variant="outline" onClick={clearFilters} className="glass hover-glow">
                    {t('common.clearFilters', 'Clear filters')}
                  </Button>
                </div>
              ) : (
                <div className="text-center py-12">
                  <Target className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-xl font-semibold mb-2">{t('costOptimization.noRecommendationsFound', 'No recommendations found')}</h3>
                  <p className="text-muted-foreground mb-4">
                    {t('costOptimization.infrastructureOptimized', 'Your infrastructure is well optimized or we are still analyzing the data.')}
                  </p>
                  <Button onClick={handleRefresh} className="glass hover-glow">
                    <RefreshCw className="h-4 w-4 mr-2" />
                    {t('costOptimization.checkAgain', 'Check Again')}
                  </Button>
                </div>
              )}

              {/* Pagination */}
              {paginatedRecommendations && paginatedRecommendations.length > 0 && totalPages > 0 && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>{t('common.showing', 'Showing')}</span>
                    <Select value={String(itemsPerPage)} onValueChange={handleItemsPerPageChange}>
                      <SelectTrigger className="w-[70px] h-8 glass">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="5">5</SelectItem>
                        <SelectItem value="10">10</SelectItem>
                        <SelectItem value="20">20</SelectItem>
                        <SelectItem value="50">50</SelectItem>
                      </SelectContent>
                    </Select>
                    <span>
                      {t('common.ofTotal', 'of {{total}}', { total: totalFilteredCount })}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-1">
                    <span className="text-sm text-muted-foreground mr-2">
                      {showingFrom}-{showingTo} {t('common.of', 'of')} {totalFilteredCount}
                    </span>
                    
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 glass"
                      onClick={() => setCurrentPage(1)}
                      disabled={currentPage === 1}
                    >
                      <ChevronsLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 glass"
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      disabled={currentPage === 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    
                    <span className="px-3 text-sm">
                      {t('common.page', 'Page')} {currentPage} {t('common.of', 'of')} {totalPages}
                    </span>
                    
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 glass"
                      onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                      disabled={currentPage === totalPages}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 glass"
                      onClick={() => setCurrentPage(totalPages)}
                      disabled={currentPage === totalPages}
                    >
                      <ChevronsRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Savings by Type */}
            <Card className="glass border-primary/20">
              <CardHeader>
                <CardTitle>{t('costOptimization.savingsByType', 'Savings by Type')}</CardTitle>
                <CardDescription>{t('costOptimization.savingsDistribution', 'Distribution of savings opportunities')}</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-[300px] w-full" />
                ) : chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={chartData}
                        cx="35%"
                        cy="50%"
                        labelLine={false}
                        outerRadius={80}
                        innerRadius={40}
                        fill="#8884d8"
                        dataKey="savings"
                        nameKey="type"
                        paddingAngle={2}
                      >
                        {chartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number | undefined) => `$${(value ?? 0).toFixed(2)}`} />
                      <Legend 
                        layout="vertical" 
                        align="right" 
                        verticalAlign="middle"
                        wrapperStyle={{ paddingLeft: '10px', fontSize: '11px' }}
                        formatter={(value) => {
                          const item = chartData.find(d => d.type === value);
                          return `${value}: $${item?.savings?.toFixed(0) || 0}`;
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                    {t('costOptimization.noDataAvailable', 'No data available')}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Confidence Distribution */}
            <Card className="glass border-primary/20">
              <CardHeader>
                <CardTitle>{t('costOptimization.confidenceDistribution', 'Confidence Distribution')}</CardTitle>
                <CardDescription>{t('costOptimization.recommendationsByConfidence', 'Recommendations by confidence level')}</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-[300px] w-full" />
                ) : recommendations && recommendations.length > 0 ? (
                  <div className="space-y-4">
                    {['high', 'medium', 'low'].map((confidence) => {
                      const count = recommendations.filter(rec => rec.confidence === confidence).length;
                      const savings = recommendations
                        .filter(rec => rec.confidence === confidence)
                        .reduce((sum, rec) => sum + rec.potential_savings, 0);
                      const percentage = recommendations.length > 0 ? (count / recommendations.length) * 100 : 0;

                      return (
                        <div key={confidence} className="space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="font-medium capitalize">{t(`costOptimization.confidence${confidence.charAt(0).toUpperCase() + confidence.slice(1)}`, confidence)} {t('costOptimization.confidence', 'Confidence')}</span>
                            <span className="text-sm text-muted-foreground">
                              {count} {t('costOptimization.recommendations', 'recommendations')} • ${savings.toFixed(2)}
                            </span>
                          </div>
                          <Progress value={percentage} className="h-2" />
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                    {t('costOptimization.noDataAvailable', 'No data available')}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="implemented" className="space-y-4">
          <Card className="glass border-primary/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-500" />
                {t('costOptimization.implementedRecommendations', 'Implemented Recommendations')}
              </CardTitle>
              <CardDescription>{t('costOptimization.implementedDesc', 'Optimizations already applied and their realized savings')}</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-24 w-full" />
                  ))}
                </div>
              ) : recommendations?.filter(rec => rec.status === 'implemented').length === 0 ? (
                <div className="text-center py-12">
                  <CheckCircle className="h-16 w-16 mx-auto mb-4 text-muted-foreground/50" />
                  <h3 className="text-xl font-semibold mb-2">{t('costOptimization.noImplementationsYet', 'No implementations yet')}</h3>
                  <p className="text-muted-foreground">
                    {t('costOptimization.noImplementationsDesc', 'When you mark recommendations as implemented, they will appear here.')}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Summary Card */}
                  <div className="bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-800 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-green-800 dark:text-green-200">{t('costOptimization.totalRealizedSavings', 'Total Realized Savings')}</p>
                        <p className="text-2xl font-semibold text-green-700 dark:text-green-300">
                          ${recommendations?.filter(rec => rec.status === 'implemented').reduce((sum, rec) => sum + rec.potential_savings, 0).toFixed(2)}/mês
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium text-green-800 dark:text-green-200">{t('costOptimization.implementations', 'Implementations')}</p>
                        <p className="text-2xl font-semibold text-green-700 dark:text-green-300">
                          {recommendations?.filter(rec => rec.status === 'implemented').length}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Implemented Recommendations List */}
                  {recommendations?.filter(rec => rec.status === 'implemented').map((rec) => {
                    const TypeIcon = getTypeIcon(rec.type);
                    return (
                      <Card key={rec.id} className="border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/20">
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between">
                            <div className="flex items-start gap-3">
                              <div className={`p-2 rounded-lg bg-green-100 dark:bg-green-900/50`}>
                                <TypeIcon className="h-5 w-5 text-green-600 dark:text-green-400" />
                              </div>
                              <div>
                                <h4 className="font-semibold text-foreground">{rec.resource_name}</h4>
                                <p className="text-sm text-muted-foreground">{rec.resource_type}</p>
                                <p className="text-sm text-foreground/80 mt-1">{rec.description}</p>
                              </div>
                            </div>
                            <div className="text-right">
                              <Badge variant="default" className="bg-green-600 hover:bg-green-700">
                                <CheckCircle className="h-3 w-3 mr-1" />
                                {t('costOptimization.implemented', 'Implemented')}
                              </Badge>
                              <p className="text-lg font-semibold text-green-600 dark:text-green-400 mt-2">
                                ${rec.potential_savings.toFixed(2)}/mês
                              </p>
                              <p className="text-xs text-muted-foreground">{t('costOptimization.realizedSavings', 'realized savings')}</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Detail Modal */}
      <Dialog open={!!selectedRecommendation} onOpenChange={(open: boolean) => !open && setSelectedRecommendation(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              {t('costOptimization.recommendationDetails', 'Recommendation Details')}
            </DialogTitle>
            <DialogDescription>
              {t('costOptimization.fullOptimizationInfo', 'Complete information about the optimization opportunity')}
            </DialogDescription>
          </DialogHeader>
          
          {selectedRecommendation && (
            <div className="space-y-6">
              {/* Resource Info */}
              <div className="space-y-2">
                <h4 className="font-semibold">{t('costOptimization.resource', 'Resource')}</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">ID:</span>
                    <p className="font-mono">{selectedRecommendation.resource_id}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Tipo:</span>
                    <p>{selectedRecommendation.resource_type}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">{t('costOptimization.optimizationType', 'Optimization Type')}:</span>
                    <p className="capitalize">{selectedRecommendation.type.replace('_', ' ')}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Status:</span>
                    <Badge variant={selectedRecommendation.status === 'implemented' ? 'default' : 'secondary'}>
                      {selectedRecommendation.status}
                    </Badge>
                  </div>
                </div>
              </div>

              {/* Cost Analysis */}
              <div className="space-y-2">
                <h4 className="font-semibold">{t('costOptimization.costAnalysis', 'Cost Analysis')}</h4>
                <div className="grid grid-cols-3 gap-4">
                  <Card className="p-4">
                    <p className="text-sm text-muted-foreground">{t('costOptimization.currentCost', 'Current Cost')}</p>
                    <p className="text-xl font-semibold">${selectedRecommendation.current_cost.toFixed(2)}</p>
                  </Card>
                  <Card className="p-4">
                    <p className="text-sm text-muted-foreground">{t('costOptimization.optimizedCost', 'Optimized Cost')}</p>
                    <p className="text-xl font-semibold text-green-500">${selectedRecommendation.optimized_cost.toFixed(2)}</p>
                  </Card>
                  <Card className="p-4">
                    <p className="text-sm text-muted-foreground">{t('costOptimization.savings', 'Savings')}</p>
                    <p className="text-xl font-semibold text-primary">${selectedRecommendation.potential_savings.toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground">{selectedRecommendation.savings_percentage.toFixed(1)}%</p>
                  </Card>
                </div>
              </div>

              {/* Assessment */}
              <div className="space-y-2">
                <h4 className="font-semibold">{t('costOptimization.assessment', 'Assessment')}</h4>
                <div className="flex gap-4">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">{t('costOptimization.confidence', 'Confidence')}:</span>
                    {getConfidenceBadge(selectedRecommendation.confidence)}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">{t('costOptimization.effort', 'Effort')}:</span>
                    {getEffortBadge(selectedRecommendation.effort)}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">{t('costOptimization.impact', 'Impact')}:</span>
                    {getImpactBadge(selectedRecommendation.impact)}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">{t('costOptimization.risk', 'Risk')}:</span>
                    <Badge variant={selectedRecommendation.risk_level === 'low' ? 'outline' : selectedRecommendation.risk_level === 'medium' ? 'secondary' : 'destructive'}>
                      {selectedRecommendation.risk_level}
                    </Badge>
                  </div>
                </div>
              </div>

              {/* Description */}
              <div className="space-y-2">
                <h4 className="font-semibold">{t('costOptimization.descriptionLabel', 'Description')}</h4>
                <p className="text-sm text-muted-foreground">{selectedRecommendation.description}</p>
              </div>

              {/* Recommendation */}
              <div className="space-y-2 bg-muted/30 rounded-lg p-4">
                <h4 className="font-semibold flex items-center gap-2">
                  <Lightbulb className="h-4 w-4" />
                  {t('costOptimization.recommendation', 'Recommendation')}
                </h4>
                <p className="text-sm">{selectedRecommendation.recommendation}</p>
              </div>

              {/* Implementation Steps */}
              {selectedRecommendation.implementation_steps && selectedRecommendation.implementation_steps.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-semibold">{t('costOptimization.implementationSteps', 'Implementation Steps')}</h4>
                  <ol className="space-y-2">
                    {selectedRecommendation.implementation_steps.map((step, idx) => (
                      <li key={idx} className="flex gap-3 text-sm">
                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-medium">
                          {idx + 1}
                        </span>
                        <span className="text-muted-foreground">{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {/* Implementation Scripts */}
              {selectedRecommendation.implementation_scripts && selectedRecommendation.implementation_scripts.length > 0 && (
                <div className="space-y-3">
                  <h4 className="font-semibold flex items-center gap-2">
                    <Terminal className="h-4 w-4" />
                    {t('costOptimization.recommendedScripts', 'Recommended Scripts')}
                  </h4>
                  <div className="space-y-3">
                    {selectedRecommendation.implementation_scripts.map((script, idx) => (
                      <div key={idx} className="border rounded-lg overflow-hidden">
                        <div className="bg-muted/50 px-3 py-2 flex items-center justify-between">
                          <div>
                            <span className="font-medium text-sm">{script.title}</span>
                            <p className="text-xs text-muted-foreground">{script.description}</p>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              navigator.clipboard.writeText(script.command);
                              toast({
                                title: t('costOptimization.commandCopied', 'Command copied!'),
                                description: t('costOptimization.pasteInTerminal', 'Paste in terminal to execute.'),
                              });
                            }}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                        <pre className="bg-slate-900 text-slate-100 p-3 text-xs overflow-x-auto">
                          <code>{script.command}</code>
                        </pre>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Copilot Integration */}
              {selectedRecommendation.copilot_prompt && (
                <div className="space-y-3 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-4 border border-blue-200">
                  <h4 className="font-semibold flex items-center gap-2 text-gray-900">
                    <MessageSquare className="h-4 w-4 text-blue-600" />
                    {t('costOptimization.needHelp', 'Need Help? Use FinOps Copilot')}
                  </h4>
                  <p className="text-sm text-gray-700">
                    {t('costOptimization.copyPromptDesc', 'Copy the prompt below and paste it in FinOps Copilot to get personalized guidance on this optimization.')}
                  </p>
                  <div className="bg-white rounded p-3 border border-blue-200">
                    <p className="text-sm text-gray-800 italic">"{selectedRecommendation.copilot_prompt}"</p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-blue-400 text-gray-900 hover:bg-blue-100"
                      onClick={() => {
                        navigator.clipboard.writeText(selectedRecommendation.copilot_prompt || '');
                        toast({
                          title: t('costOptimization.promptCopied', 'Prompt copied!'),
                          description: t('costOptimization.goToCopilot', 'Now go to FinOps Copilot and paste the prompt.'),
                        });
                      }}
                    >
                      <Copy className="h-4 w-4 mr-2" />
                      {t('costOptimization.copyPrompt', 'Copy Prompt')}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-blue-400 text-gray-900 hover:bg-blue-100"
                      onClick={() => {
                        // Navigate to FinOps Copilot page
                        window.location.href = '/finops-copilot';
                      }}
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      {t('costOptimization.goToCopilotBtn', 'Go to Copilot')}
                    </Button>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button variant="outline" onClick={() => setSelectedRecommendation(null)}>
                  {t('common.close', 'Close')}
                </Button>
                <Button 
                  onClick={() => markAsImplementedMutation.mutate(selectedRecommendation.id)}
                  disabled={markAsImplementedMutation.isPending || selectedRecommendation.status === 'implemented'}
                >
                  {markAsImplementedMutation.isPending ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      {t('common.saving', 'Saving...')}
                    </>
                  ) : (
                    <>
                      <CheckCircle className="h-4 w-4 mr-2" />
                      {selectedRecommendation.status === 'implemented' ? t('costOptimization.alreadyImplemented', 'Already Implemented') : t('costOptimization.markAsImplemented', 'Mark as Implemented')}
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      </div>
    </Layout>
  );
}