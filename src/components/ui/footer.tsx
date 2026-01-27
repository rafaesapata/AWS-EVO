/**
 * Footer Component - Redesigned
 * Modern, functional footer with real-time status, sync indicator, and useful links
 */

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Rocket,
  RefreshCw,
  Book,
  Activity,
  Headphones,
  FileText,
  ExternalLink,
  Wifi,
  WifiOff,
  Info,
  Code2,
  Calendar,
  GitBranch,
  Clock,
  Server,
  Cloud,
  Zap
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { 
  Tooltip, 
  TooltipContent, 
  TooltipTrigger,
  TooltipProvider 
} from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from '@/components/ui/dialog';
import { getVersionString, getBuildInfo } from '@/lib/version';

// Get version without the 'v' prefix since we add it in the UI
const APP_VERSION = (import.meta.env.VITE_APP_VERSION || getVersionString()).replace(/^v/, '');

interface FooterProps {
  className?: string;
  variant?: 'default' | 'minimal' | 'detailed';
}

export function Footer({ className = '', variant = 'default' }: FooterProps) {
  const { t } = useTranslation();
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [lastSync, setLastSync] = useState<Date>(new Date());
  const [systemStatus, setSystemStatus] = useState<'operational' | 'degraded' | 'down'>('operational');
  const [buildInfo] = useState(getBuildInfo());
  const currentYear = new Date().getFullYear();

  // Monitor online status
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setSystemStatus('operational');
    };
    const handleOffline = () => {
      setIsOnline(false);
      setSystemStatus('down');
    };
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Listen for data sync events
  useEffect(() => {
    const handleSync = () => setLastSync(new Date());
    
    // Listen for custom sync events from React Query or API calls
    window.addEventListener('evo-data-sync', handleSync);
    
    // Also update on visibility change (when user returns to tab)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        setLastSync(new Date());
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    
    return () => {
      window.removeEventListener('evo-data-sync', handleSync);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  const getTimeSinceSync = () => {
    const now = new Date();
    const diff = Math.floor((now.getTime() - lastSync.getTime()) / 1000);
    
    if (diff < 60) return t('footer.syncNow', 'agora');
    if (diff < 3600) {
      const minutes = Math.floor(diff / 60);
      return `há ${minutes} min`;
    }
    const hours = Math.floor(diff / 3600);
    return `há ${hours}h`;
  };

  const getStatusColor = () => {
    if (!isOnline) return 'text-red-500';
    switch (systemStatus) {
      case 'operational': return 'text-emerald-500';
      case 'degraded': return 'text-amber-500';
      case 'down': return 'text-red-500';
      default: return 'text-muted-foreground';
    }
  };

  const getStatusBgColor = () => {
    if (!isOnline) return 'bg-red-500';
    switch (systemStatus) {
      case 'operational': return 'bg-emerald-500';
      case 'degraded': return 'bg-amber-500';
      case 'down': return 'bg-red-500';
      default: return 'bg-muted-foreground';
    }
  };

  const getStatusText = () => {
    if (!isOnline) return t('footer.offline', 'Offline');
    switch (systemStatus) {
      case 'operational': return t('footer.operational', 'Operacional');
      case 'degraded': return t('footer.degraded', 'Degradado');
      case 'down': return t('footer.down', 'Indisponível');
      default: return t('footer.unknown', 'Desconhecido');
    }
  };

  // Minimal variant
  if (variant === 'minimal') {
    return (
      <TooltipProvider>
        <footer className={cn(
          'border-t border-border/40 bg-background/80 backdrop-blur-sm',
          className
        )}>
          <div className="px-4 py-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              {/* Left - Brand */}
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <Rocket className="h-3.5 w-3.5 text-primary" />
                  <span className="font-medium text-foreground/80">EVO Platform</span>
                </div>
                <Badge variant="secondary" className="h-5 px-1.5 text-[10px] bg-primary/10 text-primary border-0">
                  v{APP_VERSION}
                </Badge>
              </div>

              {/* Center - Status */}
              <div className="hidden sm:flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <span className={cn('h-2 w-2 rounded-full animate-pulse', getStatusBgColor())} />
                  <span className={getStatusColor()}>{getStatusText()}</span>
                </div>
                <div className="flex items-center gap-1.5 text-muted-foreground/70">
                  <RefreshCw className="h-3 w-3" />
                  <span>Sync {getTimeSinceSync()}</span>
                </div>
              </div>

              {/* Right - Copyright */}
              <span>© {currentYear} EVO Cloud</span>
            </div>
          </div>
        </footer>
      </TooltipProvider>
    );
  }

  // Default/Detailed variant
  return (
    <TooltipProvider>
      <footer className={cn(
        'border-t border-border/50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80',
        className
      )}>
        {/* Decorative gradient line */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
        
        <div className="px-4 md:px-6 py-3">
          <div className="flex items-center justify-between gap-4">
            
            {/* Left Section - Brand, Status & Sync */}
            <div className="flex items-center gap-4 md:gap-6">
              {/* Brand & Version */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-2 cursor-default">
                    <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-sm">
                      <Rocket className="h-3.5 w-3.5 text-white" />
                    </div>
                    <div className="hidden sm:block">
                      <span className="text-sm font-semibold text-foreground">EVO Platform</span>
                    </div>
                    <Badge 
                      variant="secondary" 
                      className="h-5 px-2 text-[10px] font-medium bg-primary/10 text-primary border-0"
                    >
                      v{APP_VERSION}
                    </Badge>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p>Versão {APP_VERSION}</p>
                  <p className="text-xs text-muted-foreground">Build {buildInfo.buildNumber}</p>
                </TooltipContent>
              </Tooltip>

              {/* Divider */}
              <div className="hidden md:block h-5 w-px bg-border/50" />

              {/* System Status */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-2 cursor-default">
                    {isOnline ? (
                      <Wifi className={cn('h-4 w-4', getStatusColor())} />
                    ) : (
                      <WifiOff className="h-4 w-4 text-red-500" />
                    )}
                    <div className="flex items-center gap-1.5">
                      <span className={cn('h-2 w-2 rounded-full', getStatusBgColor(), isOnline && 'animate-pulse')} />
                      <span className={cn('text-sm font-medium', getStatusColor())}>
                        {getStatusText()}
                      </span>
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p>Status: {getStatusText()}</p>
                  {isOnline && (
                    <p className="text-xs text-muted-foreground">Todos os serviços funcionando</p>
                  )}
                </TooltipContent>
              </Tooltip>

              {/* Last Sync */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="hidden sm:flex items-center gap-1.5 text-sm text-muted-foreground cursor-default">
                    <RefreshCw className="h-3.5 w-3.5" />
                    <span>Sync {getTimeSinceSync()}</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p>Última sincronização</p>
                  <p className="text-xs text-muted-foreground">{lastSync.toLocaleTimeString()}</p>
                </TooltipContent>
              </Tooltip>
            </div>

            {/* Center Section - Quick Links */}
            <div className="hidden lg:flex items-center gap-1">
              <FooterLink href="https://docs.evocloud.com" icon={Book}>
                Docs
              </FooterLink>
              <FooterLink href="https://status.evocloud.com" icon={Activity}>
                Status
              </FooterLink>
              <FooterLink href="https://support.evocloud.com" icon={Headphones}>
                Suporte
              </FooterLink>
              <FooterLink href="/changelog" icon={FileText} external={false}>
                Changelog
              </FooterLink>
            </div>

            {/* Right Section - Copyright & Info */}
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">
                © {currentYear}{' '}
                <span className="hidden sm:inline">EVO Cloud Technologies</span>
                <span className="sm:hidden">EVO</span>
              </span>
              
              {/* Version Info Dialog */}
              <Dialog>
                <DialogTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-7 w-7 p-0 rounded-md hover:bg-primary/10 hover:text-primary"
                  >
                    <Info className="h-3.5 w-3.5" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center">
                        <Code2 className="h-4 w-4 text-white" />
                      </div>
                      Informações do Sistema
                    </DialogTitle>
                    <DialogDescription>
                      Detalhes técnicos da versão atual
                    </DialogDescription>
                  </DialogHeader>
                  
                  <Card className="border-border/50 bg-muted/30">
                    <CardContent className="p-4 space-y-4">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <InfoItem icon={GitBranch} label="Versão" value={buildInfo.version} />
                        <InfoItem icon={Server} label="Ambiente" value={buildInfo.environment} />
                        <InfoItem icon={Calendar} label="Build" value={buildInfo.buildNumber} />
                        <InfoItem icon={Clock} label="Status" value={getStatusText()} />
                      </div>
                      
                      <div className="pt-3 border-t border-border/50">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                          <Code2 className="h-3 w-3" />
                          <span>Versão Completa</span>
                        </div>
                        <p className="font-mono text-xs bg-muted/50 px-3 py-2 rounded-md border border-border/50">
                          {buildInfo.fullVersion}
                        </p>
                      </div>
                      
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <Cloud className="h-3 w-3 text-primary" />
                          <span>100% AWS Native</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Zap className="h-3 w-3 text-amber-500" />
                          <span>Serverless</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </div>
      </footer>
    </TooltipProvider>
  );
}

// Footer Link Component
interface FooterLinkProps {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  external?: boolean;
}

function FooterLink({ href, icon: Icon, children, external = true }: FooterLinkProps) {
  const linkProps = external 
    ? { target: '_blank', rel: 'noopener noreferrer' } 
    : {};
  
  return (
    <a
      href={href}
      {...linkProps}
      className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-md transition-colors"
    >
      <Icon className="h-3.5 w-3.5" />
      <span>{children}</span>
      {external && <ExternalLink className="h-3 w-3 opacity-50" />}
    </a>
  );
}

// Info Item Component for Dialog
interface InfoItemProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}

function InfoItem({ icon: Icon, label, value }: InfoItemProps) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3 w-3" />
        <span>{label}</span>
      </div>
      <p className="font-medium text-sm">{value}</p>
    </div>
  );
}

export default Footer;
