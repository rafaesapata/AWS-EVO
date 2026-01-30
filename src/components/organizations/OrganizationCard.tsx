/**
 * Individual organization card in the list
 */
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { 
  Users, 
  DollarSign, 
  Shield, 
  Crown, 
  Play, 
  Square, 
  Clock, 
  AlertTriangle,
  Eye,
  Key,
  Ban,
  CheckCircle
} from "lucide-react";
import type { Organization } from "./types";
import { getDemoExpirationDays } from "./utils";

interface OrganizationCardProps {
  org: Organization;
  onViewUsers: (org: Organization) => void;
  onViewLicenses: (org: Organization) => void;
  onViewDetails: (org: Organization) => void;
  onDemoAction: (org: Organization, action: 'activate' | 'deactivate') => void;
  onSuspendAction: (org: Organization, action: 'suspend' | 'unsuspend') => void;
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'active': return <Badge className="bg-green-500">Ativa</Badge>;
    case 'inactive': return <Badge variant="secondary">Inativa</Badge>;
    case 'suspended': return <Badge variant="destructive">Suspensa</Badge>;
    default: return <Badge variant="outline">{status}</Badge>;
  }
}

export function OrganizationCard({
  org,
  onViewUsers,
  onViewLicenses,
  onViewDetails,
  onDemoAction,
  onSuspendAction,
}: OrganizationCardProps) {
  const { t } = useTranslation();

  return (
    <div className="border rounded-lg p-4 space-y-3">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-semibold text-sm">{org.name}</h4>
            {getStatusBadge(org.status)}
            <Badge variant="outline">{org.domain}</Badge>
            {org.demo_mode && (
              <Badge className="bg-amber-500 text-white">
                <AlertTriangle className="h-3 w-3 mr-1" />
                {t('demo.explainer.badge', 'DEMO')}
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">{org.description}</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span>{org.user_count} usuários</span>
            </div>
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-muted-foreground" />
              <span>{org.aws_account_count} contas AWS</span>
            </div>
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <span>${org.monthly_cost.toFixed(2)}/mês</span>
            </div>
            <div className="text-xs text-muted-foreground">
              Criada: {new Date(org.created_at).toLocaleDateString('pt-BR')}
            </div>
          </div>
          <div className="text-sm">
            <span className="text-muted-foreground">Email de cobrança:</span>
            <span className="ml-2">{org.billing_email}</span>
          </div>
          
          {/* Demo Mode Info */}
          {org.demo_mode && org.demo_expires_at && (
            <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
              <Clock className="h-4 w-4" />
              <span>
                {t('demo.admin.expiresIn', 'Expira em')}: {getDemoExpirationDays(org.demo_expires_at)} {t('common.days', 'dias')}
              </span>
              {org.demo_activated_at && (
                <span className="text-muted-foreground">
                  ({t('demo.admin.activatedAt', 'Ativado em')}: {new Date(org.demo_activated_at).toLocaleDateString('pt-BR')})
                </span>
              )}
            </div>
          )}
        </div>
        
        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onViewUsers(org)}
                  className="text-blue-600 border-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950"
                >
                  <Users className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{t('organizations.viewUsers', 'Ver usuários')}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                {org.demo_mode ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onDemoAction(org, 'deactivate')}
                    className="text-amber-600 border-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950"
                  >
                    <Square className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onDemoAction(org, 'activate')}
                    className="text-green-600 border-green-600 hover:bg-green-50 dark:hover:bg-green-950"
                  >
                    <Play className="h-4 w-4" />
                  </Button>
                )}
              </TooltipTrigger>
              <TooltipContent>
                <p>
                  {org.demo_mode 
                    ? t('demo.admin.tooltipDeactivate', 'Desativar modo demo - Exibir dados reais')
                    : t('demo.admin.tooltipActivate', 'Ativar modo demo - Exibir dados fictícios')
                  }
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onViewLicenses(org)}
                  className="text-purple-600 border-purple-600 hover:bg-purple-50 dark:hover:bg-purple-950"
                >
                  <Key className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{t('organizations.viewLicenses', 'Ver licenças')}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                {org.status === 'suspended' ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onSuspendAction(org, 'unsuspend')}
                    className="text-green-600 border-green-600 hover:bg-green-50 dark:hover:bg-green-950"
                  >
                    <CheckCircle className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onSuspendAction(org, 'suspend')}
                    className="text-red-600 border-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                  >
                    <Ban className="h-4 w-4" />
                  </Button>
                )}
              </TooltipTrigger>
              <TooltipContent>
                <p>
                  {org.status === 'suspended'
                    ? t('organizations.unsuspendOrg', 'Reativar organização')
                    : t('organizations.suspendOrg', 'Suspender organização')
                  }
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onViewDetails(org)}
                >
                  <Eye className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{t('organizations.viewDetails', 'Ver detalhes da organização')}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
      
      {org.admin_users && org.admin_users.length > 0 && (
        <div className="space-y-1">
          <p className="text-sm font-medium">Administradores:</p>
          <div className="flex gap-2 flex-wrap">
            {org.admin_users.map((admin, idx) => (
              <Badge key={idx} variant="outline" className="text-xs gap-1">
                <Crown className="h-3 w-3" />
                {admin}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
