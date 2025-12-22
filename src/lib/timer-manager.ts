/**
 * Centralized Timer Manager
 * Prevents memory leaks, duplicate timers, and manages all intervals/timeouts
 */
export class TimerManager {
  private static instance: TimerManager;
  private timers = new Map<string, NodeJS.Timeout>();
  private callbacks = new Map<string, () => void>();

  private constructor() {}

  static getInstance(): TimerManager {
    if (!TimerManager.instance) {
      TimerManager.instance = new TimerManager();
    }
    return TimerManager.instance;
  }

  /**
   * Register a new interval timer
   * Automatically clears any existing timer with the same key
   */
  register(key: string, callback: () => void, interval: number): void {
    this.clear(key);
    
    const id = setInterval(() => {
      try {
        callback();
      } catch (error) {
        console.error(`Timer ${key} callback error:`, error);
      }
    }, interval);
    
    this.timers.set(key, id);
    this.callbacks.set(key, callback);
  }

  /**
   * Register a one-time timeout
   */
  registerTimeout(key: string, callback: () => void, delay: number): void {
    this.clear(key);
    
    const id = setTimeout(() => {
      try {
        callback();
      } catch (error) {
        console.error(`Timeout ${key} callback error:`, error);
      } finally {
        this.timers.delete(key);
        this.callbacks.delete(key);
      }
    }, delay);
    
    this.timers.set(key, id);
    this.callbacks.set(key, callback);
  }

  /**
   * Clear a specific timer
   */
  clear(key: string): void {
    const id = this.timers.get(key);
    if (id) {
      clearInterval(id);
      clearTimeout(id);
      this.timers.delete(key);
      this.callbacks.delete(key);
    }
  }

  /**
   * Clear all timers - useful for cleanup
   */
  clearAll(): void {
    this.timers.forEach((id) => {
      clearInterval(id);
      clearTimeout(id);
    });
    this.timers.clear();
    this.callbacks.clear();
  }

  /**
   * Check if a timer exists
   */
  has(key: string): boolean {
    return this.timers.has(key);
  }

  /**
   * Get all active timer keys
   */
  getActiveTimers(): string[] {
    return Array.from(this.timers.keys());
  }

  /**
   * Execute a timer callback immediately (without waiting for interval)
   */
  executeNow(key: string): void {
    const callback = this.callbacks.get(key);
    if (callback) {
      try {
        callback();
      } catch (error) {
        console.error(`Timer ${key} immediate execution error:`, error);
      }
    }
  }
}

export const timerManager = TimerManager.getInstance();
