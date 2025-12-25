# Security Engine V2 - Military-Grade Implementation

## Status: ✅ DEPLOYED & OPERATIONAL

**Last Updated:** December 25, 2025
**Lambda:** `evo-uds-v3-production-security-scan-v2`
**Endpoint:** `POST /api/functions/security-scan-v2`

---

## Overview

Security Engine V2 is a comprehensive AWS security scanning solution with 147 unique security checks across 23 AWS services, mapped to 6 compliance frameworks.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Security Engine V2                        │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ Scan Manager│──│ Client      │──│ Resource Cache      │  │
│  │             │  │ Factory     │  │ (TTL: 5min)         │  │
│  └──────┬──────┘  └─────────────┘  └─────────────────────┘  │
│         │                                                    │
│  ┌──────▼──────────────────────────────────────────────┐    │
│  │              23 Service Scanners                     │    │
│  │  IAM | S3 | EC2 | RDS | Lambda | EKS | ECS | ...    │    │
│  └─────────────────────────────────────────────────────┘    │
│         │                                                    │
│  ┌──────▼──────────────────────────────────────────────┐    │
│  │           147 Security Checks                        │    │
│  │  CIS | PCI-DSS | NIST | LGPD | SOC2 | Well-Arch    │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

## Service Coverage (23 Services)

| Service | Checks | Category |
|---------|--------|----------|
| IAM | 28 | Identity Security |
| S3 | 11 | Data Protection |
| EC2 | 12 | Network Security |
| RDS | 10 | Data Protection |
| Lambda | 9 | Serverless Security |
| CloudTrail | 6 | Logging & Monitoring |
| KMS | 2 | Encryption |
| SecretsManager | 3 | Secrets Management |
| GuardDuty | 4 | Logging & Monitoring |
| SecurityHub | 3 | Compliance |
| WAF | 4 | Network Security |
| SQS | 3 | Data Protection |
| SNS | 2 | Data Protection |
| DynamoDB | 4 | Data Protection |
| Cognito | 5 | Identity Security |
| APIGateway | 5 | API Security |
| ACM | 5 | Encryption |
| CloudFront | 6 | Network Security |
| ElastiCache | 6 | Data Protection |
| ELB | 5 | Network Security |
| EKS | 5 | Container Security |
| ECS | 7 | Container Security |
| OpenSearch | 7 | Data Protection |

**Total: 147 unique security checks**

## Compliance Framework Mappings

| Framework | Controls Mapped |
|-----------|-----------------|
| CIS AWS Foundations Benchmark v1.5.0 | 66 |
| AWS Well-Architected Framework | 51 |
| PCI-DSS v4.0 | 43 |
| NIST 800-53 Rev5 | 18 |
| LGPD (Brazil) | 10 |
| SOC 2 | 2 |

## Security Check Categories

### Critical Severity (Immediate Action Required)
- Root account without MFA
- Root account access keys
- IAM roles with wildcard trust policies
- S3 buckets with public access
- RDS instances publicly accessible
- Lambda functions with public URLs (no auth)
- Security groups exposing critical ports (SSH, RDP, DB)
- CloudTrail not logging
- ACM certificates expired

### High Severity
- IAM users without MFA (console access)
- Old access keys (180+ days)
- EBS volumes unencrypted
- RDS instances unencrypted
- Lambda with deprecated runtimes
- Lambda with secrets in env vars
- EKS public endpoint enabled
- EKS secrets not encrypted
- OpenSearch not in VPC
- CloudFront allowing HTTP
- ELB using HTTP listeners
- ECS privileged containers

### Medium Severity
- Password policy weaknesses
- Cross-account roles without ExternalId
- VPC without flow logs
- EC2 using IMDSv1
- RDS without Multi-AZ
- CloudTrail not multi-region
- GuardDuty protections disabled
- API Gateway without WAF
- Cognito MFA optional

### Low Severity
- Detailed monitoring disabled
- X-Ray tracing disabled
- Deletion protection disabled
- DLQ not configured
- Lifecycle policies missing

## API Usage

### Request
```bash
POST /api/functions/security-scan-v2
Authorization: Bearer <cognito-token>
Content-Type: application/json

{
  "accountId": "optional-credential-id",
  "scanLevel": "quick|standard|deep"
}
```

### Response
```json
{
  "scan_id": "uuid",
  "status": "completed",
  "duration_ms": 45000,
  "engine_version": "v2",
  "summary": {
    "total": 25,
    "critical": 2,
    "high": 5,
    "medium": 10,
    "low": 8,
    "info": 0,
    "by_service": { "IAM": 5, "S3": 3, ... },
    "by_category": { "Identity Security": 8, ... }
  },
  "metrics": {
    "services_scanned": 23,
    "regions_scanned": 1,
    "total_duration": 45000
  },
  "findings": [...]
}
```

## Scan Levels

| Level | Services | Description |
|-------|----------|-------------|
| quick | 6 | IAM, S3, EC2, RDS, Lambda, GuardDuty |
| standard | 23 | All services |
| deep | 23 | All services + extended checks |

## Finding Structure

Each finding includes:
- **id**: Unique identifier
- **severity**: critical/high/medium/low/info
- **title**: Short description
- **description**: Detailed explanation
- **analysis**: Risk analysis
- **resource_id**: AWS resource identifier
- **resource_arn**: Full ARN
- **region**: AWS region
- **service**: AWS service name
- **category**: Security category
- **scan_type**: Unique check identifier
- **compliance**: Array of compliance mappings
- **remediation**: Steps to fix with CLI commands
- **evidence**: Raw data supporting the finding
- **risk_vector**: Type of risk
- **risk_score**: 1-10 score
- **attack_vectors**: Potential attack methods
- **business_impact**: Business risk description

## Files Structure

```
backend/src/lib/security-engine/
├── index.ts                 # Main exports
├── types.ts                 # TypeScript interfaces
├── config.ts                # Configuration constants
├── arn-builder.ts           # ARN builder (80+ methods)
├── core/
│   ├── base-scanner.ts      # Abstract scanner class
│   ├── client-factory.ts    # AWS SDK client factory
│   ├── parallel-executor.ts # Parallel execution engine
│   ├── resource-cache.ts    # Caching layer
│   └── scan-manager.ts      # Orchestrator
└── scanners/
    ├── iam/index.ts
    ├── s3/index.ts
    ├── ec2/index.ts
    ├── rds/index.ts
    ├── lambda/index.ts
    ├── cloudtrail/index.ts
    ├── kms/index.ts
    ├── secrets-manager/index.ts
    ├── guardduty/index.ts
    ├── security-hub/index.ts
    ├── waf/index.ts
    ├── sqs/index.ts
    ├── sns/index.ts
    ├── dynamodb/index.ts
    ├── cognito/index.ts
    ├── api-gateway/index.ts
    ├── acm/index.ts
    ├── cloudfront/index.ts
    ├── elasticache/index.ts
    ├── elb/index.ts
    ├── eks/index.ts
    ├── ecs/index.ts
    └── opensearch/index.ts
```

## Lambda Configuration

- **Runtime**: Node.js 18.x
- **Memory**: 1024 MB
- **Timeout**: 300 seconds (5 minutes)
- **VPC**: Configured with private subnets
- **Layer**: evo-prisma-deps-layer:2

## Deployment Commands

```bash
# Build
npm run build --prefix backend

# Package
rm -rf /tmp/lambda-security-v2
mkdir -p /tmp/lambda-security-v2/handlers/security /tmp/lambda-security-v2/lib/security-engine
cp backend/dist/handlers/security/security-scan-v2.js /tmp/lambda-security-v2/handlers/security/
cp -r backend/dist/lib/security-engine/* /tmp/lambda-security-v2/lib/security-engine/
cp backend/dist/lib/*.js /tmp/lambda-security-v2/lib/
pushd /tmp/lambda-security-v2 && zip -r /tmp/security-scan-v2.zip . && popd

# Deploy
aws lambda update-function-code \
  --function-name evo-uds-v3-production-security-scan-v2 \
  --zip-file fileb:///tmp/security-scan-v2.zip \
  --region us-east-1
```

## Quality Assurance

- ✅ TypeScript compilation passes
- ✅ All 23 scanners implemented
- ✅ 147 unique security checks
- ✅ 6 compliance frameworks mapped
- ✅ Error handling in all scanners
- ✅ Parallel execution for performance
- ✅ Resource caching to reduce API calls
- ✅ Detailed remediation steps with CLI commands
- ✅ Evidence collection for audit trails
- ✅ Multi-region support
- ✅ Role assumption support for cross-account scanning

---

**Military-Grade Security Scanning Engine - Production Ready**
