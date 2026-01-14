# Bash Command Guidelines

## 🚨 IMPORTANTE: Evitar Erros de Sintaxe em Comandos Shell

Este documento contém boas práticas para evitar erros comuns ao executar comandos no terminal.

## ⛔ Erros Comuns a Evitar

### 1. Erro `cmdand dquote>` - Aspas não fechadas

**Causa:** Aspas duplas ou simples não fechadas corretamente.

```bash
# ❌ ERRADO - Aspas não fechadas
aws lambda wait function-updated --function-name evo-uds-v3-production-validate-azure-credentials --region us-east-1 &&echo "Ready!"cmdand dquote>

# ✅ CORRETO - Cada comando em linha separada ou com espaço antes de &&
aws lambda wait function-updated --function-name evo-uds-v3-production-validate-azure-credentials --region us-east-1
echo "Ready!"

# ✅ CORRETO - Com && mas com espaços
aws lambda wait function-updated --function-name evo-uds-v3-production-validate-azure-credentials --region us-east-1 && echo "Ready!"
```

### 2. Erro de `&&` colado ao comando

**Causa:** Falta de espaço entre o comando anterior e `&&`.

```bash
# ❌ ERRADO - && colado
command1&&command2

# ✅ CORRETO - Espaços ao redor de &&
command1 && command2
```

### 3. Erro de continuação de linha `\`

**Causa:** Espaço ou caractere após `\` no final da linha.

```bash
# ❌ ERRADO - Espaço após \
aws lambda update-function-code \ 
  --function-name my-function

# ✅ CORRETO - Nada após \
aws lambda update-function-code \
  --function-name my-function
```

## ✅ Boas Práticas

### 1. Comandos Longos - Usar Continuação de Linha

```bash
# ✅ CORRETO - Quebrar em múltiplas linhas
aws lambda update-function-configuration \
  --function-name evo-uds-v3-production-validate-azure-credentials \
  --layers "arn:aws:lambda:us-east-1:383234048592:layer:evo-prisma-deps-layer:46" \
  --environment "Variables={NODE_PATH=/opt/nodejs/node_modules}" \
  --region us-east-1
```

### 2. Múltiplos Comandos - Usar Linhas Separadas

```bash
# ✅ CORRETO - Comandos separados
aws lambda update-function-code --function-name my-function --zip-file fileb://code.zip --region us-east-1
aws lambda wait function-updated --function-name my-function --region us-east-1
echo "Deploy complete!"
```

### 3. Comandos Encadeados - Espaços Obrigatórios

```bash
# ✅ CORRETO - Espaços ao redor de && e ||
command1 && command2 && command3
command1 || echo "Failed"
```

### 4. Variáveis em Strings - Usar Aspas Duplas

```bash
# ✅ CORRETO - Variáveis em aspas duplas
FUNCTION_NAME="evo-uds-v3-production-validate-azure-credentials"
aws lambda invoke --function-name "$FUNCTION_NAME" output.json

# ❌ ERRADO - Variáveis sem aspas (pode quebrar com espaços)
aws lambda invoke --function-name $FUNCTION_NAME output.json
```

### 5. JSON em Linha de Comando - Usar Aspas Simples

```bash
# ✅ CORRETO - JSON em aspas simples
aws lambda invoke \
  --function-name my-function \
  --payload '{"key": "value"}' \
  output.json

# ❌ ERRADO - JSON em aspas duplas (conflito de aspas)
aws lambda invoke \
  --function-name my-function \
  --payload "{"key": "value"}" \
  output.json
```

## 🔧 Como Recuperar de Erros

### Erro `dquote>` ou `quote>`

O terminal está esperando fechar aspas. Opções:

1. **Fechar as aspas:** Digite `"` ou `'` e pressione Enter
2. **Cancelar:** Pressione `Ctrl+C`
3. **Limpar:** Pressione `Ctrl+C` e digite o comando novamente

### Erro `>`

O terminal está esperando mais input. Opções:

1. **Cancelar:** Pressione `Ctrl+C`
2. **Completar:** Se era continuação de linha, complete o comando

### Erro `cmdand` ou similar

Isso indica que o comando foi colado incorretamente. Opções:

1. **Cancelar:** Pressione `Ctrl+C`
2. **Redigitar:** Digite o comando manualmente
3. **Verificar:** Copie o comando de uma fonte limpa

## 📋 Checklist Antes de Executar

- [ ] Todas as aspas estão fechadas (`"..."` ou `'...'`)
- [ ] Espaços ao redor de `&&`, `||`, `|`
- [ ] Nenhum espaço após `\` em continuação de linha
- [ ] Variáveis entre aspas duplas: `"$VAR"`
- [ ] JSON em aspas simples: `'{"key": "value"}'`
- [ ] Comando não foi colado com caracteres invisíveis

## 🛠️ Comandos AWS Comuns - Formato Correto

### Lambda - Atualizar Configuração com Environment Variables

```bash
# ❌ ERRADO - Variáveis vazias ou com caracteres especiais inline
aws lambda update-function-configuration \
  --function-name my-function \
  --environment "Variables={NODE_PATH=/opt/nodejs/node_modules,DATABASE_URL=,API_KEY=}" \
  --region us-east-1

# ❌ ERRADO - Tentar interpolar variáveis shell dentro de Variables={}
aws lambda update-function-configuration \
  --function-name my-function \
  --environment "Variables={KEY=$VALUE}" \
  --region us-east-1

# ✅ CORRETO - Apenas layers, sem environment (quando vars já estão configuradas)
aws lambda update-function-configuration \
  --function-name my-function \
  --layers "arn:aws:lambda:us-east-1:123456789:layer:my-layer:1" \
  --region us-east-1

# ✅ CORRETO - Environment com JSON file
echo '{"Variables":{"NODE_PATH":"/opt/nodejs/node_modules","DATABASE_URL":"postgres://..."}}' > /tmp/env.json
aws lambda update-function-configuration \
  --function-name my-function \
  --environment file:///tmp/env.json \
  --region us-east-1

# ✅ CORRETO - Environment com JSON inline (aspas simples externas, duplas internas)
aws lambda update-function-configuration \
  --function-name my-function \
  --environment '{"Variables":{"NODE_PATH":"/opt/nodejs/node_modules"}}' \
  --region us-east-1

# ✅ CORRETO - Apenas uma variável simples sem caracteres especiais
aws lambda update-function-configuration \
  --function-name my-function \
  --environment "Variables={NODE_PATH=/opt/nodejs/node_modules}" \
  --region us-east-1
```

**REGRAS IMPORTANTES para --environment:**
1. **NUNCA** use variáveis vazias (ex: `DATABASE_URL=`)
2. **NUNCA** use `$VAR` dentro de `Variables={}`
3. **PREFIRA** usar apenas `--layers` quando as env vars já estão configuradas
4. **USE** formato JSON com aspas simples para múltiplas variáveis
5. **USE** `file://` para configurações complexas

### Lambda - Atualizar Código

```bash
aws lambda update-function-code \
  --function-name evo-uds-v3-production-NOME \
  --zip-file fileb:///tmp/lambda.zip \
  --region us-east-1
```

### Lambda - Aguardar Atualização

```bash
aws lambda wait function-updated \
  --function-name evo-uds-v3-production-NOME \
  --region us-east-1
```

### Lambda - Invocar

```bash
aws lambda invoke \
  --function-name evo-uds-v3-production-NOME \
  --payload '{"test": true}' \
  --region us-east-1 \
  /tmp/output.json
```

### API Gateway - Deploy

```bash
aws apigateway create-deployment \
  --rest-api-id 3l66kn0eaj \
  --stage-name prod \
  --region us-east-1
```

### CloudWatch Logs - Ver Logs

```bash
aws logs tail /aws/lambda/evo-uds-v3-production-NOME \
  --since 10m \
  --region us-east-1
```

---

**Última atualização:** 2026-01-12
**Versão:** 1.0
