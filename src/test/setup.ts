import { expect, afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';

expect.extend(matchers);

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Mock AWS clients
vi.mock('@/integrations/aws/cognito-client-simple', () => ({
  cognitoAuth: {
    getCurrentUser: vi.fn(() => Promise.resolve(null)),
    getCurrentSession: vi.fn(() => Promise.resolve(null)),
    signIn: vi.fn(() => Promise.resolve({})),
    signUp: vi.fn(() => Promise.resolve()),
    signOut: vi.fn(() => Promise.resolve()),
  },
}));

vi.mock('@/integrations/aws/api-client', () => ({
  apiClient: {
    select: vi.fn(() => Promise.resolve({ data: [], error: null })),
    insert: vi.fn(() => Promise.resolve({ data: null, error: null })),
    update: vi.fn(() => Promise.resolve({ data: null, error: null })),
    delete: vi.fn(() => Promise.resolve({ data: null, error: null })),
    rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
    invoke: vi.fn(() => Promise.resolve({ data: null, error: null })),
  },
}));

// Mock React Router
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useLocation: () => ({ pathname: '/' }),
  };
});

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
  Toaster: () => null,
}));
