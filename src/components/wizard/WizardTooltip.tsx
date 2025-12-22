import { HelpCircle, ExternalLink } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';

interface WizardTooltipProps {
  title: string;
  content: string;
  learnMoreUrl?: string;
}

export const WizardTooltip = ({ title, content, learnMoreUrl }: WizardTooltipProps) => {
  return (
    <TooltipProvider>
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="h-5 w-5 rounded-full">
            <HelpCircle className="h-4 w-4 text-muted-foreground" />
          </Button>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs space-y-2" side="right">
          <p className="font-semibold">{title}</p>
          <p className="text-sm text-muted-foreground">{content}</p>
          {learnMoreUrl && (
            <a 
              href={learnMoreUrl} 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-primary hover:underline mt-2"
            >
              Saiba mais <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
