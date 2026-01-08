---
title: CloudFormation Template Deployment Process
category: infrastructure
tags: [cloudformation, deployment, s3, frontend]
---

# CloudFormation Template Deployment Process

## 🚨 REGRA DE OURO - LEIA PRIMEIRO

**ATENÇÃO:** Todos os clientes usam Quick Connect. Existe apenas UM template oficial.

### ✅ TEMPLATE ÚNICO:
**Arquivo:** `public/cloudformation/evo-platform-role.yaml`  
**URL Pública:** `https://evo.ai.udstec.io/cloudformation/evo-platform-role.yaml`  
**Deploy:** Via build do frontend (Vite) + S3 sync + CloudFront invalidation

### ⚠️ ERRO COMUM QUE VOCÊ DEVE EVITAR:
❌ Atualizar `cloudformation/customer-iam-role-waf.yaml` (template antigo/deprecated)  
❌ Cliente reporta "no changes" porque o template live não foi atualizado  
❌ Perder tempo debugando quando o problema é ter editado o arquivo errado

### ✅ PROCESSO CORRETO:
1. Atualizar `public/cloudformation/evo-platform-role.yaml` (ÚNICO template válido)
2. Build frontend: `npm run build`
3. Deploy para S3: `aws s3 sync dist/ s3://evo-uds-v3-production-frontend-383234048592 --delete`
4. Invalidar CloudFront: `aws cloudfront create-invalidation --distribution-id E1PY7U3VNT6P1R --paths "/cloudformation/*"`
5. Verificar com `curl` que as mudanças estão live
6. Instruir cliente a usar "Use current template" no console AWS

## 🎯 Objetivo

Este documento define o processo correto para atualizar o template CloudFormation usado pelos clientes da plataforma EVO via Quick Connect.

## 📋 Template Oficial

### Template Quick Connect (ÚNICO)
- **Nome:** `evo-platform-role.yaml`
- **Localização Source:** `public/cloudformation/evo-platform-role.yaml`
- **URL Pública:** `https://evo.ai.udstec.io/cloudformation/evo-platform-role.yaml`
- **Uso:** Todos os clientes usam este template via Quick Connect
- **Deploy:** Via build do frontend (Vite)

### ⚠️ Arquivos Deprecated (NÃO USAR)
- `cloudformation/customer-iam-role-waf.yaml` - Template antigo, não é mais usado
- Qualquer outro template em `cloudformation/` - Ignorar

## 🔄 Processo de Atualização

### Quando Atualizar Template

Atualize o template quando:
- ✅ Adicionar novas permissões IAM
- ✅ Modificar políticas de segurança
- ✅ Adicionar novos serviços AWS
- ✅ Corrigir bugs de permissões
- ✅ Melhorar documentação inline

### Passo 1: Atualizar o Template Source

```bash
# Editar o ÚNICO template oficial
vim public/cloudformation/evo-platform-role.yaml
```

**Checklist de Mudanças:**
- [ ] Adicionar permissões necessárias
- [ ] Atualizar descrição do template
- [ ] Atualizar comentários inline
- [ ] Validar sintaxe YAML
- [ ] Testar localmente se possível

### Passo 2: Deploy do Template

```bash
# 1. Build do frontend (inclui templates)
npm run build

# 2. Deploy para S3
aws s3 sync dist/ s3://evo-uds-v3-production-frontend-383234048592 --delete

# 3. Invalidar CloudFront
aws cloudfront create-invalidation \
  --distribution-id E1PY7U3VNT6P1R \
  --paths "/cloudformation/*"

# 4. Verificar
curl -I https://evo.ai.udstec.io/cloudformation/evo-platform-role.yaml
```

### Passo 3: Comunicar aos Clientes

Após o deploy, informar os clientes sobre a atualização:

```markdown
## Atualização Disponível

O template CloudFormation foi atualizado com novas permissões.

**Como atualizar:**
1. Acesse: https://console.aws.amazon.com/cloudformation
2. Selecione o stack: evo-platform-role
3. Clique em "Update"
4. Selecione "Use current template" (já está atualizado!)
5. Next → Next → Next → Submit

**Mudanças:**
- [Listar mudanças aqui]
```

## 🚨 Troubleshooting

### "No updates are to be performed"

**Causa:** Template já está atualizado ou mudanças não afetam recursos

**Solução:**
1. Verificar se o template no S3/CloudFront está correto
2. Comparar com o template atual do stack
3. Se necessário, fazer mudança cosmética (adicionar comentário) para forçar update

### Cliente não consegue acessar template

**Causa:** Permissões S3 ou CloudFront

**Solução:**
```bash
# Verificar permissões do bucket
aws s3api get-bucket-policy --bucket evo-uds-cloudformation-383234048592

# Verificar se arquivo existe
aws s3 ls s3://evo-uds-cloudformation-383234048592/

# Testar acesso público
curl -I https://evo-uds-cloudformation-383234048592.s3.us-east-1.amazonaws.com/customer-iam-role-waf.yaml
```

### Template inválido

**Causa:** Erro de sintaxe YAML

**Solução:**
```bash
# Validar template antes de deploy
aws cloudformation validate-template \
  --template-body file://cloudformation/customer-iam-role-waf.yaml

# Ou para template público
aws cloudformation validate-template \
  --template-url https://evo.ai.udstec.io/cloudformation/evo-platform-role.yaml
```

## 📊 Checklist de Deploy

Antes de considerar o deploy completo:

- [ ] Template source atualizado
- [ ] Sintaxe YAML validada
- [ ] Template deployado (S3 ou Frontend)
- [ ] URL acessível publicamente
- [ ] Documentação atualizada
- [ ] Clientes notificados
- [ ] Instruções de atualização fornecidas
- [ ] Testado em ambiente de desenvolvimento (se possível)

## 🔍 Verificação Pós-Deploy

```bash
# 1. Verificar template está acessível
curl -s https://evo.ai.udstec.io/cloudformation/evo-platform-role.yaml | head -20

# 2. Verificar permissões específicas estão presentes
curl -s https://evo.ai.udstec.io/cloudformation/evo-platform-role.yaml | grep -i "PutResourcePolicy"

# 3. Validar template
aws cloudformation validate-template \
  --template-url https://evo.ai.udstec.io/cloudformation/evo-platform-role.yaml

# 4. Comparar com versão anterior (se disponível)
diff <(curl -s https://evo.ai.udstec.io/cloudformation/evo-platform-role.yaml) \
     public/cloudformation/evo-platform-role.yaml
```

## 📚 Referências

- **Frontend Build:** `npm run build` (inclui `public/cloudformation/`)
- **S3 Frontend:** `s3://evo-uds-v3-production-frontend-383234048592`
- **S3 Templates:** `s3://evo-uds-cloudformation-383234048592`
- **CloudFront ID:** `E1PY7U3VNT6P1R`
- **CloudFront URL:** `https://evo.ai.udstec.io`

## 🎯 Exemplo Completo

### Cenário: Adicionar permissão WAF ao template Quick Connect

```bash
# 1. Editar template
vim public/cloudformation/evo-platform-role.yaml

# Adicionar em EVOWafMonitoringPolicy:
# - logs:PutResourcePolicy
# - logs:DescribeResourcePolicies

# 2. Validar
aws cloudformation validate-template \
  --template-body file://public/cloudformation/evo-platform-role.yaml

# 3. Build frontend
npm run build

# 4. Deploy
aws s3 sync dist/ s3://evo-uds-v3-production-frontend-383234048592 --delete

# 5. Invalidar cache
aws cloudfront create-invalidation \
  --distribution-id E1PY7U3VNT6P1R \
  --paths "/cloudformation/*"

# 6. Aguardar propagação (1-2 minutos)
sleep 120

# 7. Verificar
curl -s https://evo.ai.udstec.io/cloudformation/evo-platform-role.yaml | grep "PutResourcePolicy"

# 8. Notificar clientes
echo "✅ Template atualizado! Clientes podem usar 'Use current template' no CloudFormation Console"
```

## ⚠️ IMPORTANTE

**SEMPRE** que modificar permissões IAM:
1. ✅ Atualizar `public/cloudformation/evo-platform-role.yaml` (ÚNICO template)
2. ✅ Build frontend: `npm run build`
3. ✅ Deploy para S3: `aws s3 sync dist/ ...`
4. ✅ Invalidar CloudFront cache
5. ✅ Verificar URL pública está atualizada
6. ✅ Documentar mudanças
7. ✅ Notificar clientes

**NUNCA:**
- ❌ Modificar `cloudformation/customer-iam-role-waf.yaml` (deprecated)
- ❌ Deploy sem validar sintaxe
- ❌ Esquecer de invalidar cache do CloudFront
- ❌ Assumir que S3 sync atualiza CloudFront automaticamente

## 📝 Histórico de Atualizações

### 2026-01-08 - WAF Monitoring Permissions
**Problema:** AccessDeniedException ao habilitar WAF monitoring  
**Causa:** Faltavam permissões para criar CloudWatch Logs resource policy  
**Solução:** Adicionadas permissões em `EVOPlatformSecurityMonitoringPolicy`:
- `logs:PutResourcePolicy` - Criar resource policy para WAF logs
- `logs:DescribeResourcePolicies` - Verificar policies existentes

**Template atualizado:** `public/cloudformation/evo-platform-role.yaml`  
**Seção:** `CloudWatchLogsWAFMonitoring` statement  
**Deploy:** Frontend build + S3 sync + CloudFront invalidation  
**Status:** ✅ LIVE em https://evo.ai.udstec.io/cloudformation/evo-platform-role.yaml

**Lição aprendida:** O ÚNICO template válido é `public/cloudformation/evo-platform-role.yaml`. Nunca editar templates em `cloudformation/` pois são deprecated e não são usados pelos clientes.

---

**Última atualização:** 2026-01-08  
**Versão:** 2.0 (Simplificado - Quick Connect apenas)  
**Mantido por:** DevOps Team

