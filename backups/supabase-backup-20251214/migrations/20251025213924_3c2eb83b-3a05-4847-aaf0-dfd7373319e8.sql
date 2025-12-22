-- Tabelas para suporte a WebAuthn

-- Tabela para armazenar desafios temporários
CREATE TABLE IF NOT EXISTS public.webauthn_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  challenge TEXT NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Tabela para armazenar credenciais WebAuthn
CREATE TABLE IF NOT EXISTS public.webauthn_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  credential_id TEXT NOT NULL UNIQUE,
  public_key TEXT NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0,
  transports TEXT[] DEFAULT '{}',
  friendly_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  last_used_at TIMESTAMP WITH TIME ZONE
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_webauthn_challenges_user ON webauthn_challenges(user_id);
CREATE INDEX IF NOT EXISTS idx_webauthn_challenges_expires ON webauthn_challenges(expires_at);
CREATE INDEX IF NOT EXISTS idx_webauthn_credentials_user ON webauthn_credentials(user_id);
CREATE INDEX IF NOT EXISTS idx_webauthn_credentials_id ON webauthn_credentials(credential_id);

-- RLS Policies
ALTER TABLE public.webauthn_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webauthn_credentials ENABLE ROW LEVEL SECURITY;

-- Challenges: users can only see their own
CREATE POLICY "Users can manage their own challenges"
  ON public.webauthn_challenges
  FOR ALL
  USING (auth.uid() = user_id);

-- Credentials: users can only see and manage their own
CREATE POLICY "Users can view their own credentials"
  ON public.webauthn_credentials
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own credentials"
  ON public.webauthn_credentials
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own credentials"
  ON public.webauthn_credentials
  FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own credentials"
  ON public.webauthn_credentials
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Função para limpar desafios expirados
CREATE OR REPLACE FUNCTION public.cleanup_expired_challenges()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM public.webauthn_challenges
  WHERE expires_at < now();
END;
$$;