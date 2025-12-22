import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle, Clock, AlertCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface ApprovalStatusBadgeProps {
  status: string | null;
  rejectionReason?: string | null;
}

export function ApprovalStatusBadge({ status, rejectionReason }: ApprovalStatusBadgeProps) {
  const getBadgeContent = () => {
    switch (status) {
      case 'approved':
        return {
          badge: <Badge className="bg-green-500 hover:bg-green-600"><CheckCircle className="h-3 w-3 mr-1" /> Aprovado</Badge>,
          tooltip: "Este artigo foi aprovado e está publicado"
        };
      case 'rejected':
        return {
          badge: <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" /> Rejeitado</Badge>,
          tooltip: rejectionReason || "Este artigo foi rejeitado"
        };
      case 'pending':
      default:
        return {
          badge: <Badge variant="outline" className="border-yellow-500 text-yellow-600"><Clock className="h-3 w-3 mr-1" /> Pendente</Badge>,
          tooltip: "Este artigo está aguardando revisão"
        };
    }
  };

  const { badge, tooltip } = getBadgeContent();

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span>{badge}</span>
        </TooltipTrigger>
        <TooltipContent>
          <p className="max-w-xs">{tooltip}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
