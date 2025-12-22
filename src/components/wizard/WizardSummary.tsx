import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Edit2, ChevronRight } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface SummaryItem {
  label: string;
  value: string | string[];
  step: number;
}

interface WizardSummaryProps {
  items: SummaryItem[];
  onEdit: (step: number) => void;
  onConfirm: () => void;
  isProcessing?: boolean;
}

export const WizardSummary = ({ items, onEdit, onConfirm, isProcessing }: WizardSummaryProps) => {
  return (
    <div className="space-y-6 animate-fade-in">
      <Alert className="border-primary/50 bg-primary/5">
        <CheckCircle2 className="h-5 w-5 text-primary" />
        <AlertDescription>
          <p className="font-semibold text-foreground mb-1">Revise suas configurações</p>
          <p className="text-sm text-muted-foreground">
            Confira todos os dados antes de finalizar. Você pode editar qualquer informação clicando no botão correspondente.
          </p>
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Resumo da Configuração</CardTitle>
          <CardDescription>Confirme os dados antes de prosseguir</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {items.map((item, index) => (
            <div 
              key={index}
              className="flex items-start justify-between p-4 rounded-lg border border-border bg-muted/30 hover:bg-muted/50 transition-colors"
            >
              <div className="space-y-1 flex-1">
                <p className="font-medium text-sm text-muted-foreground">{item.label}</p>
                {Array.isArray(item.value) ? (
                  <div className="flex flex-wrap gap-2">
                    {item.value.map((val, idx) => (
                      <span 
                        key={idx}
                        className="px-2 py-1 rounded-md bg-primary/10 text-primary text-sm font-medium"
                      >
                        {val}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-foreground font-medium">
                    {item.value.includes('*') ? '••••••••••••' : item.value}
                  </p>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onEdit(item.step)}
                className="ml-4"
              >
                <Edit2 className="h-4 w-4 mr-2" />
                Editar
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button 
          onClick={onConfirm}
          disabled={isProcessing}
          className="flex-1"
          size="lg"
        >
          {isProcessing ? 'Processando...' : 'Confirmar e Finalizar'}
          <ChevronRight className="h-5 w-5 ml-2" />
        </Button>
      </div>
    </div>
  );
};
