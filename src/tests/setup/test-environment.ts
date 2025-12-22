/**
 * Advanced Test Environment Setup
 * Configures comprehensive testing environment with mocks and utilities
 */

import { vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';

// Mock AWS Services
export const mockCognitoAuth = {
  getCurrentUser: vi.fn(),
  getCurrentSession: vi.fn(),
  signIn: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
};

export const mockApiClient = {
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  rpc: vi.fn(),
  invoke: vi.fn(),
};

export const mockBedrockAI = {
  generateAnalysis: vi.fn(),
  generateQuickResponse: vi.fn(),
  generateCostOptimization: vi.fn(),
  generateSecurityAnalysis: vi.fn(),
  generateWellArchitectedAnalysis: vi.fn(),
  generateRemediationScript: vi.fn(),
  generateKnowledgeBaseContent: vi.fn(),
};

// Mock implementations
vi.mock('@/integrations/aws/cognito-client-simple', () => ({
  cognitoAuth: mockCognitoAuth,
}));

vi.mock('@/integrations/aws/api-client', () => ({
  apiClient: mockApiClient,
}));

vi.mock('@/integrations/aws/bedrock-client', () => ({
  bedrockAI: mockBedrockAI,
}));

// Test utilities
export const createTestQueryClient = () => new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      gcTime: 0,
    },
    mutations: {
      retry: false,
    },
  },
});

export const mockUser = {
  id: 'test-user-123',
  email: 'test@example.com',
  name: 'Test User',
  organizationId: 'test-org-123',
};

export const mockSession = {
  user: mockUser,
  accessToken: 'mock-access-token',
  idToken: 'mock-id-token',
  refreshToken: 'mock-refresh-token',
};

export const mockOrganization = {
  id: 'test-org-123',
  name: 'Test Organization',
  settings: {},
};

// Global test setup
beforeAll(() => {
  // Setup global mocks
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });

  // Mock IntersectionObserver
  global.IntersectionObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  }));

  // Mock ResizeObserver
  global.ResizeObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  }));

  // Mock window.URL.createObjectURL
  global.URL.createObjectURL = vi.fn(() => 'mock-url');
  global.URL.revokeObjectURL = vi.fn();
});

beforeEach(() => {
  // Reset all mocks before each test
  vi.clearAllMocks();
  
  // Setup default mock returns
  mockCognitoAuth.getCurrentUser.mockResolvedValue(mockUser);
  mockCognitoAuth.getCurrentSession.mockResolvedValue(mockSession);
  mockApiClient.select.mockResolvedValue({ data: [], error: null });
  mockApiClient.insert.mockResolvedValue({ data: {}, error: null });
  mockApiClient.update.mockResolvedValue({ data: {}, error: null });
  mockApiClient.delete.mockResolvedValue({ data: null, error: null });
  mockApiClient.rpc.mockResolvedValue({ data: null, error: null });
  mockApiClient.invoke.mockResolvedValue({ data: {}, error: null });
  mockBedrockAI.generateAnalysis.mockResolvedValue('Mock AI analysis');
  mockBedrockAI.generateQuickResponse.mockResolvedValue('Mock AI response');
});

afterEach(() => {
  cleanup();
});

afterAll(() => {
  vi.restoreAllMocks();
});

// Test data factories
export const createMockAWSAccount = (overrides = {}) => ({
  id: 'aws-account-123',
  account_name: 'Test AWS Account',
  account_id: '123456789012',
  regions: ['us-east-1', 'us-west-2'],
  is_active: true,
  ...overrides,
});

export const createMockCostData = (overrides = {}) => ({
  totalCost: 1000,
  services: [
    { name: 'EC2', cost: 500 },
    { name: 'S3', cost: 300 },
    { name: 'RDS', cost: 200 },
  ],
  trends: {
    monthly: [800, 900, 1000],
    daily: [30, 35, 32],
  },
  ...overrides,
});

export const createMockSecurityFinding = (overrides = {}) => ({
  id: 'finding-123',
  severity: 'HIGH',
  title: 'Test Security Finding',
  description: 'Test security issue description',
  resource: 'arn:aws:ec2:us-east-1:123456789012:instance/i-1234567890abcdef0',
  status: 'ACTIVE',
  ...overrides,
});

export const createMockKnowledgeBaseArticle = (overrides = {}) => ({
  id: 'article-123',
  title: 'Test Article',
  content: 'Test article content',
  category: 'AWS',
  tags: ['test', 'aws'],
  author_id: mockUser.id,
  approval_status: 'approved',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...overrides,
});

// Performance testing utilities
export const measurePerformance = async (fn: () => Promise<any>) => {
  const start = performance.now();
  const result = await fn();
  const end = performance.now();
  return {
    result,
    duration: end - start,
  };
};

// Error simulation utilities
export const simulateNetworkError = () => {
  throw new Error('Network error');
};

export const simulateAuthError = () => {
  mockCognitoAuth.getCurrentUser.mockRejectedValue(new Error('Authentication failed'));
  mockCognitoAuth.getCurrentSession.mockRejectedValue(new Error('Session expired'));
};

export const simulateAPIError = (errorMessage = 'API Error') => {
  mockApiClient.select.mockResolvedValue({ data: null, error: { message: errorMessage } });
  mockApiClient.insert.mockResolvedValue({ data: null, error: { message: errorMessage } });
  mockApiClient.update.mockResolvedValue({ data: null, error: { message: errorMessage } });
  mockApiClient.delete.mockResolvedValue({ data: null, error: { message: errorMessage } });
};

// Accessibility testing utilities
export const checkAccessibility = async (container: HTMLElement) => {
  // Check for basic accessibility requirements
  const issues = [];
  
  // Check for alt text on images
  const images = container.querySelectorAll('img');
  images.forEach((img, index) => {
    if (!img.getAttribute('alt')) {
      issues.push(`Image ${index} missing alt text`);
    }
  });
  
  // Check for form labels
  const inputs = container.querySelectorAll('input, textarea, select');
  inputs.forEach((input, index) => {
    const id = input.getAttribute('id');
    const label = container.querySelector(`label[for="${id}"]`);
    const ariaLabel = input.getAttribute('aria-label');
    const ariaLabelledBy = input.getAttribute('aria-labelledby');
    
    if (!label && !ariaLabel && !ariaLabelledBy) {
      issues.push(`Input ${index} missing label`);
    }
  });
  
  // Check for heading hierarchy
  const headings = container.querySelectorAll('h1, h2, h3, h4, h5, h6');
  let previousLevel = 0;
  headings.forEach((heading, index) => {
    const level = parseInt(heading.tagName.charAt(1));
    if (level > previousLevel + 1) {
      issues.push(`Heading ${index} skips levels (h${previousLevel} to h${level})`);
    }
    previousLevel = level;
  });
  
  return issues;
};

export default {
  mockCognitoAuth,
  mockApiClient,
  mockBedrockAI,
  createTestQueryClient,
  mockUser,
  mockSession,
  mockOrganization,
  createMockAWSAccount,
  createMockCostData,
  createMockSecurityFinding,
  createMockKnowledgeBaseArticle,
  measurePerformance,
  simulateNetworkError,
  simulateAuthError,
  simulateAPIError,
  checkAccessibility,
};