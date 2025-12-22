-- Create license_seats table to track seat allocation
CREATE TABLE IF NOT EXISTS public.license_seats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  license_key TEXT NOT NULL,
  allocated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  allocated_by UUID REFERENCES auth.users(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(organization_id, user_id)
);

-- Add indexes for performance
CREATE INDEX idx_license_seats_org ON public.license_seats(organization_id);
CREATE INDEX idx_license_seats_user ON public.license_seats(user_id);
CREATE INDEX idx_license_seats_active ON public.license_seats(is_active) WHERE is_active = true;

-- Enable RLS
ALTER TABLE public.license_seats ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own seat allocation
CREATE POLICY "Users can view their own seat"
ON public.license_seats
FOR SELECT
USING (user_id = auth.uid());

-- Policy: Org admins can view all seats in their org
CREATE POLICY "Org admins can view org seats"
ON public.license_seats
FOR SELECT
USING (
  organization_id = get_user_organization(auth.uid())
  AND (
    has_role(auth.uid(), 'org_admin'::app_role)
    OR has_role(auth.uid(), 'super_admin'::app_role)
  )
);

-- Policy: Org admins can allocate seats
CREATE POLICY "Org admins can allocate seats"
ON public.license_seats
FOR INSERT
WITH CHECK (
  organization_id = get_user_organization(auth.uid())
  AND (
    has_role(auth.uid(), 'org_admin'::app_role)
    OR has_role(auth.uid(), 'super_admin'::app_role)
  )
);

-- Policy: Org admins can update seat allocation
CREATE POLICY "Org admins can update seats"
ON public.license_seats
FOR UPDATE
USING (
  organization_id = get_user_organization(auth.uid())
  AND (
    has_role(auth.uid(), 'org_admin'::app_role)
    OR has_role(auth.uid(), 'super_admin'::app_role)
  )
);

-- Policy: Org admins can deallocate seats
CREATE POLICY "Org admins can deallocate seats"
ON public.license_seats
FOR DELETE
USING (
  organization_id = get_user_organization(auth.uid())
  AND (
    has_role(auth.uid(), 'org_admin'::app_role)
    OR has_role(auth.uid(), 'super_admin'::app_role)
  )
);

-- Trigger to update updated_at
CREATE TRIGGER update_license_seats_updated_at
BEFORE UPDATE ON public.license_seats
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at();

-- Function to check if user has allocated seat
CREATE OR REPLACE FUNCTION public.user_has_seat(_user_id UUID, _org_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM public.license_seats
    WHERE user_id = _user_id
      AND organization_id = _org_id
      AND is_active = true
  );
END;
$$;

-- Function to get available seats count
CREATE OR REPLACE FUNCTION public.get_available_seats(_org_id UUID, _total_seats INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  allocated_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO allocated_count
  FROM public.license_seats
  WHERE organization_id = _org_id
    AND is_active = true;
  
  RETURN _total_seats - allocated_count;
END;
$$;