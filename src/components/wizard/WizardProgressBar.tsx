import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Step {
  title: string;
  icon?: any;
}

interface WizardProgressBarProps {
  steps: Step[];
  currentStep: number;
  onStepClick?: (step: number) => void;
  allowNavigation?: boolean;
}

export const WizardProgressBar = ({ 
  steps, 
  currentStep, 
  onStepClick,
  allowNavigation = false 
}: WizardProgressBarProps) => {
  return (
    <div className="w-full py-6">
      <div className="flex items-center justify-between">
        {steps.map((step, index) => {
          const isCompleted = index < currentStep;
          const isCurrent = index === currentStep;
          const isClickable = allowNavigation && index <= currentStep;
          
          return (
            <div key={index} className="flex items-center flex-1 last:flex-none">
              {/* Step Circle */}
              <div className="relative flex flex-col items-center">
                <button
                  onClick={() => isClickable && onStepClick?.(index)}
                  disabled={!isClickable}
                  className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center transition-all",
                    "font-semibold text-sm relative z-10",
                    isCompleted && "bg-primary text-primary-foreground shadow-glow",
                    isCurrent && "bg-primary text-primary-foreground ring-4 ring-primary/20 animate-pulse-glow",
                    !isCompleted && !isCurrent && "bg-muted text-muted-foreground",
                    isClickable && "cursor-pointer hover:scale-110",
                    !isClickable && "cursor-not-allowed"
                  )}
                >
                  {isCompleted ? (
                    <Check className="w-5 h-5" />
                  ) : (
                    index + 1
                  )}
                </button>
                
                {/* Step Label */}
                <span className={cn(
                  "absolute top-12 text-xs font-medium whitespace-nowrap transition-all",
                  isCurrent && "text-foreground font-semibold",
                  !isCurrent && "text-muted-foreground"
                )}>
                  {step.title}
                </span>
              </div>
              
              {/* Connector Line */}
              {index < steps.length - 1 && (
                <div className="flex-1 h-1 mx-2 relative">
                  <div className="absolute inset-0 bg-muted rounded-full" />
                  <div 
                    className={cn(
                      "absolute inset-0 bg-primary rounded-full transition-all duration-500",
                      isCompleted ? "w-full" : "w-0"
                    )}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
