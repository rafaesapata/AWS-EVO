/**
 * Property Test: Multi-Tenancy Isolation (Property 2)
 * 
 * Validates Requirement 1.6: Multi-tenancy isolation
 * 
 * This test ensures that Azure credentials and related data are properly
 * isolated between organizations, preventing data leakage across tenants.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

describe('Property 2: Multi-Tenancy Isolation', () => {
  let org1Id: string;
  let org2Id: string;
  let azureCred1Id: string;
  let azureCred2Id: string;

  beforeAll(async () => {
    // Create two test organizations
    const org1 = await prisma.organization.create({
      data: {
        name: 'Test Org 1',
        slug: `test-org-1-${randomUUID()}`,
      },
    });
    org1Id = org1.id;

    const org2 = await prisma.organization.create({
      data: {
        name: 'Test Org 2',
        slug: `test-org-2-${randomUUID()}`,
      },
    });
    org2Id = org2.id;

    // Create Azure credentials for each organization
    const azureCred1 = await prisma.azureCredential.create({
      data: {
        organization_id: org1Id,
        subscription_id: `sub-${randomUUID()}`,
        subscription_name: 'Test Subscription 1',
        tenant_id: `tenant-${randomUUID()}`,
        client_id: `client-${randomUUID()}`,
        client_secret: 'encrypted-secret-1',
        regions: ['eastus', 'westus'],
      },
    });
    azureCred1Id = azureCred1.id;

    const azureCred2 = await prisma.azureCredential.create({
      data: {
        organization_id: org2Id,
        subscription_id: `sub-${randomUUID()}`,
        subscription_name: 'Test Subscription 2',
        tenant_id: `tenant-${randomUUID()}`,
        client_id: `client-${randomUUID()}`,
        client_secret: 'encrypted-secret-2',
        regions: ['eastus2', 'westus2'],
      },
    });
    azureCred2Id = azureCred2.id;
  });

  afterAll(async () => {
    // Cleanup: Delete test data
    await prisma.azureCredential.deleteMany({
      where: {
        id: { in: [azureCred1Id, azureCred2Id] },
      },
    });

    await prisma.organization.deleteMany({
      where: {
        id: { in: [org1Id, org2Id] },
      },
    });

    await prisma.$disconnect();
  });

  it('should isolate Azure credentials by organization_id', async () => {
    // Fetch credentials for org1
    const org1Creds = await prisma.azureCredential.findMany({
      where: { organization_id: org1Id },
    });

    // Fetch credentials for org2
    const org2Creds = await prisma.azureCredential.findMany({
      where: { organization_id: org2Id },
    });

    // Property: Each organization should only see their own credentials
    expect(org1Creds).toHaveLength(1);
    expect(org1Creds[0].id).toBe(azureCred1Id);
    expect(org1Creds[0].organization_id).toBe(org1Id);

    expect(org2Creds).toHaveLength(1);
    expect(org2Creds[0].id).toBe(azureCred2Id);
    expect(org2Creds[0].organization_id).toBe(org2Id);

    // Property: Credentials should not leak across organizations
    expect(org1Creds.some(c => c.id === azureCred2Id)).toBe(false);
    expect(org2Creds.some(c => c.id === azureCred1Id)).toBe(false);
  });

  it('should isolate Azure security findings by organization_id', async () => {
    // Create test findings for each organization
    const finding1 = await prisma.finding.create({
      data: {
        organization_id: org1Id,
        cloud_provider: 'AZURE',
        azure_credential_id: azureCred1Id,
        severity: 'high',
        description: 'Test finding for org 1',
        details: { test: true },
      },
    });

    const finding2 = await prisma.finding.create({
      data: {
        organization_id: org2Id,
        cloud_provider: 'AZURE',
        azure_credential_id: azureCred2Id,
        severity: 'medium',
        description: 'Test finding for org 2',
        details: { test: true },
      },
    });

    // Fetch findings for each organization
    const org1Findings = await prisma.finding.findMany({
      where: {
        organization_id: org1Id,
        cloud_provider: 'AZURE',
      },
    });

    const org2Findings = await prisma.finding.findMany({
      where: {
        organization_id: org2Id,
        cloud_provider: 'AZURE',
      },
    });

    // Property: Each organization should only see their own findings
    expect(org1Findings.some(f => f.id === finding1.id)).toBe(true);
    expect(org1Findings.some(f => f.id === finding2.id)).toBe(false);

    expect(org2Findings.some(f => f.id === finding2.id)).toBe(true);
    expect(org2Findings.some(f => f.id === finding1.id)).toBe(false);

    // Cleanup
    await prisma.finding.deleteMany({
      where: { id: { in: [finding1.id, finding2.id] } },
    });
  });

  it('should isolate Azure cost data by organization_id', async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Create test cost data for each organization
    const cost1 = await prisma.dailyCost.create({
      data: {
        organization_id: org1Id,
        aws_account_id: azureCred1Id, // Reusing field for Azure credential ID
        cloud_provider: 'AZURE',
        azure_credential_id: azureCred1Id,
        date: today,
        service: 'Virtual Machines',
        cost: 100.50,
        currency: 'USD',
      },
    });

    const cost2 = await prisma.dailyCost.create({
      data: {
        organization_id: org2Id,
        aws_account_id: azureCred2Id,
        cloud_provider: 'AZURE',
        azure_credential_id: azureCred2Id,
        date: today,
        service: 'Storage Accounts',
        cost: 50.25,
        currency: 'USD',
      },
    });

    // Fetch cost data for each organization
    const org1Costs = await prisma.dailyCost.findMany({
      where: {
        organization_id: org1Id,
        cloud_provider: 'AZURE',
      },
    });

    const org2Costs = await prisma.dailyCost.findMany({
      where: {
        organization_id: org2Id,
        cloud_provider: 'AZURE',
      },
    });

    // Property: Each organization should only see their own cost data
    expect(org1Costs.some(c => c.id === cost1.id)).toBe(true);
    expect(org1Costs.some(c => c.id === cost2.id)).toBe(false);

    expect(org2Costs.some(c => c.id === cost2.id)).toBe(true);
    expect(org2Costs.some(c => c.id === cost1.id)).toBe(false);

    // Cleanup
    await prisma.dailyCost.deleteMany({
      where: { id: { in: [cost1.id, cost2.id] } },
    });
  });

  it('should isolate Azure resource inventory by organization_id', async () => {
    // Create test resources for each organization
    const resource1 = await prisma.resourceInventory.create({
      data: {
        organization_id: org1Id,
        aws_account_id: azureCred1Id,
        cloud_provider: 'AZURE',
        azure_credential_id: azureCred1Id,
        resource_id: `/subscriptions/${randomUUID()}/resourceGroups/test-rg/providers/Microsoft.Compute/virtualMachines/vm1`,
        resource_type: 'Microsoft.Compute/virtualMachines',
        resource_name: 'test-vm-1',
        region: 'eastus',
        metadata: { size: 'Standard_D2s_v3' },
      },
    });

    const resource2 = await prisma.resourceInventory.create({
      data: {
        organization_id: org2Id,
        aws_account_id: azureCred2Id,
        cloud_provider: 'AZURE',
        azure_credential_id: azureCred2Id,
        resource_id: `/subscriptions/${randomUUID()}/resourceGroups/test-rg/providers/Microsoft.Compute/virtualMachines/vm2`,
        resource_type: 'Microsoft.Compute/virtualMachines',
        resource_name: 'test-vm-2',
        region: 'westus',
        metadata: { size: 'Standard_B2s' },
      },
    });

    // Fetch resources for each organization
    const org1Resources = await prisma.resourceInventory.findMany({
      where: {
        organization_id: org1Id,
        cloud_provider: 'AZURE',
      },
    });

    const org2Resources = await prisma.resourceInventory.findMany({
      where: {
        organization_id: org2Id,
        cloud_provider: 'AZURE',
      },
    });

    // Property: Each organization should only see their own resources
    expect(org1Resources.some(r => r.id === resource1.id)).toBe(true);
    expect(org1Resources.some(r => r.id === resource2.id)).toBe(false);

    expect(org2Resources.some(r => r.id === resource2.id)).toBe(true);
    expect(org2Resources.some(r => r.id === resource1.id)).toBe(false);

    // Cleanup
    await prisma.resourceInventory.deleteMany({
      where: { id: { in: [resource1.id, resource2.id] } },
    });
  });

  it('should prevent cross-organization queries via credential ID', async () => {
    // Attempt to query org2's credentials using org1's organization_id
    const crossOrgQuery = await prisma.azureCredential.findMany({
      where: {
        organization_id: org1Id,
        id: azureCred2Id, // Trying to access org2's credential
      },
    });

    // Property: Cross-organization queries should return empty results
    expect(crossOrgQuery).toHaveLength(0);
  });

  it('should enforce unique constraint on organization_id + subscription_id', async () => {
    // Attempt to create duplicate Azure credential with same subscription_id for same org
    const duplicateSubscriptionId = `sub-duplicate-${randomUUID()}`;

    await prisma.azureCredential.create({
      data: {
        organization_id: org1Id,
        subscription_id: duplicateSubscriptionId,
        tenant_id: `tenant-${randomUUID()}`,
        client_id: `client-${randomUUID()}`,
        client_secret: 'encrypted-secret',
        regions: ['eastus'],
      },
    });

    // Property: Duplicate subscription_id for same organization should fail
    await expect(
      prisma.azureCredential.create({
        data: {
          organization_id: org1Id,
          subscription_id: duplicateSubscriptionId, // Same subscription_id
          tenant_id: `tenant-${randomUUID()}`,
          client_id: `client-${randomUUID()}`,
          client_secret: 'encrypted-secret-2',
          regions: ['westus'],
        },
      })
    ).rejects.toThrow();

    // Cleanup
    await prisma.azureCredential.deleteMany({
      where: {
        organization_id: org1Id,
        subscription_id: duplicateSubscriptionId,
      },
    });
  });

  it('should allow same subscription_id across different organizations', async () => {
    // This tests that the unique constraint is scoped to organization
    const sharedSubscriptionId = `sub-shared-${randomUUID()}`;

    const cred1 = await prisma.azureCredential.create({
      data: {
        organization_id: org1Id,
        subscription_id: sharedSubscriptionId,
        tenant_id: `tenant-${randomUUID()}`,
        client_id: `client-${randomUUID()}`,
        client_secret: 'encrypted-secret-1',
        regions: ['eastus'],
      },
    });

    // Property: Same subscription_id should be allowed for different organizations
    const cred2 = await prisma.azureCredential.create({
      data: {
        organization_id: org2Id,
        subscription_id: sharedSubscriptionId, // Same subscription_id, different org
        tenant_id: `tenant-${randomUUID()}`,
        client_id: `client-${randomUUID()}`,
        client_secret: 'encrypted-secret-2',
        regions: ['westus'],
      },
    });

    expect(cred1.subscription_id).toBe(sharedSubscriptionId);
    expect(cred2.subscription_id).toBe(sharedSubscriptionId);
    expect(cred1.organization_id).not.toBe(cred2.organization_id);

    // Cleanup
    await prisma.azureCredential.deleteMany({
      where: {
        id: { in: [cred1.id, cred2.id] },
      },
    });
  });
});
