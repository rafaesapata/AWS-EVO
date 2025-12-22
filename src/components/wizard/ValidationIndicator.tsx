import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ValidationIndicatorProps {
  status: 'idle' | 'validating' | 'valid' | 'invalid';
  message?: string;
  className?: string;
}

export const ValidationIndicator = ({ status, message, className }: ValidationIndicatorProps) => {
  if (status === 'idle') return null;

  return (
    <div className={cn("flex items-center gap-2 text-sm animate-fade-in", className)}>
      {status === 'validating' && (
        <>
          <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />
          <span className="text-muted-foreground">Validando...</span>
        </>
      )}
      {status === 'valid' && (
        <>
          <CheckCircle2 className="h-4 w-4 text-success" />
          <span className="text-success">{message || 'Válido'}</span>
        </>
      )}
      {status === 'invalid' && (
        <>
          <XCircle className="h-4 w-4 text-destructive" />
          <span className="text-destructive">{message || 'Inválido'}</span>
        </>
      )}
    </div>
  );
};
