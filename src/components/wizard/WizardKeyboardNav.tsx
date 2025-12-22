import { useEffect } from 'react';

interface WizardKeyboardNavProps {
  onNext?: () => void;
  onPrevious?: () => void;
  onCancel?: () => void;
  canGoNext?: boolean;
  canGoPrevious?: boolean;
  isEnabled?: boolean;
}

export const useWizardKeyboard = ({
  onNext,
  onPrevious,
  onCancel,
  canGoNext = true,
  canGoPrevious = true,
  isEnabled = true,
}: WizardKeyboardNavProps) => {
  useEffect(() => {
    if (!isEnabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      switch (e.key) {
        case 'Enter':
          if (canGoNext && onNext) {
            e.preventDefault();
            onNext();
          }
          break;
        case 'ArrowLeft':
          if (canGoPrevious && onPrevious) {
            e.preventDefault();
            onPrevious();
          }
          break;
        case 'ArrowRight':
          if (canGoNext && onNext) {
            e.preventDefault();
            onNext();
          }
          break;
        case 'Escape':
          if (onCancel) {
            e.preventDefault();
            onCancel();
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onNext, onPrevious, onCancel, canGoNext, canGoPrevious, isEnabled]);
};

export const WizardKeyboardHints = () => {
  return (
    <div className="flex items-center justify-center gap-6 text-xs text-muted-foreground mt-4 pb-2">
      <div className="flex items-center gap-1">
        <kbd className="px-2 py-1 bg-muted rounded border border-border font-mono">Enter</kbd>
        <span>Avançar</span>
      </div>
      <div className="flex items-center gap-1">
        <kbd className="px-2 py-1 bg-muted rounded border border-border font-mono">←</kbd>
        <kbd className="px-2 py-1 bg-muted rounded border border-border font-mono">→</kbd>
        <span>Navegar</span>
      </div>
      <div className="flex items-center gap-1">
        <kbd className="px-2 py-1 bg-muted rounded border border-border font-mono">Esc</kbd>
        <span>Cancelar</span>
      </div>
    </div>
  );
};
