/**
 * Comprehensive Form Validation System
 * Provides consistent validation patterns across all forms
 */

import { ErrorFactory } from './error-handler';
import { z } from './zod-config';

// Common validation patterns
export const ValidationPatterns = {
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  phone: /^\+?[\d\s\-\(\)]+$/,
  url: /^https?:\/\/.+/,
  awsAccountId: /^\d{12}$/,
  awsRegion: /^[a-z0-9-]+$/,
  uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  strongPassword: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/,
  ipAddress: /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/,
  cidr: /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\/(?:[0-9]|[1-2][0-9]|3[0-2])$/,
};

// Custom validation messages in Portuguese
export const ValidationMessages = {
  required: 'Este campo é obrigatório',
  email: 'Digite um email válido',
  phone: 'Digite um telefone válido',
  url: 'Digite uma URL válida',
  awsAccountId: 'ID da conta AWS deve ter 12 dígitos',
  awsRegion: 'Região AWS inválida',
  uuid: 'UUID inválido',
  strongPassword: 'Senha deve ter pelo menos 8 caracteres, incluindo maiúscula, minúscula, número e símbolo',
  ipAddress: 'Endereço IP inválido',
  cidr: 'CIDR inválido (ex: 192.168.1.0/24)',
  minLength: (min: number) => `Deve ter pelo menos ${min} caracteres`,
  maxLength: (max: number) => `Deve ter no máximo ${max} caracteres`,
  min: (min: number) => `Valor mínimo é ${min}`,
  max: (max: number) => `Valor máximo é ${max}`,
  custom: (message: string) => message,
};

// Base validation schemas
export const BaseSchemas = {
  // User information
  email: z.string()
    .min(1, ValidationMessages.required)
    .email(ValidationMessages.email),
  
  password: z.string()
    .min(8, ValidationMessages.minLength(8))
    .regex(ValidationPatterns.strongPassword, ValidationMessages.strongPassword),
  
  name: z.string()
    .min(1, ValidationMessages.required)
    .min(2, ValidationMessages.minLength(2))
    .max(100, ValidationMessages.maxLength(100)),
  
  phone: z.string()
    .optional()
    .refine(val => !val || ValidationPatterns.phone.test(val), ValidationMessages.phone),
  
  // AWS specific
  awsAccountId: z.string()
    .min(1, ValidationMessages.required)
    .regex(ValidationPatterns.awsAccountId, ValidationMessages.awsAccountId),
  
  awsRegion: z.string()
    .min(1, ValidationMessages.required)
    .regex(ValidationPatterns.awsRegion, ValidationMessages.awsRegion),
  
  awsCredentials: z.object({
    accessKeyId: z.string().min(1, ValidationMessages.required),
    secretAccessKey: z.string().min(1, ValidationMessages.required),
    sessionToken: z.string().optional(),
    region: z.string().regex(ValidationPatterns.awsRegion, ValidationMessages.awsRegion),
  }),
  
  // Network
  ipAddress: z.string()
    .regex(ValidationPatterns.ipAddress, ValidationMessages.ipAddress),
  
  cidr: z.string()
    .regex(ValidationPatterns.cidr, ValidationMessages.cidr),
  
  url: z.string()
    .url(ValidationMessages.url),
  
  // Common fields
  uuid: z.string()
    .regex(ValidationPatterns.uuid, ValidationMessages.uuid),
  
  dateRange: z.object({
    startDate: z.date(),
    endDate: z.date(),
  }).refine(data => data.startDate <= data.endDate, {
    message: 'Data inicial deve ser anterior à data final',
    path: ['endDate'],
  }),
  
  // Pagination
  pagination: z.object({
    page: z.number().min(1, 'Página deve ser maior que 0'),
    limit: z.number().min(1, 'Limite deve ser maior que 0').max(100, 'Limite máximo é 100'),
  }),
};

// Form-specific schemas
export const FormSchemas = {
  // Authentication forms
  login: z.object({
    email: BaseSchemas.email,
    password: z.string().min(1, ValidationMessages.required),
    rememberMe: z.boolean().optional(),
  }),
  
  register: z.object({
    name: BaseSchemas.name,
    email: BaseSchemas.email,
    password: BaseSchemas.password,
    confirmPassword: z.string(),
    acceptTerms: z.boolean().refine(val => val === true, {
      message: 'Você deve aceitar os termos de uso',
    }),
  }).refine(data => data.password === data.confirmPassword, {
    message: 'Senhas não coincidem',
    path: ['confirmPassword'],
  }),
  
  changePassword: z.object({
    currentPassword: z.string().min(1, ValidationMessages.required),
    newPassword: BaseSchemas.password,
    confirmPassword: z.string(),
  }).refine(data => data.newPassword === data.confirmPassword, {
    message: 'Senhas não coincidem',
    path: ['confirmPassword'],
  }),
  
  // AWS configuration forms
  awsCredentials: z.object({
    accountName: z.string().min(1, ValidationMessages.required),
    accountId: BaseSchemas.awsAccountId,
    accessKeyId: z.string().min(1, ValidationMessages.required),
    secretAccessKey: z.string().min(1, ValidationMessages.required),
    sessionToken: z.string().optional(),
    regions: z.array(BaseSchemas.awsRegion).min(1, 'Selecione pelo menos uma região'),
    isActive: z.boolean().default(true),
  }),
  
  // Security scan forms
  securityScan: z.object({
    accountId: z.string().optional(),
    scanLevel: z.enum(['basic', 'advanced', 'military']).default('military'),
    regions: z.array(BaseSchemas.awsRegion).optional(),
    scanTypes: z.array(z.string()).optional(),
    scheduledScan: z.boolean().default(false),
    scheduleExpression: z.string().optional(),
  }).refine(data => {
    if (data.scheduledScan && !data.scheduleExpression) {
      return false;
    }
    return true;
  }, {
    message: 'Expressão de agendamento é obrigatória para scans agendados',
    path: ['scheduleExpression'],
  }),
  
  // User management forms
  createUser: z.object({
    name: BaseSchemas.name,
    email: BaseSchemas.email,
    phone: BaseSchemas.phone,
    roles: z.array(z.string()).min(1, 'Selecione pelo menos um papel'),
    organizationId: BaseSchemas.uuid,
    isActive: z.boolean().default(true),
  }),
  
  updateUser: z.object({
    name: BaseSchemas.name.optional(),
    phone: BaseSchemas.phone,
    roles: z.array(z.string()).optional(),
    isActive: z.boolean().optional(),
  }),
  
  // Organization forms
  createOrganization: z.object({
    name: z.string().min(1, ValidationMessages.required),
    description: z.string().optional(),
    website: z.string().url(ValidationMessages.url).optional(),
    industry: z.string().optional(),
    size: z.enum(['startup', 'small', 'medium', 'large', 'enterprise']).optional(),
  }),
  
  // Settings forms
  notificationSettings: z.object({
    emailNotifications: z.boolean().default(true),
    smsNotifications: z.boolean().default(false),
    criticalAlerts: z.boolean().default(true),
    weeklyReports: z.boolean().default(true),
    monthlyReports: z.boolean().default(false),
  }),
  
  // Filter forms
  findingsFilter: z.object({
    severity: z.array(z.enum(['critical', 'high', 'medium', 'low'])).optional(),
    status: z.array(z.enum(['pending', 'acknowledged', 'resolved', 'false_positive'])).optional(),
    service: z.array(z.string()).optional(),
    category: z.array(z.string()).optional(),
    dateRange: BaseSchemas.dateRange.optional(),
    search: z.string().optional(),
  }),
  
  // Cost analysis forms
  costAnalysis: z.object({
    accountId: z.string().optional(),
    service: z.string().optional(),
    granularity: z.enum(['DAILY', 'MONTHLY', 'HOURLY']).default('DAILY'),
    dateRange: BaseSchemas.dateRange,
    groupBy: z.array(z.string()).optional(),
    metrics: z.array(z.string()).optional(),
  }),
};

/**
 * Validation utility functions
 */
export class FormValidator {
  /**
   * Validate form data against schema
   */
  static validate<T>(schema: z.ZodSchema<T>, data: unknown): {
    success: true;
    data: T;
  } | {
    success: false;
    errors: Record<string, string>;
    firstError: string;
  } {
    try {
      const result = schema.parse(data);
      return { success: true, data: result };
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errors: Record<string, string> = {};
        let firstError = '';
        
        error.errors.forEach((err, index) => {
          const path = err.path.join('.');
          errors[path] = err.message;
          
          if (index === 0) {
            firstError = err.message;
          }
        });
        
        return { success: false, errors, firstError };
      }
      
      return {
        success: false,
        errors: { general: 'Erro de validação desconhecido' },
        firstError: 'Erro de validação desconhecido',
      };
    }
  }
  
  /**
   * Validate single field
   */
  static validateField<T>(
    schema: z.ZodSchema<T>,
    value: unknown,
    fieldName: string
  ): { isValid: boolean; error?: string } {
    try {
      schema.parse(value);
      return { isValid: true };
    } catch (error) {
      if (error instanceof z.ZodError) {
        const fieldError = error.errors.find(err => 
          err.path.length === 0 || err.path[0] === fieldName
        );
        return {
          isValid: false,
          error: fieldError?.message || 'Valor inválido',
        };
      }
      return { isValid: false, error: 'Erro de validação' };
    }
  }
  
  /**
   * Create custom validation schema
   */
  static custom<T>(
    validator: (value: T) => boolean | string,
    message: string = 'Valor inválido'
  ) {
    return z.any().refine((value: T) => {
      const result = validator(value);
      return result === true;
    }, { message });
  }
  
  /**
   * Async validation
   */
  static async validateAsync<T>(
    schema: z.ZodSchema<T>,
    data: unknown
  ): Promise<{
    success: true;
    data: T;
  } | {
    success: false;
    errors: Record<string, string>;
    firstError: string;
  }> {
    try {
      const result = await schema.parseAsync(data);
      return { success: true, data: result };
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errors: Record<string, string> = {};
        let firstError = '';
        
        error.errors.forEach((err, index) => {
          const path = err.path.join('.');
          errors[path] = err.message;
          
          if (index === 0) {
            firstError = err.message;
          }
        });
        
        return { success: false, errors, firstError };
      }
      
      return {
        success: false,
        errors: { general: 'Erro de validação desconhecido' },
        firstError: 'Erro de validação desconhecido',
      };
    }
  }
  
  /**
   * Sanitize input data
   */
  static sanitize(data: Record<string, any>): Record<string, any> {
    const sanitized: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(data)) {
      if (typeof value === 'string') {
        // Trim whitespace
        sanitized[key] = value.trim();
        
        // Remove potential XSS
        sanitized[key] = sanitized[key]
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
          .replace(/javascript:/gi, '')
          .replace(/on\w+\s*=/gi, '');
      } else if (Array.isArray(value)) {
        sanitized[key] = value.map(item => 
          typeof item === 'string' ? item.trim() : item
        );
      } else {
        sanitized[key] = value;
      }
    }
    
    return sanitized;
  }
}

/**
 * React Hook Form integration
 */
export function createFormResolver<T>(schema: z.ZodSchema<T>) {
  return async (data: any) => {
    const sanitizedData = FormValidator.sanitize(data);
    const result = await FormValidator.validateAsync(schema, sanitizedData);
    
    if (result.success) {
      return { values: result.data, errors: {} };
    }
    
    return {
      values: {},
      errors: Object.entries(result.errors).reduce((acc, [key, message]) => {
        acc[key] = { type: 'validation', message };
        return acc;
      }, {} as any),
    };
  };
}

/**
 * Common validation rules for reuse
 */
export const ValidationRules = {
  required: (message?: string) => z.string().min(1, message || ValidationMessages.required),
  
  optional: () => z.string().optional(),
  
  email: (message?: string) => BaseSchemas.email.refine(
    val => ValidationPatterns.email.test(val),
    message || ValidationMessages.email
  ),
  
  strongPassword: (message?: string) => BaseSchemas.password.refine(
    val => ValidationPatterns.strongPassword.test(val),
    message || ValidationMessages.strongPassword
  ),
  
  minLength: (min: number, message?: string) => z.string().min(
    min,
    message || ValidationMessages.minLength(min)
  ),
  
  maxLength: (max: number, message?: string) => z.string().max(
    max,
    message || ValidationMessages.maxLength(max)
  ),
  
  range: (min: number, max: number) => z.number().min(min).max(max),
  
  oneOf: <T extends readonly [string, ...string[]]>(
    values: T,
    message?: string
  ) => z.enum(values, { errorMap: () => ({ message: message || 'Valor inválido' }) }),
  
  array: <T>(schema: z.ZodSchema<T>, minItems?: number, maxItems?: number) => {
    let arraySchema = z.array(schema);
    
    if (minItems !== undefined) {
      arraySchema = arraySchema.min(minItems, `Selecione pelo menos ${minItems} item(s)`);
    }
    
    if (maxItems !== undefined) {
      arraySchema = arraySchema.max(maxItems, `Selecione no máximo ${maxItems} item(s)`);
    }
    
    return arraySchema;
  },
};