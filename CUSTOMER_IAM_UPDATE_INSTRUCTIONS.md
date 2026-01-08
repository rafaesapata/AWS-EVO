# 📋 Instruções para Atualizar IAM Role - Cliente

**Data:** 2026-01-08  
**Versão:** 2.2.0  
**Prioridade:** Alta (necessário para WAF Monitoring)

---

## 🎯 Objetivo

Atualizar o IAM Role do cliente para adicionar permissões necessárias ao monitoramento WAF.

---

## 🖱️ Opção 1: AWS Console (Recomendado - Mais Fácil!)

### Passos Simples

1. **Acessar CloudFormation Console:**
   - Vá para: https://console.aws.amazon.com/cloudformation
   - **Região:** us-east-1 (N. Virginia)

2. **Selecionar o Stack:**
   - Encontre o stack: `evo-platform-role` (ou nome similar com "EVO" ou "Platform")
   - ✅ Clique no nome do stack
   - 🔵 Clique no botão **"Update"** (canto superior direito)

3. **Escolher Template:**
   - Selecione: ⚪ **"Replace current template"**
   - Em "Amazon S3 URL", cole:
     ```
     https://evo-uds-cloudformation-383234048592.s3.us-east-1.amazonaws.com/customer-iam-role-waf.yaml
     ```
   - 🔵 Clique em **"Next"**

4. **Manter Parâmetros:**
   - ✅ **NÃO MUDE NADA** - mantenha todos os valores como estão
   - 🔵 Clique em **"Next"**

5. **Configurar Opções:**
   - ✅ **NÃO MUDE NADA** - mantenha as configurações padrão
   - 🔵 Clique em **"Next"**

6. **Revisar e Confirmar:**
   - Role até o final da página
   - ✅ Marque a caixa: **"I acknowledge that AWS CloudFormation might create IAM resources"**
   - 🔵 Clique em **"Submit"** (ou **"Update stack"**)

7. **Aguardar Conclusão:**
   - Status mudará para: `UPDATE_IN_PROGRESS` → `UPDATE_COMPLETE`
   - ⏱️ Tempo estimado: **1-2 minutos**
   - ✅ Quando aparecer `UPDATE_COMPLETE`, está pronto!

### 📸 Visual Guide

```
CloudFormation Console
├── Stacks (menu lateral)
├── Selecionar "evo-platform-role"
├── Botão "Update" (topo)
├── "Replace current template"
├── Colar URL do S3
├── Next → Next → Next
├── Marcar checkbox IAM
└── Submit
```

---

## ⚡ Opção 2: Script Automático (Para quem prefere CLI)

### Passos

1. **Acessar CloudFormation Console:**
   - Vá para: https://console.aws.amazon.com/cloudformation
   - Região: us-east-1

2. **Selecionar o Stack:**
   - Encontre o stack: `evo-platform-role` (ou nome similar)
   - Clique em "Update"

3. **Atualizar Template:**
   - Selecione: "Replace current template"
   - Amazon S3 URL: 
     ```
     https://evo-uds-cloudformation-383234048592.s3.us-east-1.amazonaws.com/customer-iam-role-waf.yaml
     ```
   - Clique em "Next"

4. **Manter Parâmetros:**
   - Mantenha todos os parâmetros existentes
   - Clique em "Next"

5. **Configurar Opções:**
   - Mantenha as configurações padrão
   - Clique em "Next"

6. **Revisar e Atualizar:**
   - Marque: "I acknowledge that AWS CloudFormation might create IAM resources"
   - Clique em "Update stack"

7. **Aguardar Conclusão:**
   - Status mudará para: `UPDATE_COMPLETE`
   - Tempo estimado: 1-2 minutos

---

## 🔧 Opção 3: AWS CLI (Manual)

### Comando Único

```bash
# Obter External ID atual
EXTERNAL_ID=$(aws cloudformation describe-stacks \
  --stack-name evo-platform-role \
  --region us-east-1 \
  --query 'Stacks[0].Parameters[?ParameterKey==`ExternalId`].ParameterValue' \
  --output text)

# Atualizar stack
aws cloudformation update-stack \
  --stack-name evo-platform-role \
  --template-url https://evo-uds-cloudformation-383234048592.s3.us-east-1.amazonaws.com/customer-iam-role-waf.yaml \
  --parameters \
      ParameterKey=ExternalId,ParameterValue="$EXTERNAL_ID" \
      ParameterKey=EVOAccountId,UsePreviousValue=true \
      ParameterKey=EVOWafLogProcessorArn,UsePreviousValue=true \
  --capabilities CAPABILITY_NAMED_IAM \
  --region us-east-1

# Aguardar conclusão
aws cloudformation wait stack-update-complete \
  --stack-name evo-platform-role \
  --region us-east-1

echo "✅ Stack atualizado com sucesso!"
```

---

## 📋 O Que Está Sendo Adicionado

### Novas Permissões

```yaml
- logs:PutResourcePolicy
- logs:DescribeResourcePolicies
```

### Por Que São Necessárias

Estas permissões permitem que a plataforma EVO:
1. **Crie políticas de recursos** no CloudWatch Logs
2. **Permita que o AWS WAF** escreva logs no CloudWatch Logs
3. **Configure monitoramento WAF** automaticamente

### Segurança

- ✅ Permissões são **somente para CloudWatch Logs**
- ✅ Escopo limitado aos **log groups do cliente**
- ✅ Não expande acesso a outros serviços
- ✅ Mantém o princípio de **least privilege**

---

## ✅ Verificação

### Após a Atualização

1. **Verificar Status do Stack:**
   ```bash
   aws cloudformation describe-stacks \
     --stack-name evo-platform-role \
     --region us-east-1 \
     --query 'Stacks[0].StackStatus' \
     --output text
   ```
   
   **Esperado:** `UPDATE_COMPLETE`

2. **Verificar Permissões:**
   ```bash
   aws iam get-role-policy \
     --role-name EVO-Platform-Role \
     --policy-name EVO-WAF-Monitoring-Policy \
     --query 'PolicyDocument.Statement[].Action' \
     --output json
   ```
   
   **Esperado:** Deve incluir `logs:PutResourcePolicy`

3. **Testar WAF Monitoring:**
   - Acesse: https://evo.ai.udstec.io
   - Vá para: Security → WAF Monitoring
   - Clique: "Setup Monitoring"
   - Configure um Web ACL
   
   **Esperado:** Setup completa sem erros

---

## 🚨 Troubleshooting

### Erro: "No updates are to be performed"

**Causa:** O stack já está atualizado

**Solução:** Nenhuma ação necessária

### Erro: "Insufficient permissions"

**Causa:** Usuário não tem permissão para atualizar CloudFormation

**Solução:** Use um usuário com permissões de administrador ou adicione:
```json
{
  "Effect": "Allow",
  "Action": [
    "cloudformation:UpdateStack",
    "cloudformation:DescribeStacks",
    "iam:*"
  ],
  "Resource": "*"
}
```

### Erro: "Stack does not exist"

**Causa:** Nome do stack incorreto

**Solução:** Liste os stacks disponíveis:
```bash
aws cloudformation list-stacks \
  --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE \
  --region us-east-1 \
  --query 'StackSummaries[].StackName' \
  --output table
```

---

## 📞 Suporte

### Se Precisar de Ajuda

**Email:** suporte@udstec.io  
**Slack:** #evo-platform-support  
**Documentação:** https://docs.evo.ai.udstec.io

### Informações Úteis para Suporte

Ao entrar em contato, forneça:
- ✅ Account ID da AWS
- ✅ Nome do stack CloudFormation
- ✅ Mensagem de erro completa (se houver)
- ✅ Output do comando que falhou

---

## 📚 Recursos Adicionais

- [Documentação WAF Monitoring](./WAF_MONITORING_COMPLETE.md)
- [Guia de Troubleshooting](./WAF_ACCESS_DENIED_FIX.md)
- [AWS CloudFormation Docs](https://docs.aws.amazon.com/cloudformation/)
- [AWS IAM Best Practices](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html)

---

## ✅ Checklist

Após completar a atualização:

- [ ] Stack atualizado com sucesso (status: UPDATE_COMPLETE)
- [ ] Permissões verificadas (logs:PutResourcePolicy presente)
- [ ] WAF Monitoring testado no frontend
- [ ] Sem erros de AccessDeniedException
- [ ] Documentação revisada

---

**Atualizado em:** 2026-01-08 18:35 UTC  
**Versão do Template:** 2.2.0  
**Status:** ✅ Pronto para uso

