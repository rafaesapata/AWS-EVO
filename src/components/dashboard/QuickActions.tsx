import { useState } from "react";
import { Button } from "@/components/ui/button";
import { 
  Zap, 
  FileDown, 
  Camera, 
  RefreshCw,
  Filter,
  Settings
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";
import { apiClient } from "@/integrations/aws/api-client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useAwsAccount } from "@/contexts/AwsAccountContext";

interface QuickActionsProps {
  organizationId: string;
  onRefresh: () => void;
  onExport: () => void;
}

export default function QuickActions({ 
  organizationId, 
  onRefresh, 
  onExport 
}: QuickActionsProps) {
  const { toast } = useToast();
  const { selectedAccountId } = useAwsAccount();
  const [showFiltersDialog, setShowFiltersDialog] = useState(false);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [exportFormat, setExportFormat] = useState<'pdf' | 'excel'>('pdf');
  const [isExporting, setIsExporting] = useState(false);

  const takeSnapshot = async () => {
    if (!selectedAccountId) {
      toast({
        title: "Erro",
        description: "Nenhuma conta AWS selecionada",
        variant: "destructive"
      });
      return;
    }
    
    try {
      // Buscar dados atuais - FILTERED BY ACCOUNT
      const [costsData, findingsData] = await Promise.all([
        apiClient.get('daily_costs')
          .select('*')
          .eq('organization_id', organizationId)
          .eq('aws_account_id', selectedAccountId)
          .order('cost_date', { ascending: false })
          .limit(1)
          .single(),
        
        apiClient.get('findings')
          .select('severity')
          .eq('organization_id', organizationId)
          .eq('status', 'pending')
      ]);

      const { error } = await apiClient.post('/dashboard_snapshots', {
        organization_id: organizationId,
        name: `Snapshot ${new Date().toLocaleDateString()}`,
        metrics_data: {
          costs: costsData.data,
          findings_count: findingsData.data?.length || 0
        },
        costs_data: costsData.data,
        findings_data: findingsData.data
      });

      

      toast({
        title: "Snapshot criado",
        description: "Estado do dashboard salvo com sucesso"
      });
    } catch (error) {
      toast({
        title: "Erro",
        description: "Falha ao criar snapshot",
        variant: "destructive"
      });
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const functionName = exportFormat === 'pdf' ? 'generate-pdf-report' : 'generate-excel-report';
      
      const data = await apiClient.lambda(functionName, {
        body: { 
          organizationId,
          reportType: 'executive-dashboard'
        }
      });

      

      toast({
        title: "Relatório gerado",
        description: `Relatório ${exportFormat.toUpperCase()} exportado com sucesso`
      });

      // Trigger download
      if (data?.downloadUrl) {
        window.open(data.downloadUrl, '_blank');
      }
    } catch (error: any) {
      toast({
        title: "Erro ao exportar",
        description: error.message || "Não foi possível gerar o relatório",
        variant: "destructive"
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button 
          size="sm" 
          variant="outline" 
          onClick={onRefresh}
          className="gap-2"
        >
          <RefreshCw className="h-4 w-4" />
          Atualizar
        </Button>
        
        <Button 
          size="sm" 
          variant="outline" 
          onClick={handleExport}
          disabled={isExporting}
          className="gap-2"
        >
          <FileDown className="h-4 w-4" />
          {isExporting ? 'Exportando...' : 'Exportar'}
        </Button>
        
        <Button 
          size="sm" 
          variant="outline" 
          onClick={takeSnapshot}
          className="gap-2"
        >
          <Camera className="h-4 w-4" />
          Snapshot
        </Button>
        
        <Button 
          size="sm" 
          variant="outline"
          onClick={() => setShowFiltersDialog(true)}
          className="gap-2"
        >
          <Filter className="h-4 w-4" />
          Filtros
        </Button>
        
        <Button 
          size="sm" 
          variant="outline"
          onClick={() => setShowSettingsDialog(true)}
          className="gap-2"
        >
          <Settings className="h-4 w-4" />
          Configurar
        </Button>
      </div>

      {/* Filters Dialog */}
      <Dialog open={showFiltersDialog} onOpenChange={setShowFiltersDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Filtros do Dashboard</DialogTitle>
            <DialogDescription>
              Configure os filtros para visualização dos dados
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Período</Label>
              <Select defaultValue="30">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">Últimos 7 dias</SelectItem>
                  <SelectItem value="30">Últimos 30 dias</SelectItem>
                  <SelectItem value="90">Últimos 90 dias</SelectItem>
                  <SelectItem value="365">Último ano</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Severidade Mínima</Label>
              <Select defaultValue="low">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Baixa</SelectItem>
                  <SelectItem value="medium">Média</SelectItem>
                  <SelectItem value="high">Alta</SelectItem>
                  <SelectItem value="critical">Crítica</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button className="w-full" onClick={() => {
              toast({ title: "Filtros aplicados" });
              setShowFiltersDialog(false);
            }}>
              Aplicar Filtros
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Settings Dialog */}
      <Dialog open={showSettingsDialog} onOpenChange={setShowSettingsDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Configurações do Dashboard</DialogTitle>
            <DialogDescription>
              Personalize a exibição e formato de exportação
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Formato de Exportação</Label>
              <Select value={exportFormat} onValueChange={(v) => setExportFormat(v as 'pdf' | 'excel')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pdf">PDF</SelectItem>
                  <SelectItem value="excel">Excel</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Atualização Automática</Label>
              <Select defaultValue="manual">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual</SelectItem>
                  <SelectItem value="30s">A cada 30 segundos</SelectItem>
                  <SelectItem value="1m">A cada minuto</SelectItem>
                  <SelectItem value="5m">A cada 5 minutos</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button className="w-full" onClick={() => {
              toast({ title: "Configurações salvas" });
              setShowSettingsDialog(false);
            }}>
              Salvar Configurações
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}