import { X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface TagBadgeTag {
  key: string;
  value: string;
  color: string;
}

interface TagBadgeProps {
  tag: TagBadgeTag;
  variant?: 'evo-local' | 'native-cloud';
  cloudProvider?: 'aws' | 'azure';
  onRemove?: () => void;
  size?: 'sm' | 'md';
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
  };
}

function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const [rs, gs, bs] = [r / 255, g / 255, b / 255].map((c) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  );
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function getTextColor(hex: string): string {
  return relativeLuminance(hex) > 0.179 ? '#0F172A' : '#FFFFFF';
}

export function TagBadge({ tag, variant = 'evo-local', cloudProvider, onRemove, size = 'sm' }: TagBadgeProps) {
  const { r, g, b } = hexToRgb(tag.color);
  const bg = `rgba(${r}, ${g}, ${b}, 0.13)`;
  const border = `rgba(${r}, ${g}, ${b}, 0.27)`;
  const textColor = getTextColor(tag.color);

  if (variant === 'native-cloud') {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full border px-2 ${size === 'sm' ? 'text-xs py-0.5' : 'text-sm py-1'} text-muted-foreground border-muted-foreground/30`}
      >
        {cloudProvider === 'aws' && <span className="text-[10px] font-bold text-orange-500">AWS</span>}
        {cloudProvider === 'azure' && <span className="text-[10px] font-bold text-blue-500">AZ</span>}
        <span>{tag.key}: {tag.value}</span>
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 ${size === 'sm' ? 'text-xs py-0.5' : 'text-sm py-1'} font-medium`}
      style={{ backgroundColor: bg, border: `1px solid ${border}`, color: textColor }}
    >
      <span>{tag.key}: {tag.value}</span>
      {onRemove && (
        <button onClick={onRemove} className="ml-0.5 hover:opacity-70 transition-opacity" aria-label={`Remove tag ${tag.key}`}>
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}

interface TagBadgeListProps {
  tags: TagBadgeTag[];
  maxVisible?: number;
  onRemove?: (index: number) => void;
}

export function TagBadgeList({ tags, maxVisible = 3, onRemove }: TagBadgeListProps) {
  const visible = tags.slice(0, maxVisible);
  const overflow = tags.length - maxVisible;

  return (
    <div className="flex flex-wrap items-center gap-1">
      {visible.map((tag, i) => (
        <TagBadge key={`${tag.key}-${tag.value}`} tag={tag} onRemove={onRemove ? () => onRemove(i) : undefined} />
      ))}
      {overflow > 0 && (
        <Popover>
          <PopoverTrigger asChild>
            <button className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground hover:bg-muted/80">
              +{overflow}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-2" align="start">
            <div className="flex flex-wrap gap-1 max-w-[300px]">
              {tags.slice(maxVisible).map((tag, i) => (
                <TagBadge key={`${tag.key}-${tag.value}`} tag={tag} onRemove={onRemove ? () => onRemove(maxVisible + i) : undefined} />
              ))}
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
