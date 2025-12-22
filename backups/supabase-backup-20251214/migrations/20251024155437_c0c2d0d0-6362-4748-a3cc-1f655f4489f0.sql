-- Add ticket_id to findings table
ALTER TABLE public.findings 
ADD COLUMN IF NOT EXISTS ticket_id uuid REFERENCES public.remediation_tickets(id);

-- Add ticket_id to iam_findings table
ALTER TABLE public.iam_findings 
ADD COLUMN IF NOT EXISTS ticket_id uuid REFERENCES public.remediation_tickets(id);

-- Add ticket_id to compliance_checks table
ALTER TABLE public.compliance_checks 
ADD COLUMN IF NOT EXISTS ticket_id uuid REFERENCES public.remediation_tickets(id);

-- Add ticket_id to drift_detections table
ALTER TABLE public.drift_detections 
ADD COLUMN IF NOT EXISTS ticket_id uuid REFERENCES public.remediation_tickets(id);

-- Add ticket_id to cost_anomalies table
ALTER TABLE public.cost_anomalies 
ADD COLUMN IF NOT EXISTS ticket_id uuid REFERENCES public.remediation_tickets(id);

-- Add ticket_id to predictive_incidents table
ALTER TABLE public.predictive_incidents 
ADD COLUMN IF NOT EXISTS ticket_id uuid REFERENCES public.remediation_tickets(id);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_findings_ticket_id ON public.findings(ticket_id);
CREATE INDEX IF NOT EXISTS idx_iam_findings_ticket_id ON public.iam_findings(ticket_id);
CREATE INDEX IF NOT EXISTS idx_compliance_checks_ticket_id ON public.compliance_checks(ticket_id);
CREATE INDEX IF NOT EXISTS idx_drift_detections_ticket_id ON public.drift_detections(ticket_id);
CREATE INDEX IF NOT EXISTS idx_cost_anomalies_ticket_id ON public.cost_anomalies(ticket_id);
CREATE INDEX IF NOT EXISTS idx_predictive_incidents_ticket_id ON public.predictive_incidents(ticket_id);