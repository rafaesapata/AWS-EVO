/**
 * Info Icon Component
 * Displays a help icon with popover on click
 * Based on Figma design specifications
 */

import { HelpCircle } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

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
    <Popover>
      <PopoverTrigger asChild>
        <button 
          type="button"
          className={`p-1 cursor-pointer focus:outline-none ${className}`}
        >
          <HelpCircle className="h-4 w-4 text-gray-400 hover:text-gray-600 transition-colors" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" className="max-w-xs">
        <p className="text-sm">{tooltip}</p>
      </PopoverContent>
    </Popover>
  );
}

