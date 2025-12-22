# Permissões AWS Completas - EVO Platform

## ⚠️ IMPORTANTE: AWS Limita Políticas a 2048 Caracteres

A AWS limita políticas IAM inline a 2048 caracteres. Por isso, as permissões necessárias foram divididas em **3 políticas** que devem ser criadas separadamente e anexadas ao mesmo usuário IAM.

## ✅ Política 1: Core Compute & Storage

Nome sugerido: `EVOPlatformPart1`

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "EVOPlatformPart1",
      "Effect": "Allow",
      "Action": [
        "ec2:Describe*",
        "ec2:GetConsoleOutput",
        "ec2:DescribeReservedInstances",
        "ec2:DescribeSnapshots",
        "rds:Describe*",
        "rds:ListTagsForResource",
        "rds:DescribeReservedDBInstances",
        "s3:ListAllMyBuckets",
        "s3:GetBucket*",
        "elasticache:Describe*",
        "dynamodb:ListTables",
        "dynamodb:DescribeTable",
        "backup:List*",
        "backup:Describe*",
        "glacier:List*",
        "redshift:Describe*",
        "sts:GetCallerIdentity"
      ],
      "Resource": "*"
    }
  ]
}
```

## ✅ Política 2: Security & Monitoring

Nome sugerido: `EVOPlatformPart2`

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "EVOPlatformPart2",
      "Effect": "Allow",
      "Action": [
        "iam:List*",
        "iam:Get*",
        "iam:GenerateCredentialReport",
        "cloudwatch:Describe*",
        "cloudwatch:Get*",
        "logs:Describe*",
        "logs:Get*",
        "cloudtrail:Describe*",
        "cloudtrail:Get*",
        "cloudtrail:LookupEvents",
        "kms:List*",
        "kms:Describe*",
        "kms:GetKeyRotationStatus",
        "guardduty:Get*",
        "guardduty:List*",
        "securityhub:Get*",
        "securityhub:List*",
        "inspector:Describe*",
        "inspector:List*",
        "config:Describe*",
        "config:Get*",
        "secretsmanager:List*",
        "acm:List*",
        "acm:Get*",
        "trustedadvisor:Describe*",
        "health:Describe*"
      ],
      "Resource": "*"
    }
  ]
}
```

## ✅ Política 3: Networking, Containers & Costs

Nome sugerido: `EVOPlatformPart3`

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "EVOPlatformPart3",
      "Effect": "Allow",
      "Action": [
        "elasticloadbalancing:Describe*",
        "elasticloadbalancingv2:Describe*",
        "cloudfront:List*",
        "cloudfront:Get*",
        "waf:Get*",
        "waf:List*",
        "wafv2:Get*",
        "wafv2:List*",
        "lambda:List*",
        "lambda:Get*",
        "autoscaling:Describe*",
        "ecs:Describe*",
        "ecs:List*",
        "eks:Describe*",
        "eks:List*",
        "ce:Get*",
        "ce:Describe*",
        "budgets:View*",
        "budgets:Describe*",
        "savingsplans:Describe*",
        "savingsplans:List*",
        "sns:List*",
        "sqs:List*",
        "cloudformation:Describe*",
        "cloudformation:List*",
        "ssm:Describe*",
        "ssm:Get*",
        "route53:List*",
        "route53:Get*",
        "organizations:Describe*",
        "organizations:List*",
        "wellarchitected:Get*",
        "wellarchitected:List*",
        "resource-groups:List*",
        "tag:Get*",
        "servicequotas:Get*",
        "apigateway:GET",
        "events:Describe*",
        "states:Describe*"
      ],
      "Resource": "*"
    }
  ]
}
```

## 🚀 Como Aplicar

1. Acesse AWS Console → IAM → Policies → Create policy
2. Selecione a aba "JSON"
3. Cole a **Política 1** e crie com nome `EVOPlatformPart1`
4. Repita o processo para a **Política 2** com nome `EVOPlatformPart2`
5. Repita o processo para a **Política 3** com nome `EVOPlatformPart3`
6. Navegue até Users → selecione seu usuário IAM
7. Em "Permissions" → "Add permissions" → "Attach policies directly"
8. Selecione **as 3 políticas** e confirme

## 🔒 Segurança

✅ **Todas as permissões são READ-ONLY (Describe*, List*, Get*)**

✅ **NENHUMA permissão de modificação (Create, Update, Delete)**

✅ **A aplicação NUNCA pode alterar recursos AWS - apenas analisa**

## 📊 Resumo das Políticas

| Política | Categoria | Serviços Principais |
|----------|-----------|---------------------|
| **Part1** | Core Compute & Storage | EC2, RDS, S3, ElastiCache, DynamoDB, Backup, Glacier |
| **Part2** | Security & Monitoring | IAM, CloudWatch, CloudTrail, KMS, GuardDuty, SecurityHub, Config |
| **Part3** | Networking, Containers & Costs | ELB, Lambda, ECS, EKS, Cost Explorer, WAF, CloudFront, Route53 |
