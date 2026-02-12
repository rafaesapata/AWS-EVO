-- Add language and timezone preferences to profiles table
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "language" TEXT DEFAULT 'pt';
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "timezone" TEXT DEFAULT 'America/Sao_Paulo';
