/**
 * Donut Chart Component
 * Circular progress indicator for Health Score
 * Based on Figma design specifications
 * - Size: 110px diameter
 * - Stroke: 6px
 * - Center value: 35px Extra Light
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
  size = 110,
  strokeWidth = 6,
  color = '#00B2FF'
}: DonutChartProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const percentage = (value / max) * 100;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg
        width={size}
        height={size}
        className="transform -rotate-90"
      >
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={`${color}1A`} // 10% opacity
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
      
      {/* Center value - 35px Extra Light */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="flex items-baseline gap-0.5">
          <span 
            className="font-extralight tabular-nums" 
            style={{ fontSize: '35px', lineHeight: '1', color }}
          >
            {value}
          </span>
          <span 
            className="font-normal text-gray-400"
            style={{ fontSize: '35px', lineHeight: '1' }}
          >
            /{max}
          </span>
        </div>
      </div>
    </div>
  );
}
