/**
 * Donut Chart Component
 * Circular progress indicator for Health Score
 * Based on Figma design specifications
 * - Size: 160px diameter (configurable)
 * - Stroke: 8px
 * - Center value: Large font with /100
 * - Animated: stroke draws in + number counts up on mount/change
 */

import { useState, useEffect, useRef } from 'react';
import { useCountUp } from '@/hooks/useCountUp';

interface DonutChartProps {
  value: number;
  max: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
}

export default function DonutChart({
  value,
  max = 100,
  size = 160,
  strokeWidth = 8,
  color = '#00B2FF'
}: DonutChartProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const percentage = (value / max) * 100;
  const targetOffset = circumference - (percentage / 100) * circumference;

  // Animate stroke from full offset to target
  const [strokeOffset, setStrokeOffset] = useState(circumference);
  const mounted = useRef(false);

  useEffect(() => {
    // Start with full offset, then animate to target
    if (!mounted.current) {
      mounted.current = true;
      // Small delay so the initial state renders first
      requestAnimationFrame(() => {
        setStrokeOffset(targetOffset);
      });
    } else {
      setStrokeOffset(targetOffset);
    }
  }, [targetOffset]);

  // Animate the displayed number
  const displayValue = useCountUp(value, 1200, 0);

  // Calculate font size based on donut size
  const valueFontSize = Math.round(size * 0.28);
  const maxFontSize = Math.round(size * 0.15);

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg
        width={size}
        height={size}
        className="transform -rotate-90"
      >
        {/* Background circle - light gray */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#E5E5E5"
          strokeWidth={strokeWidth}
        />
        
        {/* Progress circle - animated draw-in */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeOffset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(0.16, 1, 0.3, 1)' }}
        />
      </svg>
      
      {/* Center value - animated count */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="flex items-baseline">
          <span 
            className="tabular-nums text-[#393939]" 
            style={{ fontSize: `${valueFontSize}px`, lineHeight: '1', fontWeight: '300' }}
          >
            {displayValue}
          </span>
          <span 
            className="text-[#9CA3AF]"
            style={{ fontSize: `${maxFontSize}px`, lineHeight: '1', fontWeight: '300' }}
          >
            /{max}
          </span>
        </div>
      </div>
    </div>
  );
}
