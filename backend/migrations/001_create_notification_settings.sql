-- Create notification_settings table
CREATE TABLE IF NOT EXISTS notification_settings (
    id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255) UNIQUE NOT NULL,
    
    -- Email settings
    email_enabled BOOLEAN DEFAULT TRUE NOT NULL,
    
    -- Webhook settings
    webhook_enabled BOOLEAN DEFAULT FALSE NOT NULL,
    webhook_url TEXT,
    
    -- Slack settings
    slack_enabled BOOLEAN DEFAULT FALSE NOT NULL,
    slack_webhook_url TEXT,
    
    -- Datadog settings
    datadog_enabled BOOLEAN DEFAULT FALSE NOT NULL,
    datadog_api_key TEXT,
    datadog_site VARCHAR(255) DEFAULT 'datadoghq.com',
    
    -- Graylog settings
    graylog_enabled BOOLEAN DEFAULT FALSE NOT NULL,
    graylog_url TEXT,
    graylog_port INTEGER DEFAULT 12201,
    
    -- Zabbix settings
    zabbix_enabled BOOLEAN DEFAULT FALSE NOT NULL,
    zabbix_url TEXT,
    zabbix_auth_token TEXT,
    
    -- Notification preferences
    notify_on_critical BOOLEAN DEFAULT TRUE NOT NULL,
    notify_on_high BOOLEAN DEFAULT TRUE NOT NULL,
    notify_on_medium BOOLEAN DEFAULT FALSE NOT NULL,
    notify_on_scan_complete BOOLEAN DEFAULT TRUE NOT NULL,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Create index on user_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_notification_settings_user_id ON notification_settings(user_id);

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_notification_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_notification_settings_updated_at
    BEFORE UPDATE ON notification_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_notification_settings_updated_at();