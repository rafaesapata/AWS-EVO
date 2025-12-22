import { useState, useEffect } from "react";
import { cognitoAuth } from "@/integrations/aws/cognito-client-simple";
import { apiClient } from "@/integrations/aws/api-client";
import { useOrganization } from "./useOrganization";

interface ArticleAnalytics {
  totalViews: number;
  completedReads: number;
  avgReadingTime: number;
  avgScrollDepth: number;
  helpfulCount: number;
  unhelpfulCount: number;
  shares: number;
  exports: number;
}

export function useKnowledgeBaseAnalytics(articleId?: string) {
  const { data: organizationId } = useOrganization();
  const [analytics, setAnalytics] = useState<ArticleAnalytics | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!articleId || !organizationId) return;

    fetchAnalytics();
  }, [articleId, organizationId]);

  const fetchAnalytics = async () => {
    if (!articleId || !organizationId) return;

    setIsLoading(true);
    try {
      const result = await apiClient.rpc('get_article_analytics_summary', {
        p_article_id: articleId
      });

      if (result.error) throw new Error(result.error.message);
      
      // Parse the JSON data safely
      if (result.data && typeof result.data === 'object') {
        setAnalytics(result.data as unknown as ArticleAnalytics);
      }
    } catch (error) {
      console.error('Error fetching analytics:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const trackView = async (readingTime?: number, scrollDepth?: number) => {
    if (!articleId) return;

    try {
      await apiClient.rpc('track_article_view', {
        p_article_id: articleId,
        p_reading_time: readingTime,
        p_scroll_depth: scrollDepth
      });

      // Increment view count on article
      await apiClient.rpc('increment_article_views', { article_id: articleId });
    } catch (error) {
      console.error('Error tracking view:', error);
    }
  };

  const trackEvent = async (eventType: 'helpful' | 'unhelpful' | 'share' | 'export' | 'read_complete') => {
    if (!articleId || !organizationId) return;

    try {
      const user = await cognitoAuth.getCurrentUser();
      if (!user) return;

      await apiClient.insert('knowledge_base_analytics', {
        article_id: articleId,
        organization_id: organizationId,
        user_id: user.id,
        event_type: eventType,
      });

      // Refresh analytics
      await fetchAnalytics();
    } catch (error) {
      console.error('Error tracking event:', error);
    }
  };

  const trackReadingProgress = (readingTime: number, scrollDepth: number) => {
    if (!articleId || !organizationId) return undefined;

    // Debounced tracking to avoid too many writes
    const timeoutId = setTimeout(async () => {
      try {
        const user = await cognitoAuth.getCurrentUser();
        if (!user) return;

        await apiClient.insert('knowledge_base_analytics', {
          article_id: articleId,
          organization_id: organizationId,
          user_id: user.id,
          event_type: 'progress',
          reading_time_seconds: readingTime,
          scroll_depth_percentage: scrollDepth,
        });
      } catch (error) {
        console.error('Error tracking progress:', error);
      }
    }, 5000);

    // Return cleanup function
    return () => clearTimeout(timeoutId);
  };

  return {
    analytics,
    isLoading,
    trackView,
    trackEvent,
    trackReadingProgress,
    refreshAnalytics: fetchAnalytics,
  };
}
