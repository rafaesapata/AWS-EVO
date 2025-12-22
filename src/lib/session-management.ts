/**
 * Advanced Session Management System
 * Provides secure session handling with automatic cleanup and monitoring
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { cognitoAuth } from '@/integrations/aws/cognito-client-simple';
import { logger } from './logging';
import { ErrorHandler, ErrorFactory } from './error-handler';

export interface SessionInfo {
  id: string;
  userId: string;
  email: string;
  createdAt: Date;
  lastActivity: Date;
  expiresAt: Date;
  isActive: boolean;
  deviceInfo: {
    userAgent: string;
    platform: string;
    browser: string;
    ipAddress?: string;
  };
  metadata?: Record<string, any>;
}

export interface SessionConfig {
  maxIdleTime: number; // Maximum idle time in milliseconds
  maxSessionTime: number; // Maximum session duration in milliseconds
  warningTime: number; // Time before expiry to show warning
  checkInterval: number; // Interval to check session status
  autoRefresh: boolean; // Automatically refresh tokens
  trackActivity: boolean; // Track user activity
  multipleSessionsAllowed: boolean; // Allow multiple concurrent sessions
}

export interface ActivityEvent {
  type: 'click' | 'keypress' | 'scroll' | 'focus' | 'api_call' | 'navigation';
  timestamp: Date;
  metadata?: Record<string, any>;
}

/**
 * Session Manager Class
 */
export class SessionManager {
  private config: SessionConfig;
  private sessionInfo: SessionInfo | null = null;
  private activityEvents: ActivityEvent[] = [];
  private checkTimer?: NodeJS.Timeout;
  private warningTimer?: NodeJS.Timeout;
  private refreshTimer?: NodeJS.Timeout;
  private activityListeners: (() => void)[] = [];
  private isWarningShown = false;
  private lastActivity = Date.now();

  constructor(config: Partial<SessionConfig> = {}) {
    this.config = {
      maxIdleTime: 30 * 60 * 1000, // 30 minutes
      maxSessionTime: 8 * 60 * 60 * 1000, // 8 hours
      warningTime: 5 * 60 * 1000, // 5 minutes before expiry
      checkInterval: 60 * 1000, // 1 minute
      autoRefresh: true,
      trackActivity: true,
      multipleSessionsAllowed: false,
      ...config,
    };

    this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      // Get current session
      const session = await cognitoAuth.getCurrentSession();
      
      if (!session) {
        throw ErrorFactory.authInvalid({ cognitoError: 'No active session' });
      }

      if (session) {
        await this.createSessionInfo(session);
        this.startMonitoring();
        
        if (this.config.trackActivity) {
          this.setupActivityTracking();
        }
      }

      // Note: Cognito auth state changes would need to be implemented
      // with custom event listeners or periodic session checks

    } catch (error) {
      logger.error('Failed to initialize session manager', error as Error);
    }
  }

  private async createSessionInfo(session: any): Promise<void> {
    const deviceInfo = this.getDeviceInfo();
    
    this.sessionInfo = {
      id: session.access_token.substring(0, 16), // Use part of token as session ID
      userId: session.user.id,
      email: session.user.email,
      createdAt: new Date(session.user.created_at),
      lastActivity: new Date(),
      expiresAt: new Date(session.expires_at * 1000),
      isActive: true,
      deviceInfo,
      metadata: {
        tokenType: session.token_type,
        provider: session.user.app_metadata?.provider,
      },
    };

    logger.info('Session created', {
      sessionId: this.sessionInfo.id,
      userId: this.sessionInfo.userId,
      expiresAt: this.sessionInfo.expiresAt,
    });
  }

  private getDeviceInfo() {
    const userAgent = navigator.userAgent;
    const platform = navigator.platform;
    
    // Simple browser detection
    let browser = 'Unknown';
    if (userAgent.includes('Chrome')) browser = 'Chrome';
    else if (userAgent.includes('Firefox')) browser = 'Firefox';
    else if (userAgent.includes('Safari')) browser = 'Safari';
    else if (userAgent.includes('Edge')) browser = 'Edge';

    return {
      userAgent,
      platform,
      browser,
    };
  }

  private async handleAuthStateChange(event: string, session: any): Promise<void> {
    logger.debug('Auth state changed', { event, hasSession: !!session });

    switch (event) {
      case 'SIGNED_IN':
        if (session) {
          await this.createSessionInfo(session);
          this.startMonitoring();
          
          if (this.config.trackActivity) {
            this.setupActivityTracking();
          }
        }
        break;

      case 'SIGNED_OUT':
        await this.cleanup();
        break;

      case 'TOKEN_REFRESHED':
        if (session && this.sessionInfo) {
          this.sessionInfo.expiresAt = new Date(session.expires_at * 1000);
          this.sessionInfo.lastActivity = new Date();
          logger.debug('Session token refreshed', {
            sessionId: this.sessionInfo.id,
            newExpiresAt: this.sessionInfo.expiresAt,
          });
        }
        break;
    }
  }

  private startMonitoring(): void {
    this.stopMonitoring(); // Clear any existing timers

    // Regular session check
    this.checkTimer = setInterval(() => {
      this.checkSessionStatus();
    }, this.config.checkInterval);

    // Auto-refresh timer
    if (this.config.autoRefresh && this.sessionInfo) {
      const refreshTime = this.sessionInfo.expiresAt.getTime() - Date.now() - (5 * 60 * 1000); // 5 minutes before expiry
      
      if (refreshTime > 0) {
        this.refreshTimer = setTimeout(() => {
          this.refreshSession();
        }, refreshTime);
      }
    }
  }

  private stopMonitoring(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = undefined;
    }

    if (this.warningTimer) {
      clearTimeout(this.warningTimer);
      this.warningTimer = undefined;
    }

    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = undefined;
    }
  }

  private setupActivityTracking(): void {
    if (typeof window === 'undefined') return;

    const trackActivity = (type: ActivityEvent['type'], metadata?: Record<string, any>) => {
      this.recordActivity(type, metadata);
    };

    // Mouse and keyboard activity
    const mouseHandler = () => trackActivity('click');
    const keyHandler = () => trackActivity('keypress');
    const scrollHandler = () => trackActivity('scroll');
    const focusHandler = () => trackActivity('focus');

    window.addEventListener('click', mouseHandler, { passive: true });
    window.addEventListener('keypress', keyHandler, { passive: true });
    window.addEventListener('scroll', scrollHandler, { passive: true });
    window.addEventListener('focus', focusHandler, { passive: true });

    // Store cleanup functions
    this.activityListeners = [
      () => window.removeEventListener('click', mouseHandler),
      () => window.removeEventListener('keypress', keyHandler),
      () => window.removeEventListener('scroll', scrollHandler),
      () => window.removeEventListener('focus', focusHandler),
    ];
  }

  private recordActivity(type: ActivityEvent['type'], metadata?: Record<string, any>): void {
    const now = Date.now();
    this.lastActivity = now;

    if (this.sessionInfo) {
      this.sessionInfo.lastActivity = new Date(now);
    }

    // Add to activity log
    this.activityEvents.push({
      type,
      timestamp: new Date(now),
      metadata,
    });

    // Keep only recent activities (last 100)
    if (this.activityEvents.length > 100) {
      this.activityEvents = this.activityEvents.slice(-100);
    }

    // Reset warning if user becomes active
    if (this.isWarningShown) {
      this.isWarningShown = false;
    }
  }

  private async checkSessionStatus(): Promise<void> {
    if (!this.sessionInfo) return;

    const now = Date.now();
    const timeSinceActivity = now - this.lastActivity;
    const timeUntilExpiry = this.sessionInfo.expiresAt.getTime() - now;

    // Check for idle timeout
    if (timeSinceActivity > this.config.maxIdleTime) {
      logger.warn('Session expired due to inactivity', {
        sessionId: this.sessionInfo.id,
        idleTime: timeSinceActivity,
      });
      
      await this.expireSession('idle_timeout');
      return;
    }

    // Check for absolute timeout
    if (timeUntilExpiry <= 0) {
      logger.warn('Session expired', {
        sessionId: this.sessionInfo.id,
        expiresAt: this.sessionInfo.expiresAt,
      });
      
      await this.expireSession('session_expired');
      return;
    }

    // Show warning if approaching expiry
    if (timeUntilExpiry <= this.config.warningTime && !this.isWarningShown) {
      this.showExpiryWarning(Math.ceil(timeUntilExpiry / 1000));
    }
  }

  private showExpiryWarning(secondsRemaining: number): void {
    this.isWarningShown = true;
    
    logger.warn('Session expiring soon', {
      sessionId: this.sessionInfo?.id,
      secondsRemaining,
    });

    // Emit custom event for UI to handle
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('sessionExpiring', {
        detail: { secondsRemaining },
      }));
    }
  }

  private async refreshSession(): Promise<void> {
    try {
      logger.debug('Refreshing session token');
      
      // Cognito handles token refresh automatically
      const session = await cognitoAuth.getCurrentSession();
      
      if (!session) {
        throw ErrorFactory.authExpired({ cognitoError: 'Session refresh failed' });
      }

      if (data.session && this.sessionInfo) {
        this.sessionInfo.expiresAt = new Date(data.session.expires_at * 1000);
        this.sessionInfo.lastActivity = new Date();
        
        logger.info('Session refreshed successfully', {
          sessionId: this.sessionInfo.id,
          newExpiresAt: this.sessionInfo.expiresAt,
        });

        // Restart monitoring with new expiry time
        this.startMonitoring();
      }
    } catch (error) {
      logger.error('Failed to refresh session', error as Error);
      await this.expireSession('refresh_failed');
    }
  }

  private async expireSession(reason: string): Promise<void> {
    if (this.sessionInfo) {
      logger.info('Session expired', {
        sessionId: this.sessionInfo.id,
        reason,
      });

      this.sessionInfo.isActive = false;
    }

    await this.cleanup();

    // Emit custom event
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('sessionExpired', {
        detail: { reason },
      }));
    }

    // Sign out user
    await cognitoAuth.signOut();
  }

  private async cleanup(): Promise<void> {
    this.stopMonitoring();
    
    // Remove activity listeners
    this.activityListeners.forEach(cleanup => cleanup());
    this.activityListeners = [];
    
    this.sessionInfo = null;
    this.activityEvents = [];
    this.isWarningShown = false;
  }

  // Public methods
  public getSessionInfo(): SessionInfo | null {
    return this.sessionInfo;
  }

  public getActivityEvents(): ActivityEvent[] {
    return [...this.activityEvents];
  }

  public async extendSession(): Promise<void> {
    if (!this.sessionInfo) return;

    try {
      await this.refreshSession();
      this.recordActivity('api_call', { action: 'extend_session' });
    } catch (error) {
      ErrorHandler.handle(error, {
        component: 'SessionManager',
        action: 'estender sessão',
      });
    }
  }

  public async terminateSession(): Promise<void> {
    await this.expireSession('user_requested');
  }

  public isSessionActive(): boolean {
    return this.sessionInfo?.isActive ?? false;
  }

  public getTimeUntilExpiry(): number {
    if (!this.sessionInfo) return 0;
    return Math.max(0, this.sessionInfo.expiresAt.getTime() - Date.now());
  }

  public getIdleTime(): number {
    return Date.now() - this.lastActivity;
  }

  public destroy(): void {
    this.cleanup();
  }
}

// Global session manager instance
export const sessionManager = new SessionManager();

/**
 * React hook for session management
 */
export function useSessionManager() {
  const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null);
  const [timeUntilExpiry, setTimeUntilExpiry] = useState(0);
  const [isExpiring, setIsExpiring] = useState(false);

  useEffect(() => {
    // Update session info periodically
    const updateInterval = setInterval(() => {
      const info = sessionManager.getSessionInfo();
      setSessionInfo(info);
      
      if (info) {
        const timeLeft = sessionManager.getTimeUntilExpiry();
        setTimeUntilExpiry(timeLeft);
        setIsExpiring(timeLeft <= 5 * 60 * 1000); // 5 minutes
      }
    }, 1000);

    // Listen for session events
    const handleSessionExpiring = (event: CustomEvent) => {
      setIsExpiring(true);
    };

    const handleSessionExpired = (event: CustomEvent) => {
      setSessionInfo(null);
      setTimeUntilExpiry(0);
      setIsExpiring(false);
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('sessionExpiring', handleSessionExpiring as EventListener);
      window.addEventListener('sessionExpired', handleSessionExpired as EventListener);
    }

    return () => {
      clearInterval(updateInterval);
      
      if (typeof window !== 'undefined') {
        window.removeEventListener('sessionExpiring', handleSessionExpiring as EventListener);
        window.removeEventListener('sessionExpired', handleSessionExpired as EventListener);
      }
    };
  }, []);

  const extendSession = useCallback(async () => {
    try {
      await sessionManager.extendSession();
      setIsExpiring(false);
    } catch (error) {
      ErrorHandler.handle(error, {
        component: 'useSessionManager',
        action: 'estender sessão',
      });
    }
  }, []);

  const terminateSession = useCallback(async () => {
    await sessionManager.terminateSession();
  }, []);

  return {
    sessionInfo,
    timeUntilExpiry,
    isExpiring,
    isActive: sessionManager.isSessionActive(),
    idleTime: sessionManager.getIdleTime(),
    activityEvents: sessionManager.getActivityEvents(),
    extendSession,
    terminateSession,
  };
}

/**
 * Session warning component hook
 */
export function useSessionWarning() {
  const [showWarning, setShowWarning] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(0);

  useEffect(() => {
    const handleSessionExpiring = (event: CustomEvent) => {
      setShowWarning(true);
      setSecondsRemaining(event.detail.secondsRemaining);
    };

    const handleSessionExpired = () => {
      setShowWarning(false);
      setSecondsRemaining(0);
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('sessionExpiring', handleSessionExpiring as EventListener);
      window.addEventListener('sessionExpired', handleSessionExpired as EventListener);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('sessionExpiring', handleSessionExpiring as EventListener);
        window.removeEventListener('sessionExpired', handleSessionExpired as EventListener);
      }
    };
  }, []);

  const dismissWarning = useCallback(() => {
    setShowWarning(false);
  }, []);

  const extendSession = useCallback(async () => {
    await sessionManager.extendSession();
    setShowWarning(false);
  }, []);

  return {
    showWarning,
    secondsRemaining,
    dismissWarning,
    extendSession,
  };
}

/**
 * Session activity tracker hook
 */
export function useActivityTracker() {
  const recordActivity = useCallback((
    type: ActivityEvent['type'],
    metadata?: Record<string, any>
  ) => {
    sessionManager['recordActivity'](type, metadata);
  }, []);

  return { recordActivity };
}