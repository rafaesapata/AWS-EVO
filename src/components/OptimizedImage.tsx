/**
 * Optimized Image Component
 * Provides lazy loading, WebP support, and responsive images
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { logger } from '@/lib/logging';
import { metricsCollector } from '@/lib/metrics-collector';

export interface OptimizedImageProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src' | 'srcSet'> {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  quality?: number;
  format?: 'webp' | 'avif' | 'auto';
  sizes?: string;
  priority?: boolean; // Disable lazy loading for above-the-fold images
  placeholder?: 'blur' | 'empty' | string; // Base64 blur placeholder
  fallback?: string; // Fallback image URL
  onLoad?: () => void;
  onError?: (error: Event) => void;
  className?: string;
  containerClassName?: string;
  aspectRatio?: number; // width/height ratio
  objectFit?: 'contain' | 'cover' | 'fill' | 'none' | 'scale-down';
  loading?: 'lazy' | 'eager';
  crossOrigin?: 'anonymous' | 'use-credentials';
}

interface ImageState {
  isLoaded: boolean;
  isLoading: boolean;
  hasError: boolean;
  currentSrc: string;
}

/**
 * Generate responsive image URLs
 */
function generateResponsiveUrls(
  src: string,
  width?: number,
  quality: number = 75,
  format: string = 'auto'
): {
  webp?: string;
  avif?: string;
  original: string;
  srcSet?: string;
} {
  // If it's already a data URL or external URL, return as-is
  if (src.startsWith('data:') || src.startsWith('http')) {
    return { original: src };
  }

  const baseUrl = src.replace(/\.[^/.]+$/, ''); // Remove extension
  const extension = src.match(/\.[^/.]+$/)?.[0] || '.jpg';

  // Generate different formats
  const urls = {
    original: src,
    webp: undefined as string | undefined,
    avif: undefined as string | undefined,
    srcSet: undefined as string | undefined,
  };

  // Generate WebP and AVIF versions if format is auto or specified
  if (format === 'auto' || format === 'webp') {
    urls.webp = `${baseUrl}.webp`;
  }
  
  if (format === 'auto' || format === 'avif') {
    urls.avif = `${baseUrl}.avif`;
  }

  // Generate srcSet for responsive images
  if (width) {
    const sizes = [0.5, 1, 1.5, 2].map(multiplier => {
      const size = Math.round(width * multiplier);
      return `${baseUrl}-${size}w${extension} ${size}w`;
    });
    urls.srcSet = sizes.join(', ');
  }

  return urls;
}

/**
 * Intersection Observer hook for lazy loading
 */
function useIntersectionObserver(
  elementRef: React.RefObject<Element>,
  options: IntersectionObserverInit = {}
): boolean {
  const [isIntersecting, setIsIntersecting] = useState(false);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsIntersecting(true);
          observer.disconnect();
        }
      },
      {
        rootMargin: '50px',
        threshold: 0.1,
        ...options,
      }
    );

    observer.observe(element);

    return () => observer.disconnect();
  }, [elementRef, options]);

  return isIntersecting;
}

/**
 * Image loading hook
 */
function useImageLoader(
  src: string,
  shouldLoad: boolean,
  fallback?: string
): ImageState {
  const [state, setState] = useState<ImageState>({
    isLoaded: false,
    isLoading: false,
    hasError: false,
    currentSrc: src,
  });

  const loadImage = useCallback((imageSrc: string) => {
    setState(prev => ({ ...prev, isLoading: true, hasError: false }));

    const img = new Image();
    const startTime = Date.now();

    img.onload = () => {
      const loadTime = Date.now() - startTime;
      
      metricsCollector.record('image_load_success', 1, {
        format: imageSrc.includes('.webp') ? 'webp' : 
               imageSrc.includes('.avif') ? 'avif' : 'original',
        loadTime: loadTime.toString(),
      });

      setState({
        isLoaded: true,
        isLoading: false,
        hasError: false,
        currentSrc: imageSrc,
      });
    };

    img.onerror = () => {
      const loadTime = Date.now() - startTime;
      
      logger.warn('Image failed to load', {
        src: imageSrc,
        loadTime,
      });

      metricsCollector.record('image_load_error', 1, {
        format: imageSrc.includes('.webp') ? 'webp' : 
               imageSrc.includes('.avif') ? 'avif' : 'original',
      });

      // Try fallback if available
      if (fallback && imageSrc !== fallback) {
        loadImage(fallback);
      } else {
        setState(prev => ({
          ...prev,
          isLoading: false,
          hasError: true,
        }));
      }
    };

    img.src = imageSrc;
  }, [fallback]);

  useEffect(() => {
    if (shouldLoad && !state.isLoaded && !state.isLoading) {
      loadImage(src);
    }
  }, [shouldLoad, src, state.isLoaded, state.isLoading, loadImage]);

  return state;
}

/**
 * Optimized Image Component
 */
export const OptimizedImage: React.FC<OptimizedImageProps> = ({
  src,
  alt,
  width,
  height,
  quality = 75,
  format = 'auto',
  sizes,
  priority = false,
  placeholder = 'empty',
  fallback,
  onLoad,
  onError,
  className,
  containerClassName,
  aspectRatio,
  objectFit = 'cover',
  loading = 'lazy',
  crossOrigin,
  ...props
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const isIntersecting = useIntersectionObserver(containerRef, {
    rootMargin: '50px',
  });

  const shouldLoad = priority || isIntersecting;
  const imageUrls = generateResponsiveUrls(src, width, quality, format);
  const imageState = useImageLoader(imageUrls.original, shouldLoad, fallback);

  // Calculate container styles
  const containerStyle: React.CSSProperties = {
    position: 'relative',
    overflow: 'hidden',
    ...(aspectRatio && {
      aspectRatio: aspectRatio.toString(),
    }),
    ...(width && height && !aspectRatio && {
      width,
      height,
    }),
  };

  // Calculate image styles
  const imageStyle: React.CSSProperties = {
    objectFit,
    transition: 'opacity 0.3s ease-in-out',
    opacity: imageState.isLoaded ? 1 : 0,
    ...(width && { width: '100%' }),
    ...(height && { height: '100%' }),
  };

  // Handle load event
  const handleLoad = useCallback(() => {
    onLoad?.();
  }, [onLoad]);

  // Handle error event
  const handleError = useCallback((event: React.SyntheticEvent<HTMLImageElement>) => {
    onError?.(event.nativeEvent);
  }, [onError]);

  // Render placeholder
  const renderPlaceholder = () => {
    if (placeholder === 'empty') return null;
    
    if (placeholder === 'blur') {
      return (
        <div
          className="absolute inset-0 bg-gray-200 animate-pulse"
          style={{
            backgroundImage: 'linear-gradient(45deg, transparent 25%, rgba(255,255,255,0.5) 25%, rgba(255,255,255,0.5) 75%, transparent 75%), linear-gradient(45deg, transparent 25%, rgba(255,255,255,0.5) 25%, rgba(255,255,255,0.5) 75%, transparent 75%)',
            backgroundSize: '20px 20px',
            backgroundPosition: '0 0, 10px 10px',
          }}
        />
      );
    }

    if (typeof placeholder === 'string' && placeholder.startsWith('data:')) {
      return (
        <img
          src={placeholder}
          alt=""
          className="absolute inset-0 w-full h-full object-cover filter blur-sm scale-110"
          style={{ opacity: imageState.isLoaded ? 0 : 1 }}
        />
      );
    }

    return null;
  };

  // Render error state
  const renderError = () => {
    if (!imageState.hasError) return null;

    return (
      <div className="absolute inset-0 flex items-center justify-center bg-gray-100 text-gray-400">
        <div className="text-center">
          <svg
            className="mx-auto h-8 w-8 mb-2"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
          <p className="text-xs">Imagem não encontrada</p>
        </div>
      </div>
    );
  };

  // Render loading state
  const renderLoading = () => {
    if (!imageState.isLoading) return null;

    return (
      <div className="absolute inset-0 flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-400" />
      </div>
    );
  };

  return (
    <div
      ref={containerRef}
      className={cn('relative', containerClassName)}
      style={containerStyle}
    >
      {renderPlaceholder()}
      {renderLoading()}
      {renderError()}
      
      {shouldLoad && !imageState.hasError && (
        <picture>
          {/* AVIF source */}
          {imageUrls.avif && (
            <source
              srcSet={imageUrls.avif}
              type="image/avif"
              sizes={sizes}
            />
          )}
          
          {/* WebP source */}
          {imageUrls.webp && (
            <source
              srcSet={imageUrls.webp}
              type="image/webp"
              sizes={sizes}
            />
          )}
          
          {/* Original image */}
          <img
            src={imageState.currentSrc}
            srcSet={imageUrls.srcSet}
            alt={alt}
            className={cn('block', className)}
            style={imageStyle}
            sizes={sizes}
            loading={priority ? 'eager' : loading}
            crossOrigin={crossOrigin}
            onLoad={handleLoad}
            onError={handleError}
            {...props}
          />
        </picture>
      )}
    </div>
  );
};

/**
 * Avatar component with optimized image
 */
export interface OptimizedAvatarProps extends Omit<OptimizedImageProps, 'aspectRatio' | 'objectFit'> {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  fallbackText?: string;
}

export const OptimizedAvatar: React.FC<OptimizedAvatarProps> = ({
  size = 'md',
  fallbackText,
  className,
  ...props
}) => {
  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-12 h-12',
    xl: 'w-16 h-16',
  };

  const textSizeClasses = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
    xl: 'text-lg',
  };

  return (
    <div className={cn('relative rounded-full overflow-hidden', sizeClasses[size], className)}>
      <OptimizedImage
        {...props}
        aspectRatio={1}
        objectFit="cover"
        className="w-full h-full"
        fallback={fallbackText ? undefined : '/default-avatar.png'}
      />
      
      {fallbackText && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-200 text-gray-600">
          <span className={cn('font-medium', textSizeClasses[size])}>
            {fallbackText.charAt(0).toUpperCase()}
          </span>
        </div>
      )}
    </div>
  );
};

/**
 * Logo component with optimized image
 */
export interface OptimizedLogoProps extends Omit<OptimizedImageProps, 'alt'> {
  variant?: 'light' | 'dark' | 'auto';
  size?: 'sm' | 'md' | 'lg';
}

export const OptimizedLogo: React.FC<OptimizedLogoProps> = ({
  variant = 'auto',
  size = 'md',
  className,
  ...props
}) => {
  const sizeClasses = {
    sm: 'h-6',
    md: 'h-8',
    lg: 'h-12',
  };

  // Determine logo variant based on theme
  const logoSrc = variant === 'auto' 
    ? '/logo-auto.svg' // SVG that adapts to theme
    : variant === 'dark'
    ? '/logo-dark.svg'
    : '/logo-light.svg';

  return (
    <OptimizedImage
      {...props}
      src={logoSrc}
      alt="EVO Logo"
      className={cn('w-auto', sizeClasses[size], className)}
      priority
      loading="eager"
    />
  );
};

/**
 * Background image component
 */
export interface OptimizedBackgroundProps extends Omit<OptimizedImageProps, 'objectFit'> {
  overlay?: boolean;
  overlayOpacity?: number;
  children?: React.ReactNode;
}

export const OptimizedBackground: React.FC<OptimizedBackgroundProps> = ({
  overlay = false,
  overlayOpacity = 0.5,
  children,
  className,
  containerClassName,
  ...props
}) => {
  return (
    <div className={cn('relative', containerClassName)}>
      <OptimizedImage
        {...props}
        className={cn('absolute inset-0 w-full h-full', className)}
        objectFit="cover"
      />
      
      {overlay && (
        <div
          className="absolute inset-0 bg-black"
          style={{ opacity: overlayOpacity }}
        />
      )}
      
      {children && (
        <div className="relative z-10">
          {children}
        </div>
      )}
    </div>
  );
};

/**
 * Image gallery component with lazy loading
 */
export interface OptimizedGalleryProps {
  images: Array<{
    src: string;
    alt: string;
    caption?: string;
  }>;
  columns?: number;
  gap?: number;
  onImageClick?: (index: number) => void;
}

export const OptimizedGallery: React.FC<OptimizedGalleryProps> = ({
  images,
  columns = 3,
  gap = 4,
  onImageClick,
}) => {
  return (
    <div
      className="grid"
      style={{
        gridTemplateColumns: `repeat(${columns}, 1fr)`,
        gap: `${gap * 0.25}rem`,
      }}
    >
      {images.map((image, index) => (
        <div
          key={index}
          className="relative cursor-pointer group"
          onClick={() => onImageClick?.(index)}
        >
          <OptimizedImage
            src={image.src}
            alt={image.alt}
            aspectRatio={1}
            className="w-full h-full transition-transform group-hover:scale-105"
            placeholder="blur"
          />
          
          {image.caption && (
            <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-50 text-white p-2 text-sm opacity-0 group-hover:opacity-100 transition-opacity">
              {image.caption}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default OptimizedImage;