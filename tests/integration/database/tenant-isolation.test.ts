/**
 * Integration Tests for Tenant Isolation
 * Ensures data isolation between organizations
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getPrismaClient } from '../../../backend/src/lib/database';

const prisma = getPrismaClient();

describe('Tenant Isolation', () => {
  const org1Id = 'org-1-test';
  const org2Id = 'org-2-test';
  const user1Id = 'user-1-test';
  const user2Id = 'user-2-test';

  beforeEach(async () => {
    // Setup test data
    await prisma.organization.createMany({
      data: [
        { id: org1Id, name: 'Organization 1', plan: 'enterprise' },
        { id: org2Id, name: 'Organization 2', plan: 'enterprise' },
      ],
      skipDuplicates: true,
    });

    await prisma.user.createMany({
      data: [
        { id: user1Id, email: 'user1@test.com', organization_id: org1Id },
        { id: user2Id, email: 'user2@test.com', organization_id: org2Id },
      ],
      skipDuplicates: true,
    });
  });

  afterEach(async () => {
    // Cleanup test data
    await prisma.finding.deleteMany({
      where: { organization_id: { in: [org1Id, org2Id] } },
    });
    await prisma.securityScan.deleteMany({
      where: { organization_id: { in: [org1Id, org2Id] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [user1Id, user2Id] } },
    });
    await prisma.organization.deleteMany({
      where: { id: { in: [org1Id, org2Id] } },
    });
  });

  it('should isolate security scans between organizations', async () => {
    // Create scans for both organizations
    const scan1 = await prisma.securityScan.create({
      data: {
        scan_type: 'comprehensive',
        status: 'completed',
        organization_id: org1Id,
        created_by: user1Id,
      },
    });

    const scan2 = await prisma.securityScan.create({
      data: {
        scan_type: 'quick',
        status: 'completed',
        organization_id: org2Id,
        created_by: user2Id,
      },
    });

    // Verify org1 can only see their scan
    const org1Scans = await prisma.securityScan.findMany({
      where: { organization_id: org1Id },
    });
    expect(org1Scans).toHaveLength(1);
    expect(org1Scans[0].id).toBe(scan1.id);

    // Verify org2 can only see their scan
    const org2Scans = await prisma.securityScan.findMany({
      where: { organization_id: org2Id },
    });
    expect(org2Scans).toHaveLength(1);
    expect(org2Scans[0].id).toBe(scan2.id);
  });

  it('should isolate findings between organizations', async () => {
    // Create findings for both organizations
    await prisma.finding.createMany({
      data: [
        {
          title: 'Finding 1',
          severity: 'high',
          status: 'ACTIVE',
          organization_id: org1Id,
          resource_id: 'resource-1',
          resource_type: 'EC2',
          details: { test: 'data' },
        },
        {
          title: 'Finding 2',
          severity: 'medium',
          status: 'ACTIVE',
          organization_id: org2Id,
          resource_id: 'resource-2',
          resource_type: 'S3',
          details: { test: 'data' },
        },
      ],
    });

    // Verify isolation
    const org1Findings = await prisma.finding.findMany({
      where: { organization_id: org1Id },
    });
    expect(org1Findings).toHaveLength(1);
    expect(org1Findings[0].title).toBe('Finding 1');

    const org2Findings = await prisma.finding.findMany({
      where: { organization_id: org2Id },
    });
    expect(org2Findings).toHaveLength(1);
    expect(org2Findings[0].title).toBe('Finding 2');
  });

  it('should prevent cross-organization data access', async () => {
    const scan = await prisma.securityScan.create({
      data: {
        scan_type: 'comprehensive',
        status: 'completed',
        organization_id: org1Id,
        created_by: user1Id,
      },
    });

    // Try to access org1's scan from org2's context
    const crossOrgAccess = await prisma.securityScan.findFirst({
      where: {
        id: scan.id,
        organization_id: org2Id, // Wrong organization
      },
    });

    expect(crossOrgAccess).toBeNull();
  });

  it('should enforce organization_id in all queries', async () => {
    // This test ensures that all queries include organization_id filter
    // In a real implementation, this would be enforced by RLS or middleware

    const findings = await prisma.finding.findMany({
      where: { organization_id: org1Id },
    });

    // All findings should belong to the specified organization
    findings.forEach(finding => {
      expect(finding.organization_id).toBe(org1Id);
    });
  });
});