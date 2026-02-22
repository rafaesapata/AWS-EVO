import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Filter, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { TagBadge } from './TagBadge';
import { useTagList, type Tag } from '@/hooks/useTags';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

interface TagFilterBarProps {
  onFilterChange: (tagIds: string[]) => void;
  syncWithUrl?: boolean;
  showCloudFilter?: boolean;
}

export function TagFilterBar({ onFilterChange, syncWithUrl = true, showCloudFilter = false }: TagFilterBarProps) {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 150);

  const [selectedTags, setSelectedTags] = useState<Tag[]>(() => {
    return [];
  });

  // Check if URL has tag filters that need initial sync
  const urlTagIds = syncWithUrl ? searchParams.get('tags') : null;
  const needsUrlSync = urlTagIds && selectedTags.length === 0;

  // Fetch tags when popover is open OR when URL has tags that need syncing
  const { data: tagData } = useTagList({ search: debouncedSearch || undefined, limit: 30, enabled: open || !!needsUrlSync });
  const tags = tagData?.tags || [];

  // Sync from URL on mount — also call onFilterChange so parent gets the IDs
  useEffect(() => {
    if (!syncWithUrl) return;
    const urlTags = searchParams.get('tags');
    if (urlTags && tags.length > 0) {
      const ids = urlTags.split(',');
      const matched = tags.filter((t) => ids.includes(t.id));
      if (matched.length > 0 && matched.length !== selectedTags.length) {
        setSelectedTags(matched);
        onFilterChange(matched.map((t) => t.id));
      }
    }
  }, [syncWithUrl, searchParams, tags]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateFilters = useCallback((newTags: Tag[]) => {
    setSelectedTags(newTags);
    const ids = newTags.map((t) => t.id);
    onFilterChange(ids);
    if (syncWithUrl) {
      const params = new URLSearchParams(searchParams);
      if (ids.length > 0) {
        params.set('tags', ids.join(','));
      } else {
        params.delete('tags');
      }
      setSearchParams(params, { replace: true });
    }
  }, [onFilterChange, syncWithUrl, searchParams, setSearchParams]);

  const addTag = useCallback((tag: Tag) => {
    if (selectedTags.find((t) => t.id === tag.id)) return;
    updateFilters([...selectedTags, tag]);
    setOpen(false);
    setSearch('');
  }, [selectedTags, updateFilters]);

  const removeTag = useCallback((tagId: string) => {
    updateFilters(selectedTags.filter((t) => t.id !== tagId));
  }, [selectedTags, updateFilters]);

  const clearAll = useCallback(() => {
    updateFilters([]);
  }, [updateFilters]);

  const [cloudFilter, setCloudFilter] = useState<string | null>(null);

  const selectedIds = new Set(selectedTags.map((t) => t.id));

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {showCloudFilter && (
        <div className="flex items-center gap-1 mr-1">
          <button
            onClick={() => setCloudFilter(cloudFilter === 'aws' ? null : 'aws')}
            className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold transition-colors ${
              cloudFilter === 'aws' ? 'bg-orange-500 text-white' : 'bg-orange-100 text-orange-700 hover:bg-orange-200'
            }`}
          >
            AWS
          </button>
          <button
            onClick={() => setCloudFilter(cloudFilter === 'azure' ? null : 'azure')}
            className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold transition-colors ${
              cloudFilter === 'azure' ? 'bg-blue-600 text-white' : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
            }`}
          >
            AZ
          </button>
        </div>
      )}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Filter className="h-3 w-3" />
              {t('tags.filterByTag', 'Filter by tag:')}
            </span>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">{t('tags.andLogicTooltip', 'Showing resources matching ALL selected tags')}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {selectedTags.map((tag) => (
        <TagBadge key={tag.id} tag={tag} onRemove={() => removeTag(tag.id)} size="sm" />
      ))}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-6 text-xs px-2 gap-1">
            <Filter className="h-3 w-3" />
            {t('tags.addFilter', '+ Filter')}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-0" align="start">
          <div className="p-2 border-b">
            <Input
              placeholder={t('tags.searchTags', 'Search tags...')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-7 text-sm"
              autoFocus
            />
          </div>
          <ScrollArea className="max-h-[200px]">
            <div className="p-1">
              {tags.filter((t) => !selectedIds.has(t.id)).map((tag) => (
                <button
                  key={tag.id}
                  className="flex items-center gap-2 w-full px-2 py-1.5 rounded-sm text-sm hover:bg-accent transition-colors"
                  onClick={() => addTag(tag)}
                >
                  <TagBadge tag={tag} size="sm" />
                </button>
              ))}
              {tags.filter((t) => !selectedIds.has(t.id)).length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-2">{t('tags.noTags', 'No tags found')}</p>
              )}
            </div>
          </ScrollArea>
        </PopoverContent>
      </Popover>

      {selectedTags.length > 0 && (
        <button onClick={clearAll} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5">
          <X className="h-3 w-3" />
          {t('tags.clearAll', 'Clear all')}
        </button>
      )}
    </div>
  );
}
