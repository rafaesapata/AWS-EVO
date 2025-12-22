import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * Botão visível para atualização global de todos os dados do sistema
 * Substitui o antigo GlobalDataRefresh que era invisível
 */
export function GlobalRefreshButton() {
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    
    try {
      // Invalidar TODAS as queries do sistema
      await queryClient.invalidateQueries();
      
      toast.success("Dados atualizados com sucesso!");
    } catch (error) {
      toast.error("Erro ao atualizar dados");
    } finally {
      // Aguardar animação completar antes de parar o spinner
      setTimeout(() => {
        setIsRefreshing(false);
      }, 500);
    }
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="relative"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>Atualizar todos os dados</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
