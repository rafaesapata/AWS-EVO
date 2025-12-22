/**
 * Virtualized List Component
 * High-performance list rendering for large datasets
 */

import React, { useMemo, useCallback, useState, useEffect, useRef } from 'react';
import { FixedSizeList as List, VariableSizeList, ListChildComponentProps } from 'react-window';
import { FixedSizeGrid as Grid, GridChildComponentProps } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Search, Filter, SortAsc, SortDesc } from 'lucide-react';
import { cn } from '@/lib/utils';

// Types
export interface VirtualizedListItem {
  id: string;
  [key: string]: any;
}

export interface VirtualizedListProps<T extends VirtualizedListItem> {
  items: T[];
  itemHeight?: number | ((index: number) => number);
  renderItem: (item: T, index: number, style: React.CSSProperties) => React.ReactNode;
  className?: string;
  searchable?: boolean;
  searchFields?: (keyof T)[];
  filterable?: boolean;
  sortable?: boolean;
  sortFields?: (keyof T)[];
  onItemClick?: (item: T, index: number) => void;
  onItemSelect?: (selectedItems: T[]) => void;
  selectable?: boolean;
  multiSelect?: boolean;
  emptyMessage?: string;
  loadingMessage?: string;
  isLoading?: boolean;
  overscan?: number;
  estimatedItemSize?: number;
  threshold?: number;
  onEndReached?: () => void;
  onEndReachedThreshold?: number;
}

export interface VirtualizedGridProps<T extends VirtualizedListItem> {
  items: T[];
  columnCount: number;
  rowHeight: number;
  columnWidth: number;
  renderCell: (item: T | undefined, rowIndex: number, columnIndex: number, style: React.CSSProperties) => React.ReactNode;
  className?: string;
  gap?: number;
}

// Virtualized List Component
export function VirtualizedList<T extends VirtualizedListItem>({
  items,
  itemHeight = 60,
  renderItem,
  className,
  searchable = false,
  searchFields = [],
  filterable = false,
  sortable = false,
  sortFields = [],
  onItemClick,
  onItemSelect,
  selectable = false,
  multiSelect = false,
  emptyMessage = 'Nenhum item encontrado',
  loadingMessage = 'Carregando...',
  isLoading = false,
  overscan = 5,
  estimatedItemSize = 60,
  threshold = 15,
  onEndReached,
  onEndReachedThreshold = 0.8,
}: VirtualizedListProps<T>) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<keyof T | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const listRef = useRef<List>(null);

  // Filtered and sorted items
  const processedItems = useMemo(() => {
    let filtered = items;

    // Search filtering
    if (searchable && searchTerm && searchFields.length > 0) {
      const searchLower = searchTerm.toLowerCase();
      filtered = items.filter(item =>
        searchFields.some(field => {
          const value = item[field];
          return value && String(value).toLowerCase().includes(searchLower);
        })
      );
    }

    // Sorting
    if (sortable && sortField) {
      filtered = [...filtered].sort((a, b) => {
        const aValue = a[sortField];
        const bValue = b[sortField];
        
        if (aValue === bValue) return 0;
        
        let comparison = 0;
        if (aValue > bValue) comparison = 1;
        if (aValue < bValue) comparison = -1;
        
        return sortDirection === 'desc' ? -comparison : comparison;
      });
    }

    return filtered;
  }, [items, searchTerm, searchFields, sortField, sortDirection, searchable, sortable]);

  // Handle item selection
  const handleItemSelect = useCallback((item: T, selected: boolean) => {
    if (!selectable) return;

    setSelectedItems(prev => {
      const newSelected = new Set(prev);
      
      if (selected) {
        if (multiSelect) {
          newSelected.add(item.id);
        } else {
          newSelected.clear();
          newSelected.add(item.id);
        }
      } else {
        newSelected.delete(item.id);
      }
      
      const selectedItemsArray = processedItems.filter(i => newSelected.has(i.id));
      onItemSelect?.(selectedItemsArray);
      
      return newSelected;
    });
  }, [selectable, multiSelect, processedItems, onItemSelect]);

  // Handle sorting
  const handleSort = useCallback((field: keyof T) => {
    if (!sortable) return;
    
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  }, [sortable, sortField]);

  // Infinite scrolling
  const handleItemsRendered = useCallback(({ visibleStopIndex }: any) => {
    if (
      onEndReached &&
      visibleStopIndex >= processedItems.length * onEndReachedThreshold
    ) {
      onEndReached();
    }
  }, [onEndReached, processedItems.length, onEndReachedThreshold]);

  // Item renderer with selection and click handling
  const ItemRenderer = useCallback(({ index, style }: ListChildComponentProps) => {
    const item = processedItems[index];
    if (!item) return null;

    const isSelected = selectedItems.has(item.id);

    return (
      <div
        style={style}
        className={cn(
          'flex items-center px-4 border-b border-border/50 hover:bg-muted/50 transition-colors',
          isSelected && 'bg-primary/10',
          onItemClick && 'cursor-pointer'
        )}
        onClick={() => onItemClick?.(item, index)}
      >
        {selectable && (
          <input
            type={multiSelect ? 'checkbox' : 'radio'}
            checked={isSelected}
            onChange={(e) => handleItemSelect(item, e.target.checked)}
            className="mr-3"
            onClick={(e) => e.stopPropagation()}
          />
        )}
        {renderItem(item, index, style)}
      </div>
    );
  }, [processedItems, selectedItems, selectable, multiSelect, onItemClick, renderItem, handleItemSelect]);

  // Variable size item renderer
  const getItemSize = useCallback((index: number) => {
    if (typeof itemHeight === 'function') {
      return itemHeight(index);
    }
    return itemHeight;
  }, [itemHeight]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">{loadingMessage}</div>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Controls */}
      {(searchable || sortable) && (
        <div className="flex items-center gap-4 p-4 border-b">
          {searchable && (
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          )}
          
          {sortable && sortFields.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Ordenar por:</span>
              {sortFields.map(field => (
                <Button
                  key={String(field)}
                  variant={sortField === field ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleSort(field)}
                  className="flex items-center gap-1"
                >
                  {String(field)}
                  {sortField === field && (
                    sortDirection === 'asc' ? 
                      <SortAsc className="h-3 w-3" /> : 
                      <SortDesc className="h-3 w-3" />
                  )}
                </Button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Selection info */}
      {selectable && selectedItems.size > 0 && (
        <div className="flex items-center justify-between p-2 bg-muted/50 border-b">
          <span className="text-sm text-muted-foreground">
            {selectedItems.size} item(s) selecionado(s)
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedItems(new Set())}
          >
            Limpar seleção
          </Button>
        </div>
      )}

      {/* List */}
      <div className="flex-1">
        {processedItems.length === 0 ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-muted-foreground">{emptyMessage}</div>
          </div>
        ) : (
          <AutoSizer>
            {({ height, width }) => (
              typeof itemHeight === 'function' ? (
                <VariableSizeList
                  ref={listRef}
                  height={height}
                  width={width}
                  itemCount={processedItems.length}
                  itemSize={getItemSize}
                  overscanCount={overscan}
                  onItemsRendered={handleItemsRendered}
                  estimatedItemSize={estimatedItemSize}
                >
                  {ItemRenderer}
                </VariableSizeList>
              ) : (
                <List
                  ref={listRef}
                  height={height}
                  width={width}
                  itemCount={processedItems.length}
                  itemSize={itemHeight}
                  overscanCount={overscan}
                  onItemsRendered={handleItemsRendered}
                >
                  {ItemRenderer}
                </List>
              )
            )}
          </AutoSizer>
        )}
      </div>

      {/* Stats */}
      <div className="flex items-center justify-between p-2 border-t text-xs text-muted-foreground">
        <span>
          Mostrando {processedItems.length} de {items.length} itens
        </span>
        {searchTerm && (
          <Badge variant="secondary" className="text-xs">
            Filtrado: "{searchTerm}"
          </Badge>
        )}
      </div>
    </div>
  );
}

// Virtualized Grid Component
export function VirtualizedGrid<T extends VirtualizedListItem>({
  items,
  columnCount,
  rowHeight,
  columnWidth,
  renderCell,
  className,
  gap = 0,
}: VirtualizedGridProps<T>) {
  const rowCount = Math.ceil(items.length / columnCount);

  const CellRenderer = useCallback(({ columnIndex, rowIndex, style }: GridChildComponentProps) => {
    const itemIndex = rowIndex * columnCount + columnIndex;
    const item = items[itemIndex];

    const cellStyle = {
      ...style,
      left: (style.left as number) + (columnIndex * gap),
      top: (style.top as number) + (rowIndex * gap),
      width: (style.width as number) - gap,
      height: (style.height as number) - gap,
    };

    return renderCell(item, rowIndex, columnIndex, cellStyle);
  }, [items, columnCount, gap, renderCell]);

  return (
    <div className={cn('h-full', className)}>
      <AutoSizer>
        {({ height, width }) => (
          <Grid
            height={height}
            width={width}
            columnCount={columnCount}
            columnWidth={columnWidth + gap}
            rowCount={rowCount}
            rowHeight={rowHeight + gap}
            overscanRowCount={2}
            overscanColumnCount={2}
          >
            {CellRenderer}
          </Grid>
        )}
      </AutoSizer>
    </div>
  );
}

// Specialized components for common use cases

// Findings List
export interface Finding extends VirtualizedListItem {
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  service: string;
  status: string;
  createdAt: string;
}

export function VirtualizedFindingsList({
  findings,
  onFindingClick,
  ...props
}: Omit<VirtualizedListProps<Finding>, 'items' | 'renderItem'> & {
  findings: Finding[];
  onFindingClick?: (finding: Finding) => void;
}) {
  const renderFinding = useCallback((finding: Finding, index: number, style: React.CSSProperties) => (
    <div className="flex items-center justify-between w-full py-2">
      <div className="flex items-center gap-3">
        <Badge 
          variant={finding.severity === 'critical' ? 'destructive' : 
                  finding.severity === 'high' ? 'destructive' : 
                  finding.severity === 'medium' ? 'default' : 'secondary'}
        >
          {finding.severity}
        </Badge>
        <div>
          <p className="font-medium text-sm">{finding.description}</p>
          <p className="text-xs text-muted-foreground">{finding.service}</p>
        </div>
      </div>
      <div className="text-right">
        <Badge variant="outline">{finding.status}</Badge>
        <p className="text-xs text-muted-foreground mt-1">
          {new Date(finding.createdAt).toLocaleDateString()}
        </p>
      </div>
    </div>
  ), []);

  return (
    <VirtualizedList
      items={findings}
      renderItem={renderFinding}
      onItemClick={onFindingClick}
      searchable
      searchFields={['description', 'service']}
      sortable
      sortFields={['severity', 'createdAt', 'service']}
      itemHeight={80}
      {...props}
    />
  );
}

// AWS Accounts List
export interface AWSAccount extends VirtualizedListItem {
  accountName: string;
  accountId: string;
  status: string;
  region: string;
  lastSync: string;
}

export function VirtualizedAWSAccountsList({
  accounts,
  onAccountClick,
  ...props
}: Omit<VirtualizedListProps<AWSAccount>, 'items' | 'renderItem'> & {
  accounts: AWSAccount[];
  onAccountClick?: (account: AWSAccount) => void;
}) {
  const renderAccount = useCallback((account: AWSAccount, index: number, style: React.CSSProperties) => (
    <div className="flex items-center justify-between w-full py-2">
      <div>
        <p className="font-medium">{account.accountName}</p>
        <p className="text-sm text-muted-foreground">{account.accountId}</p>
      </div>
      <div className="text-right">
        <Badge variant={account.status === 'active' ? 'default' : 'secondary'}>
          {account.status}
        </Badge>
        <p className="text-xs text-muted-foreground mt-1">
          {account.region} • {new Date(account.lastSync).toLocaleDateString()}
        </p>
      </div>
    </div>
  ), []);

  return (
    <VirtualizedList
      items={accounts}
      renderItem={renderAccount}
      onItemClick={onAccountClick}
      searchable
      searchFields={['accountName', 'accountId']}
      sortable
      sortFields={['accountName', 'status', 'lastSync']}
      itemHeight={70}
      {...props}
    />
  );
}

// Performance monitoring hook
export function useVirtualizedListPerformance(listName: string) {
  const renderCount = useRef(0);
  const startTime = useRef(Date.now());

  useEffect(() => {
    renderCount.current += 1;
    
    // Log performance metrics every 10 renders
    if (renderCount.current % 10 === 0) {
      const duration = Date.now() - startTime.current;
      console.log(`VirtualizedList ${listName} - ${renderCount.current} renders in ${duration}ms`);
      
      // Reset counters
      renderCount.current = 0;
      startTime.current = Date.now();
    }
  });

  return {
    renderCount: renderCount.current,
    averageRenderTime: (Date.now() - startTime.current) / Math.max(renderCount.current, 1)
  };
}