import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Clock } from "lucide-react";

export type MetricsPeriod = '3h' | '24h' | '7d';

interface MetricsPeriodSelectorProps {
  value: MetricsPeriod;
  onChange: (value: MetricsPeriod) => void;
}

export const PERIOD_CONFIG: Record<MetricsPeriod, { label: string; hours: number; description: string }> = {
  '3h': { label: 'Últimas 3 horas', hours: 3, description: '3h' },
  '24h': { label: 'Últimas 24 horas', hours: 24, description: '24h' },
  '7d': { label: 'Últimos 7 dias', hours: 168, description: '7d' }
};

export const MetricsPeriodSelector = ({ value, onChange }: MetricsPeriodSelectorProps) => {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as MetricsPeriod)}>
      <SelectTrigger className="w-[180px]">
        <Clock className="h-4 w-4 mr-2" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(PERIOD_CONFIG).map(([key, config]) => (
          <SelectItem key={key} value={key}>
            {config.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

export default MetricsPeriodSelector;
