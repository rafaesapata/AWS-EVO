-- Create table for AWS credentials
CREATE TABLE public.aws_credentials (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  access_key_id TEXT NOT NULL,
  secret_access_key TEXT NOT NULL,
  region TEXT NOT NULL DEFAULT 'us-east-1',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.aws_credentials ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (since there's no auth)
CREATE POLICY "Allow public read access" 
ON public.aws_credentials 
FOR SELECT 
USING (true);

CREATE POLICY "Allow public insert access" 
ON public.aws_credentials 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Allow public update access" 
ON public.aws_credentials 
FOR UPDATE 
USING (true);

CREATE POLICY "Allow public delete access" 
ON public.aws_credentials 
FOR DELETE 
USING (true);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_aws_credentials_updated_at
BEFORE UPDATE ON public.aws_credentials
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();