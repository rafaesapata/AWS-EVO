import { useAwsAccount } from '@/contexts/AwsAccountContext';
import { useNavigate } from 'react-router-dom';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Cloud, Globe, ChevronDown, CheckCircle2, Server, AlertTriangle } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface AwsAccountSelectorProps {
  className?: string;
  showLabel?: boolean;
  compact?: boolean;
}

export function AwsAccountSelector({ 
  className = '', 
  showLabel = true,
  compact = false 
}: AwsAccountSelectorProps) {
  const navigate = useNavigate();
  const { 
    accounts, 
    selectedAccountId, 
    selectedAccount,
    setSelectedAccountId, 
    isLoading,
    hasMultipleAccounts 
  } = useAwsAccount();

  if (isLoading) {
    return (
      <div className="flex items-center gap-2">
        <Skeleton className="h-8 w-8 rounded-lg" />
        <div className="space-y-1">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-2 w-16" />
        </div>
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div 
              onClick={() => navigate('/aws-settings')}
              className={cn(
                "flex items-center gap-3 px-4 py-2.5 rounded-xl cursor-pointer transition-all",
                "bg-gradient-to-r from-amber-500/5 to-orange-500/10 hover:from-amber-500/10 hover:to-orange-500/15",
                "border border-amber-500/20 hover:border-amber-500/30",
                className
              )}
            >
              {/* Warning icon */}
              <div className="relative">
                <div className="p-2.5 rounded-lg bg-gradient-to-br from-amber-500/20 to-orange-500/20">
                  <Cloud className="h-5 w-5 text-amber-500" />
                </div>
                <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-amber-500 border-2 border-background" />
              </div>
              
              {/* Message */}
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-medium text-amber-600">
                  Nenhuma conta AWS
                </span>
                <span className="text-[11px] text-muted-foreground">
                  Clique para configurar
                </span>
              </div>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs p-3">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                <span className="font-medium text-sm">Configuração Necessária</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Você precisa conectar pelo menos uma conta AWS para usar o sistema.
              </p>
              <p className="text-xs text-muted-foreground">
                Clique aqui para ir às configurações AWS.
              </p>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // If only one account, show elegant display
  if (!hasMultipleAccounts && accounts[0]) {
    const account = accounts[0];
    const isOrphaned = (account as any)._isOrphaned;
    
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={cn(
              "flex items-center gap-1.5 h-[32px] w-[140px] px-2 py-1 rounded-md cursor-help transition-all overflow-hidden",
              isOrphaned 
                ? "bg-amber-500/10 hover:bg-amber-500/15 border border-amber-500/20"
                : "bg-primary/10 hover:bg-primary/15 border border-primary/20",
              className
            )}>
              {/* Icon with status */}
              <div className="relative flex-shrink-0">
                <Cloud className={cn(
                  "h-3 w-3",
                  isOrphaned ? "text-amber-500" : "text-orange-500"
                )} />
                <div className={cn(
                  "absolute -bottom-0.5 -right-0.5 h-1.5 w-1.5 rounded-full border border-background",
                  isOrphaned ? "bg-amber-500" : "bg-green-500"
                )} />
              </div>
              
              {/* Account info */}
              <span className="text-[9px] leading-tight font-medium truncate flex-1">
                {account.account_name}
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" align="end" className="max-w-xs p-3">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                {isOrphaned ? (
                  <>
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    <span className="font-medium text-sm">Dados de Custo Encontrados</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    <span className="font-medium text-sm">Conta Conectada</span>
                  </>
                )}
              </div>
              <div className="pl-6 space-y-1">
                <p className="text-sm">{account.account_name}</p>
                {isOrphaned ? (
                  <p className="text-xs text-muted-foreground">
                    Existem dados de custo para esta conta, mas as credenciais AWS não estão configuradas.
                  </p>
                ) : (
                  account.account_id && (
                    <p className="text-xs text-muted-foreground font-mono">ID: {account.account_id}</p>
                  )
                )}
              </div>
              {account.regions && account.regions.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap pt-2 border-t border-border/50">
                  <Globe className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Regiões:</span>
                  {account.regions.map((region) => (
                    <Badge key={region} variant="secondary" className="text-[10px] py-0 px-1.5 font-mono">
                      {region}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Multiple accounts - show selector
  return (
    <div className={cn("flex items-center", className)}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="relative">
              <Select
                value={selectedAccountId || undefined}
                onValueChange={setSelectedAccountId}
              >
                <SelectTrigger 
                  className={cn(
                    "h-[32px] w-[140px] px-2 py-1 rounded-md border-primary/20 hover:border-primary/30",
                    "bg-primary/10 hover:bg-primary/15 transition-all focus:ring-primary/30",
                    "flex items-center"
                  )}
                >
                  <div className="flex items-center gap-1.5 w-full overflow-hidden">
                    {/* Icon with status */}
                    <div className="relative flex-shrink-0">
                      <Cloud className="h-3 w-3 text-orange-500" />
                      <div className="absolute -bottom-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-green-500 border border-background" />
                    </div>
                    
                    {/* Account info */}
                    <div className="flex-1 min-w-0">
                      <SelectValue placeholder="Conta AWS">
                        {selectedAccount && (
                          <span className="text-[9px] leading-tight font-medium block truncate">
                            {selectedAccount.account_name}
                          </span>
                        )}
                      </SelectValue>
                    </div>
                  </div>
                </SelectTrigger>
                
                <SelectContent className="z-50 bg-popover/95 backdrop-blur-sm border-border/50 rounded-lg p-1 w-[200px]">
                  {accounts.map((account) => (
                    <SelectItem 
                      key={account.id} 
                      value={account.id}
                      className="rounded-md cursor-pointer focus:bg-primary/10 text-xs"
                    >
                      <div className="flex items-center gap-2 py-1">
                        <Server className="h-3 w-3 text-orange-500/80 flex-shrink-0" />
                        <div className="flex flex-col min-w-0 flex-1">
                          <span className="text-xs font-medium truncate">{account.account_name}</span>
                          {account.account_id && (
                            <span className="text-[10px] text-muted-foreground font-mono truncate">
                              {account.account_id}
                            </span>
                          )}
                        </div>
                        {account.id === selectedAccountId && (
                          <CheckCircle2 className="h-3 w-3 text-green-500 flex-shrink-0" />
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </TooltipTrigger>
          {selectedAccount && selectedAccount.regions && selectedAccount.regions.length > 0 && (
            <TooltipContent side="bottom" align="end" className="max-w-xs p-3">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span className="font-medium text-sm">Conta Ativa</span>
                </div>
                <div className="pl-6 space-y-1">
                  <p className="text-sm">{selectedAccount.account_name}</p>
                  {selectedAccount.account_id && (
                    <p className="text-xs text-muted-foreground font-mono">ID: {selectedAccount.account_id}</p>
                  )}
                </div>
                <div className="flex items-center gap-1.5 flex-wrap pt-2 border-t border-border/50">
                  <Globe className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Regiões:</span>
                  {selectedAccount.regions.map((region) => (
                    <Badge key={region} variant="secondary" className="text-[10px] py-0 px-1.5 font-mono">
                      {region}
                    </Badge>
                  ))}
                </div>
              </div>
            </TooltipContent>
          )}
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
