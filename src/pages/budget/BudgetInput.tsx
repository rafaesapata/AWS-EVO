import { useCallback, useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { DollarSign } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

export interface BudgetInputProps {
  value: number;
  onChange: (value: number) => void;
  onSave: (value: number) => void;
  loading?: boolean;
  disabled?: boolean;
  /** Slot for the AI suggestion button rendered next to the input */
  actionSlot?: React.ReactNode;
}

export function BudgetInput({
  value,
  onChange,
  onSave,
  loading = false,
  disabled = false,
  actionSlot,
}: BudgetInputProps) {
  const { t } = useTranslation();
  const [inputText, setInputText] = useState(String(value));
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef<number>(value);

  // Sync inputText when external value changes (e.g. AI suggestion)
  useEffect(() => {
    setInputText(String(value));
  }, [value]);

  const sliderMax = Math.max(value * 2, 50000);

  const scheduleSave = useCallback(
    (newValue: number) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        if (newValue !== lastSavedRef.current) {
          lastSavedRef.current = newValue;
          onSave(newValue);
        }
      }, 800);
    },
    [onSave],
  );

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setInputText(raw);

    const parsed = parseFloat(raw);
    if (isNaN(parsed)) return;

    // Reject negatives — clamp to 0
    const clamped = Math.max(0, parsed);
    onChange(clamped);
    scheduleSave(clamped);
  };

  const handleInputBlur = () => {
    const parsed = parseFloat(inputText);
    if (isNaN(parsed) || parsed < 0) {
      // Reset to current value on invalid input
      setInputText(String(value));
      return;
    }
    const clamped = Math.max(0, parsed);
    if (clamped !== value) {
      onChange(clamped);
      scheduleSave(clamped);
    }
    setInputText(String(clamped));
  };

  const handleSliderChange = (values: number[]) => {
    const newValue = values[0] ?? 0;
    setInputText(String(newValue));
    onChange(newValue);
    scheduleSave(newValue);
  };

  return (
    <Card className="glass border-primary/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <DollarSign className="h-4 w-4" />
          {t('budgetManagement.setBudget', 'Definir Orçamento')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Numeric input with $ prefix + action slot */}
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground font-medium">$</span>
          <Input
            type="number"
            min={0}
            step={100}
            value={inputText}
            onChange={handleInputChange}
            onBlur={handleInputBlur}
            disabled={disabled || loading}
            placeholder="0"
            className={cn('text-lg h-10 px-3 py-2 tabular-nums', loading && 'opacity-50')}
            aria-label={t('budgetManagement.budgetInputLabel', 'Valor do orçamento em USD')}
          />
          {actionSlot}
        </div>

        {/* Slider */}
        <div className="space-y-2">
          <Slider
            value={[value]}
            min={0}
            max={sliderMax}
            step={100}
            onValueChange={handleSliderChange}
            disabled={disabled || loading}
            className={cn(loading && 'opacity-50')}
            aria-label={t('budgetManagement.budgetSliderLabel', 'Ajustar orçamento')}
          />
          <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
            <span>$0</span>
            <span>${sliderMax.toLocaleString('en-US')}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
