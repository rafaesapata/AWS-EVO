# 🔧 Solução: TemplateURL must be a supported URL

## Problema
Ao usar o Quick Connect para conectar uma conta AWS, aparece o erro:
```
TemplateURL must be a supported URL.
```

## Causa
O CloudFormation não consegue acessar o template porque ele está sendo servido localmente (`localhost`) ou de uma URL não acessível pela AWS.

## ✅ Soluções

### Solução 1: Deploy Completo (Recomendado)

1. **Faça o deploy da infraestrutura:**
```bash
cd infra
npm run deploy:dev
```

2. **Atualize o domínio do CloudFront:**
```bash
npm run update-cloudfront-domain
```

3. **Reinicie o servidor de desenvolvimento:**
```bash
npm run dev
```

4. **Teste o Quick Create Link** - agora deve usar a URL do CloudFront

### Solução 2: Configuração Manual

Se o script automático não funcionar:

1. **Obtenha o domínio do CloudFront:**
```bash
aws cloudformation describe-stacks \
  --stack-name EvoUds-dev-Frontend \
  --query 'Stacks[0].Outputs[?OutputKey==`FrontendUrl`].OutputValue' \
  --output text
```

2. **Adicione ao arquivo .env:**
```bash
# Exemplo: d1234567890abc.cloudfront.net
VITE_CLOUDFRONT_DOMAIN=seu-dominio.cloudfront.net
```

3. **Reinicie o servidor:**
```bash
npm run dev
```

### Solução 3: Verificação Manual do Template

Verifique se o template está acessível:

```bash
# Substitua pelo seu domínio CloudFront
curl -I https://seu-dominio.cloudfront.net/cloudformation/evo-platform-role.yaml
```

Deve retornar `200 OK`.

## 🔍 Diagnóstico

### Verificar se o problema foi resolvido:

1. **Abra o Quick Create Link**
2. **Verifique a URL do template** - deve começar com `https://` e usar CloudFront
3. **Teste no CloudFormation** - deve carregar sem erros

### Verificar logs:

```bash
# Ver logs do CloudFront
aws logs tail /aws/cloudfront/distribution/DISTRIBUTION_ID --follow

# Ver status do deploy
aws cloudformation describe-stacks --stack-name EvoUds-dev-Frontend
```

## 📋 Checklist de Verificação

- [ ] Stack do Frontend foi deployada com sucesso
- [ ] CloudFront está distribuindo o template
- [ ] Variável `VITE_CLOUDFRONT_DOMAIN` está configurada
- [ ] Servidor de desenvolvimento foi reiniciado
- [ ] Quick Create Link usa URL HTTPS do CloudFront
- [ ] Template é acessível via browser

## 🚨 Troubleshooting

### Erro: "Stack não encontrada"
```bash
# Verifique se a stack existe
aws cloudformation list-stacks --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE
```

### Erro: "Template não encontrado no CloudFront"
```bash
# Verifique se o arquivo foi deployado
aws s3 ls s3://seu-bucket/cloudformation/
```

### Erro: "Permissões AWS"
```bash
# Verifique suas credenciais
aws sts get-caller-identity
```

## 🔄 Processo Automático

O sistema agora detecta automaticamente:

1. **Desenvolvimento**: Usa template local (pode causar erro)
2. **Produção**: Usa CloudFront automaticamente
3. **Fallback**: Mostra aviso se CloudFront não disponível

## 📝 Arquivos Modificados

- `infra/lib/frontend-stack.ts` - Deploy do template para S3/CloudFront
- `src/components/dashboard/QuickCreateLink.tsx` - Detecção automática de URL
- `src/hooks/useCloudFrontDomain.ts` - Hook para obter domínio
- `scripts/update-cloudfront-domain.js` - Script de configuração automática

## ✨ Melhorias Implementadas

1. **Deploy automático** do template CloudFormation para CloudFront
2. **Detecção automática** do ambiente (dev/prod)
3. **Fallback inteligente** para desenvolvimento local
4. **Script de configuração** automática pós-deploy
5. **Alertas visuais** sobre o modo de operação

---

**Status**: ✅ Resolvido  
**Versão**: 2.2.0  
**Data**: 2025-12-15