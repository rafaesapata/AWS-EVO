import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { CalendarIcon, Filter, X } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useState } from "react";

interface WafFiltersProps {
  filters?: WafFilterValues;
  onFiltersChange?: (filters: WafFilterValues) => void;
  onFilterChange?: (filters: WafFilterValues) => void;
  onReset?: () => void;
}

export interface WafFilterValues {
  period: string;
  severity?: string;
  threatType?: string;
  sourceIp?: string;
  country?: string;
  startDate?: Date | null;
  endDate?: Date | null;
}

export function WafFilters({ filters: externalFilters, onFiltersChange, onFilterChange, onReset }: WafFiltersProps) {
  const { t } = useTranslation();
  const [filters, setFilters] = useState<WafFilterValues>(externalFilters || {
    period: '24h',
  });

  const handleFilterChange = (key: keyof WafFilterValues, value: any) => {
    const newFilters = { ...filters, [key]: value };
    setFilters(newFilters);
    // Support both prop names for backwards compatibility
    if (onFilterChange) {
      onFilterChange(newFilters);
    }
    if (onFiltersChange) {
      onFiltersChange(newFilters);
    }
  };

  const handleReset = () => {
    const resetFilters = { period: '24h' };
    setFilters(resetFilters);
    if (onReset) {
      onReset();
    }
    if (onFiltersChange) {
      onFiltersChange(resetFilters);
    }
    if (onFilterChange) {
      onFilterChange(resetFilters);
    }
  };

  const hasActiveFilters = Object.keys(filters).length > 1 || filters.period !== '24h';

  return (
    <Card className="glass border-primary/20">
      <CardContent className="pt-6">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="h-4 w-4" />
          <h3 className="font-semibold">{t('waf.filters.title', 'Filtros')}</h3>
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleReset}
              className="ml-auto"
            >
              <X className="h-4 w-4 mr-1" />
              {t('common.clear', 'Limpar')}
            </Button>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {/* Period */}
          <div className="space-y-2">
            <Label>{t('waf.period', 'Período')}</Label>
            <Select
              value={filters.period}
              onValueChange={(value) => handleFilterChange('period', value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1h">{t('waf.lastHour', 'Última hora')}</SelectItem>
                <SelectItem value="6h">{t('waf.last6Hours', 'Últimas 6 horas')}</SelectItem>
                <SelectItem value="24h">{t('waf.last24Hours', 'Últimas 24 horas')}</SelectItem>
                <SelectItem value="7d">{t('waf.last7Days', 'Últimos 7 dias')}</SelectItem>
                <SelectItem value="30d">{t('waf.last30Days', 'Últimos 30 dias')}</SelectItem>
                <SelectItem value="custom">{t('waf.customPeriod', 'Personalizado')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Severity */}
          <div className="space-y-2">
            <Label>{t('waf.severity', 'Severidade')}</Label>
            <Select
              value={filters.severity}
              onValueChange={(value) => handleFilterChange('severity', value)}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('waf.allSeverities', 'Todas')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('waf.allSeverities', 'Todas')}</SelectItem>
                <SelectItem value="critical">{t('waf.critical', 'Crítico')}</SelectItem>
                <SelectItem value="high">{t('waf.high', 'Alto')}</SelectItem>
                <SelectItem value="medium">{t('waf.medium', 'Médio')}</SelectItem>
                <SelectItem value="low">{t('waf.low', 'Baixo')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Threat Type */}
          <div className="space-y-2">
            <Label>{t('waf.threatType', 'Tipo de Ameaça')}</Label>
            <Select
              value={filters.threatType}
              onValueChange={(value) => handleFilterChange('threatType', value)}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('waf.allTypes', 'Todos')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('waf.allTypes', 'Todos')}</SelectItem>
                <SelectItem value="sql_injection">SQL Injection</SelectItem>
                <SelectItem value="xss">XSS</SelectItem>
                <SelectItem value="path_traversal">Path Traversal</SelectItem>
                <SelectItem value="command_injection">Command Injection</SelectItem>
                <SelectItem value="bot">Bot</SelectItem>
                <SelectItem value="scanner">Scanner</SelectItem>
                <SelectItem value="ddos">DDoS</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Source IP */}
          <div className="space-y-2">
            <Label>{t('waf.sourceIp', 'IP de Origem')}</Label>
            <Input
              placeholder="192.168.1.1"
              value={filters.sourceIp || ''}
              onChange={(e) => handleFilterChange('sourceIp', e.target.value)}
            />
          </div>
        </div>

        {/* Custom Date Range */}
        {filters.period === 'custom' && (
          <div className="grid gap-4 md:grid-cols-2 mt-4">
            <div className="space-y-2">
              <Label>{t('waf.startDate', 'Data Inicial')}</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {filters.startDate ? format(filters.startDate, 'PPP', { locale: ptBR }) : t('waf.selectDate', 'Selecionar data')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={filters.startDate}
                    onSelect={(date) => handleFilterChange('startDate', date)}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label>{t('waf.endDate', 'Data Final')}</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {filters.endDate ? format(filters.endDate, 'PPP', { locale: ptBR }) : t('waf.selectDate', 'Selecionar data')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={filters.endDate}
                    onSelect={(date) => handleFilterChange('endDate', date)}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
