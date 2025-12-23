import { useEffect, useState, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { cognitoAuth, AuthSession, AuthUser } from "@/integrations/aws/cognito-client-simple";
import { apiClient } from "@/integrations/aws/api-client";
import LoadingSkeleton from "./LoadingSkeleton";
import LicenseBlockedScreen from "./LicenseBlockedScreen";
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
  const [authCheckAttempts, setAuthCheckAttempts] = useState(0);
  const passwordCheckTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Check license status
  const { data: licenseStatus, isLoading: licenseLoading, isFetching } = useLicenseValidation();

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (passwordCheckTimeoutRef.current) {
        clearTimeout(passwordCheckTimeoutRef.current);
      }
    };
  }, []);

  // Set up auth state listener
  useEffect(() => {
    // Prevent infinite loops by limiting auth check attempts
    if (authCheckAttempts >= 3) {
      console.error('❌ Too many auth check attempts, redirecting to login');
      setIsLoading(false);
      navigate('/auth');
      return;
    }

    // Setup cache invalidation patterns
    setupCommonInvalidationPatterns();
    
    // Check for existing session with error handling
    const checkAuth = async () => {
      try {
        setAuthCheckAttempts(prev => prev + 1);
        const session = await cognitoAuth.getCurrentSession();
        
        setSession(session);
        setUser(session?.user ?? null);
        
        if (!session) {
          navigate('/auth');
        } else {
          // Check if user needs to change password
          passwordCheckTimeoutRef.current = setTimeout(() => {
            checkPasswordChangeRequired(session.user.id);
          }, 0);
        }
      } catch (error) {
        console.error('❌ Auth check failed:', error);
        navigate('/auth');
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();

    // Note: Cognito auth state changes would need to be implemented
    // with custom event listeners or periodic session checks
  }, [navigate, authCheckAttempts]);

  // Track last valid license state to prevent flickering
  useEffect(() => {
    if (licenseStatus && !isFetching) {
      setLastValidLicense(licenseStatus.isValid);
    }
  }, [licenseStatus, isFetching]);

  // Handle license-based navigation
  useEffect(() => {
    // Skip if still loading, on license page, or no license status yet
    if (isLoading || licenseLoading || location.pathname === '/license' || !licenseStatus) {
      return;
    }

    // Block access if license is invalid (regardless of whether customer_id exists)
    // Users without customer_id must go to /license page to link their license
    if (!licenseStatus.isValid) {
      // This will be handled by showing LicenseBlockedScreen below
      return;
    }
  }, [licenseStatus, location.pathname, navigate, isLoading, licenseLoading]);

  const checkPasswordChangeRequired = async (userId: string) => {
    try {
      const result = await apiClient.select('profiles', {
        select: 'force_password_change',
        eq: { id: userId }
      });

      if (result.error) {
        throw ErrorFactory.databaseError('check password change requirement', result.error);
      }

      const profile = result.data?.[0];

      if (profile?.force_password_change && window.location.pathname !== '/change-password') {
        navigate('/change-password');
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
  if (location.pathname === '/license') {
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

  // Block access if license is invalid (regardless of whether organization has customer_id)
  // This ensures ALL users without valid licenses are blocked
  if (shouldBlock) {
    return (
      <LicenseBlockedScreen 
        reason={licenseStatus.reason as "expired" | "no_seats" | "no_license" | "seats_exceeded"}
        message={licenseStatus.message!}
      />
    );
  }

  return <AwsAccountProvider>{children}</AwsAccountProvider>;
}