---
inclusion: auto
---

# Frontend Environment Variables no CI/CD

## Problema
Os arquivos `.env.*` estão no `.gitignore` (correto por segurança). O CodeBuild clona o repo sem eles, então variáveis `VITE_*` ficam `undefined` no build do Vite.

## Solução
As variáveis `VITE_*` são exportadas como env vars do processo no `cicd/buildspec-sam.yml`, separadas por ambiente (production/sandbox). O Vite automaticamente injeta no bundle qualquer variável de ambiente que comece com `VITE_`.

## Regras
1. NUNCA commitar `.env.production` ou `.env.local` — manter no `.gitignore`
2. Ao adicionar nova variável `VITE_*`, atualizar AMBOS os blocos (production e sandbox) no `cicd/buildspec-sam.yml` na seção de frontend build
3. Valores sensíveis devem usar AWS Systems Manager Parameter Store ou Secrets Manager no futuro
4. Sempre usar `npm run build:prod` (não `npm run build`) no CI para garantir mode=production

## Localização no buildspec
```
cicd/buildspec-sam.yml → build phase → DEPLOY_FRONTEND_BUILD block
```
