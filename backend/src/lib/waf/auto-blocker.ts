/**
 * WAF Auto-Blocker Module
 * 
 * Automatically blocks IPs that exceed configured thresholds.
 * Integrates with AWS WAF IP Sets for enforcement.
 */

import { 
  WAFV2Client, 
  GetIPSetCommand,
  UpdateIPSetCommand,
  CreateIPSetCommand,
  ListIPSetsCommand,
} from '@aws-sdk/client-wafv2';
import { logger } from '../logging.js';

// Auto-block configuration
export interface AutoBlockConfig {
  enabled: boolean;
  threshold: number;        // Number of blocked requests to trigger auto-block
  blockDurationHours: number;
  ipSetName: string;        // Name of the WAF IP Set to use
  scope: 'REGIONAL' | 'CLOUDFRONT';
}

export const DEFAULT_AUTO_BLOCK_CONFIG: AutoBlockConfig = {
  enabled: false,
  threshold: 50,
  blockDurationHours: 24,
  ipSetName: 'evo-auto-blocked-ips',
  scope: 'REGIONAL',
};

// Block record
export interface BlockRecord {
  ipAddress: string;
  reason: string;
  blockedBy: 'auto' | 'manual';
  blockedAt: Date;
  expiresAt: Date;
  wafIpSetId?: string;
}

// Block result
export interface BlockResult {
  success: boolean;
  ipAddress: string;
  action: 'blocked' | 'already_blocked' | 'failed';
  message: string;
  wafIpSetId?: string;
}

/**
 * Format IP address for WAF IP Set (CIDR notation)
 */
function formatIpForWaf(ip: string): string {
  // Check if already in CIDR notation
  if (ip.includes('/')) {
    return ip;
  }
  
  // Check if IPv6
  if (ip.includes(':')) {
    return `${ip}/128`;
  }
  
  // IPv4
  return `${ip}/32`;
}

/**
 * Get or create the auto-block IP Set
 */
async function getOrCreateIpSet(
  wafClient: WAFV2Client,
  config: AutoBlockConfig
): Promise<{ id: string; lockToken: string; addresses: string[] }> {
  // First, try to find existing IP Set
  const listResponse = await wafClient.send(new ListIPSetsCommand({
    Scope: config.scope,
  }));
  
  const existingSet = listResponse.IPSets?.find(
    set => set.Name === config.ipSetName
  );
  
  if (existingSet?.Id) {
    // Get the IP Set details
    const getResponse = await wafClient.send(new GetIPSetCommand({
      Name: config.ipSetName,
      Scope: config.scope,
      Id: existingSet.Id,
    }));
    
    return {
      id: existingSet.Id,
      lockToken: getResponse.LockToken || '',
      addresses: getResponse.IPSet?.Addresses || [],
    };
  }
  
  // Create new IP Set
  const createResponse = await wafClient.send(new CreateIPSetCommand({
    Name: config.ipSetName,
    Scope: config.scope,
    IPAddressVersion: 'IPV4', // Could be made configurable
    Addresses: [],
    Description: 'Auto-blocked IPs by EVO WAF Monitoring',
  }));
  
  logger.info('Created new WAF IP Set for auto-blocking', {
    ipSetName: config.ipSetName,
    ipSetId: createResponse.Summary?.Id,
  });
  
  return {
    id: createResponse.Summary?.Id || '',
    lockToken: createResponse.Summary?.LockToken || '',
    addresses: [],
  };
}

/**
 * Add an IP to the WAF IP Set
 */
async function addIpToWafIpSet(
  wafClient: WAFV2Client,
  config: AutoBlockConfig,
  ipAddress: string
): Promise<{ success: boolean; ipSetId: string; error?: string }> {
  try {
    const ipSet = await getOrCreateIpSet(wafClient, config);
    const formattedIp = formatIpForWaf(ipAddress);
    
    // Check if IP is already in the set
    if (ipSet.addresses.includes(formattedIp)) {
      return {
        success: true,
        ipSetId: ipSet.id,
      };
    }
    
    // Add IP to the set
    const newAddresses = [...ipSet.addresses, formattedIp];
    
    await wafClient.send(new UpdateIPSetCommand({
      Name: config.ipSetName,
      Scope: config.scope,
      Id: ipSet.id,
      LockToken: ipSet.lockToken,
      Addresses: newAddresses,
    }));
    
    logger.info('Added IP to WAF IP Set', {
      ipAddress: formattedIp,
      ipSetId: ipSet.id,
      totalAddresses: newAddresses.length,
    });
    
    return {
      success: true,
      ipSetId: ipSet.id,
    };
    
  } catch (err) {
    logger.error('Failed to add IP to WAF IP Set', err as Error, { ipAddress });
    return {
      success: false,
      ipSetId: '',
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/**
 * Remove an IP from the WAF IP Set
 */
async function removeIpFromWafIpSet(
  wafClient: WAFV2Client,
  config: AutoBlockConfig,
  ipAddress: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const ipSet = await getOrCreateIpSet(wafClient, config);
    const formattedIp = formatIpForWaf(ipAddress);
    
    // Check if IP is in the set
    if (!ipSet.addresses.includes(formattedIp)) {
      return { success: true };
    }
    
    // Remove IP from the set
    const newAddresses = ipSet.addresses.filter(addr => addr !== formattedIp);
    
    await wafClient.send(new UpdateIPSetCommand({
      Name: config.ipSetName,
      Scope: config.scope,
      Id: ipSet.id,
      LockToken: ipSet.lockToken,
      Addresses: newAddresses,
    }));
    
    logger.info('Removed IP from WAF IP Set', {
      ipAddress: formattedIp,
      ipSetId: ipSet.id,
      totalAddresses: newAddresses.length,
    });
    
    return { success: true };
    
  } catch (err) {
    logger.error('Failed to remove IP from WAF IP Set', err as Error, { ipAddress });
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/**
 * Block an IP address
 */
export async function blockIp(
  prisma: any,
  wafClient: WAFV2Client,
  organizationId: string,
  ipAddress: string,
  reason: string,
  blockedBy: 'auto' | 'manual',
  config: AutoBlockConfig
): Promise<BlockResult> {
  try {
    // Check if IP is already blocked
    const existingBlock = await prisma.wafBlockedIp.findUnique({
      where: {
        organization_id_ip_address: {
          organization_id: organizationId,
          ip_address: ipAddress,
        },
      },
    });
    
    if (existingBlock?.is_active) {
      return {
        success: true,
        ipAddress,
        action: 'already_blocked',
        message: 'IP is already blocked',
        wafIpSetId: existingBlock.waf_ip_set_id || undefined,
      };
    }
    
    // Add to WAF IP Set
    const wafResult = await addIpToWafIpSet(wafClient, config, ipAddress);
    
    if (!wafResult.success) {
      return {
        success: false,
        ipAddress,
        action: 'failed',
        message: `Failed to add IP to WAF: ${wafResult.error}`,
      };
    }
    
    // Calculate expiration
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + config.blockDurationHours);
    
    // Save to database
    await prisma.wafBlockedIp.upsert({
      where: {
        organization_id_ip_address: {
          organization_id: organizationId,
          ip_address: ipAddress,
        },
      },
      create: {
        organization_id: organizationId,
        ip_address: ipAddress,
        reason,
        blocked_by: blockedBy,
        blocked_at: new Date(),
        expires_at: expiresAt,
        waf_ip_set_id: wafResult.ipSetId,
        is_active: true,
      },
      update: {
        reason,
        blocked_by: blockedBy,
        blocked_at: new Date(),
        expires_at: expiresAt,
        waf_ip_set_id: wafResult.ipSetId,
        is_active: true,
      },
    });
    
    logger.info('IP blocked successfully', {
      organizationId,
      ipAddress,
      reason,
      blockedBy,
      expiresAt,
    });
    
    return {
      success: true,
      ipAddress,
      action: 'blocked',
      message: `IP blocked until ${expiresAt.toISOString()}`,
      wafIpSetId: wafResult.ipSetId,
    };
    
  } catch (err) {
    logger.error('Failed to block IP', err as Error, { organizationId, ipAddress });
    return {
      success: false,
      ipAddress,
      action: 'failed',
      message: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/**
 * Unblock an IP address
 */
export async function unblockIp(
  prisma: any,
  wafClient: WAFV2Client,
  organizationId: string,
  ipAddress: string,
  config: AutoBlockConfig
): Promise<{ success: boolean; message: string }> {
  try {
    // Get the block record
    const blockRecord = await prisma.wafBlockedIp.findUnique({
      where: {
        organization_id_ip_address: {
          organization_id: organizationId,
          ip_address: ipAddress,
        },
      },
    });
    
    if (!blockRecord) {
      return {
        success: true,
        message: 'IP was not blocked',
      };
    }
    
    // Remove from WAF IP Set
    const wafResult = await removeIpFromWafIpSet(wafClient, config, ipAddress);
    
    if (!wafResult.success) {
      logger.warn('Failed to remove IP from WAF, but will update database', {
        ipAddress,
        error: wafResult.error,
      });
    }
    
    // Update database
    await prisma.wafBlockedIp.update({
      where: {
        organization_id_ip_address: {
          organization_id: organizationId,
          ip_address: ipAddress,
        },
      },
      data: {
        is_active: false,
      },
    });
    
    logger.info('IP unblocked successfully', { organizationId, ipAddress });
    
    return {
      success: true,
      message: 'IP unblocked successfully',
    };
    
  } catch (err) {
    logger.error('Failed to unblock IP', err as Error, { organizationId, ipAddress });
    return {
      success: false,
      message: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/**
 * Check and unblock expired IPs
 * Should be called periodically (e.g., every 5 minutes)
 */
export async function unblockExpiredIps(
  prisma: any,
  wafClient: WAFV2Client,
  config: AutoBlockConfig
): Promise<{ unblocked: number; errors: number }> {
  let unblocked = 0;
  let errors = 0;
  
  try {
    // Find expired blocks
    const expiredBlocks = await prisma.wafBlockedIp.findMany({
      where: {
        is_active: true,
        expires_at: {
          lte: new Date(),
        },
      },
    });
    
    for (const block of expiredBlocks) {
      const result = await unblockIp(
        prisma,
        wafClient,
        block.organization_id,
        block.ip_address,
        config
      );
      
      if (result.success) {
        unblocked++;
      } else {
        errors++;
      }
    }
    
    if (unblocked > 0) {
      logger.info('Unblocked expired IPs', { unblocked, errors });
    }
    
  } catch (err) {
    logger.error('Failed to process expired blocks', err as Error);
    errors++;
  }
  
  return { unblocked, errors };
}

/**
 * Check if an IP should be auto-blocked based on event count
 */
export function shouldAutoBlock(
  eventCount: number,
  config: AutoBlockConfig
): boolean {
  return config.enabled && eventCount >= config.threshold;
}
