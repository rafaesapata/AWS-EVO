# 🚨 ALERTA DE SEGURANÇA - Credenciais Expostas

## ⚠️ AÇÃO IMEDIATA NECESSÁRIA

**Data**: 2024-12-16  
**Severidade**: CRÍTICA  

### Credenciais Expostas

```
Access Key ID: AKIAVSOUHQJIEQZZH7MM
Conta AWS: 383234048592
Usuário: SA_LiveSense_Core
```

## 🔒 Passos para Remediar

### 1. Invalidar Credenciais Expostas (URGENTE)

```bash
# Deletar a access key comprometida
aws iam delete-access-key \
  --access-key-id AKIAVSOUHQJIEQZZH7MM \
  --user-name SA_LiveSense_Core
```

### 2. Criar Novas Credenciais

```bash
# Criar nova access key
aws iam create-access-key \
  --user-name SA_LiveSense_Core

# Salvar as novas credenciais em local seguro
```

### 3. Atualizar Configurações Locais

```bash
# Atualizar ~/.aws/credentials
aws configure --profile livesense

# Ou atualizar variáveis de ambiente
export AWS_ACCESS_KEY_ID=nova_access_key
export AWS_SECRET_ACCESS_KEY=nova_secret_key
```

### 4. Verificar Uso Não Autorizado

```bash
# Verificar logs do CloudTrail
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=Username,AttributeValue=SA_LiveSense_Core \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --max-results 50

# Verificar atividades suspeitas
aws iam get-access-key-last-used \
  --access-key-id AKIAVSOUHQJIEQZZH7MM
```

## ⚠️ Problema Adicional: Conta Errada

A conta **383234048592** (SA_LiveSense_Core) **NÃO** é a conta onde a aplicação EVO UDS está deployada.

**Conta Correta**: 418272799411

Para fazer o deploy da correção do QuickConnect, você precisa:

1. **Obter credenciais da conta 418272799411**
2. **Configurar essas credenciais**
3. **Fazer o deploy das funções Lambda**

## 📋 Checklist de Segurança

- [ ] Credenciais antigas deletadas
- [ ] Novas credenciais criadas
- [ ] Configurações locais atualizadas
- [ ] CloudTrail verificado para atividades suspeitas
- [ ] Nenhum recurso não autorizado criado
- [ ] Credenciais da conta correta (418272799411) obtidas
- [ ] Deploy da correção realizado

## 🔐 Melhores Práticas

### Nunca Compartilhe Credenciais

- ❌ Não poste em chat/email/código
- ❌ Não commite no git
- ❌ Não compartilhe em screenshots
- ✅ Use AWS Secrets Manager
- ✅ Use IAM Roles quando possível
- ✅ Use credenciais temporárias (STS)

### Rotação de Credenciais

```bash
# Rotacionar credenciais regularmente
aws iam update-access-key \
  --access-key-id $OLD_KEY \
  --status Inactive

aws iam create-access-key \
  --user-name SA_LiveSense_Core
```

### Monitoramento

```bash
# Configurar alertas para uso de credenciais
aws cloudwatch put-metric-alarm \
  --alarm-name UnauthorizedAPICall \
  --alarm-description "Alert on unauthorized API calls" \
  --metric-name UnauthorizedAPICallCount \
  --namespace AWS/CloudTrail \
  --statistic Sum \
  --period 300 \
  --threshold 1 \
  --comparison-operator GreaterThanThreshold
```

## 📞 Contatos de Emergência

- **AWS Support**: https://console.aws.amazon.com/support/
- **Administrador da Conta 418272799411**: [Contato do Admin]
- **Time de Segurança**: [Contato do Time]

## 🔄 Próximos Passos

1. ✅ Invalidar credenciais expostas
2. ✅ Criar novas credenciais
3. ✅ Verificar CloudTrail
4. ⏳ Obter credenciais da conta correta (418272799411)
5. ⏳ Fazer deploy da correção do QuickConnect
6. ⏳ Implementar rotação automática de credenciais

---

**IMPORTANTE**: Este incidente deve ser reportado ao time de segurança e documentado para auditoria.

**Status**: 🔴 CRÍTICO - Ação Imediata Necessária
