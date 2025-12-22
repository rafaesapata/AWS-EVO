-- Enable pg_cron and pg_net extensions for scheduled jobs
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Create a cron job to run endpoint monitoring every minute
-- This will check all active monitors that are due for a check
SELECT cron.schedule(
  'endpoint-monitor-check-every-minute',
  '* * * * *', -- Every minute
  $$
  SELECT
    net.http_post(
      url := 'https://bsluqzxeexanydqvmbrh.supabase.co/functions/v1/endpoint-monitor-check',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJzbHVxenhlZXhhbnlkcXZtYnJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEyNDUzODksImV4cCI6MjA3NjgyMTM4OX0.SJBE0YCcdFagIJHJArVwGk6mV9x6r3Yocdc3ySxpO5A"}'::jsonb,
      body := '{}'::jsonb
    ) AS request_id;
  $$
);

-- View scheduled cron jobs
-- SELECT * FROM cron.job;