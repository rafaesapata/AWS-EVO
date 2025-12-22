/**
 * Unit Tests for Security Scan Handler
 * Tests the security scan Lambda handler functionality
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handler } from '../../../backend/src/handlers/security/security-scan';
import { getPrismaClient } from '../../../backend/src/lib/database';

// Mock dependencies
vi.mock('../../../backend/src/lib/database');
vi.mock('../../../backend/src/lib/auth');
vi.mock('../../../backend/src/lib/aws-helpers');

const mockPrisma = {
  securityScan: {
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  finding: {
    createMany: vi.fn(),
  },
  awsAccount: {
    findMany: vi.fn(),
  },
};

vi.mocked(getPrismaClient).mockReturnValue(mockPrisma as any);

describe('Security Scan Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockEvent = {
    requestContext: {
      http: { method: 'POST' },
      authorizer: { jwt: { claims: { sub: 'user-123' } } },
    },
    body: JSON.stringify({
      scanType: 'comprehensive',
      accountId: 'account-123',
    }),
  };

  const mockContext = {
    getRemainingTimeInMillis: () => 30000,
  };

  it('should create a new security scan', async () => {
    // Setup mocks
    mockPrisma.awsAccount.findMany.mockResolvedValue([
      { id: 'account-123', accountName: 'Test Account' }
    ]);
    
    mockPrisma.securityScan.create.mockResolvedValue({
      id: 'scan-123',
      scan_type: 'comprehensive',
      status: 'running',
    });

    const response = await handler(mockEvent as any, mockContext as any);

    expect(response.statusCode).toBe(200);
    expect(mockPrisma.securityScan.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        scan_type: 'comprehensive',
        status: 'running',
      }),
    });
  });

  it('should handle invalid scan type', async () => {
    const invalidEvent = {
      ...mockEvent,
      body: JSON.stringify({
        scanType: 'invalid-type',
        accountId: 'account-123',
      }),
    };

    const response = await handler(invalidEvent as any, mockContext as any);

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toMatchObject({
      error: expect.stringContaining('Invalid scan type'),
    });
  });

  it('should handle missing account', async () => {
    mockPrisma.awsAccount.findMany.mockResolvedValue([]);

    const response = await handler(mockEvent as any, mockContext as any);

    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.body)).toMatchObject({
      error: expect.stringContaining('AWS account not found'),
    });
  });

  it('should handle database errors', async () => {
    mockPrisma.awsAccount.findMany.mockRejectedValue(new Error('Database error'));

    const response = await handler(mockEvent as any, mockContext as any);

    expect(response.statusCode).toBe(500);
    expect(JSON.parse(response.body)).toMatchObject({
      error: expect.stringContaining('Internal server error'),
    });
  });

  it('should handle OPTIONS requests', async () => {
    const optionsEvent = {
      ...mockEvent,
      requestContext: {
        ...mockEvent.requestContext,
        http: { method: 'OPTIONS' },
      },
    };

    const response = await handler(optionsEvent as any, mockContext as any);

    expect(response.statusCode).toBe(200);
    expect(response.headers).toMatchObject({
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    });
  });
});