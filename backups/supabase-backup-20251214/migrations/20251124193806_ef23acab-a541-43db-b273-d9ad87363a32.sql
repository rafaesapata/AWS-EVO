-- GuardDuty Threat Detection Tables
CREATE TABLE IF NOT EXISTS public.guardduty_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  aws_account_id UUID REFERENCES public.aws_credentials(id) ON DELETE CASCADE,
  finding_id TEXT NOT NULL,
  finding_type TEXT NOT NULL,
  severity NUMERIC NOT NULL,
  severity_label TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  resource_type TEXT,
  resource_id TEXT,
  region TEXT,
  service TEXT,
  action JSONB,
  actor JSONB,
  evidence JSONB,
  remediation_recommendations JSONB,
  first_seen TIMESTAMPTZ NOT NULL,
  last_seen TIMESTAMPTZ NOT NULL,
  count INTEGER DEFAULT 1,
  status TEXT DEFAULT 'active',
  assigned_to UUID REFERENCES auth.users(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(aws_account_id, finding_id)
);

-- IAM Behavioral Analysis
CREATE TABLE IF NOT EXISTS public.iam_behavior_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  aws_account_id UUID REFERENCES public.aws_credentials(id) ON DELETE CASCADE,
  user_identity TEXT NOT NULL,
  user_type TEXT NOT NULL,
  baseline_actions JSONB NOT NULL,
  anomalous_actions JSONB,
  risk_score INTEGER NOT NULL,
  anomaly_details JSONB,
  analysis_period JSONB NOT NULL,
  last_analyzed TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Lateral Movement Detection
CREATE TABLE IF NOT EXISTS public.lateral_movement_detections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  aws_account_id UUID REFERENCES public.aws_credentials(id) ON DELETE CASCADE,
  source_identity TEXT NOT NULL,
  source_resource TEXT,
  target_resources JSONB NOT NULL,
  movement_pattern TEXT NOT NULL,
  severity TEXT NOT NULL,
  detection_confidence NUMERIC NOT NULL,
  timeline JSONB NOT NULL,
  indicators JSONB,
  status TEXT DEFAULT 'active',
  investigated_by UUID REFERENCES auth.users(id),
  investigation_notes TEXT,
  detected_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ML-based Resource Utilization Analysis
CREATE TABLE IF NOT EXISTS public.resource_utilization_ml (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  aws_account_id UUID REFERENCES public.aws_credentials(id) ON DELETE CASCADE,
  resource_id TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_name TEXT,
  current_size TEXT,
  recommended_size TEXT,
  utilization_patterns JSONB NOT NULL,
  hourly_usage JSONB,
  daily_usage JSONB,
  weekly_usage JSONB,
  ml_confidence NUMERIC NOT NULL,
  potential_monthly_savings NUMERIC,
  recommendation_type TEXT NOT NULL,
  implementation_complexity TEXT,
  auto_scaling_eligible BOOLEAN DEFAULT false,
  auto_scaling_config JSONB,
  analyzed_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Team Comments System
CREATE TABLE IF NOT EXISTS public.resource_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  comment TEXT NOT NULL,
  mentions JSONB,
  parent_comment_id UUID REFERENCES public.resource_comments(id) ON DELETE CASCADE,
  edited_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Mentions Notifications
CREATE TABLE IF NOT EXISTS public.mention_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  mentioned_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  mentioning_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  comment_id UUID REFERENCES public.resource_comments(id) ON DELETE CASCADE,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Knowledge Base
CREATE TABLE IF NOT EXISTS public.knowledge_base_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT NOT NULL,
  tags TEXT[],
  author_id UUID REFERENCES auth.users(id),
  is_public BOOLEAN DEFAULT false,
  view_count INTEGER DEFAULT 0,
  helpful_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Runbooks
CREATE TABLE IF NOT EXISTS public.runbooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  steps JSONB NOT NULL,
  category TEXT NOT NULL,
  tags TEXT[],
  author_id UUID REFERENCES auth.users(id),
  execution_count INTEGER DEFAULT 0,
  average_duration_minutes INTEGER,
  success_rate NUMERIC,
  is_automated BOOLEAN DEFAULT false,
  automation_script TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Report Templates
CREATE TABLE IF NOT EXISTS public.report_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  template_type TEXT NOT NULL,
  sections JSONB NOT NULL,
  filters JSONB,
  schedule JSONB,
  recipients TEXT[],
  format TEXT DEFAULT 'pdf',
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Error Knowledge Base
CREATE TABLE IF NOT EXISTS public.error_knowledge_base (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  error_code TEXT NOT NULL,
  error_message TEXT NOT NULL,
  service TEXT NOT NULL,
  category TEXT,
  solution TEXT NOT NULL,
  related_documentation TEXT[],
  occurrence_count INTEGER DEFAULT 1,
  last_occurred TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(organization_id, error_code, service)
);

-- Dashboard Layouts (for drag & drop)
CREATE TABLE IF NOT EXISTS public.dashboard_layouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  dashboard_name TEXT NOT NULL,
  layout_config JSONB NOT NULL,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, dashboard_name)
);

-- Enable RLS
ALTER TABLE public.guardduty_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.iam_behavior_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lateral_movement_detections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resource_utilization_ml ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resource_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mention_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_base_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.runbooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.error_knowledge_base ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_layouts ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their org's GuardDuty findings"
  ON public.guardduty_findings FOR SELECT
  USING (organization_id = (SELECT get_user_organization(auth.uid())));

CREATE POLICY "Users can view their org's IAM behavior analysis"
  ON public.iam_behavior_analysis FOR SELECT
  USING (organization_id = (SELECT get_user_organization(auth.uid())));

CREATE POLICY "Users can view their org's lateral movement detections"
  ON public.lateral_movement_detections FOR SELECT
  USING (organization_id = (SELECT get_user_organization(auth.uid())));

CREATE POLICY "Users can view their org's resource utilization ML"
  ON public.resource_utilization_ml FOR SELECT
  USING (organization_id = (SELECT get_user_organization(auth.uid())));

CREATE POLICY "Users can view their org's comments"
  ON public.resource_comments FOR SELECT
  USING (organization_id = (SELECT get_user_organization(auth.uid())));

CREATE POLICY "Users can create comments in their org"
  ON public.resource_comments FOR INSERT
  WITH CHECK (organization_id = (SELECT get_user_organization(auth.uid())) AND user_id = auth.uid());

CREATE POLICY "Users can update their own comments"
  ON public.resource_comments FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own comments"
  ON public.resource_comments FOR DELETE
  USING (user_id = auth.uid());

CREATE POLICY "Users can view their mentions"
  ON public.mention_notifications FOR SELECT
  USING (mentioned_user_id = auth.uid());

CREATE POLICY "Users can update their mention notifications"
  ON public.mention_notifications FOR UPDATE
  USING (mentioned_user_id = auth.uid());

CREATE POLICY "Users can view their org's knowledge base"
  ON public.knowledge_base_articles FOR SELECT
  USING (organization_id = (SELECT get_user_organization(auth.uid())) OR is_public = true);

CREATE POLICY "Users can create knowledge base articles"
  ON public.knowledge_base_articles FOR INSERT
  WITH CHECK (organization_id = (SELECT get_user_organization(auth.uid())) AND author_id = auth.uid());

CREATE POLICY "Authors can update their articles"
  ON public.knowledge_base_articles FOR UPDATE
  USING (author_id = auth.uid());

CREATE POLICY "Users can view their org's runbooks"
  ON public.runbooks FOR SELECT
  USING (organization_id = (SELECT get_user_organization(auth.uid())));

CREATE POLICY "Users can create runbooks"
  ON public.runbooks FOR INSERT
  WITH CHECK (organization_id = (SELECT get_user_organization(auth.uid())) AND author_id = auth.uid());

CREATE POLICY "Users can view their org's report templates"
  ON public.report_templates FOR SELECT
  USING (organization_id = (SELECT get_user_organization(auth.uid())));

CREATE POLICY "Users can manage report templates"
  ON public.report_templates FOR ALL
  USING (organization_id = (SELECT get_user_organization(auth.uid())));

CREATE POLICY "Users can view their org's error knowledge"
  ON public.error_knowledge_base FOR SELECT
  USING (organization_id = (SELECT get_user_organization(auth.uid())));

CREATE POLICY "Users can manage their dashboard layouts"
  ON public.dashboard_layouts FOR ALL
  USING (user_id = auth.uid());

-- Indexes
CREATE INDEX idx_guardduty_org_account ON public.guardduty_findings(organization_id, aws_account_id);
CREATE INDEX idx_guardduty_severity ON public.guardduty_findings(severity_label, status);
CREATE INDEX idx_iam_behavior_org ON public.iam_behavior_analysis(organization_id, aws_account_id);
CREATE INDEX idx_lateral_movement_org ON public.lateral_movement_detections(organization_id, status);
CREATE INDEX idx_resource_ml_org ON public.resource_utilization_ml(organization_id, aws_account_id);
CREATE INDEX idx_comments_resource ON public.resource_comments(resource_type, resource_id);
CREATE INDEX idx_mentions_user ON public.mention_notifications(mentioned_user_id, read_at);
CREATE INDEX idx_kb_category ON public.knowledge_base_articles(category, organization_id);
CREATE INDEX idx_runbooks_category ON public.runbooks(category, organization_id);
CREATE INDEX idx_error_kb_service ON public.error_knowledge_base(service, organization_id);

-- Triggers
CREATE TRIGGER update_guardduty_findings_updated_at
  BEFORE UPDATE ON public.guardduty_findings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_iam_behavior_updated_at
  BEFORE UPDATE ON public.iam_behavior_analysis
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_lateral_movement_updated_at
  BEFORE UPDATE ON public.lateral_movement_detections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_resource_ml_updated_at
  BEFORE UPDATE ON public.resource_utilization_ml
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_comments_updated_at
  BEFORE UPDATE ON public.resource_comments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_kb_articles_updated_at
  BEFORE UPDATE ON public.knowledge_base_articles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_runbooks_updated_at
  BEFORE UPDATE ON public.runbooks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_report_templates_updated_at
  BEFORE UPDATE ON public.report_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_error_kb_updated_at
  BEFORE UPDATE ON public.error_knowledge_base
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_dashboard_layouts_updated_at
  BEFORE UPDATE ON public.dashboard_layouts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();