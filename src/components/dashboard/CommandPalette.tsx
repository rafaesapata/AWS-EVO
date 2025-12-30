import { useEffect, useState } from "react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { 
  Search, 
  BarChart3, 
  Shield, 
  DollarSign, 
  Settings,
  FileText,
  AlertTriangle,
  Bot,
  TrendingUp,
  Activity,
  Zap,
  Bell,
  Ticket,
  BookOpen,
  Key,
  Cloud,
  Users
} from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";

interface CommandPaletteProps {
  onTabChange?: (tab: string) => void;
}

export default function CommandPalette({ onTabChange }: CommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const runCommand = (command: () => void) => {
    setOpen(false);
    command();
  };

  const navigateToTab = (tab: string) => {
    // Se estamos na página /app, usa o callback para mudar a tab
    if (location.pathname === '/app' && onTabChange) {
      onTabChange(tab);
    } else {
      // Senão, navega para /app primeiro
      navigate('/app');
      // Pequeno delay para garantir que a página carregou
      setTimeout(() => {
        if (onTabChange) onTabChange(tab);
      }, 100);
    }
  };

  return (
    <>
      <div 
        className="hidden md:flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground border rounded-md cursor-pointer hover:bg-accent transition-colors"
        onClick={() => setOpen(true)}
      >
        <Search className="h-4 w-4" />
        <span>Buscar...</span>
        <kbd className="ml-auto pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-xs font-medium opacity-100">
          <span className="text-xs">⌘</span>K
        </kbd>
      </div>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Digite um comando ou busca..." />
        <CommandList>
          <CommandEmpty>Nenhum resultado encontrado.</CommandEmpty>
          
          <CommandGroup heading="Navegação Principal">
            <CommandItem onSelect={() => runCommand(() => navigateToTab('executive'))}>
              <BarChart3 className="mr-2 h-4 w-4" />
              Dashboard Executivo
            </CommandItem>
            <CommandItem onSelect={() => runCommand(() => navigateToTab('cost-analysis'))}>
              <DollarSign className="mr-2 h-4 w-4" />
              Análise de Custos
            </CommandItem>
            <CommandItem onSelect={() => runCommand(() => navigateToTab('copilot'))}>
              <Bot className="mr-2 h-4 w-4" />
              FinOps Copilot AI
            </CommandItem>
            <CommandItem onSelect={() => runCommand(() => navigateToTab('ml'))}>
              <TrendingUp className="mr-2 h-4 w-4" />
              Incidentes Preditivos
            </CommandItem>
            <CommandItem onSelect={() => runCommand(() => navigateToTab('anomalies'))}>
              <AlertTriangle className="mr-2 h-4 w-4" />
              Detecção de Anomalias
            </CommandItem>
          </CommandGroup>

          <CommandGroup heading="Monitoramento">
            <CommandItem onSelect={() => runCommand(() => navigateToTab('endpoint-monitoring'))}>
              <Activity className="mr-2 h-4 w-4" />
              Endpoints
            </CommandItem>
            <CommandItem onSelect={() => runCommand(() => navigate('/resource-monitoring'))}>
              <Activity className="mr-2 h-4 w-4" />
              Recursos AWS
            </CommandItem>
            <CommandItem onSelect={() => runCommand(() => navigateToTab('edge-monitoring'))}>
              <Activity className="mr-2 h-4 w-4" />
              Borda (LB/CF/WAF)
            </CommandItem>
          </CommandGroup>

          <CommandGroup heading="Segurança">
            <CommandItem onSelect={() => runCommand(() => navigate('/attack-detection'))}>
              <Shield className="mr-2 h-4 w-4" />
              Detecção de Ataques
            </CommandItem>
            <CommandItem onSelect={() => runCommand(() => navigateToTab('scans'))}>
              <Shield className="mr-2 h-4 w-4" />
              Scans de Segurança
            </CommandItem>
            <CommandItem onSelect={() => runCommand(() => navigateToTab('security'))}>
              <Shield className="mr-2 h-4 w-4" />
              Postura de Segurança
            </CommandItem>
          </CommandGroup>

          <CommandGroup heading="Otimização">
            <CommandItem onSelect={() => runCommand(() => navigateToTab('advanced'))}>
              <Zap className="mr-2 h-4 w-4" />
              Otimização de Custos
            </CommandItem>
            <CommandItem onSelect={() => runCommand(() => navigateToTab('risp'))}>
              <DollarSign className="mr-2 h-4 w-4" />
              RI/Savings Plans
            </CommandItem>
            <CommandItem onSelect={() => runCommand(() => navigateToTab('waste'))}>
              <AlertTriangle className="mr-2 h-4 w-4" />
              Detecção de Desperdício
            </CommandItem>
          </CommandGroup>

          <CommandGroup heading="Páginas">
            <CommandItem onSelect={() => runCommand(() => navigate('/knowledge-base'))}>
              <BookOpen className="mr-2 h-4 w-4" />
              Base de Conhecimento
            </CommandItem>
            <CommandItem onSelect={() => runCommand(() => navigate('/license-management'))}>
              <Key className="mr-2 h-4 w-4" />
              Licença
            </CommandItem>
            <CommandItem onSelect={() => runCommand(() => navigate('/aws-settings'))}>
              <Cloud className="mr-2 h-4 w-4" />
              Configurações AWS
            </CommandItem>
          </CommandGroup>

          <CommandGroup heading="Ações Rápidas">
            <CommandItem onSelect={() => runCommand(() => navigateToTab('alerts'))}>
              <Bell className="mr-2 h-4 w-4" />
              Alertas Inteligentes
            </CommandItem>
            <CommandItem onSelect={() => runCommand(() => navigateToTab('tickets'))}>
              <Ticket className="mr-2 h-4 w-4" />
              Tickets de Remediação
            </CommandItem>
            <CommandItem onSelect={() => runCommand(() => navigateToTab('setup'))}>
              <Settings className="mr-2 h-4 w-4" />
              Configurações
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
