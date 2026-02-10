import { useEffect, useState, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { cognitoAuth, AuthSession, AuthUser } from "@/integrations/aws/cognito-client-simple";
import { apiClient } from "@/integrations/aws/api-client";
import LoadingSkeleton from "./LoadingSkeleton";
import { useLicenseValidation } from "@/hooks/useLicenseValidation";
import { AwsAccountProvider } from "@/contexts/AwsAccountContext";
import { ErrorHandler, ErrorFactory } from "@/lib/error-handler";
import { setupCommonInvalidationPatterns } from "@/lib/cache-invalidation";

interface AuthGuardProps {
  children: React.ReactNode;
}

export default function AuthGuard({ children }: AuthGuardProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [session, setSession] = useState<AuthSession | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastValidLicense, setLastValidLicense] = useState<boolean | null>(null);
  
  // SECURITY: Use refs to prevent race conditions
  const isCheckingRef = useRef(false);
  const attemptsRef = useRef(0);
  const isMountedRef = useRef(true);
  const passwordCheckTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Check license status
  const { data: licenseStatus, isLoading: licenseLoading, isFetching } = useLicenseValidation();

  // Track mounted state
  useEffect(() => {
    isMountedRef.current = true;
    // Reset auth check attempts on mount to prevent permanent lockout
    // across component re-mounts (e.g., route changes)
    attemptsRef.current = 0;
    return () => {
      isMountedRef.current = false;
      if (passwordCheckTimeoutRef.current) {
        clearTimeout(passwordCheckTimeoutRef.current);
      }
    };
  }, []);

  // Set up auth state listener
  useEffect(() => {
    // SECURITY: Prevent multiple simultaneous auth checks
    if (isCheckingRef.current) return;
    
    // Prevent infinite loops by limiting auth check attempts
    if (attemptsRef.current >= 3) {
      console.error('❌ Too many auth check attempts, redirecting to login');
      if (isMountedRef.current) {
        setIsLoading(false);
        navigate('/auth', { replace: true });
      }
      return;
    }

    // Setup cache invalidation patterns (only once)
    if (attemptsRef.current === 0) {
      setupCommonInvalidationPatterns();
    }
    
    // Check for existing session with error handling
    const checkAuth = async () => {
      isCheckingRef.current = true;
      attemptsRef.current++;
      
      try {
        const session = await cognitoAuth.getCurrentSession();
        
        // SECURITY: Check if component is still mounted before updating state
        if (!isMountedRef.current) return;
        
        if (!session) {
          navigate('/auth', { replace: true });
          return;
        }
        
        setSession(session);
        setUser(session.user);
        
        // Check if user needs to change password (with proper delay)
        if (session.user?.id) {
          passwordCheckTimeoutRef.current = setTimeout(() => {
            if (isMountedRef.current) {
              checkPasswordChangeRequired(session.user.id);
            }
          }, 100); // Small delay to prevent race condition
        }
      } catch (error) {
        console.error('❌ Auth check failed:', error);
        if (isMountedRef.current) {
          navigate('/auth', { replace: true });
        }
      } finally {
        isCheckingRef.current = false;
        if (isMountedRef.current) {
          setIsLoading(false);
        }
      }
    };

    checkAuth();
  }, [navigate]); // SECURITY: Removed authCheckAttempts from deps to prevent loops

  // Track last valid license state to prevent flickering
  useEffect(() => {
    if (licenseStatus && !isFetching) {
      setLastValidLicense(licenseStatus.isValid);
    }
  }, [licenseStatus, isFetching]);

  // Handle license-based navigation
  useEffect(() => {
    // Skip if still loading, on license management page, or no license status yet
    if (isLoading || licenseLoading || location.pathname === '/license-management' || !licenseStatus) {
      return;
    }

    // If license is invalid, always redirect to license management page
    if (!licenseStatus.isValid) {
      navigate('/license-management', { replace: true });
      return;
    }
  }, [licenseStatus, location.pathname, navigate, isLoading, licenseLoading]);

  const checkPasswordChangeRequired = async (userId: string) => {
    // SECURITY: Check if still mounted
    if (!isMountedRef.current) return;
    
    try {
      const result = await apiClient.select('profiles', {
        select: 'force_password_change',
        eq: { id: userId }
      });

      if (result.error) {
        throw ErrorFactory.databaseError('check password change requirement', result.error);
      }

      const profile = result.data?.[0];

      if (isMountedRef.current && profile?.force_password_change && window.location.pathname !== '/change-password') {
        navigate('/change-password', { replace: true });
      }
    } catch (error) {
      ErrorHandler.handleSilent(error, {
        component: 'AuthGuard',
        action: 'verificar mudança de senha obrigatória',
        userId,
      });
    }
  };

  if (isLoading || licenseLoading) {
    return (
      <div className="min-h-screen bg-background">
        <LoadingSkeleton />
      </div>
    );
  }

  if (!session || !user) {
    return null;
  }

  // Allow access to license management page always (but still wrap with provider)
  if (location.pathname === '/license-management') {
    return <AwsAccountProvider>{children}</AwsAccountProvider>;
  }

  // Allow access to communication center page (wrap with provider)
  if (location.pathname === '/communication-center') {
    return <AwsAccountProvider>{children}</AwsAccountProvider>;
  }

  // Use cached license status during refetch to prevent flickering
  // Only block if we have confirmed invalid license (not during initial fetch or refetch)
  const shouldBlock = licenseStatus && !licenseStatus.isValid && !isFetching && !licenseLoading;
  
  // CRITICAL: If we had a valid license before and we're just refetching, don't block
  // This prevents the flickering issue after login when license is being revalidated
  if (isFetching && lastValidLicense === true) {
    return <AwsAccountProvider>{children}</AwsAccountProvider>;
  }

  // Don't block immediately after authentication - give time for license to validate
  // This prevents the intermittent block screen right after login
  if (licenseLoading) {
    return (
      <div className="min-h-screen bg-background">
        <LoadingSkeleton />
      </div>
    );
  }

  // Block access if license is invalid — redirect to license management
  if (shouldBlock) {
    navigate('/license-management', { replace: true });
    return null;
  }

  return <AwsAccountProvider>{children}</AwsAccountProvider>;
}