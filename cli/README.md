# EVO CLI Tool

Command-line interface for EVO AWS Security & Cost Auditor.

## Installation

```bash
cd cli
npm install
npm run build
npm link
```

## Configuration

Set environment variables:

```bash
export VITE_SUPABASE_URL="your-supabase-url"
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
export EVO_ORG_ID="your-organization-id"
```

## Usage

### Login
```bash
evo-cli login user@example.com password123
```

### Security Scan
```bash
evo-cli scan <aws-account-id>
```

### Get Costs
```bash
evo-cli costs <org-id> 2024-01-01 2024-01-31
```

### Export Data
```bash
evo-cli export <org-id> csv
```

### Refresh Materialized Views
```bash
evo-cli refresh-views
```

### System Health
```bash
evo-cli health
```

### Recent Events
```bash
evo-cli events <org-id> 20
```

### Validate License
```bash
evo-cli validate-license <customer-id>
```

## Features

- 🔐 Authentication and session management
- 🔍 Trigger security scans
- 💰 Fetch and analyze cost data
- 📊 Export data in multiple formats
- 🔄 Refresh materialized views on-demand
- 🏥 Monitor system health
- 📋 View event logs
- 🎫 Validate licenses

## Advanced Usage

### Scheduled Jobs
Use cron to schedule regular operations:

```cron
# Refresh materialized views daily at 2 AM
0 2 * * * evo-cli refresh-views

# Export costs weekly
0 0 * * 0 evo-cli export $ORG_ID csv > weekly-costs.csv
```

### CI/CD Integration
```bash
# In your CI pipeline
evo-cli scan $AWS_ACCOUNT_ID
evo-cli health
```

## Troubleshooting

### Authentication Issues
Ensure your service role key has proper permissions and is not expired.

### Network Errors
Check that your Supabase URL is accessible and correct.

### Permission Errors
Verify your organization ID and user permissions.
