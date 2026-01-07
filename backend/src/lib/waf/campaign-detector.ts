/**
 * WAF Campaign Detection Module
 * 
 * Detects attack campaigns by grouping events from the same IP
 * within a configurable time window.
 * 
 * Uses Redis for real-time rate tracking and campaign state.
 */

import { logger } from '../logging.js';
import type { Severity, ThreatType } from './threat-detector.js';

// Campaign detection configuration
export interface CampaignConfig {
  threshold: number;      // Number of events to trigger campaign detection
  windowMinutes: number;  // Time window for grouping events
  cooldownMinutes: number; // Time before same IP can start new campaign
}

export const DEFAULT_CAMPAIGN_CONFIG: CampaignConfig = {
  threshold: 10,
  windowMinutes: 5,
  cooldownMinutes: 30,
};

// Campaign state stored in Redis
export interface CampaignState {
  organizationId: string;
  sourceIp: string;
  eventCount: number;
  firstSeen: number;      // Unix timestamp
  lastSeen: number;       // Unix timestamp
  attackTypes: string[];
  severity: Severity;
  isCampaign: boolean;
}

// Campaign detection result
export interface CampaignDetectionResult {
  isCampaign: boolean;
  isNewCampaign: boolean;
  campaignId?: string;
  eventCount: number;
  attackTypes: string[];
  severity: Severity;
  shouldAlert: boolean;
}

/**
 * Redis key patterns for campaign tracking
 */
export const REDIS_KEYS = {
  // Rate counter per IP: waf:rate:{orgId}:{ip}
  rateCounter: (orgId: string, ip: string) => `waf:rate:${orgId}:${ip}`,
  
  // Campaign state: waf:campaign:{orgId}:{ip}
  campaignState: (orgId: string, ip: string) => `waf:campaign:${orgId}:${ip}`,
  
  // Active campaigns set: waf:campaigns:active:{orgId}
  activeCampaigns: (orgId: string) => `waf:campaigns:active:${orgId}`,
};

/**
 * In-memory campaign tracker (fallback when Redis is not available)
 * In production, use Redis for distributed state
 */
class InMemoryCampaignTracker {
  private campaigns: Map<string, CampaignState> = new Map();
  private rateCounts: Map<string, { count: number; firstSeen: number }> = new Map();
  
  private getKey(orgId: string, ip: string): string {
    return `${orgId}:${ip}`;
  }
  
  /**
   * Increment rate counter for an IP
   */
  incrementRate(
    orgId: string, 
    ip: string, 
    windowMs: number
  ): { count: number; isNew: boolean } {
    const key = this.getKey(orgId, ip);
    const now = Date.now();
    
    const existing = this.rateCounts.get(key);
    
    if (existing) {
      // Check if window has expired
      if (now - existing.firstSeen > windowMs) {
        // Reset counter
        this.rateCounts.set(key, { count: 1, firstSeen: now });
        return { count: 1, isNew: true };
      }
      
      // Increment counter
      existing.count++;
      return { count: existing.count, isNew: false };
    }
    
    // New counter
    this.rateCounts.set(key, { count: 1, firstSeen: now });
    return { count: 1, isNew: true };
  }
  
  /**
   * Get or create campaign state
   */
  getCampaignState(orgId: string, ip: string): CampaignState | null {
    const key = this.getKey(orgId, ip);
    return this.campaigns.get(key) || null;
  }
  
  /**
   * Update campaign state
   */
  setCampaignState(orgId: string, ip: string, state: CampaignState): void {
    const key = this.getKey(orgId, ip);
    this.campaigns.set(key, state);
  }
  
  /**
   * Clean up old entries (call periodically)
   */
  cleanup(maxAgeMs: number): void {
    const now = Date.now();
    
    // Clean rate counts
    for (const [key, value] of this.rateCounts.entries()) {
      if (now - value.firstSeen > maxAgeMs) {
        this.rateCounts.delete(key);
      }
    }
    
    // Clean campaigns
    for (const [key, campaign] of this.campaigns.entries()) {
      if (now - campaign.lastSeen > maxAgeMs) {
        this.campaigns.delete(key);
      }
    }
  }
}

// Global tracker instance (in production, replace with Redis client)
const tracker = new InMemoryCampaignTracker();

/**
 * Detect if events from an IP constitute an attack campaign
 */
export function detectCampaign(
  organizationId: string,
  sourceIp: string,
  threatType: ThreatType,
  severity: Severity,
  config: CampaignConfig = DEFAULT_CAMPAIGN_CONFIG
): CampaignDetectionResult {
  const windowMs = config.windowMinutes * 60 * 1000;
  
  // Increment rate counter
  const { count, isNew } = tracker.incrementRate(organizationId, sourceIp, windowMs);
  
  // Get existing campaign state
  let campaignState = tracker.getCampaignState(organizationId, sourceIp);
  const now = Date.now();
  
  // Check if this is a new campaign
  const isCampaign = count >= config.threshold;
  let isNewCampaign = false;
  
  if (isCampaign && !campaignState?.isCampaign) {
    // New campaign detected
    isNewCampaign = true;
    
    campaignState = {
      organizationId,
      sourceIp,
      eventCount: count,
      firstSeen: now - (windowMs * (count - 1) / count), // Approximate
      lastSeen: now,
      attackTypes: [threatType],
      severity,
      isCampaign: true,
    };
    
    tracker.setCampaignState(organizationId, sourceIp, campaignState);
    
    logger.info('New attack campaign detected', {
      organizationId,
      sourceIp,
      eventCount: count,
      threshold: config.threshold,
      threatType,
      severity,
    });
  } else if (campaignState) {
    // Update existing campaign
    campaignState.eventCount = count;
    campaignState.lastSeen = now;
    
    // Add new attack type if not already present
    if (!campaignState.attackTypes.includes(threatType)) {
      campaignState.attackTypes.push(threatType);
    }
    
    // Escalate severity if needed
    const severityOrder: Severity[] = ['low', 'medium', 'high', 'critical'];
    if (severityOrder.indexOf(severity) > severityOrder.indexOf(campaignState.severity)) {
      campaignState.severity = severity;
    }
    
    tracker.setCampaignState(organizationId, sourceIp, campaignState);
  }
  
  // Determine if we should alert
  // Alert on new campaigns or when event count crosses certain thresholds
  const alertThresholds = [config.threshold, 25, 50, 100, 250, 500, 1000];
  const shouldAlert = isNewCampaign || alertThresholds.includes(count);
  
  return {
    isCampaign,
    isNewCampaign,
    campaignId: isCampaign ? `campaign-${organizationId}-${sourceIp}-${campaignState?.firstSeen}` : undefined,
    eventCount: count,
    attackTypes: campaignState?.attackTypes || [threatType],
    severity: campaignState?.severity || severity,
    shouldAlert,
  };
}

/**
 * Get all active campaigns for an organization
 */
export function getActiveCampaigns(organizationId: string): CampaignState[] {
  // In production, query Redis for all campaigns matching the org
  // For now, return empty array (would need to iterate in-memory map)
  return [];
}

/**
 * Mark a campaign as resolved
 */
export function resolveCampaign(
  organizationId: string,
  sourceIp: string
): boolean {
  const state = tracker.getCampaignState(organizationId, sourceIp);
  if (state) {
    state.isCampaign = false;
    tracker.setCampaignState(organizationId, sourceIp, state);
    return true;
  }
  return false;
}

/**
 * Clean up old campaign data
 * Should be called periodically (e.g., every 5 minutes)
 */
export function cleanupOldCampaigns(maxAgeMinutes: number = 60): void {
  tracker.cleanup(maxAgeMinutes * 60 * 1000);
}

/**
 * Check if an IP is currently part of an active campaign
 */
export function isIpInCampaign(organizationId: string, sourceIp: string): boolean {
  const state = tracker.getCampaignState(organizationId, sourceIp);
  return state?.isCampaign || false;
}
