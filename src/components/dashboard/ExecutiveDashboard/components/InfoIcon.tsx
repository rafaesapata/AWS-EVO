/**
 * Info Icon Component
 * Displays a help icon with optional tooltip
 * Based on Figma design specifications
 */

import { HelpCircle } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
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
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>
        <button 
          type="button"
          className={`p-1 cursor-help focus:outline-none ${className}`}
        >
          <HelpCircle className="h-4 w-4 text-gray-400 hover:text-gray-600 transition-colors" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">
        <p className="text-sm">{tooltip}</p>
      </TooltipContent>
    </Tooltip>
  );
}

