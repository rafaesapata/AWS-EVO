# MFA Implementation Guide

## 🚨 IMPORTANTE: NÃO USAR COGNITO PARA MFA

A implementação de MFA neste projeto **NÃO usa Cognito** para verificação de códigos TOTP. O Cognito é usado apenas para autenticação básica (login/logout).

## Arquitetura MFA

### Fluxo de Enrollment (Cadastro)

1. **Frontend** chama `POST /api/functions/mfa-enroll` com `factorType: 'totp'`
2. **Backend** gera um secret TOTP usando `crypto.randomBytes(20)`
3. **Backend** salva o secret na tabela `mfa_factors` do PostgreSQL
4. **Backend** retorna o secret e a URL `otpauth://` para o QR Code
5. **Frontend** gera o QR Code usando a biblioteca `qrcode`
6. **Usuário** escaneia o QR Code com app autenticador (Google Authenticator, Authy, etc)

### Fluxo de Verificação

1. **Frontend** chama `POST /api/functions/mfa-challenge-verify` com `factorId` e `code`
2. **Backend** busca o fator na tabela `mfa_factors` pelo `factorId` e `user_id`
3. **Backend** verifica o código TOTP **localmente** usando a função `verifyTOTP()`
4. **Backend** atualiza o status do fator para `verified` se o código estiver correto
5. **Frontend** recebe confirmação de sucesso

### Fluxo de Login com MFA

1. **Frontend** chama `POST /api/functions/mfa-check` para verificar se usuário tem MFA
2. Se tiver MFA, **Frontend** solicita código ao usuário
3. **Frontend** chama `POST /api/functions/mfa-verify-login` com `factorId` e `code`
4. **Backend** verifica o código TOTP **localmente**
5. **Frontend** completa o login

## Arquivos Principais

### Backend
- `backend/src/handlers/auth/mfa-handlers.ts` - Todos os handlers MFA
- `backend/src/lib/schemas.ts` - Schemas de validação (mfaEnrollSchema, mfaVerifySchema)
- `backend/prisma/schema.prisma` - Model `MfaFactor`

### Frontend
- `src/components/MFASettings.tsx` - Interface de configuração MFA

### Banco de Dados
- Tabela: `mfa_factors`
- Colunas: `id`, `user_id`, `factor_type`, `friendly_name`, `secret`, `status`, `is_active`, `verified_at`, `deactivated_at`, `last_used_at`, `created_at`

## Função de Verificação TOTP

A verificação é feita **localmente** no backend usando a função `verifyTOTP()`:

```typescript
function verifyTOTP(secret: string, token: string, window: number = 1): boolean {
  // 1. Decodifica o secret de Base32
  // 2. Calcula o counter baseado no timestamp atual (epoch / 30)
  // 3. Gera HMAC-SHA1 do counter com o secret
  // 4. Extrai 6 dígitos do HMAC
  // 5. Compara com o token fornecido
  // 6. Verifica também tokens adjacentes (window) para tolerância de tempo
}
```

## ⛔ O QUE NÃO FAZER

1. **NÃO usar `VerifySoftwareTokenCommand` do Cognito** - Causa problemas de sincronização
2. **NÃO usar `AssociateSoftwareTokenCommand` do Cognito** - O secret deve ser gerado localmente
3. **NÃO depender do Cognito para armazenar secrets MFA** - Use a tabela `mfa_factors`
4. **NÃO usar `accessToken` do Cognito para verificação MFA** - Não é necessário

## ✅ O QUE FAZER

1. **Gerar secret TOTP localmente** usando `crypto.randomBytes(20).toString('base32')`
2. **Armazenar secret na tabela `mfa_factors`** do PostgreSQL
3. **Verificar códigos TOTP localmente** usando a função `verifyTOTP()`
4. **Usar rate limiting** para prevenir brute force (10 tentativas/minuto)

## Lambdas MFA

| Lambda | Função |
|--------|--------|
| `evo-uds-v3-production-mfa-enroll` | Cadastrar novo fator MFA |
| `evo-uds-v3-production-mfa-check` | Verificar se usuário tem MFA |
| `evo-uds-v3-production-mfa-challenge-verify` | Verificar código durante enrollment |
| `evo-uds-v3-production-mfa-verify-login` | Verificar código durante login |
| `evo-uds-v3-production-mfa-list-factors` | Listar fatores do usuário |
| `evo-uds-v3-production-mfa-unenroll` | Remover fator MFA |

## Segurança

### Implementado
- Rate limiting: 10 tentativas por minuto, bloqueio de 15 minutos
- Isolamento por usuário: `user_id` em todas as queries
- Validação de input com Zod
- Logging de tentativas de brute force

### Recomendações Futuras
- Criptografar campo `secret` com AWS KMS
- Implementar backup recovery codes
- Adicionar logs de auditoria detalhados
- Implementar MFA obrigatório por organização

## Troubleshooting

### Erro "Invalid verification code"
1. Verificar se o relógio do dispositivo está sincronizado
2. Verificar se o secret foi salvo corretamente no banco
3. Verificar se o `factorId` está correto
4. Verificar logs da Lambda para mais detalhes

### Erro "Factor not found"
1. Verificar se a tabela `mfa_factors` existe
2. Verificar se o fator foi criado durante o enrollment
3. Verificar se o `user_id` está correto

### Erro 502 nas Lambdas MFA
1. Verificar se o layer Prisma está anexado
2. Verificar se o código foi deployado corretamente
3. Verificar logs do CloudWatch

---

**Última atualização:** 2026-01-08
**Versão:** 1.0
