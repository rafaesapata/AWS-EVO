/**
 * Zod Configuration and Safe Import
 * Ensures proper initialization of zod library to prevent "Cannot access 'z' before initialization" errors
 */

import { z } from 'zod';

// Re-export zod safely
export { z };

// Re-export common zod types for convenience
export type ZodSchema<T = any> = import('zod').ZodSchema<T>;
export type ZodError = import('zod').ZodError;
export type ZodIssue = import('zod').ZodIssue;

// Validation helper
export function createSchema<T>(schemaFactory: (z: typeof z) => import('zod').ZodSchema<T>) {
  return schemaFactory(z);
}

// Safe validation function
export function safeValidate<T>(
  schema: import('zod').ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; error: import('zod').ZodError } {
  try {
    const result = schema.parse(data);
    return { success: true, data: result };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error };
    }
    throw error;
  }
}