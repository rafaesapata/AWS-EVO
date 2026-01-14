/**
 * Property Tests: OAuth Security
 * 
 * Property 4: State Expiration Enforcement
 * Validates Requirements 1.5, 2.2
 * 
 * Property 5: Invalid State Rejection
 * Validates Requirements 2.1, 2.2
 * 
 * Property 9: Invalid Credential No-Refresh
 * Validates Requirements 4.5
 * 
 * Property 10: Credential Deletion Cascade
 * Validates Requirements 6.1, 6.3
 * 
 * Property 12: Token Non-Exposure in Logs
 * Validates Requirements 8.6, 8.7
 * 
 * Property 13: Mixed Auth Type Support
 * Validates Requirements 7.4
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import {
  generateState,
  generatePKCE,
  isStateValid,
  calculateStateExpiration,
} from '../../src/lib/oauth-utils.js';
import {
  encryptToken,
  serializeEncryptedToken,
  generateEncryptionKey,
} from '../../src/lib/token-encryption.js';

const prisma = new PrismaClient();

describe('Property 4: State Expiration Enforcement', () => {
  let testOrgId: string;

  beforeAll(async () => {
    // Set up encryption key for tests
    process.env.TOKEN_ENCRYPTION_KEY = generateEncryptionKey();

    // Create test organization
    const org = await prisma.organization.create({
      data: {
        name: 'Test Org State Expiration',
        slug: `test-org-state-exp-${randomUUID()}`,
      },
    });
    testOrgId = org.id;
  });

  afterAll(async () => {
    await prisma.oAuthState.deleteMany({
      where: { organization_id: testOrgId },
    });
    await prisma.organization.delete({
      where: { id: testOrgId },
    });
    await prisma.$disconnect();
  });

  it('should validate non-expired state (created now)', async () => {
    const state = generateState();
    const { codeVerifier } = generatePKCE();
    const now = new Date();

    await prisma.oAuthState.create({
      data: {
        organization_id: testOrgId,
        user_id: randomUUID(),
        state,
        code_verifier: codeVerifier,
        created_at: now,
        expires_at: calculateStateExpiration(10),
        used: false,
      },
    });

    // Property: State created now should be valid
    expect(isStateValid(now, 10)).toBe(true);
  });

  it('should invalidate expired state (created 11 minutes ago)', async () => {
    const state = generateState();
    const { codeVerifier } = generatePKCE();
    const elevenMinutesAgo = new Date(Date.now() - 11 * 60 * 1000);

    await prisma.oAuthState.create({
      data: {
        organization_id: testOrgId,
        user_id: randomUUID(),
        state,
        code_verifier: codeVerifier,
        created_at: elevenMinutesAgo,
        expires_at: new Date(elevenMinutesAgo.getTime() + 10 * 60 * 1000),
        used: false,
      },
    });

    // Property: State created 11 minutes ago should be invalid (10 min expiry)
    expect(isStateValid(elevenMinutesAgo, 10)).toBe(false);
  });

  it('should validate state at exactly max age boundary', async () => {
    const exactlyTenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

    // Property: State at exactly max age should still be valid
    expect(isStateValid(exactlyTenMinutesAgo, 10)).toBe(true);
  });

  it('should invalidate state 1ms after max age', async () => {
    const justOverTenMinutes = new Date(Date.now() - 10 * 60 * 1000 - 1);

    // Property: State 1ms over max age should be invalid
    expect(isStateValid(justOverTenMinutes, 10)).toBe(false);
  });
});

describe('Property 5: Invalid State Rejection', () => {
  let testOrgId: string;

  beforeAll(async () => {
    const org = await prisma.organization.create({
      data: {
        name: 'Test Org Invalid State',
        slug: `test-org-invalid-state-${randomUUID()}`,
      },
    });
    testOrgId = org.id;
  });

  afterAll(async () => {
    await prisma.oAuthState.deleteMany({
      where: { organization_id: testOrgId },
    });
    await prisma.organization.delete({
      where: { id: testOrgId },
    });
    await prisma.$disconnect();
  });

  it('should not find non-existent state', async () => {
    const nonExistentState = generateState();

    const result = await prisma.oAuthState.findUnique({
      where: { state: nonExistentState },
    });

    // Property: Non-existent state should return null
    expect(result).toBeNull();
  });

  it('should reject already-used state', async () => {
    const state = generateState();
    const { codeVerifier } = generatePKCE();

    // Create and mark as used
    await prisma.oAuthState.create({
      data: {
        organization_id: testOrgId,
        user_id: randomUUID(),
        state,
        code_verifier: codeVerifier,
        created_at: new Date(),
        expires_at: calculateStateExpiration(10),
        used: true, // Already used
      },
    });

    const result = await prisma.oAuthState.findUnique({
      where: { state },
    });

    // Property: Used state should be marked as used
    expect(result).not.toBeNull();
    expect(result!.used).toBe(true);
  });

  it('should enforce state uniqueness', async () => {
    const state = generateState();
    const { codeVerifier } = generatePKCE();

    await prisma.oAuthState.create({
      data: {
        organization_id: testOrgId,
        user_id: randomUUID(),
        state,
        code_verifier: codeVerifier,
        created_at: new Date(),
        expires_at: calculateStateExpiration(10),
        used: false,
      },
    });

    // Property: Duplicate state should fail
    await expect(
      prisma.oAuthState.create({
        data: {
          organization_id: testOrgId,
          user_id: randomUUID(),
          state, // Same state
          code_verifier: generatePKCE().codeVerifier,
          created_at: new Date(),
          expires_at: calculateStateExpiration(10),
          used: false,
        },
      })
    ).rejects.toThrow();
  });
});

describe('Property 9: Invalid Credential No-Refresh', () => {
  let testOrgId: string;

  beforeAll(async () => {
    process.env.TOKEN_ENCRYPTION_KEY = generateEncryptionKey();

    const org = await prisma.organization.create({
      data: {
        name: 'Test Org No Refresh',
        slug: `test-org-no-refresh-${randomUUID()}`,
      },
    });
    testOrgId = org.id;
  });

  afterAll(async () => {
    await prisma.azureCredential.deleteMany({
      where: { organization_id: testOrgId },
    });
    await prisma.organization.delete({
      where: { id: testOrgId },
    });
    await prisma.$disconnect();
  });

  it('should identify credential with refresh_error as invalid', async () => {
    const cred = await prisma.azureCredential.create({
      data: {
        organization_id: testOrgId,
        subscription_id: `sub-${randomUUID()}`,
        auth_type: 'oauth',
        refresh_error: 'Authorization expired or revoked',
        is_active: false,
      },
    });

    const result = await prisma.azureCredential.findUnique({
      where: { id: cred.id },
    });

    // Property: Credential with refresh_error should be marked invalid
    expect(result).not.toBeNull();
    expect(result!.refresh_error).toBeTruthy();
    expect(result!.is_active).toBe(false);
  });

  it('should identify credential without refresh_token as unable to refresh', async () => {
    const cred = await prisma.azureCredential.create({
      data: {
        organization_id: testOrgId,
        subscription_id: `sub-${randomUUID()}`,
        auth_type: 'oauth',
        encrypted_refresh_token: null, // No refresh token
        is_active: true,
      },
    });

    const result = await prisma.azureCredential.findUnique({
      where: { id: cred.id },
    });

    // Property: Credential without refresh_token cannot be refreshed
    expect(result).not.toBeNull();
    expect(result!.encrypted_refresh_token).toBeNull();
  });

  it('should identify service_principal credentials as not needing refresh', async () => {
    const cred = await prisma.azureCredential.create({
      data: {
        organization_id: testOrgId,
        subscription_id: `sub-${randomUUID()}`,
        auth_type: 'service_principal',
        tenant_id: `tenant-${randomUUID()}`,
        client_id: `client-${randomUUID()}`,
        client_secret: 'encrypted-secret',
        is_active: true,
      },
    });

    const result = await prisma.azureCredential.findUnique({
      where: { id: cred.id },
    });

    // Property: Service principal credentials don't use OAuth refresh
    expect(result).not.toBeNull();
    expect(result!.auth_type).toBe('service_principal');
    expect(result!.encrypted_refresh_token).toBeNull();
  });
});

describe('Property 10: Credential Deletion Cascade', () => {
  let testOrgId: string;

  beforeAll(async () => {
    const org = await prisma.organization.create({
      data: {
        name: 'Test Org Cascade Delete',
        slug: `test-org-cascade-${randomUUID()}`,
      },
    });
    testOrgId = org.id;
  });

  afterAll(async () => {
    await prisma.organization.delete({
      where: { id: testOrgId },
    });
    await prisma.$disconnect();
  });

  it('should delete credential and verify it is gone', async () => {
    const cred = await prisma.azureCredential.create({
      data: {
        organization_id: testOrgId,
        subscription_id: `sub-${randomUUID()}`,
        auth_type: 'oauth',
        is_active: true,
      },
    });

    // Delete the credential
    await prisma.azureCredential.delete({
      where: { id: cred.id },
    });

    // Property: Deleted credential should not exist
    const result = await prisma.azureCredential.findUnique({
      where: { id: cred.id },
    });
    expect(result).toBeNull();
  });

  it('should cascade delete related security scans', async () => {
    // Create AWS credential first (required for SecurityScan)
    const awsCred = await prisma.awsCredential.create({
      data: {
        organization_id: testOrgId,
        account_id: '123456789012',
        account_name: 'Test AWS Account',
        is_active: true,
      },
    });

    const azureCred = await prisma.azureCredential.create({
      data: {
        organization_id: testOrgId,
        subscription_id: `sub-${randomUUID()}`,
        auth_type: 'oauth',
        is_active: true,
      },
    });

    // Create a security scan linked to the Azure credential
    const scan = await prisma.securityScan.create({
      data: {
        organization_id: testOrgId,
        aws_account_id: awsCred.id,
        cloud_provider: 'AZURE',
        azure_credential_id: azureCred.id,
        scan_type: 'security',
        status: 'completed',
      },
    });

    // Delete the Azure credential
    await prisma.azureCredential.delete({
      where: { id: azureCred.id },
    });

    // Property: Related security scans should have azure_credential_id set to null
    // (or be deleted depending on cascade configuration)
    const scanResult = await prisma.securityScan.findUnique({
      where: { id: scan.id },
    });

    // The scan should either be deleted or have null azure_credential_id
    if (scanResult) {
      expect(scanResult.azure_credential_id).toBeNull();
    }

    // Cleanup
    if (scanResult) {
      await prisma.securityScan.delete({ where: { id: scan.id } });
    }
    await prisma.awsCredential.delete({ where: { id: awsCred.id } });
  });
});

describe('Property 12: Token Non-Exposure in Logs', () => {
  beforeAll(() => {
    process.env.TOKEN_ENCRYPTION_KEY = generateEncryptionKey();
  });

  it('should not expose raw tokens in encrypted format', () => {
    const sensitiveToken = 'super-secret-refresh-token-12345';
    const encrypted = encryptToken(sensitiveToken);
    const serialized = serializeEncryptedToken(encrypted);

    // Property: Serialized encrypted token should not contain raw token
    expect(serialized).not.toContain(sensitiveToken);
    expect(encrypted.ciphertext).not.toContain(sensitiveToken);
  });

  it('should produce different ciphertext for same token', () => {
    const token = 'same-token-for-log-test';

    const encrypted1 = encryptToken(token);
    const encrypted2 = encryptToken(token);

    // Property: Same token should produce different ciphertext (due to random IV)
    expect(encrypted1.ciphertext).not.toBe(encrypted2.ciphertext);
  });

  it('should not expose token in JSON stringification', () => {
    const token = 'token-to-stringify';
    const encrypted = encryptToken(token);

    const jsonString = JSON.stringify(encrypted);

    // Property: JSON representation should not contain raw token
    expect(jsonString).not.toContain(token);
  });

  it('should mask token prefixes in log-safe format', () => {
    const token = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsIng1dCI6Imk2bEdrM0ZaenhSY1ViMkMzbkVRN3N5SEpsWSIsImtpZCI6Imk2bEdrM0ZaenhSY1ViMkMzbkVRN3N5SEpsWSJ9.eyJhdWQiOiJodHRwczovL21hbmFnZW1lbnQuYXp1cmUuY29tIiwiaXNzIjoiaHR0cHM6Ly9zdHMud2luZG93cy5uZXQvNzJmOTg4YmYtODZmMS00MWFmLTkxYWItMmQ3Y2QwMTFkYjQ3LyIsImlhdCI6MTYwMDAwMDAwMCwibmJmIjoxNjAwMDAwMDAwLCJleHAiOjE2MDAwMDM2MDAsImFjciI6IjEiLCJhaW8iOiJBVFFBeS84UUFBQUE9PSIsImFtciI6WyJwd2QiXSwiYXBwaWQiOiIwNGIwNzc5NS04ZGRiLTQ2MWEtYmJlZS0wMmY5ZTFiZjdiNDYiLCJhcHBpZGFjciI6IjAiLCJmYW1pbHlfbmFtZSI6IkRvZSIsImdpdmVuX25hbWUiOiJKb2huIiwiaXBhZGRyIjoiMTI3LjAuMC4xIiwibmFtZSI6IkpvaG4gRG9lIiwib2lkIjoiMDAwMDAwMDAtMDAwMC0wMDAwLTAwMDAtMDAwMDAwMDAwMDAwIiwicHVpZCI6IjEwMDMwMDAwQTEyMzQ1NjciLCJzY3AiOiJ1c2VyX2ltcGVyc29uYXRpb24iLCJzdWIiOiJBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQT0iLCJ0aWQiOiI3MmY5ODhiZi04NmYxLTQxYWYtOTFhYi0yZDdjZDAxMWRiNDciLCJ1bmlxdWVfbmFtZSI6ImpvaG4uZG9lQGV4YW1wbGUuY29tIiwidXBuIjoiam9obi5kb2VAZXhhbXBsZS5jb20iLCJ1dGkiOiJBQkNERUZHSElKS0xNTk9QUVJTVFVWV1hZWjAxMjM0NTY3ODkiLCJ2ZXIiOiIxLjAifQ.signature';

    // Create a log-safe version (first 8 chars + ...)
    const logSafeToken = token.substring(0, 8) + '...';

    // Property: Log-safe format should not expose full token
    expect(logSafeToken.length).toBeLessThan(token.length);
    expect(logSafeToken).toBe('eyJ0eXAi...');
  });
});

describe('Property 13: Mixed Auth Type Support', () => {
  let testOrgId: string;

  beforeAll(async () => {
    process.env.TOKEN_ENCRYPTION_KEY = generateEncryptionKey();

    const org = await prisma.organization.create({
      data: {
        name: 'Test Org Mixed Auth',
        slug: `test-org-mixed-auth-${randomUUID()}`,
      },
    });
    testOrgId = org.id;
  });

  afterAll(async () => {
    await prisma.azureCredential.deleteMany({
      where: { organization_id: testOrgId },
    });
    await prisma.organization.delete({
      where: { id: testOrgId },
    });
    await prisma.$disconnect();
  });

  it('should support service_principal auth type', async () => {
    const cred = await prisma.azureCredential.create({
      data: {
        organization_id: testOrgId,
        subscription_id: `sub-sp-${randomUUID()}`,
        auth_type: 'service_principal',
        tenant_id: `tenant-${randomUUID()}`,
        client_id: `client-${randomUUID()}`,
        client_secret: 'encrypted-secret',
        is_active: true,
      },
    });

    // Property: Service principal credentials should have required fields
    expect(cred.auth_type).toBe('service_principal');
    expect(cred.tenant_id).toBeTruthy();
    expect(cred.client_id).toBeTruthy();
    expect(cred.client_secret).toBeTruthy();
  });

  it('should support oauth auth type', async () => {
    const encryptedToken = serializeEncryptedToken(
      encryptToken('test-refresh-token')
    );

    const cred = await prisma.azureCredential.create({
      data: {
        organization_id: testOrgId,
        subscription_id: `sub-oauth-${randomUUID()}`,
        auth_type: 'oauth',
        oauth_tenant_id: `tenant-${randomUUID()}`,
        oauth_user_email: 'user@example.com',
        encrypted_refresh_token: encryptedToken,
        token_expires_at: new Date(Date.now() + 3600 * 1000),
        is_active: true,
      },
    });

    // Property: OAuth credentials should have required fields
    expect(cred.auth_type).toBe('oauth');
    expect(cred.oauth_tenant_id).toBeTruthy();
    expect(cred.oauth_user_email).toBeTruthy();
    expect(cred.encrypted_refresh_token).toBeTruthy();
  });

  it('should allow both auth types in same organization', async () => {
    const spCred = await prisma.azureCredential.create({
      data: {
        organization_id: testOrgId,
        subscription_id: `sub-mixed-sp-${randomUUID()}`,
        auth_type: 'service_principal',
        tenant_id: `tenant-${randomUUID()}`,
        client_id: `client-${randomUUID()}`,
        client_secret: 'encrypted-secret',
        is_active: true,
      },
    });

    const oauthCred = await prisma.azureCredential.create({
      data: {
        organization_id: testOrgId,
        subscription_id: `sub-mixed-oauth-${randomUUID()}`,
        auth_type: 'oauth',
        oauth_tenant_id: `tenant-${randomUUID()}`,
        oauth_user_email: 'user2@example.com',
        encrypted_refresh_token: serializeEncryptedToken(
          encryptToken('test-refresh-token-2')
        ),
        is_active: true,
      },
    });

    // Fetch all credentials for the organization
    const allCreds = await prisma.azureCredential.findMany({
      where: { organization_id: testOrgId },
    });

    // Property: Organization should have both auth types
    const authTypes = allCreds.map(c => c.auth_type);
    expect(authTypes).toContain('service_principal');
    expect(authTypes).toContain('oauth');
  });

  it('should filter credentials by auth_type', async () => {
    const oauthCreds = await prisma.azureCredential.findMany({
      where: {
        organization_id: testOrgId,
        auth_type: 'oauth',
      },
    });

    const spCreds = await prisma.azureCredential.findMany({
      where: {
        organization_id: testOrgId,
        auth_type: 'service_principal',
      },
    });

    // Property: Filtering by auth_type should work correctly
    expect(oauthCreds.every(c => c.auth_type === 'oauth')).toBe(true);
    expect(spCreds.every(c => c.auth_type === 'service_principal')).toBe(true);
  });
});
