/**
 * Loading State Management Hook
 * Provides consistent loading state patterns across the application
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { ErrorHandler, AppError } from '@/lib/error-handler';

export interface LoadingState {
  isLoading: boolean;
  error: AppError | null;
  data: any;
}

export interface LoadingOptions {
  minLoadingTime?: number; // Minimum loading time in ms
  showLoadingAfter?: number; // Show loading indicator after X ms
  retryCount?: number;
  retryDelay?: number;
  onSuccess?: (data: any) => void;
  onError?: (error: AppError) => void;
}

/**
 * Enhanced loading state hook with smart loading indicators
 */
export function useLoadingState<T = any>(
  initialData: T | null = null,
  options: LoadingOptions = {}
) {
  const {
    minLoadingTime = 300,
    showLoadingAfter = 200,
    retryCount = 0,
    retryDelay = 1000,
    onSuccess,
    onError,
  } = options;

  const [state, setState] = useState<LoadingState>({
    isLoading: false,
    error: null,
    data: initialData,
  });

  const [showLoading, setShowLoading] = useState(false);
  const loadingTimeoutRef = useRef<NodeJS.Timeout>();
  const minTimeoutRef = useRef<NodeJS.Timeout>();
  const retryTimeoutRef = useRef<NodeJS.Timeout>();
  const startTimeRef = useRef<number>();

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
      if (minTimeoutRef.current) clearTimeout(minTimeoutRef.current);
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
    };
  }, []);

  const execute = useCallback(async (
    operation: () => Promise<T>,
    currentRetry = 0
  ): Promise<T | null> => {
    try {
      // Clear any existing timeouts
      if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
      if (minTimeoutRef.current) clearTimeout(minTimeoutRef.current);

      startTimeRef.current = Date.now();

      // Set loading state immediately
      setState(prev => ({ ...prev, isLoading: true, error: null }));

      // Show loading indicator after delay
      loadingTimeoutRef.current = setTimeout(() => {
        setShowLoading(true);
      }, showLoadingAfter);

      // Execute the operation
      const result = await operation();

      // Ensure minimum loading time for better UX
      const elapsed = Date.now() - startTimeRef.current;
      const remainingTime = Math.max(0, minLoadingTime - elapsed);

      const finishLoading = () => {
        setState({
          isLoading: false,
          error: null,
          data: result,
        });
        setShowLoading(false);
        onSuccess?.(result);
      };

      if (remainingTime > 0) {
        minTimeoutRef.current = setTimeout(finishLoading, remainingTime);
      } else {
        finishLoading();
      }

      return result;

    } catch (error) {
      const appError = ErrorHandler.normalizeError(error);

      // Handle retries
      if (currentRetry < retryCount && shouldRetry(appError)) {
        console.log(`Retrying operation (${currentRetry + 1}/${retryCount})...`);
        
        return new Promise((resolve) => {
          retryTimeoutRef.current = setTimeout(async () => {
            const result = await execute(operation, currentRetry + 1);
            resolve(result);
          }, retryDelay * (currentRetry + 1));
        });
      }

      // Final error state
      setState({
        isLoading: false,
        error: appError,
        data: null,
      });
      setShowLoading(false);
      onError?.(appError);

      return null;
    }
  }, [minLoadingTime, showLoadingAfter, retryCount, retryDelay, onSuccess, onError]);

  const reset = useCallback(() => {
    setState({
      isLoading: false,
      error: null,
      data: initialData,
    });
    setShowLoading(false);
  }, [initialData]);

  const setData = useCallback((data: T) => {
    setState(prev => ({ ...prev, data }));
  }, []);

  const setError = useCallback((error: AppError | Error | string) => {
    const appError = ErrorHandler.normalizeError(error);
    setState(prev => ({ ...prev, error: appError }));
  }, []);

  return {
    ...state,
    showLoading,
    execute,
    reset,
    setData,
    setError,
  };
}

/**
 * Determine if an error should trigger a retry
 */
function shouldRetry(error: AppError): boolean {
  // Don't retry client errors (4xx)
  if (error.statusCode >= 400 && error.statusCode < 500) {
    return false;
  }

  // Don't retry validation errors
  if (error.code === 'VALIDATION_ERROR') {
    return false;
  }

  // Don't retry authentication errors
  if (error.code === 'AUTH_REQUIRED' || error.code === 'AUTH_INVALID') {
    return false;
  }

  // Retry server errors and network issues
  return true;
}

/**
 * Hook for managing multiple loading states
 */
export function useMultipleLoadingStates<T extends Record<string, any>>(
  initialStates: T,
  options: LoadingOptions = {}
) {
  const {
    retryCount = 0,
    retryDelay = 1000,
    onSuccess,
    onError,
  } = options;

  const [states, setStates] = useState<Record<keyof T, LoadingState>>(() => {
    const initial: Record<keyof T, LoadingState> = {} as any;
    for (const key in initialStates) {
      initial[key] = {
        isLoading: false,
        error: null,
        data: initialStates[key],
      };
    }
    return initial;
  });

  const execute = useCallback(async <K extends keyof T>(
    key: K,
    operation: () => Promise<T[K]>,
    currentRetry = 0
  ): Promise<T[K] | null> => {
    setStates(prev => ({
      ...prev,
      [key]: { ...prev[key], isLoading: true, error: null },
    }));

    try {
      const result = await operation();
      
      setStates(prev => ({
        ...prev,
        [key]: { isLoading: false, error: null, data: result },
      }));

      onSuccess?.(result);
      return result;
    } catch (error) {
      const appError = ErrorHandler.normalizeError(error);
      
      // Handle retries
      if (currentRetry < retryCount && shouldRetry(appError)) {
        return new Promise((resolve) => {
          setTimeout(async () => {
            const result = await execute(key, operation, currentRetry + 1);
            resolve(result);
          }, retryDelay * (currentRetry + 1));
        });
      }
      
      setStates(prev => ({
        ...prev,
        [key]: { isLoading: false, error: appError, data: null },
      }));

      onError?.(appError);
      return null;
    }
  }, [initialStates, retryCount, retryDelay, onSuccess, onError]);

  const reset = useCallback(<K extends keyof T>(key?: K) => {
    if (key) {
      setStates(prev => ({
        ...prev,
        [key]: { isLoading: false, error: null, data: initialStates[key] },
      }));
    } else {
      const resetStates: Record<keyof T, LoadingState> = {} as any;
      for (const k in initialStates) {
        resetStates[k] = {
          isLoading: false,
          error: null,
          data: initialStates[k],
        };
      }
      setStates(resetStates);
    }
  }, [initialStates]);

  const isAnyLoading = Object.values(states).some(state => state.isLoading);
  const hasAnyError = Object.values(states).some(state => state.error);

  return {
    states,
    execute,
    reset,
    isAnyLoading,
    hasAnyError,
  };
}

/**
 * Hook for sequential loading operations
 */
export function useSequentialLoading<T extends any[]>(
  operations: (() => Promise<T[number]>)[],
  options: LoadingOptions = {}
) {
  const [currentStep, setCurrentStep] = useState(0);
  const [results, setResults] = useState<T>([]);
  const [overallState, setOverallState] = useState<LoadingState>({
    isLoading: false,
    error: null,
    data: null,
  });

  const execute = useCallback(async (): Promise<T | null> => {
    setOverallState({ isLoading: true, error: null, data: null });
    setCurrentStep(0);
    setResults([]);

    try {
      const allResults: T = [] as any;

      for (let i = 0; i < operations.length; i++) {
        setCurrentStep(i);
        const result = await operations[i]();
        allResults.push(result);
        setResults([...allResults]);
      }

      setOverallState({
        isLoading: false,
        error: null,
        data: allResults,
      });

      return allResults;

    } catch (error) {
      const appError = ErrorHandler.normalizeError(error);
      setOverallState({
        isLoading: false,
        error: appError,
        data: null,
      });

      return null;
    }
  }, [operations]);

  const progress = operations.length > 0 ? (currentStep / operations.length) * 100 : 0;

  return {
    ...overallState,
    currentStep,
    totalSteps: operations.length,
    progress,
    results,
    execute,
  };
}