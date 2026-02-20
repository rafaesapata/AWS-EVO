import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Tags, CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useApplyTemplates, useTagTemplates } from '@/hooks/useTags';

interface QuickstartWizardProps {
  onComplete: () => void;
  onSkip: () => void;
}

export function QuickstartWizard({ onComplete, onSkip }: QuickstartWizardProps) {
  const { t } = useTranslation();
  const { data: templates, isLoading } = useTagTemplates();
  const applyTemplates = useApplyTemplates();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [done, setDone] = useState(false);

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const handleApply = useCallback(async () => {
    if (selected.size === 0) return;
    await applyTemplates.mutateAsync(Array.from(selected));
    setDone(true);
    setTimeout(onComplete, 1500);
  }, [selected, applyTemplates, onComplete]);

  if (done) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-4">
        <CheckCircle2 className="h-16 w-16 text-green-500" />
        <p className="text-xl font-medium">{t('tags.quickstartDone', 'Tags Created!')}</p>
        <p className="text-sm text-muted-foreground">{t('tags.quickstartDoneDesc', 'Your tag templates have been applied.')}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center py-8 space-y-6 max-w-lg mx-auto">
      <Tags className="h-12 w-12 text-primary" />
      <div className="text-center space-y-2">
        <h2 className="text-xl font-semibold">{t('tags.quickstartTitle', 'Get Started with Tags')}</h2>
        <p className="text-sm text-muted-foreground">
          {t('tags.quickstartDesc', 'Select tag templates to quickly set up your tagging strategy.')}
        </p>
      </div>

      {isLoading ? (
        <Loader2 className="h-6 w-6 animate-spin" />
      ) : (
        <div className="w-full space-y-2">
          {(templates || []).map((tmpl: any) => (
            <Card
              key={tmpl.id}
              className={`glass cursor-pointer transition-all ${selected.has(tmpl.id) ? 'border-primary/40 bg-primary/5' : 'border-primary/20'}`}
              onClick={() => toggle(tmpl.id)}
            >
              <CardContent className="flex items-center gap-3 p-3">
                <Checkbox checked={selected.has(tmpl.id)} onCheckedChange={() => toggle(tmpl.id)} />
                <div className="flex-1">
                  <p className="text-sm font-medium">{tmpl.name}</p>
                  <p className="text-xs text-muted-foreground">{tmpl.description}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="flex gap-3 w-full">
        <Button variant="ghost" className="flex-1" onClick={onSkip}>
          {t('tags.skipSetup', 'Skip — I\'ll set up manually')}
        </Button>
        <Button
          className="flex-1 glass hover-glow"
          disabled={selected.size === 0 || applyTemplates.isPending}
          onClick={handleApply}
        >
          {applyTemplates.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
          {t('tags.applyTemplates', 'Apply Templates')} ({selected.size})
        </Button>
      </div>
    </div>
  );
}
