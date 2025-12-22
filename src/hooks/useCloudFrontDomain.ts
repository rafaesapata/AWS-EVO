import { useState, useEffect } from 'react';

/**
 * Hook to get CloudFront domain from environment or API
 * This allows the Quick Create Link to use the proper CloudFront URL
 * for hosting the CloudFormation template
 */
export const useCloudFrontDomain = () => {
  const [cloudFrontDomain, setCloudFrontDomain] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    const getCloudFrontDomain = async () => {
      try {
        setLoading(true);
        setError(undefined);

        // Try to get from environment variable first
        const envDomain = import.meta.env.VITE_CLOUDFRONT_DOMAIN;
        if (envDomain) {
          setCloudFrontDomain(envDomain);
          setLoading(false);
          return;
        }

        // Try to get from API (if available)
        try {
          const response = await fetch('/api/config/cloudfront-domain');
          if (response.ok) {
            const data = await response.json();
            if (data.domain) {
              setCloudFrontDomain(data.domain);
              setLoading(false);
              return;
            }
          }
        } catch (apiError) {
          // API not available, continue with other methods
          console.debug('CloudFront domain API not available:', apiError);
        }

        // Try to detect from current hostname (if deployed)
        const currentHost = window.location.hostname;
        if (currentHost.includes('.cloudfront.net') || 
            currentHost.includes('.amazonaws.com') ||
            (!currentHost.includes('localhost') && !currentHost.includes('127.0.0.1'))) {
          setCloudFrontDomain(currentHost);
          setLoading(false);
          return;
        }

        // No CloudFront domain found - will use local template
        setCloudFrontDomain(undefined);
        setLoading(false);

      } catch (err) {
        console.error('Error getting CloudFront domain:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
        setCloudFrontDomain(undefined);
        setLoading(false);
      }
    };

    getCloudFrontDomain();
  }, []);

  return {
    cloudFrontDomain,
    loading,
    error,
    isLocal: !cloudFrontDomain
  };
};

export default useCloudFrontDomain;