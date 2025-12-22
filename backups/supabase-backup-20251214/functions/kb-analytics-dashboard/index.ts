import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const { data: { user }, error: userError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    const { data: orgId, error: orgError } = await supabase
      .rpc('get_user_organization', { _user_id: user.id });

    if (orgError || !orgId) {
      throw new Error('No organization found');
    }

    const url = new URL(req.url);
    const timeRange = url.searchParams.get('timeRange') || '30'; // days

    // Most viewed articles
    const { data: mostViewed } = await supabase
      .from('knowledge_base_articles')
      .select('id, title, view_count, category')
      .eq('organization_id', orgId)
      .order('view_count', { ascending: false })
      .limit(10);

    // Most helpful articles
    const { data: mostHelpful } = await supabase
      .from('knowledge_base_articles')
      .select('id, title, helpful_count, category')
      .eq('organization_id', orgId)
      .order('helpful_count', { ascending: false })
      .limit(10);

    // Top authors
    const { data: topAuthors } = await supabase
      .from('knowledge_base_articles')
      .select('author_id, profiles:author_id(email)')
      .eq('organization_id', orgId);

    const authorStats = topAuthors?.reduce((acc: any, article: any) => {
      const email = article.profiles?.email || 'Unknown';
      if (!acc[email]) {
        acc[email] = { articles: 0, email };
      }
      acc[email].articles++;
      return acc;
    }, {});

    const topAuthorsList = Object.values(authorStats || {})
      .sort((a: any, b: any) => b.articles - a.articles)
      .slice(0, 10);

    // Category distribution
    const { data: categoryDist } = await supabase
      .from('knowledge_base_articles')
      .select('category')
      .eq('organization_id', orgId);

    const categoryStats = categoryDist?.reduce((acc: any, article: any) => {
      acc[article.category] = (acc[article.category] || 0) + 1;
      return acc;
    }, {});

    // Reading time analytics
    const { data: readingStats } = await supabase
      .from('knowledge_base_analytics')
      .select('reading_time_seconds, scroll_depth_percentage')
      .eq('organization_id', orgId)
      .eq('event_type', 'view')
      .gte('created_at', new Date(Date.now() - parseInt(timeRange) * 24 * 60 * 60 * 1000).toISOString());

    const avgReadingTime = readingStats && readingStats.length > 0
      ? readingStats.reduce((sum, stat) => sum + (stat.reading_time_seconds || 0), 0) / readingStats.length
      : 0;
    const avgScrollDepth = readingStats && readingStats.length > 0
      ? readingStats.reduce((sum, stat) => sum + (stat.scroll_depth_percentage || 0), 0) / readingStats.length
      : 0;

    // Search queries without results (knowledge gaps)
    const { data: recentSearches } = await supabase
      .from('knowledge_base_analytics')
      .select('created_at')
      .eq('organization_id', orgId)
      .eq('event_type', 'view')
      .gte('created_at', new Date(Date.now() - parseInt(timeRange) * 24 * 60 * 60 * 1000).toISOString());

    // Growth metrics
    const { data: articleGrowth } = await supabase
      .from('knowledge_base_articles')
      .select('created_at')
      .eq('organization_id', orgId)
      .gte('created_at', new Date(Date.now() - parseInt(timeRange) * 24 * 60 * 60 * 1000).toISOString());

    // Engagement heatmap
    const { data: engagementData } = await supabase
      .from('knowledge_base_analytics')
      .select('created_at, event_type')
      .eq('organization_id', orgId)
      .gte('created_at', new Date(Date.now() - parseInt(timeRange) * 24 * 60 * 60 * 1000).toISOString());

    const engagementByHour = engagementData?.reduce((acc: any, event: any) => {
      const hour = new Date(event.created_at).getHours();
      acc[hour] = (acc[hour] || 0) + 1;
      return acc;
    }, {});

    // Completion rate
    const { data: completionData } = await supabase
      .from('knowledge_base_analytics')
      .select('event_type')
      .eq('organization_id', orgId)
      .in('event_type', ['view', 'read_complete'])
      .gte('created_at', new Date(Date.now() - parseInt(timeRange) * 24 * 60 * 60 * 1000).toISOString());

    const views = completionData?.filter(e => e.event_type === 'view').length || 0;
    const completions = completionData?.filter(e => e.event_type === 'read_complete').length || 0;
    const completionRate = views > 0 ? (completions / views) * 100 : 0;

    return new Response(JSON.stringify({
      success: true,
      analytics: {
        mostViewed: mostViewed || [],
        mostHelpful: mostHelpful || [],
        topAuthors: topAuthorsList || [],
        categoryDistribution: categoryStats || {},
        readingMetrics: {
          avgReadingTime: Math.round(avgReadingTime),
          avgScrollDepth: Math.round(avgScrollDepth),
          completionRate: Math.round(completionRate),
        },
        growth: {
          newArticles: articleGrowth?.length || 0,
          totalEngagements: engagementData?.length || 0,
        },
        engagementHeatmap: engagementByHour || {},
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
