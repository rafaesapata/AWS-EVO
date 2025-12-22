# 🚀 EVO UDS - CloudFormation Infrastructure

Complete infrastructure-as-code for deploying EVO UDS to AWS.

## 📦 What's Included

### CloudFormation Stacks

1. **master-stack.yaml** - Orchestrates all nested stacks
2. **network-stack.yaml** - VPC, Subnets, NAT Gateway, Security Groups
3. **database-stack.yaml** - RDS PostgreSQL with encryption and backups
4. **dynamodb-stack.yaml** - Organizations and Profiles tables
5. **cognito-stack.yaml** - User authentication and authorization
6. **lambda-stack.yaml** - Lambda functions and IAM roles
7. **api-gateway-stack.yaml** - REST API with Cognito authorizer
8. **frontend-stack.yaml** - S3 + CloudFront distribution
9. **monitoring-stack.yaml** - CloudWatch alarms and dashboards

### Scripts

- **deploy-infrastructure.sh** - Automated deployment script
- **DEPLOYMENT_GUIDE.md** - Detailed deployment instructions

## 🎯 Quick Start

### Prerequisites

```bash
# AWS CLI v2
aws --version

# Node.js 18+
node --version

# Configured AWS credentials
aws sts get-caller-identity
```

### Deploy

```bash
# Navigate to cloudformation directory
cd cloudformation

# Run deployment script
./deploy-infrastructure.sh production admin@example.com
```

## 📋 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      CloudFront CDN                          │
│                  (Frontend Distribution)                     │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ├─────────────────┐
                         │                 │
                    ┌────▼────┐      ┌────▼────────┐
                    │   S3    │      │ API Gateway │
                    │ Bucket  │      │   + CORS    │
                    └─────────┘      └────┬────────┘
                                          │
                                     ┌────▼────────┐
                                     │   Cognito   │
                                     │  Authorizer │
                                     └────┬────────┘
                                          │
                    ┌─────────────────────┴─────────────────────┐
                    │                                           │
              ┌─────▼──────┐                            ┌──────▼──────┐
              │   Lambda   │                            │   Lambda    │
              │ Functions  │                            │  Functions  │
              │  (VPC)     │                            │  (Public)   │
              └─────┬──────┘                            └─────────────┘
                    │
        ┌───────────┴───────────┐
        │                       │
   ┌────▼────┐            ┌────▼────────┐
   │   RDS   │            │  DynamoDB   │
   │ Postgres│            │   Tables    │
   └─────────┘            └─────────────┘
```

## 💰 Cost Estimate

### Development Environment
- **Monthly**: ~$67
  - NAT Gateway: $32
  - RDS db.t3.micro: $15
  - DynamoDB: $5
  - Lambda: $5
  - CloudFront: $10

### Production Environment
- **Monthly**: ~$242
  - NAT Gateway: $32
  - RDS db.t3.medium Multi-AZ: $120
  - DynamoDB: $20
  - Lambda: $20
  - CloudFront: $50

## 🔧 Configuration

### Parameters

All stacks accept these parameters:

- `Environment`: development | staging | production
- `ProjectName`: evo-uds (default)
- `AdminEmail`: Email for first admin user
- `DBInstanceClass`: RDS instance type
- `DBAllocatedStorage`: Database storage in GB
- `DomainName`: Custom domain (optional)
- `CertificateArn`: ACM certificate ARN (optional)

### Customization

Edit parameters in `master-stack.yaml` or pass via CLI:

```bash
aws cloudformation create-stack \
  --stack-name evo-uds-production \
  --template-body file://master-stack.yaml \
  --parameters \
    ParameterKey=Environment,ParameterValue=production \
    ParameterKey=DBInstanceClass,ParameterValue=db.t3.medium \
  --capabilities CAPABILITY_NAMED_IAM
```

## 📚 Documentation

- [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) - Complete deployment guide
- [AWS CloudFormation Docs](https://docs.aws.amazon.com/cloudformation/)

## 🔐 Security Features

- ✅ VPC with private subnets for Lambda and RDS
- ✅ Encryption at rest (RDS, DynamoDB, S3)
- ✅ Encryption in transit (HTTPS only)
- ✅ IAM roles with least privilege
- ✅ Security groups with minimal access
- ✅ Secrets Manager for credentials
- ✅ CloudFront with OAI for S3
- ✅ Cognito MFA support
- ✅ CloudWatch logging enabled

## 🚨 Troubleshooting

### Stack Creation Failed

```bash
# View error events
aws cloudformation describe-stack-events \
  --stack-name evo-uds-production-master \
  --query 'StackEvents[?ResourceStatus==`CREATE_FAILED`]'
```

### Delete Stack

```bash
# Delete all resources
aws cloudformation delete-stack \
  --stack-name evo-uds-production-master
```

## 📞 Support

For issues or questions:
- Check [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)
- Review CloudFormation events
- Check CloudWatch logs

---

**Version**: 1.0.0  
**Last Updated**: 2024-12-16  
**Status**: ✅ Production Ready
