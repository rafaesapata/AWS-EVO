import { useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Plus, Search } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { TagBadge } from './TagBadge';
import { useTagList, useCreateTag, type Tag } from '@/hooks/useTags';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

const PREDEFINED_COLORS = [
  '#EF4444', '#F97316', '#F59E0B', '#84CC16',
  '#22C55E', '#14B8A6', '#06B6D4', '#3B82F6',
  '#6366F1', '#8B5CF6', '#EC4899', '#64748B',
];

const CATEGORIES = ['COST_CENTER', 'ENVIRONMENT', 'TEAM', 'PROJECT', 'COMPLIANCE', 'CRITICALITY', 'CUSTOM'] as const;

interface TagSelectorProps {
  assignedTags: Tag[];
  onAssign: (tagId: string) => void;
  onUnassign: (tagId: string) => void;
  onCreateAndAssign?: (tag: Tag) => void;
}

export function TagSelector({ assignedTags, onAssign, onUnassign, onCreateAndAssign }: TagSelectorProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const debouncedSearch = useDebouncedValue(search, 150);

  const { data: tagData } = useTagList({ search: debouncedSearch || undefined, limit: 50 });
  const createTag = useCreateTag();

  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [newColor, setNewColor] = useState(PREDEFINED_COLORS[0]);
  const [newCategory, setNewCategory] = useState<string>('CUSTOM');

  const assignedIds = useMemo(() => new Set(assignedTags.map((t) => t.id)), [assignedTags]);
  const tags = tagData?.tags || [];

  const handleSearchChange = useCallback((val: string) => {
    setSearch(val);
    if (val.includes(':')) {
      const [k, v] = val.split(':');
      setNewKey(k.trim());
      setNewValue(v?.trim() || '');
    }
  }, []);

  const handleCreate = useCallback(async () => {
    if (!newKey) return;
    try {
      const result = await createTag.mutateAsync({
        key: newKey.toLowerCase().trim(),
        value: (newValue || '').toLowerCase().trim(),
        color: newColor,
        category: newCategory,
      });
      onCreateAndAssign?.(result);
      setShowCreate(false);
      setNewKey('');
      setNewValue('');
      setSearch('');
    } catch {
      // error handled by mutation
    }
  }, [newKey, newValue, newColor, newCategory, createTag, onCreateAndAssign]);

  const noMatch = tags.length === 0 && debouncedSearch.length > 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="glass hover-glow gap-1 h-7 text-xs">
          <Plus className="h-3 w-3" />
          {t('tags.addTag', 'Add Tag')}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <div className="p-2 border-b">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder={t('tags.searchTags', 'Search tags...')}
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-8 h-8 text-sm"
              autoFocus
            />
          </div>
        </div>

        {!showCreate ? (
          <ScrollArea className="max-h-[240px]">
            <div className="p-1">
              {tags.map((tag) => {
                const isAssigned = assignedIds.has(tag.id);
                return (
                  <button
                    key={tag.id}
                    className="flex items-center gap-2 w-full px-2 py-1.5 rounded-sm text-sm hover:bg-accent transition-colors"
                    onClick={() => isAssigned ? onUnassign(tag.id) : onAssign(tag.id)}
                  >
                    <div className="w-4 h-4 flex items-center justify-center">
                      {isAssigned && <Check className="h-3.5 w-3.5 text-primary" />}
                    </div>
                    <TagBadge tag={tag} size="sm" />
                    {tag.usage_count !== undefined && (
                      <span className="ml-auto text-xs text-muted-foreground">{tag.usage_count}</span>
                    )}
                  </button>
                );
              })}
              {noMatch && (
                <button
                  className="flex items-center gap-2 w-full px-2 py-1.5 rounded-sm text-sm hover:bg-accent text-primary"
                  onClick={() => setShowCreate(true)}
                >
                  <Plus className="h-3.5 w-3.5" />
                  {t('tags.createNew', "Create '{{search}}'", { search })}
                </button>
              )}
            </div>
          </ScrollArea>
        ) : (
          <div className="p-3 space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">{t('tags.key', 'Key')}</Label>
              <Input value={newKey} onChange={(e) => setNewKey(e.target.value)} className="h-7 text-sm" placeholder="environment" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t('tags.value', 'Value')}</Label>
              <Input value={newValue} onChange={(e) => setNewValue(e.target.value)} className="h-7 text-sm" placeholder="production" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t('tags.color', 'Color')}</Label>
              <div className="flex flex-wrap gap-1.5">
                {PREDEFINED_COLORS.map((c) => (
                  <button
                    key={c}
                    className={`w-5 h-5 rounded-full border-2 transition-all ${newColor === c ? 'border-primary scale-110' : 'border-transparent'}`}
                    style={{ backgroundColor: c }}
                    onClick={() => setNewColor(c)}
                    aria-label={c}
                  />
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t('tags.category', 'Category')}</Label>
              <Select value={newCategory} onValueChange={setNewCategory}>
                <SelectTrigger className="h-7 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{c.replace('_', ' ')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" className="h-7 text-xs flex-1" onClick={() => setShowCreate(false)}>
                {t('common.cancel', 'Cancel')}
              </Button>
              <Button size="sm" className="h-7 text-xs flex-1 glass hover-glow" onClick={handleCreate} disabled={!newKey || createTag.isPending}>
                {t('tags.create', 'Create')}
              </Button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
