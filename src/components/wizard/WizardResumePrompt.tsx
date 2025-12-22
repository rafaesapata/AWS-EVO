import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { PlayCircle, X } from 'lucide-react';

interface WizardResumePromptProps {
  onResume: () => void;
  onStartFresh: () => void;
  currentStep: number;
  totalSteps: number;
}

export const WizardResumePrompt = ({ 
  onResume, 
  onStartFresh,
  currentStep,
  totalSteps 
}: WizardResumePromptProps) => {
  return (
    <Alert className="border-primary/50 bg-primary/5 mb-6 animate-slide-down">
      <PlayCircle className="h-5 w-5 text-primary" />
      <AlertDescription className="flex items-center justify-between gap-4">
        <div>
          <p className="font-semibold text-foreground mb-1">Continue de onde parou</p>
          <p className="text-sm text-muted-foreground">
            Você estava no passo {currentStep + 1} de {totalSteps}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={onResume}
            size="sm"
            className="shadow-glow"
          >
            <PlayCircle className="h-4 w-4 mr-2" />
            Continuar
          </Button>
          <Button
            onClick={onStartFresh}
            variant="outline"
            size="sm"
          >
            <X className="h-4 w-4 mr-2" />
            Começar do zero
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
};
