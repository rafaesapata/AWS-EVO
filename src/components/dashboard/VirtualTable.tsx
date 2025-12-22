import { useRef, useState, useEffect, useMemo } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface VirtualTableProps<T> {
  data: T[];
  columns: {
    key: keyof T | string;
    header: string;
    render?: (item: T) => React.ReactNode;
  }[];
  rowHeight?: number;
  overscan?: number;
  className?: string;
}

export default function VirtualTable<T extends { id: string }>({
  data,
  columns,
  rowHeight = 60,
  overscan = 5,
  className,
}: VirtualTableProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(600);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      setScrollTop(container.scrollTop);
    };

    const handleResize = () => {
      setContainerHeight(container.clientHeight);
    };

    container.addEventListener('scroll', handleScroll);
    window.addEventListener('resize', handleResize);
    handleResize();

    return () => {
      container.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const { visibleRange, totalHeight, offsetY } = useMemo(() => {
    const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
    const endIndex = Math.min(
      data.length,
      Math.ceil((scrollTop + containerHeight) / rowHeight) + overscan
    );

    return {
      visibleRange: [startIndex, endIndex] as const,
      totalHeight: data.length * rowHeight,
      offsetY: startIndex * rowHeight,
    };
  }, [scrollTop, containerHeight, data.length, rowHeight, overscan]);

  const visibleData = data.slice(visibleRange[0], visibleRange[1]);

  return (
    <div
      ref={containerRef}
      className={`relative overflow-auto ${className}`}
      style={{ height: containerHeight }}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div style={{ transform: `translateY(${offsetY}px)` }}>
          <Table>
            <TableHeader className="sticky top-0 bg-background z-10">
              <TableRow>
                {columns.map((column, i) => (
                  <TableHead key={i}>{column.header}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleData.map((item) => (
                <TableRow key={item.id}>
                  {columns.map((column, i) => (
                    <TableCell key={i}>
                      {column.render
                        ? column.render(item)
                        : String((item as any)[column.key] || '')}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}