# ⚡ EVO UDS CloudFormation - Quick Start

## 🚀 Deploy in 60 Seconds

```bash
cd cloudformation
./deploy-infrastructure.sh production admin@example.com
```

Wait ~20 minutes. Done! ✅

---

## 📋 Prerequisites

```bash
aws --version        # AWS CLI v2+
node --version       # Node.js 18+
aws sts get-caller-identity  # Verify credentials
```

---

## 🎯 What Gets Created

- VPC with public/private subnets
- RDS PostgreSQL database
- DynamoDB tables
- Cognito authentication
- Lambda functions
- API Gateway
- S3 + CloudFront
- CloudWatch monitoring

**Total**: ~100 AWS resources

---

## 💰 Cost

- **Development**: ~$67/month
- **Production**: ~$242/month

---

## 📝 After Deployment

```bash
# 1. Get database password
aws secretsmanager get-secret-value \
  --secret-id evo-uds-production-database-secret \
  --query SecretString --output text

# 2. Create admin user
aws cognito-idp admin-create-user \
  --user-pool-id <USER_POOL_ID> \
  --username admin-user \
  --user-attributes Name=email,Value=admin@example.com

# 3. Deploy frontend
npm run build
aws s3 sync dist/ s3://evo-uds-production-frontend-ACCOUNT/

# 4. Access application
# URL shown in CloudFormation outputs
```

---

## 🔗 Full Documentation

- [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) - Complete guide
- [README.md](./README.md) - Architecture & features
- [IMPLEMENTATION_COMPLETE.md](./IMPLEMENTATION_COMPLETE.md) - Technical details

---

## 🆘 Help

```bash
# View stack status
aws cloudformation describe-stacks \
  --stack-name evo-uds-production-master

# View errors
aws cloudformation describe-stack-events \
  --stack-name evo-uds-production-master \
  --query 'StackEvents[?ResourceStatus==`CREATE_FAILED`]'

# Delete stack
aws cloudformation delete-stack \
  --stack-name evo-uds-production-master
```

---

**Status**: ✅ Production Ready  
**Version**: 1.0.0  
**Date**: 2024-12-16
