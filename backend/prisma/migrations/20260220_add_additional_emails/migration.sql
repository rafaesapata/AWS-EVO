-- Add additional_emails column to notification_settings
ALTER TABLE "notification_settings" ADD COLUMN "additional_emails" TEXT[] DEFAULT '{}';
