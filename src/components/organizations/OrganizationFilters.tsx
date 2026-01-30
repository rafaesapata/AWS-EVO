/**
 * Search and filter controls for organizations list
 */
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Filter, X } from "lucide-react";

interface OrganizationFiltersProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
  demoFilter: string;
  onDemoFilterChange: (value: string) => void;
  hasAwsFilter: string;
  onHasAwsFilterChange: (value: string) => void;
  hasUsersFilter: string;
  onHasUsersFilterChange: (value: string) => void;
  hasActiveFilters: boolean;
  onClearFilters: () => void;
}

export function OrganizationFilters({
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  demoFilter,
  onDemoFilterChange,
  hasAwsFilter,
  onHasAwsFilterChange,
  hasUsersFilter,
  onHasUsersFilterChange,
  hasActiveFilters,
  onClearFilters,
}: OrganizationFiltersProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={t('organizations.searchPlaceholder', 'Buscar por nome, domínio ou email...')}
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-10"
        />
      </div>
      
      {/* Filters Row */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">{t('common.filters', 'Filtros')}:</span>
        </div>
        
        {/* Status Filter */}
        <Select value={statusFilter} onValueChange={onStatusFilterChange}>
          <SelectTrigger className="w-[140px] h-9">
            <SelectValue placeholder={t('organizations.filterStatus', 'Status')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('organizations.allStatuses', 'Todos os status')}</SelectItem>
            <SelectItem value="active">{t('organizations.statusActive', 'Ativas')}</SelectItem>
            <SelectItem value="inactive">{t('organizations.statusInactive', 'Inativas')}</SelectItem>
            <SelectItem value="suspended">{t('organizations.statusSuspended', 'Suspensas')}</SelectItem>
          </SelectContent>
        </Select>
        
        {/* Demo Mode Filter */}
        <Select value={demoFilter} onValueChange={onDemoFilterChange}>
          <SelectTrigger className="w-[140px] h-9">
            <SelectValue placeholder={t('organizations.filterDemo', 'Modo')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('organizations.allModes', 'Todos os modos')}</SelectItem>
            <SelectItem value="demo">{t('organizations.modeDemo', 'Em Demo')}</SelectItem>
            <SelectItem value="production">{t('organizations.modeProduction', 'Produção')}</SelectItem>
          </SelectContent>
        </Select>
        
        {/* Has AWS Accounts Filter */}
        <Select value={hasAwsFilter} onValueChange={onHasAwsFilterChange}>
          <SelectTrigger className="w-[160px] h-9">
            <SelectValue placeholder={t('organizations.filterAws', 'Contas AWS')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('organizations.allAwsAccounts', 'Todas')}</SelectItem>
            <SelectItem value="with">{t('organizations.withAwsAccounts', 'Com contas AWS')}</SelectItem>
            <SelectItem value="without">{t('organizations.withoutAwsAccounts', 'Sem contas AWS')}</SelectItem>
          </SelectContent>
        </Select>
        
        {/* Has Users Filter */}
        <Select value={hasUsersFilter} onValueChange={onHasUsersFilterChange}>
          <SelectTrigger className="w-[150px] h-9">
            <SelectValue placeholder={t('organizations.filterUsers', 'Usuários')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('organizations.allUsers', 'Todos')}</SelectItem>
            <SelectItem value="with">{t('organizations.withUsers', 'Com usuários')}</SelectItem>
            <SelectItem value="without">{t('organizations.withoutUsers', 'Sem usuários')}</SelectItem>
          </SelectContent>
        </Select>
        
        {/* Clear Filters Button */}
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={onClearFilters} className="h-9">
            <X className="h-4 w-4 mr-1" />
            {t('common.clearFilters', 'Limpar')}
          </Button>
        )}
      </div>
    </div>
  );
}
