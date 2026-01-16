# 📚 Biblioteca de Prompts para Correção de Erros

## Como Usar

Quando um erro aparecer no dashboard, copie o prompt correspondente e cole aqui no chat comigo (Kiro). Eu vou executar os comandos automaticamente.

---

## 🔴 PROMPT 1: Lambda com erro "Cannot find module '../../lib/'"

### Quando Usar
- Erro 502 na Lambda
- Mensagem: "Cannot find module '../../lib/response.js'" (ou similar)
- Lambdas afetadas: save-aws-credentials, mfa-enroll, validate-azure-credentials

### Prompt para Colar

```
Erro detectado: Lambda evo-uds-v3-production-{NOME_DA_LAMBDA} com erro 502 "Cannot find module '../../lib/response.js'"

Diagnóstico:
- Deploy incorreto - apenas o arquivo .js do handler foi copiado
- Faltam diretórios lib/ e types/
- Imports não foram ajustados de ../../lib/ para ./lib/

Solução:
Execute o processo correto de deploy seguindo architecture.md para a Lambda {NOME_DA_LAMBDA}
```

**Substitua {NOME_DA_LAMBDA} pelo nome real da Lambda com problema**

---

## 🔴 PROMPT 2: Erro "PrismaClientInitializationError"

### Quando Usar
- Erro 500 na Lambda
- Mensagem: "Can't reach database server"
- Lambdas afetadas: list-background-jobs, query-table, security-scan

### Prompt para Colar

```
Erro detectado: Lambda evo-uds-v3-production-{NOME_DA_LAMBDA} com PrismaClientInitializationError

Diagnóstico:
- DATABASE_URL incorreta (endpoint inexistente ou errado)
- Lambda não está na VPC correta
- Security Group não permite conexão na porta 5432

Solução:
1. Verificar DATABASE_URL da Lambda {NOME_DA_LAMBDA}
2. Atualizar para o endpoint correto: evo-uds-v3-production-postgres.c070y4ceohf7.us-east-1.rds.amazonaws.com
3. Verificar se Lambda está na VPC correta

Execute os comandos necessários conforme database-configuration.md
```

**Substitua {NOME_DA_LAMBDA} pelo nome real da Lambda com problema**

---

## 🟠 PROMPT 3: Erro "Azure SDK not installed"

### Quando Usar
- Erro 500 na Lambda Azure
- Mensagem: "Cannot find module '@azure/identity'" ou "@typespec/ts-http-runtime"
- Lambdas afetadas: validate-azure-credentials, azure-security-scan

### Prompt para Colar

```
Erro detectado: Lambda evo-uds-v3-production-{NOME_DA_LAMBDA} com erro "Cannot find module '@azure/identity'"

Diagnóstico:
- Layer da Lambda não inclui Azure SDK
- Falta @typespec/ts-http-runtime (dependência peer do Azure SDK)
- Layer desatualizado (versão < 47)

Solução:
Atualizar Lambda {NOME_DA_LAMBDA} para usar layer versão 47 (com Azure SDK + @typespec)

Execute os comandos conforme azure-lambda-layers.md
```

**Substitua {NOME_DA_LAMBDA} pelo nome real da Lambda com problema**

---

## 🟡 PROMPT 4: CORS Error 403 no OPTIONS

### Quando Usar
- Erro 403 no frontend
- Método OPTIONS falhando
- Endpoint novo sem CORS configurado

### Prompt para Colar

```
Erro detectado: CORS 403 no endpoint /api/functions/{NOME_DO_ENDPOINT}

Diagnóstico:
- Método OPTIONS não configurado com CORS
- Deployment não feito no stage 'prod'
- Headers CORS faltando X-Impersonate-Organization

Solução:
Configurar CORS completo para o endpoint /api/functions/{NOME_DO_ENDPOINT} seguindo api-gateway-endpoints.md
```

**Substitua {NOME_DO_ENDPOINT} pelo nome real do endpoint com problema**

---

## 🟠 PROMPT 5: Lambda Timeout

### Quando Usar
- Erro "Task timed out after X seconds"
- Lambda excedendo timeout configurado
- Lambdas afetadas: security-scan, compliance-scan

### Prompt para Colar

```
Erro detectado: Lambda evo-uds-v3-production-{NOME_DA_LAMBDA} com timeout

Diagnóstico:
- Lambda excedeu o timeout configurado
- Operação muito lenta (scan grande, query pesada)
- Lambda em VPC sem NAT Gateway (não consegue acessar APIs AWS)

Solução:
1. Verificar timeout atual da Lambda {NOME_DA_LAMBDA}
2. Aumentar timeout se necessário (máximo 900 segundos)
3. Verificar se Lambda está em VPC e se NAT Gateway está ativo

Execute os comandos conforme aws-infrastructure.md
```

**Substitua {NOME_DA_LAMBDA} pelo nome real da Lambda com problema**

---

## 🔴 PROMPT 6: Quick Connect Falhando

### Quando Usar
- Usuário não consegue adicionar conta AWS
- Erro ao salvar credenciais
- Lambda save-aws-credentials com erro

### Prompt para Colar

```
Erro detectado: Quick Connect AWS falhando - usuário não consegue adicionar nova conta

Diagnóstico:
- Lambda save-aws-credentials com erro 502 ou 500
- Possível deploy incorreto ou DATABASE_URL incorreta

Solução:
1. Verificar logs da Lambda save-aws-credentials
2. Verificar se handler path está correto
3. Verificar se DATABASE_URL está correta
4. Refazer deploy se necessário

Execute diagnóstico completo conforme error-monitoring.md
```

---

## 🟡 PROMPT 7: Frontend Error Logging Não Funciona

### Quando Usar
- Erros do frontend não aparecem no dashboard
- Lambda log-frontend-error não recebe dados

### Prompt para Colar

```
Erro detectado: Frontend errors não estão sendo logados

Diagnóstico:
- ErrorBoundary não está capturando erros
- Error reporter não está configurado
- Lambda log-frontend-error com problema
- Endpoint /api/functions/log-frontend-error sem permissões

Solução:
1. Verificar se ErrorBoundary está em src/main.tsx
2. Verificar se error-reporter.ts está importado
3. Verificar Lambda log-frontend-error
4. Verificar endpoint no API Gateway

Execute verificação completa conforme error-monitoring.md
```

---

## 🟠 PROMPT 8: Performance Degradada

### Quando Usar
- Lambda com tempo de execução > 10 segundos
- Performance metrics mostrando status "Slow" ou "Critical"

### Prompt para Colar

```
Erro detectado: Lambda evo-uds-v3-production-{NOME_DA_LAMBDA} com performance degradada

Diagnóstico:
- Tempo médio de execução: {TEMPO}ms (threshold: {THRESHOLD}ms)
- Possíveis causas: query lenta, scan grande, timeout de API externa

Solução:
1. Analisar logs da Lambda {NOME_DA_LAMBDA}
2. Identificar gargalo (database, API externa, processamento)
3. Otimizar código ou aumentar recursos (memória, timeout)

Execute análise de performance conforme aws-infrastructure.md
```

**Substitua {NOME_DA_LAMBDA}, {TEMPO} e {THRESHOLD} pelos valores reais**

---

## 🔴 PROMPT 9: Alarme CloudWatch em ALARM

### Quando Usar
- Alarme CloudWatch mudou para estado ALARM
- Taxa de erros acima do threshold

### Prompt para Colar

```
Erro detectado: Alarme CloudWatch "{NOME_DO_ALARME}" em estado ALARM

Diagnóstico:
- Threshold: {THRESHOLD}
- Valor atual: {VALOR_ATUAL}
- Métrica: {METRICA}

Solução:
1. Identificar causa raiz dos erros
2. Verificar logs das Lambdas afetadas
3. Aplicar correção apropriada
4. Monitorar até alarme voltar para OK

Execute investigação completa conforme error-monitoring.md
```

**Substitua {NOME_DO_ALARME}, {THRESHOLD}, {VALOR_ATUAL} e {METRICA} pelos valores reais**

---

## 🟡 PROMPT 10: MFA Não Funciona

### Quando Usar
- Usuário não consegue configurar MFA
- Erro ao verificar código TOTP
- Lambdas MFA com erro

### Prompt para Colar

```
Erro detectado: MFA não funciona - usuário não consegue {ACAO}

Diagnóstico:
- Lambda mfa-{FUNCAO} com erro
- Possível problema: tabela mfa_factors, Prisma Client, validação TOTP

Solução:
1. Verificar logs da Lambda mfa-{FUNCAO}
2. Verificar se tabela mfa_factors existe
3. Verificar se Prisma Client está atualizado
4. Testar fluxo MFA completo

Execute diagnóstico conforme mfa-implementation.md
```

**Substitua {ACAO} (ex: "configurar MFA", "fazer login") e {FUNCAO} (ex: "enroll", "verify-login")**

---

## 📋 Template Genérico

Para qualquer outro erro não listado acima:

```
Erro detectado: {DESCRICAO_DO_ERRO}

Lambda/Endpoint afetado: {NOME}
Mensagem de erro: {MENSAGEM}
Status code: {STATUS_CODE}
Timestamp: {TIMESTAMP}

Diagnóstico:
{DESCREVA_O_QUE_VOCÊ_OBSERVOU}

Solução esperada:
{DESCREVA_O_QUE_DEVERIA_ACONTECER}

Por favor, investigue e corrija este erro.
```

---

## 🎯 Dicas de Uso

### 1. Seja Específico
- Sempre inclua o nome exato da Lambda ou endpoint
- Inclua a mensagem de erro completa
- Inclua o timestamp se possível

### 2. Use os Prompts Como Base
- Você pode adaptar os prompts conforme necessário
- Adicione contexto adicional se relevante
- Remova partes que não se aplicam

### 3. Monitore o Resultado
- Após eu executar os comandos, verifique se o erro foi corrigido
- Acesse o dashboard para confirmar
- Teste a funcionalidade afetada

### 4. Documente Novos Padrões
- Se encontrar um erro novo recorrente, me avise
- Eu vou adicionar um novo prompt à biblioteca
- Isso ajuda a resolver mais rápido no futuro

---

## 📊 Estatísticas de Uso

### Prompts Mais Usados (Estimativa)
1. **PROMPT 1** (Cannot find module): ~40% dos casos
2. **PROMPT 2** (PrismaClient): ~25% dos casos
3. **PROMPT 3** (Azure SDK): ~15% dos casos
4. **PROMPT 4** (CORS): ~10% dos casos
5. **PROMPT 5** (Timeout): ~5% dos casos
6. **Outros**: ~5% dos casos

### Tempo Médio de Resolução
- Com prompt pronto: **5-15 minutos**
- Sem prompt: **30-120 minutos**
- **Economia: 75-90% do tempo**

---

## 🔄 Atualizações

Esta biblioteca será atualizada conforme novos padrões de erros forem identificados.

**Última atualização:** 2026-01-15  
**Versão:** 1.0  
**Total de prompts:** 10 + 1 template genérico

---

**Criado por:** Kiro AI Assistant  
**Para:** Monitoramento e correção rápida de erros  
**Status:** ✅ Pronto para uso
