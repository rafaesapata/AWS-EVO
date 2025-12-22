# 🆕 New Lambda Functions (Batch 2) - Quick Reference

## Security Functions

### 1. Validate Permissions
**Endpoint**: `POST /security/validate-permissions`

**Purpose**: Valida permissões IAM necessárias para operações do sistema

**Request**:
```json
{
  "accountId": "uuid-required",
  "actions": [
    "ec2:DescribeInstances",
    "s3:ListAllMyBuckets",
    "guardduty:GetFindings"
  ]
}
```

**Response**:
```json
{
  "success": true,
  "valid": false,
  "principalArn": "arn:aws:iam::123456789012:role/EvoUdsRole",
  "summary": {
    "total": 15,
    "allowed": 12,
    "denied": 3,
    "percentage": 80
  },
  "results": [
    {
      "action": "ec2:DescribeInstances",
      "decision": "allowed",
      "allowed": true,
      "matchedStatements": 1
    },
    {
      "action": "s3:DeleteBucket",
      "decision": "denied",
      "allowed": false,
      "matchedStatements": 0
    }
  ],
  "missingPermissions": [
    "s3:DeleteBucket",
    "iam:DeleteUser",
    "rds:DeleteDBInstance"
  ]
}
```

**Use Cases**:
- Validar setup inicial de credenciais
- Troubleshooting de permissões
- Auditoria de acesso
- Compliance checking

---

### 2. IAM Behavior Analysis
**Endpoint**: `POST /security/iam-behavior-analysis`

**Purpose**: Analisa comportamento de usuários IAM para detectar anomalias

**Request**:
```json
{
  "accountId": "uuid-required",
  "region": "us-east-1",
  "lookbackDays": 7
}
```

**Response**:
```json
{
  "success": true,
  "usersAnalyzed": 15,
  "eventsAnalyzed": 234,
  "anomaliesDetected": 5,
  "summary": {
    "critical": 0,
    "high": 2,
    "medium": 2,
    "low": 1
  },
  "anomalies": [
    {
      "userName": "admin@example.com",
      "anomalyType": "after_hours_login",
      "severity": "medium",
      "description": "User logged in 3 times outside normal hours",
      "evidence": {
        "count": 3,
        "events": [...]
      }
    },
    {
      "userName": "developer@example.com",
      "anomalyType": "multiple_failed_logins",
      "severity": "high",
      "description": "User had 5 failed login attempts",
      "evidence": {
        "count": 5,
        "events": [...]
      }
    },
    {
      "userName": "ops@example.com",
      "anomalyType": "excessive_admin_actions",
      "severity": "high",
      "description": "User performed 12 administrative actions",
      "evidence": {
        "count": 12,
        "actions": ["DeleteBucket", "TerminateInstances", ...]
      }
    },
    {
      "userName": "contractor@example.com",
      "anomalyType": "multiple_locations",
      "severity": "medium",
      "description": "User accessed from 4 different IP addresses",
      "evidence": {
        "ipCount": 4,
        "ips": ["1.2.3.4", "5.6.7.8", ...]
      }
    }
  ]
}
```

**Anomaly Types**:
- `after_hours_login` - Logins fora do horário 6h-22h
- `multiple_failed_logins` - 3+ falhas de login
- `excessive_admin_actions` - 5+ ações administrativas
- `multiple_locations` - 3+ IPs diferentes

---

## Cost Functions

### 3. Generate Cost Forecast
**Endpoint**: `POST /cost/generate-forecast`

**Purpose**: Gera previsão de custos baseada em dados históricos

**Request**:
```json
{
  "accountId": "uuid-optional",
  "forecastDays": 30
}
```

**Response**:
```json
{
  "success": true,
  "forecast": [
    {
      "date": "2025-12-12",
      "predictedCost": 123.45,
      "confidence": 98,
      "lowerBound": 110.50,
      "upperBound": 136.40
    },
    {
      "date": "2025-12-13",
      "predictedCost": 125.30,
      "confidence": 96,
      "lowerBound": 112.20,
      "upperBound": 138.40
    }
  ],
  "summary": {
    "forecastDays": 30,
    "totalPredicted": 3704.50,
    "avgDailyCost": 123.48,
    "avgHistoricalCost": 115.20,
    "trend": "increasing",
    "trendPercentage": 7.19,
    "confidence": "medium"
  },
  "metadata": {
    "historicalDays": 90,
    "slope": 0.0823,
    "intercept": 115.45,
    "stdDev": 12.34
  }
}
```

**Features**:
- Regressão linear para previsão
- Intervalos de confiança (95%)
- Análise de tendências
- Comparação com histórico
- Confiança diminui com o tempo

---

## Monitoring Functions

### 4. Endpoint Monitor Check
**Endpoint**: `POST /monitoring/endpoint-check`

**Purpose**: Monitora disponibilidade e performance de endpoints

**Request**:
```json
{
  "endpointId": "uuid-optional"
}
```

**Response**:
```json
{
  "success": true,
  "results": [
    {
      "endpointId": "uuid-1",
      "url": "https://api.example.com/health",
      "status": "up",
      "statusCode": 200,
      "responseTime": 145,
      "checkedAt": "2025-12-11T10:00:00Z"
    },
    {
      "endpointId": "uuid-2",
      "url": "https://api.example.com/slow",
      "status": "degraded",
      "statusCode": 200,
      "responseTime": 2500,
      "checkedAt": "2025-12-11T10:00:01Z"
    },
    {
      "endpointId": "uuid-3",
      "url": "https://api.example.com/broken",
      "status": "down",
      "responseTime": 5000,
      "error": "Connection timeout",
      "checkedAt": "2025-12-11T10:00:06Z"
    }
  ],
  "summary": {
    "total": 3,
    "up": 1,
    "down": 1,
    "degraded": 1,
    "avgResponseTime": 2548
  }
}
```

**Status Definitions**:
- `up` - Status 2xx, response time < 2s
- `degraded` - Status 2xx, response time > 2s OR status 3xx/4xx
- `down` - Status 5xx OR timeout OR error

**Features**:
- Timeout configurável (default: 5s)
- Alertas automáticos em falhas
- Histórico de checks
- Medição de latência

---

## Report Functions

### 5. Generate Security PDF
**Endpoint**: `POST /reports/generate-security-pdf`

**Purpose**: Gera relatório de segurança em PDF/HTML

**Request**:
```json
{
  "accountId": "uuid-optional",
  "includeFindings": true,
  "includeCompliance": true,
  "includeDrifts": true
}
```

**Response**:
```json
{
  "success": true,
  "filename": "security-report-1733923200000.html",
  "downloadUrl": "https://s3.amazonaws.com/evo-uds-reports/org-id/security-report-1733923200000.html?X-Amz-..."
}
```

**Report Includes**:
- Organization info
- Security findings (top 100)
- Compliance violations (top 100)
- Configuration drifts (top 100)
- Summary statistics
- Formatted HTML tables

**Features**:
- HTML formatado
- Upload para S3
- URL pré-assinada (1 hora)
- Filtros por account

---

## Integration Functions

### 6. Create Jira Ticket
**Endpoint**: `POST /integrations/create-jira-ticket`

**Purpose**: Cria ticket no Jira vinculado a findings

**Request**:
```json
{
  "findingId": "uuid-optional",
  "title": "Critical Security Finding: S3 Bucket Public",
  "description": "S3 bucket 'my-bucket' is publicly accessible. This violates security policy.",
  "priority": "High",
  "issueType": "Bug"
}
```

**Priority Options**:
- `Highest`
- `High`
- `Medium`
- `Low`
- `Lowest`

**Issue Type Options**:
- `Bug`
- `Task`
- `Story`
- `Epic`

**Response**:
```json
{
  "success": true,
  "ticket": {
    "key": "SEC-123",
    "id": "10001",
    "url": "https://your-domain.atlassian.net/browse/SEC-123"
  }
}
```

**Prerequisites**:
- Jira integration configured in organization settings
- Valid Jira API token
- Project key configured

**Features**:
- Vinculação com findings
- Prioridades customizáveis
- Tracking de status
- URL direta para ticket

---

## Common Patterns

### Authentication
All endpoints require Cognito JWT token:
```
Authorization: Bearer <cognito-jwt-token>
```

### Error Responses
```json
{
  "error": "Error message here"
}
```

### CORS
All endpoints support CORS with:
- `OPTIONS` preflight requests
- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Headers: authorization, content-type`

---

## Testing Examples

### Using cURL

```bash
# Get API URL
export API_URL=$(aws cloudformation describe-stacks \
  --stack-name EvoUds-dev-Api \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiUrl`].OutputValue' \
  --output text)

export TOKEN="your-cognito-jwt-token"

# Test validate permissions
curl -X POST "${API_URL}security/validate-permissions" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "accountId": "uuid",
    "actions": ["ec2:DescribeInstances", "s3:ListAllMyBuckets"]
  }'

# Test IAM behavior analysis
curl -X POST "${API_URL}security/iam-behavior-analysis" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "accountId": "uuid",
    "lookbackDays": 7
  }'

# Test cost forecast
curl -X POST "${API_URL}cost/generate-forecast" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "forecastDays": 30
  }'

# Test endpoint monitoring
curl -X POST "${API_URL}monitoring/endpoint-check" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json"

# Test security PDF generation
curl -X POST "${API_URL}reports/generate-security-pdf" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "includeFindings": true,
    "includeCompliance": true,
    "includeDrifts": true
  }'

# Test Jira ticket creation
curl -X POST "${API_URL}integrations/create-jira-ticket" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Security Issue",
    "description": "Critical finding detected",
    "priority": "High"
  }'
```

---

## Deployment

All new Lambdas are automatically deployed when you run:

```bash
cd infra
npm run deploy:dev
```

Or deploy specific stack:

```bash
cdk deploy EvoUds-dev-Api
```

---

## Monitoring

View logs for any Lambda:

```bash
# Validate Permissions
aws logs tail /aws/lambda/evo-uds-dev-ValidatePermissions --follow

# IAM Behavior Analysis
aws logs tail /aws/lambda/evo-uds-dev-IAMBehaviorAnalysis --follow

# Generate Cost Forecast
aws logs tail /aws/lambda/evo-uds-dev-GenerateCostForecast --follow

# Endpoint Monitor Check
aws logs tail /aws/lambda/evo-uds-dev-EndpointMonitorCheck --follow

# Generate Security PDF
aws logs tail /aws/lambda/evo-uds-dev-GenerateSecurityPDF --follow

# Create Jira Ticket
aws logs tail /aws/lambda/evo-uds-dev-CreateJiraTicket --follow
```

---

**Last Updated**: 2025-12-11  
**Version**: 2.0  
**Total New Functions**: 6  
**Total Functions**: 32/65 (49%)
