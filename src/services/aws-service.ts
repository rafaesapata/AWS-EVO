/**
 * AWS Service
 * Data operations using AWS services (API Gateway, Lambda, Cognito)
 */

import { cognitoAuth } from '@/integrations/aws/cognito-client-simple';
import { apiClient } from '@/integrations/aws/api-client';

export class AWSService {
  // Authentication
  static async getCurrentUser() {
    return await cognitoAuth.getCurrentUser();
  }

  static async getCurrentSession() {
    return await cognitoAuth.getCurrentSession();
  }

  static async signOut() {
    return await cognitoAuth.signOut();
  }

  // Data operations using AWS API Gateway + Lambda
  static async query(table: string, filters: Record<string, any> = {}) {
    try {
      const response = await apiClient.get(`/${table}`, filters);
      return { data: Array.isArray(response) ? response : [response], error: null };
    } catch (error) {
      console.error(`AWS Query Error for ${table}:`, error);
      return { data: [], error };
    }
  }

  static async queryOne(table: string, filters: Record<string, any> = {}) {
    try {
      const response = await apiClient.get(`/${table}`, { ...filters, limit: 1 });
      const data = Array.isArray(response) ? response[0] : response;
      return { data, error: null };
    } catch (error) {
      console.error(`AWS Query One Error for ${table}:`, error);
      return { data: null, error };
    }
  }

  static async insert(table: string, data: any) {
    try {
      const response = await apiClient.post(`/${table}`, data);
      return { data: response, error: null };
    } catch (error) {
      console.error(`AWS Insert Error for ${table}:`, error);
      return { data: null, error };
    }
  }

  static async update(table: string, id: string, data: any) {
    try {
      const response = await apiClient.put(`/${table}/${id}`, data);
      return { data: response, error: null };
    } catch (error) {
      console.error(`AWS Update Error for ${table}:`, error);
      return { data: null, error };
    }
  }

  static async delete(table: string, id: string) {
    try {
      await apiClient.delete(`/${table}/${id}`);
      return { error: null };
    } catch (error) {
      console.error(`AWS Delete Error for ${table}:`, error);
      return { error };
    }
  }

  // Lambda function invocation
  static async invokeFunction(functionName: string, payload?: any) {
    try {
      const response = await apiClient.lambda(functionName, payload);
      return { data: response, error: null };
    } catch (error) {
      console.error(`AWS Lambda Error for ${functionName}:`, error);
      return { data: null, error };
    }
  }

  // RPC calls via API Gateway
  static async rpc(functionName: string, params?: any) {
    try {
      const response = await apiClient.post(`/rpc/${functionName}`, params);
      return { data: response, error: null };
    } catch (error) {
      console.error(`AWS RPC Error for ${functionName}:`, error);
      return { data: null, error };
    }
  }

  // Helper methods
  static async getCurrentUserOrganization() {
    try {
      const user = await this.getCurrentUser();
      if (!user) return null;
      
      // Use organization ID from AWS Cognito user attributes
      if (user.organizationId) {
        return user.organizationId;
      }

      // Fallback: extract organization from email domain
      if (user.email) {
        const domain = user.email.split('@')[1];
        return `org-${domain.replace(/\./g, '-')}`;
      }

      // Last fallback: use user ID as organization
      return `org-${user.id.substring(0, 8)}`;
    } catch (error) {
      console.error('Error getting user organization:', error);
      return null;
    }
  }

  // Generic query builder for backward compatibility
  static from(table: string) {
    return {
      select: (columns = '*') => ({
        eq: (column: string, value: any) => ({
          order: (orderColumn: string, options?: { ascending?: boolean }) => ({
            limit: (count: number) => ({
              then: async (callback: (result: any) => void) => {
                const { data, error } = await AWSService.query(table, { [column]: value });
                callback({ data, error });
              }
            }),
            then: async (callback: (result: any) => void) => {
              const { data, error } = await AWSService.query(table, { [column]: value });
              callback({ data, error });
            }
          }),
          single: async () => {
            return await AWSService.queryOne(table, { [column]: value });
          },
          then: async (callback: (result: any) => void) => {
            const { data, error } = await AWSService.query(table, { [column]: value });
            callback({ data, error });
          }
        }),
        order: (orderColumn: string, options?: { ascending?: boolean }) => ({
          then: async (callback: (result: any) => void) => {
            const { data, error } = await AWSService.query(table);
            callback({ data, error });
          }
        }),
        then: async (callback: (result: any) => void) => {
          const { data, error } = await AWSService.query(table);
          callback({ data, error });
        }
      }),
      insert: (values: any) => ({
        then: async (callback: (result: any) => void) => {
          const { data, error } = await AWSService.insert(table, values);
          callback({ data, error });
        }
      }),
      update: (values: any) => ({
        eq: (column: string, value: any) => ({
          then: async (callback: (result: any) => void) => {
            const { data, error } = await AWSService.update(table, value, values);
            callback({ data, error });
          }
        })
      }),
      delete: () => ({
        eq: (column: string, value: any) => ({
          then: async (callback: (result: any) => void) => {
            const { error } = await AWSService.delete(table, value);
            callback({ data: null, error });
          }
        })
      })
    };
  }

  // Functions namespace for backward compatibility
  static functions = {
    invoke: async (functionName: string, options?: { body?: any }) => {
      return await AWSService.invokeFunction(functionName, options?.body);
    }
  };

  // Cost recommendations
  static async getCostRecommendations(organizationId: string) {
    return await this.query('cost_recommendations', { organization_id: organizationId });
  }

  // AWS credentials
  static async getAWSCredentials(organizationId: string) {
    return await this.query('aws_credentials', { 
      organization_id: organizationId,
      is_active: true 
    });
  }

  // Remediation tickets
  static async createRemediationTicket(ticket: any) {
    return await this.insert('remediation_tickets', ticket);
  }

  static async updateRemediationTicket(id: string, updates: any) {
    return await this.update('remediation_tickets', id, updates);
  }

  // Daily costs
  static async getDailyCosts(filters: Record<string, any> = {}) {
    return await this.query('daily_costs', filters);
  }

  // Security findings
  static async getFindings(organizationId: string) {
    return await this.query('findings', { organization_id: organizationId });
  }

  // User profiles
  static async getUserProfile(userId: string) {
    return await this.queryOne('profiles', { id: userId });
  }
}

export default AWSService;