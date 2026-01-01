import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ArrowDown, ArrowUp } from "lucide-react";

interface FindingsFiltersProps {
  searchTerm: string;
  severityFilter: string;
  serviceFilter: string;
  statusFilter: string;
  sortBy: 'severity' | 'created_at' | 'service';
  sortOrder: 'asc' | 'desc';
  itemsPerPage: number;
  uniqueServices: string[];
  onSearchChange: (value: string) => void;
  onSeverityChange: (value: string) => void;
  onServiceChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onSortChange: (sortBy: 'severity' | 'created_at' | 'service') => void;
  onItemsPerPageChange: (value: string) => void;
}

export function FindingsFilters({
  searchTerm,
  severityFilter,
  serviceFilter,
  statusFilter,
  sortBy,
  sortOrder,
  itemsPerPage,
  uniqueServices,
  onSearchChange,
  onSeverityChange,
  onServiceChange,
  onStatusChange,
  onSortChange,
  onItemsPerPageChange
}: FindingsFiltersProps) {
  return (
    <div className="space-y-4">
      {/* Search and Filters Row */}
      <div className="flex flex-wrap gap-4">
        <div className="flex-1 min-w-[200px]">
          <Input
            placeholder="Buscar achados..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="glass transition-all duration-300 focus:scale-105"
          />
        </div>
        <Select value={severityFilter || "all"} onValueChange={onSeverityChange}>
          <SelectTrigger className="w-[150px] glass transition-all duration-300 hover:scale-105">
            <SelectValue placeholder="Severidade" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="critical">Crítico</SelectItem>
            <SelectItem value="high">Alto</SelectItem>
            <SelectItem value="medium">Médio</SelectItem>
            <SelectItem value="low">Baixo</SelectItem>
            <SelectItem value="info">Info</SelectItem>
          </SelectContent>
        </Select>
        <Select value={serviceFilter || "all"} onValueChange={onServiceChange}>
          <SelectTrigger className="w-[150px] glass transition-all duration-300 hover:scale-105">
            <SelectValue placeholder="Serviço" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {uniqueServices.map(service => (
              <SelectItem key={service} value={service}>{service}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter || "all"} onValueChange={onStatusChange}>
          <SelectTrigger className="w-[150px] glass transition-all duration-300 hover:scale-105">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="pending">Pendente</SelectItem>
            <SelectItem value="in_progress">Em Progresso</SelectItem>
            <SelectItem value="resolved">Resolvido</SelectItem>
            <SelectItem value="dismissed">Descartado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Sort and Pagination Controls Row */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground">Ordenar por:</span>
          <div className="flex gap-2">
            <Button
              variant={sortBy === 'severity' ? 'default' : 'outline'}
              size="sm"
              onClick={() => onSortChange('severity')}
              className="glass hover-glow transition-all duration-300"
            >
              Criticidade
              {sortBy === 'severity' && (
                sortOrder === 'desc' ? <ArrowDown className="h-3 w-3 ml-1" /> : <ArrowUp className="h-3 w-3 ml-1" />
              )}
            </Button>
            <Button
              variant={sortBy === 'created_at' ? 'default' : 'outline'}
              size="sm"
              onClick={() => onSortChange('created_at')}
              className="glass hover-glow transition-all duration-300"
            >
              Data
              {sortBy === 'created_at' && (
                sortOrder === 'desc' ? <ArrowDown className="h-3 w-3 ml-1" /> : <ArrowUp className="h-3 w-3 ml-1" />
              )}
            </Button>
            <Button
              variant={sortBy === 'service' ? 'default' : 'outline'}
              size="sm"
              onClick={() => onSortChange('service')}
              className="glass hover-glow transition-all duration-300"
            >
              Serviço
              {sortBy === 'service' && (
                sortOrder === 'desc' ? <ArrowDown className="h-3 w-3 ml-1" /> : <ArrowUp className="h-3 w-3 ml-1" />
              )}
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Itens por página:</span>
          <Select value={itemsPerPage?.toString() || "10"} onValueChange={onItemsPerPageChange}>
            <SelectTrigger className="w-[80px] glass">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="5">5</SelectItem>
              <SelectItem value="10">10</SelectItem>
              <SelectItem value="20">20</SelectItem>
              <SelectItem value="50">50</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
