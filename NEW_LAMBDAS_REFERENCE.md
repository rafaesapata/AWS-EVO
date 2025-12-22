# 🆕 New Lambda Functions - Quick Reference

## Security Functions

### 1. Drift Detection
**Endpoint**: `POST /security/drift-detection`

**Purpose**: Detecta mudanças não autorizadas em recursos AWS

**Request**:
```json
{
  "accountId": "uuid-optional",
  "regions": ["us-east-1", "us-west-2"]
}
```

**Response**:
```json
{
  "success": true,
  "drifts_detected": 5,
  "execution_time": "12.34",
  "summary": {
    "created": 2,
    "configuration_drift": 2,
    "deleted": 1,
    "critical": 1,
    "high": 2
  }
}
```

---

### 2. Analyze CloudTrail
**Endpoint**: `POST /security/analyze-cloudtrail`

**Purpose**: Analisa eventos de auditoria do CloudTrail

**Request**:
```json
{
  "accountId": "uuid-required",
  "region": "us-east-1",
  "startTime": "2025-12-10T00:00:00Z",
  "endTime": "2025-12-11T00:00:00Z",
  "maxResults": 50
}
```

**Response**:
```json
{
  "success": true,
  "events": [
    {
      "eventId": "...",
      "eventName": "ConsoleLogin",
      "eventTime": "2025-12-11T10:00:00Z",
      "username": "admin@example.com"
    }
  ],
  "summary": {
    "count": 50,
    "startTime": "...",
    "endTime": "..."
  }
}
```

---

### 3. Well-Architected Scan
**Endpoint**: `POST /security/well-architected-scan`

**Purpose**: Scan do AWS Well-Architected Framework

**Request**:
```json
{
  "accountId": "uuid-required",
  "region": "us-east-1"
}
```

**Response**:
```json
{
  "success": true,
  "workloads": [
    {
      "WorkloadId": "...",
      "WorkloadName": "Production App",
      "Environment": "PRODUCTION"
    }
  ],
  "summary": {
    "count": 3
  }
}
```

---

## Cost Functions

### 4. Fetch Daily Costs
**Endpoint**: `POST /cost/fetch-daily-costs`

**Purpose**: Busca custos diários via AWS Cost Explorer

**Request**:
```json
{
  "accountId": "uuid-optional",
  "startDate": "2025-11-01",
  "endDate": "2025-12-01",
  "granularity": "DAILY"
}
```

**Response**:
```json
{
  "success": true,
  "costs": [
    {
      "accountId": "...",
      "accountName": "Production",
      "date": "2025-11-01",
      "service": "Amazon EC2",
      "cost": 123.45,
      "usage": 720.0,
      "currency": "USD"
    }
  ],
  "summary": {
    "totalCost": 5432.10,
    "totalRecords": 150,
    "uniqueDates": 30,
    "uniqueServices": 15,
    "accounts": 2
  }
}
```

---

### 5. ML Waste Detection
**Endpoint**: `POST /cost/ml-waste-detection`

**Purpose**: Detecta recursos AWS desperdiçados usando ML

**Request**:
```json
{
  "accountId": "uuid-optional",
  "regions": ["us-east-1"],
  "threshold": 5
}
```

**Response**:
```json
{
  "success": true,
  "wasteItems": [
    {
      "resourceId": "i-1234567890abcdef0",
      "resourceType": "EC2::Instance",
      "resourceName": "idle-server",
      "region": "us-east-1",
      "wasteType": "zombie",
      "confidence": 95.5,
      "estimatedMonthlyCost": 70.00,
      "estimatedSavings": 70.00,
      "metrics": {
        "avgCpu": 0.5,
        "maxCpu": 2.1,
        "instanceType": "m5.large"
      },
      "recommendation": "Stop or terminate this instance..."
    }
  ],
  "summary": {
    "totalItems": 5,
    "totalSavings": 350.00,
    "byType": {
      "idle": 1,
      "underutilized": 2,
      "oversized": 1,
      "zombie": 1
    },
    "executionTime": "45.23"
  }
}
```

---

## Monitoring Functions

### 6. Fetch CloudWatch Metrics
**Endpoint**: `POST /monitoring/fetch-cloudwatch-metrics`

**Purpose**: Busca métricas customizadas do CloudWatch

**Request**:
```json
{
  "accountId": "uuid-required",
  "region": "us-east-1",
  "namespace": "AWS/EC2",
  "metricName": "CPUUtilization",
  "dimensions": [
    {
      "Name": "InstanceId",
      "Value": "i-1234567890abcdef0"
    }
  ],
  "startTime": "2025-12-10T00:00:00Z",
  "endTime": "2025-12-11T00:00:00Z",
  "period": 3600,
  "statistics": ["Average", "Maximum"]
}
```

**Response**:
```json
{
  "success": true,
  "metric": {
    "namespace": "AWS/EC2",
    "metricName": "CPUUtilization",
    "dimensions": [...]
  },
  "datapoints": [
    {
      "timestamp": "2025-12-10T00:00:00Z",
      "average": 45.5,
      "maximum": 78.2,
      "unit": "Percent"
    }
  ],
  "summary": {
    "count": 24,
    "period": 3600,
    "startTime": "...",
    "endTime": "..."
  }
}
```

---

### 7. Auto Alerts
**Endpoint**: `POST /monitoring/auto-alerts`

**Purpose**: Cria alertas automáticos baseados em anomalias

**Request**:
```json
{
  "accountId": "uuid-optional"
}
```

**Response**:
```json
{
  "success": true,
  "alertsCreated": 3,
  "alerts": [
    {
      "id": "...",
      "severity": "HIGH",
      "title": "Cost Anomaly Detected",
      "message": "Daily cost spike detected: $523.45 (avg: $123.45)",
      "triggeredAt": "2025-12-11T10:00:00Z"
    }
  ]
}
```

---

### 8. Check Alert Rules
**Endpoint**: `POST /monitoring/check-alert-rules`

**Purpose**: Verifica regras de alerta e dispara notificações

**Request**:
```json
{
  "ruleId": "uuid-optional"
}
```

**Response**:
```json
{
  "success": true,
  "rulesChecked": 10,
  "triggeredAlerts": 2,
  "alerts": [
    {
      "id": "...",
      "ruleId": "...",
      "severity": "CRITICAL",
      "title": "Cost Threshold Exceeded",
      "message": "Alert triggered: Monthly cost exceeded $5000",
      "triggeredAt": "2025-12-11T10:00:00Z"
    }
  ]
}
```

---

## Report Functions

### 9. Generate Excel Report
**Endpoint**: `POST /reports/generate-excel`

**Purpose**: Gera relatórios Excel/CSV exportáveis

**Request**:
```json
{
  "reportType": "security",
  "accountId": "uuid-optional",
  "startDate": "2025-11-01",
  "endDate": "2025-12-01"
}
```

**Report Types**:
- `security` - Security findings
- `cost` - Daily costs
- `compliance` - Compliance violations
- `drift` - Drift detections

**Response**:
```json
{
  "success": true,
  "filename": "security-report-1733923200000.csv",
  "downloadUrl": "https://s3.amazonaws.com/...",
  "recordCount": 150
}
```

---

## Knowledge Base Functions

### 10. KB AI Suggestions
**Endpoint**: `POST /kb/ai-suggestions`

**Purpose**: Sugestões inteligentes da knowledge base

**Request**:
```json
{
  "query": "how to reduce costs",
  "limit": 5
}
```

**Response**:
```json
{
  "success": true,
  "query": "how to reduce costs",
  "suggestions": [
    {
      "id": "...",
      "title": "Cost Optimization Best Practices",
      "summary": "Learn how to optimize your AWS costs...",
      "relevanceScore": 85,
      "url": "/kb/..."
    }
  ]
}
```

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

# Get token (after login)
export TOKEN="your-cognito-jwt-token"

# Test drift detection
curl -X POST "${API_URL}security/drift-detection" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"regions": ["us-east-1"]}'

# Test fetch daily costs
curl -X POST "${API_URL}cost/fetch-daily-costs" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "startDate": "2025-11-01",
    "endDate": "2025-12-01",
    "granularity": "DAILY"
  }'

# Test ML waste detection
curl -X POST "${API_URL}cost/ml-waste-detection" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"threshold": 5}'
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
# Drift Detection
aws logs tail /aws/lambda/evo-uds-dev-DriftDetection --follow

# ML Waste Detection
aws logs tail /aws/lambda/evo-uds-dev-MLWasteDetection --follow

# Auto Alerts
aws logs tail /aws/lambda/evo-uds-dev-AutoAlerts --follow
```

---

**Last Updated**: 2025-12-11  
**Version**: 2.0  
**Total New Functions**: 10
