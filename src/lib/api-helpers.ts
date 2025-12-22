/**
 * API Helper functions for common database operations
 * AWS API Client helpers for data operations
 */

import { apiClient } from '@/integrations/aws/api-client';

export interface QueryOptions {
  select?: string;
  eq?: Record<string, any>;
  order?: { column: string; ascending?: boolean };
  limit?: number;
}

export class DatabaseHelper {
  /**
   * Select data from a table with database-like syntax
   */
  static async from(table: string) {
    return {
      select: (columns: string = '*') => ({
        eq: (field: string, value: any) => ({
          order: (column: string, options?: { ascending?: boolean }) => ({
            limit: (count: number) => ({
              execute: async () => {
                return apiClient.select(table, {
                  select: columns,
                  eq: { [field]: value },
                  order: { column, ascending: options?.ascending },
                  limit: count
                });
              }
            }),
            execute: async () => {
              return apiClient.select(table, {
                select: columns,
                eq: { [field]: value },
                order: { column, ascending: options?.ascending }
              });
            }
          }),
          execute: async () => {
            return apiClient.select(table, {
              select: columns,
              eq: { [field]: value }
            });
          }
        }),
        execute: async () => {
          return apiClient.select(table, { select: columns });
        }
      })
    };
  }

  /**
   * Insert data into a table
   */
  static async insert(table: string, data: any) {
    return apiClient.insert(table, data);
  }

  /**
   * Update data in a table
   */
  static async update(table: string, data: any, where: Record<string, any>) {
    return apiClient.update(table, data, where);
  }

  /**
   * Delete data from a table
   */
  static async delete(table: string, where: Record<string, any>) {
    return apiClient.delete(table, where);
  }

  /**
   * Call a remote procedure (RPC)
   */
  static async rpc(functionName: string, params: Record<string, any> = {}) {
    return apiClient.rpc(functionName, params);
  }

  /**
   * Invoke a Lambda function
   */
  static async invoke(functionName: string, options: { body?: any } = {}) {
    return apiClient.invoke(functionName, options);
  }
}

// Export a default instance for convenience
export const db = DatabaseHelper;
