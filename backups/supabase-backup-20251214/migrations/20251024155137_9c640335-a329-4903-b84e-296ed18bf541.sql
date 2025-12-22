-- Add ticket_id to waf_validations table
ALTER TABLE public.waf_validations 
ADD COLUMN IF NOT EXISTS ticket_id uuid REFERENCES public.remediation_tickets(id);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_waf_validations_ticket_id 
ON public.waf_validations(ticket_id);

-- Add RLS policy for super_admin on scheduled_scans
CREATE POLICY "Super admins can manage scheduled scans"
ON public.scheduled_scans
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));