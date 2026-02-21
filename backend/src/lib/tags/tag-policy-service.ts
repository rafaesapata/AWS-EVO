/**
 * Tag Policy Service — Organization-level tag governance
 */

import { getPrismaClient } from '../database.js';
import { logger } from '../logger.js';

export interface TagPolicyData {
  enforce_naming: boolean;
  prevent_duplicates: boolean;
  require_category: boolean;
  alert_low_coverage: boolean;
  coverage_threshold: number;
  alert_untagged_new: boolean;
  required_keys: string[];
}

const DEFAULT_POLICY: TagPolicyData = {
  enforce_naming: true,
  prevent_duplicates: true,
  require_category: false,
  alert_low_coverage: true,
  coverage_threshold: 80,
  alert_untagged_new: false,
  required_keys: ['environment', 'cost-center', 'team'],
};

export async function getTagPolicies(organizationId: string): Promise<TagPolicyData> {
  const prisma = getPrismaClient();
  try {
    const policy = await (prisma as any).tagPolicy.findUnique({
      where: { organization_id: organizationId },
    });
    if (!policy) return DEFAULT_POLICY;
    return {
      enforce_naming: policy.enforce_naming,
      prevent_duplicates: policy.prevent_duplicates,
      require_category: policy.require_category,
      alert_low_coverage: policy.alert_low_coverage,
      coverage_threshold: policy.coverage_threshold,
      alert_untagged_new: policy.alert_untagged_new,
      required_keys: policy.required_keys || DEFAULT_POLICY.required_keys,
    };
  } catch (err: any) {
    logger.warn('getTagPolicies error, returning defaults', { error: err.message });
    return DEFAULT_POLICY;
  }
}

export async function saveTagPolicies(
  organizationId: string,
  userId: string,
  data: Partial<TagPolicyData>
): Promise<TagPolicyData> {
  const prisma = getPrismaClient();
  const updateData: any = { updated_by: userId };
  if (data.enforce_naming !== undefined) updateData.enforce_naming = data.enforce_naming;
  if (data.prevent_duplicates !== undefined) updateData.prevent_duplicates = data.prevent_duplicates;
  if (data.require_category !== undefined) updateData.require_category = data.require_category;
  if (data.alert_low_coverage !== undefined) updateData.alert_low_coverage = data.alert_low_coverage;
  if (data.coverage_threshold !== undefined) updateData.coverage_threshold = Math.min(100, Math.max(0, data.coverage_threshold));
  if (data.alert_untagged_new !== undefined) updateData.alert_untagged_new = data.alert_untagged_new;
  if (data.required_keys !== undefined) updateData.required_keys = data.required_keys;

  const policy = await (prisma as any).tagPolicy.upsert({
    where: { organization_id: organizationId },
    create: { organization_id: organizationId, ...DEFAULT_POLICY, ...updateData },
    update: updateData,
  });

  return {
    enforce_naming: policy.enforce_naming,
    prevent_duplicates: policy.prevent_duplicates,
    require_category: policy.require_category,
    alert_low_coverage: policy.alert_low_coverage,
    coverage_threshold: policy.coverage_threshold,
    alert_untagged_new: policy.alert_untagged_new,
    required_keys: policy.required_keys,
  };
}
