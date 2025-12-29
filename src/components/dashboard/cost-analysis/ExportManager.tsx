import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Download, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";
import { apiClient } from "@/integrations/aws/api-client";
import { formatDateBR } from "@/lib/utils";

interface Props {
  costs: any[];
  accounts: any[];
  selectedAccountId: string;
}

export function ExportManager({ costs, accounts, selectedAccountId }: Props) {
  const { toast } = useToast();
  const [isExporting, setIsExporting] = useState(false);

  const exportToCSV = () => {
    if (!costs || costs.length === 0) {
      toast({
        title: "Nenhum dado para exportar",
        variant: "destructive"
      });
      return;
    }

    const headers = ['Data', 'Conta AWS', 'Custo Total', 'Créditos', 'Custo Líquido', 'Principais Serviços'];
    const rows = costs.map(cost => {
      const topServices = cost.service_breakdown 
        ? Object.entries(cost.service_breakdown)
            .sort(([,a], [,b]) => (b as number) - (a as number))
            .slice(0, 5)
            .map(([service, value]) => `${service}: $${(value as number).toFixed(2)}`)
            .join('; ')
        : '';
      
      return [
        formatDateBR(cost.cost_date),
        accounts?.find(a => a.id === cost.aws_account_id)?.account_name || cost.aws_account_id,
        cost.total_cost.toFixed(2),
        (cost.credits_used || 0).toFixed(2),
        (cost.net_cost || cost.total_cost).toFixed(2),
        topServices
      ];
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `custos_aws_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();

    toast({
      title: "CSV exportado!",
      description: `${costs.length} registros exportados`,
    });
  };

  const exportToExcel = async () => {
    setIsExporting(true);
    try {
      const data = await apiClient.lambda('generate-excel-report', {
        body: {
          costs,
          accountId: selectedAccountId,
          reportType: 'cost_analysis'
        }
      });

      

      if (data.fileUrl) {
        window.open(data.fileUrl, '_blank');
        toast({
          title: "Excel gerado!",
          description: "Abrindo em nova aba...",
        });
      }
    } catch (error: any) {
      console.error('Export error:', error);
      toast({
        title: "Erro ao gerar Excel",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setIsExporting(false);
    }
  };

  const exportToPDF = async () => {
    setIsExporting(true);
    try {
      toast({
        title: "Gerando PDF...",
        description: "Isso pode levar alguns segundos",
      });

      const data = await apiClient.lambda('generate-pdf-report', {
        body: {
          costs,
          accountId: selectedAccountId,
          reportType: 'cost_analysis'
        }
      });

      

      toast({
        title: "PDF gerado!",
        description: "Download iniciado",
      });
    } catch (error: any) {
      console.error('PDF export error:', error);
      toast({
        title: "Erro ao gerar PDF",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={isExporting}>
          {isExporting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Exportando...
            </>
          ) : (
            <>
              <Download className="h-4 w-4 mr-2" />
              Exportar
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Formato de Exportação</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={exportToCSV}>
          <FileText className="h-4 w-4 mr-2" />
          CSV (Simples)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={exportToExcel}>
          <FileSpreadsheet className="h-4 w-4 mr-2" />
          Excel (Completo)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={exportToPDF}>
          <FileText className="h-4 w-4 mr-2" />
          PDF (Relatório)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
