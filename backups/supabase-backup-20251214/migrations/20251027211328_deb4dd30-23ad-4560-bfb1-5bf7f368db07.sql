-- Alter waste_detection_history to add missing columns if they don't exist
DO $$ 
BEGIN
  -- Add organization_id if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' 
                 AND table_name = 'waste_detection_history' 
                 AND column_name = 'organization_id') THEN
    ALTER TABLE public.waste_detection_history 
    ADD COLUMN organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
  END IF;

  -- Add scan_date if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' 
                 AND table_name = 'waste_detection_history' 
                 AND column_name = 'scan_date') THEN
    ALTER TABLE public.waste_detection_history 
    ADD COLUMN scan_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now();
  END IF;

  -- Add total_waste_count if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' 
                 AND table_name = 'waste_detection_history' 
                 AND column_name = 'total_waste_count') THEN
    ALTER TABLE public.waste_detection_history 
    ADD COLUMN total_waste_count INTEGER NOT NULL DEFAULT 0;
  END IF;

  -- Add total_monthly_cost if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' 
                 AND table_name = 'waste_detection_history' 
                 AND column_name = 'total_monthly_cost') THEN
    ALTER TABLE public.waste_detection_history 
    ADD COLUMN total_monthly_cost DECIMAL(10,2) NOT NULL DEFAULT 0;
  END IF;

  -- Add total_yearly_cost if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' 
                 AND table_name = 'waste_detection_history' 
                 AND column_name = 'total_yearly_cost') THEN
    ALTER TABLE public.waste_detection_history 
    ADD COLUMN total_yearly_cost DECIMAL(10,2) NOT NULL DEFAULT 0;
  END IF;

  -- Add scan_duration_seconds if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' 
                 AND table_name = 'waste_detection_history' 
                 AND column_name = 'scan_duration_seconds') THEN
    ALTER TABLE public.waste_detection_history 
    ADD COLUMN scan_duration_seconds INTEGER;
  END IF;

  -- Add status if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' 
                 AND table_name = 'waste_detection_history' 
                 AND column_name = 'status') THEN
    ALTER TABLE public.waste_detection_history 
    ADD COLUMN status TEXT NOT NULL DEFAULT 'completed';
  END IF;

  -- Add error_message if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' 
                 AND table_name = 'waste_detection_history' 
                 AND column_name = 'error_message') THEN
    ALTER TABLE public.waste_detection_history 
    ADD COLUMN error_message TEXT;
  END IF;
END $$;

-- Create or replace policies
DROP POLICY IF EXISTS "Users can view their organization waste detection history" ON public.waste_detection_history;
CREATE POLICY "Users can view their organization waste detection history"
  ON public.waste_detection_history
  FOR SELECT
  USING (
    organization_id IN (
      SELECT p.organization_id FROM public.profiles p WHERE p.id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Service role can manage waste detection history" ON public.waste_detection_history;
CREATE POLICY "Service role can manage waste detection history"
  ON public.waste_detection_history
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_waste_detection_history_org ON public.waste_detection_history(organization_id, scan_date DESC);
CREATE INDEX IF NOT EXISTS idx_waste_detection_history_account ON public.waste_detection_history(aws_account_id, scan_date DESC);