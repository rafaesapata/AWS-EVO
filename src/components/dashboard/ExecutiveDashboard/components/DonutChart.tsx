/**
 * Donut Chart Component
 * Circular progress indicator for Health Score
 * Based on Figma design specifications
 * - Size: 160px diameter (configurable)
 * - Stroke: 8px
 * - Center value: Large font with /100
 */

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
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  // Calculate font size based on donut size
  const valueFontSize = Math.round(size * 0.28); // ~45px for 160px donut
  const maxFontSize = Math.round(size * 0.15); // ~24px for 160px donut

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
        
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          className="transition-all duration-1000 ease-out"
        />
      </svg>
      
      {/* Center value */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="flex items-baseline">
          <span 
            className="tabular-nums text-[#393939]" 
            style={{ fontSize: `${valueFontSize}px`, lineHeight: '1', fontWeight: '300' }}
          >
            {value}
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
