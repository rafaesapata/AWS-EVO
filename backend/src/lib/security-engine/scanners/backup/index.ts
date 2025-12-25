/**
 * Security Engine V2 - AWS Backup Scanner
 * Checks: vault lock, encryption, cross-region/account backup, compliance
 */

import { BaseScanner } from '../../core/base-scanner.js';
import type { Finding, AWSCredentials } from '../../types.js';
import { ResourceCache } from '../../core/resource-cache.js';
import {
  ListBackupVaultsCommand,
  GetBackupVaultAccessPolicyCommand,
  ListBackupPlansCommand,
  GetBackupPlanCommand,
  ListProtectedResourcesCommand,
  DescribeBackupVaultCommand,
} from '@aws-sdk/client-backup';

export class BackupScanner extends BaseScanner {
  get serviceName(): string { return 'Backup'; }
  get category(): string { return 'Data Protection'; }

  async scan(): Promise<Finding[]> {
    this.log('Starting AWS Backup security scan');
    const findings: Finding[] = [];
    const client = await this.clientFactory.getBackupClient(this.region);

    try {
      // Check backup vaults
      const vaults = await client.send(new ListBackupVaultsCommand({}));
      
      if (!vaults.BackupVaultList?.length) {
        findings.push(this.createFinding({
          severity: 'medium',
          title: `No Backup Vaults: ${this.region}`,
          description: `No AWS Backup vaults configured in ${this.region}`,
          analysis: 'Without backup vaults, AWS Backup cannot store recovery points.',
          resource_id: `backup-${this.region}`,
          resource_arn: `arn:aws:backup:${this.region}:${this.accountId}:backup-vault`,
          scan_type: 'backup_no_vaults',
          compliance: [
            this.wellArchitectedCompliance('REL', 'Back Up Data'),
          ],
          evidence: { region: this.region, vaultCount: 0 },
          risk_vector: 'data_loss',
        }));
      }

      for (const vault of vaults.BackupVaultList || []) {
        if (!vault.BackupVaultName || !vault.BackupVaultArn) continue;

        // Check 1: Vault not using KMS encryption
        await this.safeExecute(`vault-details-${vault.BackupVaultName}`, async () => {
          const vaultDetails = await client.send(new DescribeBackupVaultCommand({ 
            BackupVaultName: vault.BackupVaultName 
          }));
          
          if (!vaultDetails.EncryptionKeyArn || vaultDetails.EncryptionKeyArn.includes('aws/backup')) {
            findings.push(this.createFinding({
              severity: 'medium',
              title: `Backup Vault Using Default Encryption: ${vault.BackupVaultName}`,
              description: `Vault ${vault.BackupVaultName} is using AWS managed key instead of customer managed KMS key`,
              analysis: 'Customer managed KMS keys provide better control and audit capabilities.',
              resource_id: vault.BackupVaultName!,
              resource_arn: vault.BackupVaultArn!,
              scan_type: 'backup_vault_default_encryption',
              compliance: [
                this.pciCompliance('3.5', 'Protect Cryptographic Keys'),
              ],
              evidence: { vaultName: vault.BackupVaultName, encryptionKeyArn: vaultDetails.EncryptionKeyArn },
              risk_vector: 'encryption_weakness',
            }));
          }

          // Check 2: Vault lock not enabled
          if (!vaultDetails.Locked) {
            findings.push(this.createFinding({
              severity: 'medium',
              title: `Backup Vault Lock Not Enabled: ${vault.BackupVaultName}`,
              description: `Vault ${vault.BackupVaultName} does not have vault lock enabled`,
              analysis: 'Vault lock provides WORM (Write Once Read Many) protection for backups.',
              resource_id: vault.BackupVaultName!,
              resource_arn: vault.BackupVaultArn!,
              scan_type: 'backup_vault_no_lock',
              compliance: [
                this.soc2Compliance('CC6.1', 'Logical and Physical Access Controls'),
              ],
              remediation: {
                description: 'Enable vault lock to prevent backup deletion',
                steps: ['Go to AWS Backup console', 'Select vault', 'Configure vault lock'],
                estimated_effort: 'low',
                automation_available: true,
              },
              evidence: { vaultName: vault.BackupVaultName, locked: false },
              risk_vector: 'data_loss',
            }));
          }
        }, null);

        // Check 3: No access policy
        try {
          await client.send(new GetBackupVaultAccessPolicyCommand({ 
            BackupVaultName: vault.BackupVaultName 
          }));
        } catch (e: any) {
          if (e.name === 'ResourceNotFoundException') {
            findings.push(this.createFinding({
              severity: 'low',
              title: `Backup Vault No Access Policy: ${vault.BackupVaultName}`,
              description: `Vault ${vault.BackupVaultName} has no resource-based access policy`,
              analysis: 'Access policies provide additional control over who can access the vault.',
              resource_id: vault.BackupVaultName,
              resource_arn: vault.BackupVaultArn,
              scan_type: 'backup_vault_no_policy',
              evidence: { vaultName: vault.BackupVaultName, hasPolicy: false },
              risk_vector: 'access_control',
            }));
          }
        }
      }

      // Check backup plans
      const plans = await client.send(new ListBackupPlansCommand({}));
      
      if (!plans.BackupPlansList?.length) {
        findings.push(this.createFinding({
          severity: 'medium',
          title: `No Backup Plans: ${this.region}`,
          description: `No AWS Backup plans configured in ${this.region}`,
          analysis: 'Without backup plans, resources are not being automatically backed up.',
          resource_id: `backup-plans-${this.region}`,
          resource_arn: `arn:aws:backup:${this.region}:${this.accountId}:backup-plan`,
          scan_type: 'backup_no_plans',
          compliance: [
            this.wellArchitectedCompliance('REL', 'Back Up Data'),
          ],
          evidence: { region: this.region, planCount: 0 },
          risk_vector: 'data_loss',
        }));
      }

      for (const plan of plans.BackupPlansList || []) {
        if (!plan.BackupPlanId || !plan.BackupPlanArn) continue;

        await this.safeExecute(`plan-details-${plan.BackupPlanId}`, async () => {
          const planDetails = await client.send(new GetBackupPlanCommand({ 
            BackupPlanId: plan.BackupPlanId 
          }));

          // Check 4: No cross-region copy
          const hasCrossRegion = planDetails.BackupPlan?.Rules?.some(rule => 
            rule.CopyActions?.some(copy => copy.DestinationBackupVaultArn)
          );

          if (!hasCrossRegion) {
            findings.push(this.createFinding({
              severity: 'low',
              title: `Backup Plan No Cross-Region Copy: ${plan.BackupPlanName}`,
              description: `Backup plan ${plan.BackupPlanName} does not copy backups to another region`,
              analysis: 'Cross-region copies protect against regional disasters.',
              resource_id: plan.BackupPlanId!,
              resource_arn: plan.BackupPlanArn!,
              scan_type: 'backup_no_cross_region',
              compliance: [
                this.wellArchitectedCompliance('REL', 'Back Up Data'),
              ],
              evidence: { planName: plan.BackupPlanName, hasCrossRegion: false },
              risk_vector: 'data_loss',
            }));
          }

          // Check 5: Short retention period
          const shortRetention = planDetails.BackupPlan?.Rules?.some(rule => 
            rule.Lifecycle?.DeleteAfterDays && rule.Lifecycle.DeleteAfterDays < 30
          );

          if (shortRetention) {
            findings.push(this.createFinding({
              severity: 'low',
              title: `Backup Plan Short Retention: ${plan.BackupPlanName}`,
              description: `Backup plan ${plan.BackupPlanName} has retention period less than 30 days`,
              analysis: 'Short retention periods may not meet compliance requirements.',
              resource_id: plan.BackupPlanId!,
              resource_arn: plan.BackupPlanArn!,
              scan_type: 'backup_short_retention',
              evidence: { planName: plan.BackupPlanName },
              risk_vector: 'compliance_gap',
            }));
          }
        }, null);
      }

      // Check protected resources
      await this.safeExecute('protected-resources', async () => {
        const protectedResources = await client.send(new ListProtectedResourcesCommand({}));
        if (!protectedResources.Results?.length) {
          findings.push(this.createFinding({
            severity: 'medium',
            title: `No Protected Resources: ${this.region}`,
            description: `No resources are protected by AWS Backup in ${this.region}`,
            analysis: 'Critical resources should be protected by backup plans.',
            resource_id: `backup-protected-${this.region}`,
            resource_arn: `arn:aws:backup:${this.region}:${this.accountId}:protected-resources`,
            scan_type: 'backup_no_protected_resources',
            evidence: { region: this.region, protectedCount: 0 },
            risk_vector: 'data_loss',
          }));
        }
      }, null);
    } catch (error) {
      this.warn('Backup scan failed', { error: (error as Error).message });
    }

    this.log('AWS Backup scan completed', { findingsCount: findings.length });
    return findings;
  }
}

export async function scanBackup(
  region: string,
  accountId: string,
  credentials: AWSCredentials,
  cache: ResourceCache
): Promise<Finding[]> {
  const scanner = new BackupScanner(region, accountId, credentials, cache);
  return scanner.scan();
}
