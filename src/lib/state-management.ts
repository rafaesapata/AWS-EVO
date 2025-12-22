/**
 * Advanced State Management Patterns
 * Provides consistent state management across the application
 */

import { create } from 'zustand';
import { subscribeWithSelector, devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ErrorHandler, AppError } from './error-handler';

// Types for state management
export interface StateSlice<T = any> {
  state: T;
  actions: Record<string, (...args: any[]) => void>;
  selectors?: Record<string, (state: T) => any>;
}

export interface AsyncState<T = any> {
  data: T | null;
  loading: boolean;
  error: AppError | null;
  lastUpdated: Date | null;
}

export interface OptimisticUpdate<T = any> {
  id: string;
  type: 'create' | 'update' | 'delete';
  data: T;
  timestamp: Date;
  rollback: () => void;
}

/**
 * Create a typed Zustand store with enhanced features
 */
export function createStore<T extends Record<string, any>>(
  initializer: (set: any, get: any) => T,
  options: {
    name?: string;
    persist?: boolean;
    devtools?: boolean;
  } = {}
) {
  const { name = 'store', persist: enablePersist = false, devtools: enableDevtools = true } = options;

  let store = create<T>()(
    subscribeWithSelector(
      immer(
        enableDevtools
          ? devtools(initializer, { name })
          : initializer
      )
    )
  );

  if (enablePersist) {
    store = create<T>()(
      persist(
        subscribeWithSelector(
          immer(
            enableDevtools
              ? devtools(initializer, { name })
              : initializer
          )
        ),
        {
          name: `evo-uds-${name}`,
          partialize: (state) => {
            // Only persist non-sensitive data
            const { ...persistedState } = state;
            return persistedState;
          },
        }
      )
    );
  }

  return store;
}

/**
 * Create async state slice with loading, error, and data management
 */
export function createAsyncSlice<T>(
  name: string,
  initialData: T | null = null
) {
  return {
    [`${name}State`]: {
      data: initialData,
      loading: false,
      error: null,
      lastUpdated: null,
    } as AsyncState<T>,

    [`set${name}Loading`]: (loading: boolean) => (state: any) => {
      state[`${name}State`].loading = loading;
      if (loading) {
        state[`${name}State`].error = null;
      }
    },

    [`set${name}Data`]: (data: T) => (state: any) => {
      state[`${name}State`].data = data;
      state[`${name}State`].loading = false;
      state[`${name}State`].error = null;
      state[`${name}State`].lastUpdated = new Date();
    },

    [`set${name}Error`]: (error: AppError) => (state: any) => {
      state[`${name}State`].error = error;
      state[`${name}State`].loading = false;
    },

    [`reset${name}`]: () => (state: any) => {
      state[`${name}State`] = {
        data: initialData,
        loading: false,
        error: null,
        lastUpdated: null,
      };
    },
  };
}

/**
 * Global application state store
 */
export interface AppState {
  // User state
  user: {
    id: string | null;
    email: string | null;
    name: string | null;
    roles: string[];
    organizationId: string | null;
  } | null;

  // UI state
  ui: {
    sidebarOpen: boolean;
    theme: 'light' | 'dark' | 'system';
    notifications: Array<{
      id: string;
      type: 'success' | 'error' | 'warning' | 'info';
      title: string;
      message: string;
      timestamp: Date;
      read: boolean;
    }>;
    loading: {
      global: boolean;
      operations: Record<string, boolean>;
    };
  };

  // AWS accounts state
  awsAccounts: {
    accounts: any[];
    selectedAccountId: string | null;
    loading: boolean;
    error: AppError | null;
  };

  // Optimistic updates
  optimisticUpdates: OptimisticUpdate[];

  // Actions
  setUser: (user: AppState['user']) => void;
  clearUser: () => void;
  
  setSidebarOpen: (open: boolean) => void;
  setTheme: (theme: AppState['ui']['theme']) => void;
  
  addNotification: (notification: Omit<AppState['ui']['notifications'][0], 'id' | 'timestamp' | 'read'>) => void;
  markNotificationRead: (id: string) => void;
  clearNotifications: () => void;
  
  setGlobalLoading: (loading: boolean) => void;
  setOperationLoading: (operation: string, loading: boolean) => void;
  
  setAwsAccounts: (accounts: any[]) => void;
  setSelectedAccount: (accountId: string | null) => void;
  setAwsAccountsLoading: (loading: boolean) => void;
  setAwsAccountsError: (error: AppError | null) => void;
  
  addOptimisticUpdate: (update: OptimisticUpdate) => void;
  removeOptimisticUpdate: (id: string) => void;
  rollbackOptimisticUpdate: (id: string) => void;
  clearOptimisticUpdates: () => void;
}

export const useAppStore = createStore<AppState>(
  (set, get) => ({
    user: null,
    
    ui: {
      sidebarOpen: true,
      theme: 'system',
      notifications: [],
      loading: {
        global: false,
        operations: {},
      },
    },
    
    awsAccounts: {
      accounts: [],
      selectedAccountId: null,
      loading: false,
      error: null,
    },
    
    optimisticUpdates: [],

    // User actions
    setUser: (user) => set((state) => {
      state.user = user;
    }),
    
    clearUser: () => set((state) => {
      state.user = null;
      state.awsAccounts = {
        accounts: [],
        selectedAccountId: null,
        loading: false,
        error: null,
      };
    }),

    // UI actions
    setSidebarOpen: (open) => set((state) => {
      state.ui.sidebarOpen = open;
    }),
    
    setTheme: (theme) => set((state) => {
      state.ui.theme = theme;
    }),
    
    addNotification: (notification) => set((state) => {
      const newNotification = {
        ...notification,
        id: `notification-${Date.now()}-${Math.random()}`,
        timestamp: new Date(),
        read: false,
      };
      state.ui.notifications.unshift(newNotification);
      
      // Keep only last 50 notifications
      if (state.ui.notifications.length > 50) {
        state.ui.notifications = state.ui.notifications.slice(0, 50);
      }
    }),
    
    markNotificationRead: (id) => set((state) => {
      const notification = state.ui.notifications.find(n => n.id === id);
      if (notification) {
        notification.read = true;
      }
    }),
    
    clearNotifications: () => set((state) => {
      state.ui.notifications = [];
    }),
    
    setGlobalLoading: (loading) => set((state) => {
      state.ui.loading.global = loading;
    }),
    
    setOperationLoading: (operation, loading) => set((state) => {
      if (loading) {
        state.ui.loading.operations[operation] = true;
      } else {
        delete state.ui.loading.operations[operation];
      }
    }),

    // AWS accounts actions
    setAwsAccounts: (accounts) => set((state) => {
      state.awsAccounts.accounts = accounts;
      state.awsAccounts.loading = false;
      state.awsAccounts.error = null;
    }),
    
    setSelectedAccount: (accountId) => set((state) => {
      state.awsAccounts.selectedAccountId = accountId;
    }),
    
    setAwsAccountsLoading: (loading) => set((state) => {
      state.awsAccounts.loading = loading;
      if (loading) {
        state.awsAccounts.error = null;
      }
    }),
    
    setAwsAccountsError: (error) => set((state) => {
      state.awsAccounts.error = error;
      state.awsAccounts.loading = false;
    }),

    // Optimistic updates actions
    addOptimisticUpdate: (update) => set((state) => {
      state.optimisticUpdates.push(update);
    }),
    
    removeOptimisticUpdate: (id) => set((state) => {
      state.optimisticUpdates = state.optimisticUpdates.filter(u => u.id !== id);
    }),
    
    rollbackOptimisticUpdate: (id) => set((state) => {
      const update = state.optimisticUpdates.find(u => u.id === id);
      if (update) {
        update.rollback();
        state.optimisticUpdates = state.optimisticUpdates.filter(u => u.id !== id);
      }
    }),
    
    clearOptimisticUpdates: () => set((state) => {
      state.optimisticUpdates.forEach(update => update.rollback());
      state.optimisticUpdates = [];
    }),
  }),
  {
    name: 'app-store',
    persist: true,
    devtools: process.env.NODE_ENV === 'development',
  }
);

/**
 * Hook for managing local component state with persistence
 */
export function usePersistedState<T>(
  key: string,
  initialValue: T,
  options: {
    serialize?: (value: T) => string;
    deserialize?: (value: string) => T;
    storage?: Storage;
  } = {}
) {
  const {
    serialize = JSON.stringify,
    deserialize = JSON.parse,
    storage = localStorage,
  } = options;

  const [state, setState] = useState<T>(() => {
    try {
      const item = storage.getItem(key);
      return item ? deserialize(item) : initialValue;
    } catch (error) {
      console.warn(`Error reading localStorage key "${key}":`, error);
      return initialValue;
    }
  });

  const setValue = useCallback((value: T | ((prev: T) => T)) => {
    try {
      const valueToStore = value instanceof Function ? value(state) : value;
      setState(valueToStore);
      storage.setItem(key, serialize(valueToStore));
    } catch (error) {
      console.warn(`Error setting localStorage key "${key}":`, error);
    }
  }, [key, serialize, storage, state]);

  const removeValue = useCallback(() => {
    try {
      storage.removeItem(key);
      setState(initialValue);
    } catch (error) {
      console.warn(`Error removing localStorage key "${key}":`, error);
    }
  }, [key, initialValue, storage]);

  return [state, setValue, removeValue] as const;
}

/**
 * Hook for managing async operations with state
 */
export function useAsyncOperation<T, P extends any[] = []>(
  operation: (...args: P) => Promise<T>,
  options: {
    onSuccess?: (data: T) => void;
    onError?: (error: AppError) => void;
    initialData?: T;
  } = {}
) {
  const { onSuccess, onError, initialData = null } = options;
  
  const [state, setState] = useState<AsyncState<T>>({
    data: initialData,
    loading: false,
    error: null,
    lastUpdated: null,
  });

  const execute = useCallback(async (...args: P) => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const result = await operation(...args);
      
      setState({
        data: result,
        loading: false,
        error: null,
        lastUpdated: new Date(),
      });

      onSuccess?.(result);
      return result;
    } catch (error) {
      const appError = ErrorHandler.normalizeError(error);
      
      setState(prev => ({
        ...prev,
        loading: false,
        error: appError,
      }));

      onError?.(appError);
      throw appError;
    }
  }, [operation, onSuccess, onError]);

  const reset = useCallback(() => {
    setState({
      data: initialData,
      loading: false,
      error: null,
      lastUpdated: null,
    });
  }, [initialData]);

  return {
    ...state,
    execute,
    reset,
  };
}

/**
 * Hook for managing optimistic updates
 */
export function useOptimisticUpdates<T>() {
  const addOptimisticUpdate = useAppStore(state => state.addOptimisticUpdate);
  const removeOptimisticUpdate = useAppStore(state => state.removeOptimisticUpdate);
  const rollbackOptimisticUpdate = useAppStore(state => state.rollbackOptimisticUpdate);

  const createOptimisticUpdate = useCallback((
    type: OptimisticUpdate['type'],
    data: T,
    rollbackFn: () => void
  ) => {
    const update: OptimisticUpdate<T> = {
      id: `optimistic-${Date.now()}-${Math.random()}`,
      type,
      data,
      timestamp: new Date(),
      rollback: rollbackFn,
    };

    addOptimisticUpdate(update);
    return update.id;
  }, [addOptimisticUpdate]);

  const confirmUpdate = useCallback((id: string) => {
    removeOptimisticUpdate(id);
  }, [removeOptimisticUpdate]);

  const revertUpdate = useCallback((id: string) => {
    rollbackOptimisticUpdate(id);
  }, [rollbackOptimisticUpdate]);

  return {
    createOptimisticUpdate,
    confirmUpdate,
    revertUpdate,
  };
}

/**
 * Hook for subscribing to store changes
 */
export function useStoreSubscription<T>(
  selector: (state: AppState) => T,
  callback: (value: T, previousValue: T) => void,
  options: {
    fireImmediately?: boolean;
    equalityFn?: (a: T, b: T) => boolean;
  } = {}
) {
  const { fireImmediately = false, equalityFn } = options;
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    return useAppStore.subscribe(
      selector,
      (value, previousValue) => callbackRef.current(value, previousValue),
      {
        fireImmediately,
        equalityFn,
      }
    );
  }, [selector, fireImmediately, equalityFn]);
}

/**
 * Hook for managing form state with validation
 */
export function useFormState<T extends Record<string, any>>(
  initialValues: T,
  validationSchema?: any
) {
  const [values, setValues] = useState<T>(initialValues);
  const [errors, setErrors] = useState<Partial<Record<keyof T, string>>>({});
  const [touched, setTouched] = useState<Partial<Record<keyof T, boolean>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const setValue = useCallback(<K extends keyof T>(field: K, value: T[K]) => {
    setValues(prev => ({ ...prev, [field]: value }));
    
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  }, [errors]);

  const setFieldTouched = useCallback(<K extends keyof T>(field: K, touched = true) => {
    setTouched(prev => ({ ...prev, [field]: touched }));
  }, []);

  const validate = useCallback(async () => {
    if (!validationSchema) return true;

    try {
      await validationSchema.parseAsync(values);
      setErrors({});
      return true;
    } catch (error: any) {
      if (error.errors) {
        const newErrors: Partial<Record<keyof T, string>> = {};
        error.errors.forEach((err: any) => {
          const field = err.path[0] as keyof T;
          newErrors[field] = err.message;
        });
        setErrors(newErrors);
      }
      return false;
    }
  }, [values, validationSchema]);

  const handleSubmit = useCallback(async (
    onSubmit: (values: T) => Promise<void> | void
  ) => {
    setIsSubmitting(true);
    
    // Mark all fields as touched
    const allTouched = Object.keys(values).reduce((acc, key) => {
      acc[key as keyof T] = true;
      return acc;
    }, {} as Partial<Record<keyof T, boolean>>);
    setTouched(allTouched);

    try {
      const isValid = await validate();
      if (!isValid) return;

      await onSubmit(values);
    } catch (error) {
      ErrorHandler.handle(error, {
        component: 'FormState',
        action: 'submeter formulário',
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [values, validate]);

  const reset = useCallback(() => {
    setValues(initialValues);
    setErrors({});
    setTouched({});
    setIsSubmitting(false);
  }, [initialValues]);

  const isValid = Object.keys(errors).length === 0;
  const isDirty = JSON.stringify(values) !== JSON.stringify(initialValues);

  return {
    values,
    errors,
    touched,
    isSubmitting,
    isValid,
    isDirty,
    setValue,
    setFieldTouched,
    validate,
    handleSubmit,
    reset,
  };
}