# Validação de Imports Lambda

## O que é
Script `scripts/validate-lambda-imports.ts` que analisa estaticamente todos os handlers em `backend/src/handlers/` para detectar imports quebrados e dependências circulares antes do deploy.

## Quando roda
- **CI/CD**: Automaticamente no `pre_build` do `cicd/buildspec-sam.yml`, antes da análise de estratégia de deploy. Se falhar (exit code 1), o build é abortado.
- **Local**: Antes de fazer push, rode manualmente.

## Como rodar localmente

```bash
# Validação completa (todos os handlers)
npx tsx scripts/validate-lambda-imports.ts

# Validar um handler específico
npx tsx scripts/validate-lambda-imports.ts --handler backend/src/handlers/auth/mfa-handlers.ts

# Gerar grafo de dependências em JSON
npx tsx scripts/validate-lambda-imports.ts --output-graph graph.json

# Atualizar domain map com libs reais
npx tsx scripts/validate-lambda-imports.ts --update-domain-map
```

## Ao adicionar nova shared lib

1. Crie o arquivo em `backend/src/lib/` ou `backend/src/types/`
2. Importe normalmente nos handlers usando path relativo com extensão `.js` (ex: `../../lib/nova-lib.js`)
3. Rode `npx tsx scripts/validate-lambda-imports.ts` para verificar que o import resolve corretamente
4. Opcionalmente rode `--update-domain-map` para atualizar o mapa de domínios

## O que é detectado
- **Imports quebrados**: imports relativos que não resolvem para nenhum arquivo `.ts` existente
- **Dependências circulares**: ciclos no grafo de imports (A → B → C → A)
- **Imports transitivos**: segue imports através de libs para detectar problemas em dependências profundas

## Resolução de imports
- `.js` → `.ts` (padrão do projeto CommonJS)
- Sem extensão → tenta `.ts`, depois `index.ts` no diretório
- Ignora imports de npm packages e Node.js built-ins
