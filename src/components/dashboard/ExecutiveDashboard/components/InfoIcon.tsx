/**
 * Info Icon Component
 * Displays a help icon with optional tooltip
 * Based on Figma design specifications
 */

import { HelpCircle } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface InfoIconProps {
  tooltip?: string;
  className?: string;
}

export default function InfoIcon({ tooltip, className = '' }: InfoIconProps) {
  if (!tooltip) {
    return (
      <div className={`p-1 ${className}`}>
        <HelpCircle className="h-4 w-4 text-gray-400" />
      </div>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={`p-1 cursor-help ${className}`}>
            <HelpCircle className="h-4 w-4 text-gray-400 hover:text-gray-600 transition-colors" />
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p className="max-w-xs text-sm">{tooltip}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
