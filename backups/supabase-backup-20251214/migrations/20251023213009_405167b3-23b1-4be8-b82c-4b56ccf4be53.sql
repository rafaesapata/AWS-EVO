-- Create findings table to store CloudTrail security findings
CREATE TABLE IF NOT EXISTS public.findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT NOT NULL,
  event_name TEXT NOT NULL,
  event_time TIMESTAMP WITH TIME ZONE NOT NULL,
  user_identity JSONB NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  description TEXT NOT NULL,
  details JSONB NOT NULL,
  ai_analysis TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved', 'ignored')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX idx_findings_status ON public.findings(status);
CREATE INDEX idx_findings_severity ON public.findings(severity);
CREATE INDEX idx_findings_event_time ON public.findings(event_time DESC);

-- Enable RLS
ALTER TABLE public.findings ENABLE ROW LEVEL SECURITY;

-- Create policy to allow public access for now (no login required)
CREATE POLICY "Allow public read access" ON public.findings
  FOR SELECT USING (true);

CREATE POLICY "Allow public insert access" ON public.findings
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public update access" ON public.findings
  FOR UPDATE USING (true);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_findings_updated_at
  BEFORE UPDATE ON public.findings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();