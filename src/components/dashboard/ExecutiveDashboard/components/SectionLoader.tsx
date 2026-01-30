/**
 * Section Loader Component
 * Provides granular loading states for individual dashboard sections
 * Allows progressive loading where each section can show its skeleton
 * while data is being fetched
 */

import { ReactNode } from 'react';

interface SectionLoaderProps {
  /** Whether the section is loading */
  isLoading: boolean;
  /** The skeleton component to show while loading */
  skeleton: ReactNode;
  /** The actual content to show when loaded */
  children: ReactNode;
  /** Optional: Minimum height to prevent layout shift */
  minHeight?: string;
  /** Optional: Delay before showing skeleton (prevents flash) */
  delay?: number;
}

/**
 * Wraps a section with loading state management
 * Shows skeleton while loading, then transitions to content
 */
export function SectionLoader({ 
  isLoading, 
  skeleton, 
  children,
  minHeight,
}: SectionLoaderProps) {
  if (isLoading) {
    return (
      <div style={{ minHeight }} className="animate-pulse">
        {skeleton}
      </div>
    );
  }

  return (
    <div style={{ minHeight }} className="animate-in fade-in duration-300">
      {children}
    </div>
  );
}

/**
 * Card-level loader for individual cards within a section
 * Useful when cards load independently
 */
interface CardLoaderProps {
  isLoading: boolean;
  skeleton: ReactNode;
  children: ReactNode;
  className?: string;
}

export function CardLoader({ 
  isLoading, 
  skeleton, 
  children,
  className = '',
}: CardLoaderProps) {
  if (isLoading) {
    return <div className={className}>{skeleton}</div>;
  }

  return (
    <div className={`${className} animate-in fade-in duration-200`}>
      {children}
    </div>
  );
}

/**
 * Progressive loader that shows content as it becomes available
 * Useful for sections where data arrives in chunks
 */
interface ProgressiveLoaderProps {
  /** Data availability flags for each section */
  sections: {
    id: string;
    isLoaded: boolean;
    skeleton: ReactNode;
    content: ReactNode;
  }[];
  /** Layout class for the container */
  className?: string;
}

export function ProgressiveLoader({ sections, className = '' }: ProgressiveLoaderProps) {
  return (
    <div className={className}>
      {sections.map((section) => (
        <div key={section.id} className="transition-all duration-300">
          {section.isLoaded ? (
            <div className="animate-in fade-in duration-300">
              {section.content}
            </div>
          ) : (
            <div className="animate-pulse">
              {section.skeleton}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default SectionLoader;
