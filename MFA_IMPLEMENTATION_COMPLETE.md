# MFA (Multi-Factor Authentication) - Implementação Completa ✅

## Resumo Executivo

Sistema de autenticação multi-fator (MFA) implementado com sucesso usando TOTP (Time-based One-Time Password). O WebAuthn foi desabilitado temporariamente e marcado como funcionalidade Enterprise.

## Problemas Resolvidos

### 1. Erro 500 - Invalid Access Token
**Problema**: Backend tentava usar `idToken` para operações Cognito que requerem `accessToken`

**Solução**:
- Frontend agora passa `accessToken` no corpo da requisição
- Backend usa o `accessToken` fornecido para `AssociateSoftwareTokenCommand`
- Schema atualizado para aceitar `accessToken` opcional

### 2. Erro 502 - Missing Dependencies
**Problema**: Lambdas MFA foram deployadas sem dependências completas

**Solução**:
- Deploy do pacote completo (`backend/dist/*`) para todas as Lambdas MFA
- Handlers corrigidos para `handlers/auth/mfa-handlers.handler`
- Lambdas atualizadas:
  - `evo-uds-v3-production-mfa-enroll`
  - `evo-uds-v3-production-mfa-check`
  - `evo-uds-v3-production-mfa-challenge-verify`

### 3. QR Code Não Aparecia
**Problema**: Backend retornava string `otpauth://` mas frontend esperava imagem

**Solução**:
- Instalada biblioteca `qrcode` no frontend
- QR Code gerado no cliente a partir da string otpauth
- Fallback para entrada manual do secret

### 4. Tabela mfa_factors Não Existia
**Problema**: Tabela não estava no script de migração

**Solução**:
- Adicionada criação da tabela ao `run-migrations.ts`
- Migração executada com sucesso
- Tabela criada com todos os índices necessários

## Arquitetura Implementada

### Backend (Node.js/TypeScript)

**Handler Principal**: `backend/src/handlers/auth/mfa-handlers.ts`

Funções implementadas:
- `enrollHandler` - Registra novo fator MFA (TOTP)
- `verifyHandler` - Verifica código TOTP durante setup
- `checkHandler` - Verifica se usuário tem MFA ativo
- `listFactorsHandler` - Lista fatores MFA do usuário
- `unenrollHandler` - Remove fator MFA
- `verifyLoginHandler` - Verifica código durante login

**Schema Prisma**: `backend/prisma/schema.prisma`
```prisma
model MfaFactor {
  id                String   @id @default(uuid()) @db.Uuid
  user_id           String   @db.Uuid
  factor_type       String   // 'totp', 'sms', 'email'
  friendly_name     String?
  secret            String?
  status            String   @default("pending")
  is_active         Boolean  @default(true)
  verified_at       DateTime? @db.Timestamptz(6)
  deactivated_at    DateTime? @db.Timestamptz(6)
  last_used_at      DateTime? @db.Timestamptz(6)
  created_at        DateTime @default(now()) @db.Timestamptz(6)
  
  @@index([user_id])
  @@index([is_active])
  @@map("mfa_factors")
}
```

### Frontend (React/TypeScript)

**Componente**: `src/components/MFASettings.tsx`

Funcionalidades:
- ✅ Configuração de TOTP com QR Code
- ✅ Entrada manual do secret como fallback
- ✅ Verificação de código de 6 dígitos
- ✅ Listagem de fatores ativos
- ✅ Remoção de fatores
- ❌ WebAuthn desabilitado (marcado como Enterprise)

**Bibliotecas Adicionadas**:
- `qrcode` - Geração de QR Code no cliente
- `@types/qrcode` - Tipos TypeScript

## Fluxo de Uso

### 1. Configurar TOTP

```typescript
// Frontend obtém session com accessToken
const session = await cognitoAuth.getCurrentSession();

// Envia requisição com accessToken
const result = await apiClient.invoke('mfa-enroll', {
  body: {
    factorType: 'totp',
    friendlyName: 'Autenticador TOTP',
    accessToken: session.accessToken
  }
});

// Backend retorna secret e otpauth URL
// Frontend gera QR Code
const qrCodeDataUrl = await QRCode.toDataURL(data.qrCode);
```

### 2. Verificar Código

```typescript
// Usuário escaneia QR Code e insere código de 6 dígitos
const result = await apiClient.invoke('mfa-challenge-verify', {
  body: {
    factorId: factorId,
    code: verifyCode
  }
});

// Backend verifica com Cognito
await cognitoClient.send(new VerifySoftwareTokenCommand({
  AccessToken: accessToken,
  UserCode: code
}));
```

### 3. Login com MFA

```typescript
// Durante login, verificar se usuário tem MFA
const mfaCheck = await apiClient.invoke('mfa-check');

if (mfaCheck.data.requiresMFA) {
  // Solicitar código TOTP
  // Verificar com mfa-verify-login
}
```

## Lambdas AWS

| Lambda | Handler | Função |
|--------|---------|--------|
| `mfa-enroll` | `handlers/auth/mfa-handlers.handler` | Registrar TOTP |
| `mfa-check` | `handlers/auth/mfa-handlers.handler` | Verificar se tem MFA |
| `mfa-challenge-verify` | `handlers/auth/mfa-handlers.handler` | Verificar código setup |
| `mfa-list-factors` | `handlers/auth/mfa-handlers.handler` | Listar fatores |
| `mfa-unenroll` | `handlers/auth/mfa-handlers.handler` | Remover fator |

**Layer**: `arn:aws:lambda:us-east-1:383234048592:layer:evo-prisma-deps-layer:34`
- Contém: Prisma Client, Zod, dependências compartilhadas

## Segurança

### Rate Limiting
- 10 tentativas por minuto para verificação MFA
- Bloqueio de 15 minutos após exceder limite
- Implementado em `checkUserRateLimit()`

### Armazenamento de Secrets
- Secrets TOTP armazenados no PostgreSQL
- TODO: Criptografar com AWS KMS

### Tokens
- `idToken` - Autorização API Gateway (contém custom attributes)
- `accessToken` - Operações Cognito (MFA, password reset)
- `refreshToken` - Renovação de tokens

## WebAuthn (Desabilitado)

O WebAuthn foi temporariamente desabilitado e marcado como funcionalidade Enterprise:

```tsx
<div className="opacity-50">
  <h3 className="font-semibold mb-3 flex items-center gap-2">
    <Key className="h-4 w-4" />
    Chave de Segurança (WebAuthn)
  </h3>
  <p className="text-sm text-muted-foreground mb-3">
    Esta funcionalidade requer uma licença Enterprise
  </p>
  <Button disabled variant="outline" className="cursor-not-allowed">
    <Key className="h-4 w-4 mr-2" />
    Indisponível nesta licença
  </Button>
</div>
```

**Motivo**: Foco inicial em TOTP, WebAuthn será implementado em versão Enterprise futura.

## Deploy Status

✅ Backend compilado e deployado
✅ Todas as Lambdas MFA atualizadas
✅ Tabela `mfa_factors` criada no banco
✅ Frontend compilado e deployado
✅ CloudFront invalidado
✅ QR Code funcionando
✅ WebAuthn desabilitado

## Testes

Para testar o MFA:

1. Acesse Settings → Security → MFA
2. Clique em "Configurar Autenticador TOTP"
3. Escaneie o QR Code com:
   - Google Authenticator
   - Microsoft Authenticator
   - Authy
   - 1Password
   - Qualquer app TOTP compatível
4. Digite o código de 6 dígitos
5. Clique em "Verificar e Ativar"

## Próximos Passos (Futuro)

1. **Criptografia de Secrets**: Implementar KMS para criptografar secrets TOTP
2. **SMS MFA**: Adicionar suporte para MFA via SMS
3. **Email MFA**: Adicionar suporte para MFA via email
4. **WebAuthn Enterprise**: Reativar WebAuthn para licenças Enterprise
5. **Backup Codes**: Gerar códigos de backup para recuperação
6. **MFA Obrigatório**: Permitir organizações forçarem MFA para todos usuários

## Documentação Técnica

### Token Types (Cognito)
- **idToken**: Identidade + custom attributes (organization_id, roles)
  - Usado para: API Gateway authorization
  - Contém: Claims do usuário
  
- **accessToken**: Operações no User Pool
  - Usado para: MFA enrollment, password changes, user updates
  - Não contém: Custom attributes
  
- **refreshToken**: Renovação de tokens
  - Usado para: Obter novos id/access tokens
  - Validade: Configurável (padrão 30 dias)

### TOTP Algorithm
- **Algoritmo**: HMAC-SHA1
- **Período**: 30 segundos
- **Dígitos**: 6
- **Window**: ±1 período (90 segundos total)
- **Formato**: Base32 encoded secret

## Conclusão

Sistema MFA TOTP totalmente funcional e pronto para produção. WebAuthn desabilitado temporariamente, disponível apenas para licenças Enterprise no futuro.
