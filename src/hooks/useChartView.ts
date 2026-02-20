import { useState, useCallback } from 'react';

export type ChartViewType = 'bar' | 'line' | 'area' | 'pie' | 'table';

interface UseChartViewOptions {
  defaultView?: ChartViewType;
  availableViews?: ChartViewType[];
  storageKey?: string;
}

export function useChartView({
  defaultView = 'bar',
  availableViews = ['bar', 'line', 'area', 'pie', 'table'],
  storageKey,
}: UseChartViewOptions = {}) {
  const [view, setView] = useState<ChartViewType>(() => {
    if (storageKey) {
      const saved = localStorage.getItem(`chart-view-${storageKey}`);
      if (saved && availableViews.includes(saved as ChartViewType)) {
        return saved as ChartViewType;
      }
    }
    return defaultView;
  });

  const changeView = useCallback((newView: ChartViewType) => {
    setView(newView);
    if (storageKey) {
      localStorage.setItem(`chart-view-${storageKey}`, newView);
    }
  }, [storageKey]);

  return { view, changeView, availableViews };
}
