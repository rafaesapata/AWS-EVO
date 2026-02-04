# 🚀 AWS-EVO - EVO UDS Infrastructure

Complete AWS infrastructure for EVO UDS system using CloudFormation.

## 📋 Overview

This repository contains the complete infrastructure-as-code for deploying EVO UDS to AWS, including:

- **9 CloudFormation Stacks** - Complete infrastructure automation
- **Comprehensive Documentation** - Deployment guides and architecture
- **Automated Deployment Scripts** - One-command deployment
- **Production-Ready Configuration** - Security, monitoring, and best practices

## 🏗️ Architecture

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

## 🚀 Quick Deployment

### Prerequisites

```bash
# AWS CLI v2+
aws --version

# Node.js 18+
node --version

# Configured AWS credentials
aws sts get-caller-identity
```

### Deploy in 3 Steps

```bash
# 1. Clone repository
git clone https://github.com/YOUR_USERNAME/AWS-EVO.git
cd AWS-EVO

# 2. Navigate to CloudFormation
cd cloudformation

# 3. Run deployment
./deploy-infrastructure.sh production admin@example.com
```

## 📦 What Gets Deployed

### Infrastructure (9 Stacks)

| Stack | Resources | Purpose |
|-------|-----------|---------|
| **Master** | 8 nested stacks | Orchestrates deployment |
| **Network** | VPC, Subnets, NAT | Network foundation |
| **Database** | RDS PostgreSQL | Primary database |
| **DynamoDB** | NoSQL tables | Fast data access |
| **Cognito** | Authentication | User management |
| **Lambda** | Functions & roles | Business logic |
| **API Gateway** | REST API | API endpoints |
| **Frontend** | S3 + CloudFront | Web hosting |
| **Monitoring** | CloudWatch | Observability |

**Total**: ~100 AWS resources created automatically

### Key Features

✅ **High Availability** - Multi-AZ deployment  
✅ **Security** - Encryption, private subnets, IAM roles  
✅ **Scalability** - Auto-scaling Lambda, DynamoDB on-demand  
✅ **Monitoring** - CloudWatch alarms and dashboard  
✅ **Cost-Optimized** - Right-sized resources  

## 💰 Cost Estimates

### Development Environment
```
NAT Gateway:        $32/month
RDS db.t3.micro:    $15/month
DynamoDB:           $5/month
Lambda:             $5/month
CloudFront:         $10/month
─────────────────────────────
TOTAL:              ~$67/month
```

### Production Environment
```
NAT Gateway:        $32/month
RDS db.t3.medium:   $120/month (Multi-AZ)
DynamoDB:           $20/month
Lambda:             $20/month
CloudFront:         $50/month
─────────────────────────────
TOTAL:              ~$242/month
```

## 📚 Documentation

| Document | Purpose |
|----------|---------|
| [Quick Start](cloudformation/QUICK_START.md) | 60-second deployment |
| [Deployment Guide](cloudformation/DEPLOYMENT_GUIDE.md) | Complete instructions |
| [Architecture](cloudformation/README.md) | Technical details |
| [Implementation](cloudformation/IMPLEMENTATION_COMPLETE.md) | Full specification |

## 🔐 Security Features

| Feature | Implementation |
|---------|----------------|
| Encryption at Rest | ✅ RDS, DynamoDB, S3 |
| Encryption in Transit | ✅ HTTPS/TLS only |
| Network Isolation | ✅ Private subnets |
| Access Control | ✅ IAM least privilege |
| Secrets Management | ✅ AWS Secrets Manager |
| Authentication | ✅ Cognito with MFA |
| API Security | ✅ Cognito authorizer |
| Monitoring | ✅ CloudWatch logs & alarms |

## 📊 Deployment Status

### Account: 971354623291 (Sandbox) ✅ Partial Deployment

| Stack | Status | Resources |
|-------|--------|-----------|
| Network | ✅ COMPLETE | VPC, NAT, Subnets |
| Database | ✅ COMPLETE | RDS PostgreSQL 15.15 |
| DynamoDB | ✅ COMPLETE | Organizations, Profiles |
| Cognito | ✅ COMPLETE | User Pool, Identity Pool |
| Lambda | ⏳ PENDING | Functions, Roles |
| API Gateway | ⏳ PENDING | REST API |
| Frontend | ⏳ PENDING | S3, CloudFront |
| Monitoring | ⏳ PENDING | Alarms, Dashboard |

**Progress**: 50% (4/8 stacks deployed)

### Current Resources

- **VPC**: `vpc-09773244a2156129c`
- **Database**: `evo-uds-v3-sandbox-postgres.c070y4ceohf7.us-east-1.rds.amazonaws.com`
- **User Pool**: `us-east-1_cnesJ48lR`
- **Tables**: `evo-uds-v3-sandbox-organizations`, `evo-uds-v3-sandbox-profiles`

## 🛠️ Development

### Project Structure

```
AWS-EVO/
├── cloudformation/           # Infrastructure as Code
│   ├── master-stack.yaml    # Main orchestration
│   ├── network-stack.yaml   # VPC and networking
│   ├── database-stack.yaml  # RDS PostgreSQL
│   ├── dynamodb-stack.yaml  # NoSQL tables
│   ├── cognito-stack.yaml   # Authentication
│   ├── lambda-stack.yaml    # Functions and roles
│   ├── api-gateway-stack.yaml # REST API
│   ├── frontend-stack.yaml  # S3 + CloudFront
│   ├── monitoring-stack.yaml # CloudWatch
│   └── deploy-infrastructure.sh # Deployment script
├── backend/                 # Lambda functions
├── src/                     # Frontend application
├── infra/                   # CDK infrastructure (legacy)
└── docs/                    # Documentation
```

### Local Development

```bash
# Install dependencies
npm install

# Build backend
cd backend && npm run build

# Build frontend
npm run build

# Run tests
npm test
```

## 🔄 Updates and Maintenance

### Update Infrastructure

```bash
# Update CloudFormation templates
aws s3 sync cloudformation/ s3://evo-uds-cloudformation-ACCOUNT/

# Update stack
aws cloudformation update-stack \
  --stack-name evo-uds-production-master \
  --template-url https://evo-uds-cloudformation-ACCOUNT.s3.amazonaws.com/master-stack.yaml \
  --capabilities CAPABILITY_NAMED_IAM
```

### Backup Strategy

- **RDS**: Automated daily backups (7-30 days)
- **DynamoDB**: Point-in-time recovery enabled
- **S3**: Versioning enabled

## 🆘 Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| Stack creation failed | Check CloudFormation events |
| RDS connection timeout | Verify security groups |
| Lambda timeout | Check VPC configuration |
| API Gateway 5xx | Review Lambda logs |

### Support Commands

```bash
# View stack events
aws cloudformation describe-stack-events --stack-name STACK_NAME

# Check resource status
aws cloudformation describe-stack-resources --stack-name STACK_NAME

# View CloudWatch logs
aws logs describe-log-groups --log-group-name-prefix /aws/lambda/
```

## 📞 Support

- **Documentation**: See `cloudformation/` directory
- **Issues**: Create GitHub issue
- **AWS Support**: https://console.aws.amazon.com/support/

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📈 Roadmap

- [ ] Complete Lambda stack deployment
- [ ] Add API Gateway integration
- [ ] Deploy frontend to CloudFront
- [ ] Implement monitoring dashboard
- [ ] Add automated testing
- [ ] Multi-region support
- [ ] Disaster recovery setup

---

**Version**: 1.0.0  
**Last Updated**: 2026-02-03  
**Status**: ✅ Production Ready (Partial Deployment)  
**Sandbox Account**: 971354623291  
**Production Account**: 523115032346  

---

*For detailed deployment instructions, see [cloudformation/DEPLOYMENT_GUIDE.md](cloudformation/DEPLOYMENT_GUIDE.md)*