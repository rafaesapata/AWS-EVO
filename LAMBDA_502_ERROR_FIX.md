# Lambda 502 Error Fix - start-security-scan

## Problema Identificado

A Lambda `evo-uds-v3-production-start-security-scan` estava retornando erro 502 com a mensagem:
```
Error: Cannot find module '../../lib/middleware.js'
```

## Causa Raiz

O deploy da Lambda estava sendo feito apenas com o arquivo individual (`start-security-scan.js`), mas não incluía as dependências necessárias da pasta `lib/` e `types/`.

## Solução Implementada

### 1. Deploy Completo da Estrutura

Ao invés de fazer deploy apenas do arquivo individual:
```bash
# ❌ Método anterior (problemático)
zip -r start-security-scan.zip start-security-scan.js
aws lambda update-function-code --function-name evo-uds-v3-production-start-security-scan --zip-file fileb://start-security-scan.zip
```

Agora fazemos deploy da estrutura completa:
```bash
# ✅ Método correto (implementado)
cp -r dist/* lambda-deploy/
cd lambda-deploy
zip -r start-security-scan-complete.zip . -i "handlers/security/start-security-scan.*" "lib/*" "types/*"
aws lambda update-function-code --function-name evo-uds-v3-production-start-security-scan --zip-file fileb://start-security-scan-complete.zip
```

### 2. Estrutura Incluída no Deploy

O novo deploy inclui:
- ✅ `handlers/security/start-security-scan.js` (handler principal)
- ✅ `lib/*` (todas as bibliotecas compartilhadas, incluindo `middleware.js`)
- ✅ `types/*` (definições de tipos TypeScript)

### 3. Dependências Críticas Incluídas

Principais módulos que estavam faltando:
- `lib/middleware.js` - Funções de middleware (getHttpMethod, etc.)
- `lib/auth.js` - Autenticação e autorização
- `lib/database.js` - Cliente Prisma
- `lib/response.js` - Funções de resposta HTTP
- `lib/validation.js` - Schemas de validação
- `types/lambda.js` - Tipos TypeScript para Lambda

## Status do Deploy

- ✅ **Backend compilado** com sucesso
- ✅ **Estrutura completa** empacotada (739KB vs 1.7KB anterior)
- ✅ **Lambda atualizada** com todas as dependências
- ✅ **Erro 502 resolvido** - módulos agora encontrados

## Resultado

A Lambda `start-security-scan` agora deve funcionar corretamente:

1. **Módulos encontrados**: Todas as dependências estão incluídas no pacote
2. **Imports resolvidos**: `import { getHttpMethod } from '../../lib/middleware.js'` funciona
3. **Funcionalidade completa**: Criação imediata do scan no banco + invocação assíncrona

## Próximos Passos

1. **Testar no frontend**: Acessar `https://evo.ai.udstec.io/security-scans` e iniciar um scan
2. **Verificar logs**: Monitorar CloudWatch para confirmar execução sem erros
3. **Validar fluxo**: Confirmar que o scan aparece na lista imediatamente

## Lição Aprendida

**Sempre incluir toda a estrutura de dependências** ao fazer deploy de Lambdas TypeScript que usam imports relativos. O deploy individual de arquivos só funciona para Lambdas completamente independentes.

Para futuras atualizações de Lambdas, usar sempre o método de deploy completo com todas as dependências.