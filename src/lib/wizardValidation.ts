/**
 * Wizard Validation Utilities
 * 
 * SECURITY NOTE: This module ONLY supports CloudFormation + IAM Role validation.
 * Direct IAM Access Keys are NOT supported and will be rejected.
 * 
 * All AWS account connections must be made through CloudFormation One-Click Deploy.
 */

import { apiClient } from "@/integrations/aws/api-client";

/**
 * Validates an AWS account that was connected via CloudFormation
 */
export const validateCloudFormationAccount = async (
  accountId: string
): Promise<{ isValid: boolean; error?: string; accountDetails?: any }> => {
  try {
    const result = await apiClient.invoke('validate-aws-credentials', {
      body: { accountId }
    });

    if (result.error) {
      return { isValid: false, error: result.error.message };
    }

    const { data } = result;

    return { 
      isValid: data.isValid, 
      error: data.error,
      accountDetails: data
    };
  } catch (e) {
    return { 
      isValid: false, 
      error: e instanceof Error ? e.message : 'Unknown error during validation' 
    };
  }
};

/**
 * Validates that a Role ARN is properly formatted
 */
export const validateRoleArn = (roleArn: string): { isValid: boolean; error?: string } => {
  if (!roleArn) {
    return { isValid: false, error: 'Role ARN is required' };
  }

  // ARN format: arn:aws:iam::ACCOUNT_ID:role/ROLE_NAME or arn:aws:iam::ACCOUNT_ID:role/PATH/ROLE_NAME
  const arnRegex = /^arn:aws:iam::(\d{12}):role\/[\w+=,.@\/-]{1,512}$/;
  
  if (!arnRegex.test(roleArn)) {
    return { 
      isValid: false, 
      error: 'Invalid Role ARN format. Expected: arn:aws:iam::ACCOUNT_ID:role/ROLE_NAME' 
    };
  }

  return { isValid: true };
};

/**
 * Extracts AWS Account ID from a Role ARN
 */
export const extractAccountIdFromArn = (roleArn: string): string | null => {
  const match = roleArn.match(/^arn:aws:iam::(\d{12}):role\//);
  return match ? match[1] : null;
};

/**
 * Debounce utility function
 */
export const debounce = <T extends (...args: any[]) => any>(
  func: T,
  wait: number
): ((...args: Parameters<T>) => void) => {
  let timeout: NodeJS.Timeout | null = null;

  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
};
