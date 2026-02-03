---
inclusion: always
---

# Regras de Deploy

## ⛔ PROIBIÇÃO ABSOLUTA

**NUNCA fazer deploy manual de código ou infraestrutura.**

Todo deploy DEVE ser feito via CI/CD (CodePipeline/CodeBuild).

### O que é PROIBIDO:
- `aws lambda update-function-code` manual
- `aws s3 sync` para frontend manual
- `aws cloudformation create-stack` manual
- `./scripts/deploy-*.sh` executado localmente
- Qualquer comando que faça deploy direto na AWS

### O que é PERMITIDO:
- Criar/modificar templates CloudFormation
- Criar/modificar scripts de CI/CD
- Fazer commit e push para o repositório
- Configurar pipelines no CodePipeline
- Verificar status de stacks e recursos (read-only)

## Fluxo de Deploy Correto

```
1. Desenvolver código localmente
2. Testar localmente (npm run build, npm test)
3. Commit e push para branch
4. CI/CD detecta mudança e executa:
   - Build do código
   - Testes automatizados
   - Deploy para ambiente correto
```

## Ambientes e Branches

| Branch | Ambiente | Deploy Automático |
|--------|----------|-------------------|
| `main` | Sandbox (971354623291) | Sim |
| `production` | Production (523115032346) | Sim |

## CI/CD Pipeline

- **CodePipeline**: Orquestra o fluxo
- **CodeBuild**: Executa build e deploy
- **CloudFormation**: Gerencia infraestrutura

---

**Última atualização:** 2026-02-03
