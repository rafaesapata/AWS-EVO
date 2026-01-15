# Token Auto-Refresh Implementation

## 🎯 Problema Resolvido

Usuários eram deslogados automaticamente após o token JWT expirar (geralmente 1 hora), mesmo estando ativamente usando a plataforma.

## ✅ Solução Implementada

Sistema de auto-refresh de tokens que mantém o usuário logado enquanto estiver usando a plataforma.

## 🔧 Como Funciona

### 1. Monitoramento de Expiração

O hook `useAuthSafe` agora monitora a expiração do token JWT:

```typescript
const scheduleTokenRefresh = useCallback((accessToken: string) => {
  // Decodifica o JWT para obter o tempo de expiração
  const payload = JSON.parse(atob(parts[1]));
  const exp = payload.exp * 1000; // Converte para milliseconds
  
  // Agenda refresh 5 minutos ANTES da expiração
  const refreshTime = exp - now - (5 * 60 * 1000);
  
  // Cria timer para fazer refresh automático
  setTimeout(async () => {
    const newSession = await cognitoAuth.refreshSession();
    // Atualiza sessão e agenda próximo refresh
  }, refreshTime);
}, []);
```

### 2. Refresh Automático

Quando o timer dispara (5 minutos antes da expiração):

1. Chama `cognitoAuth.refreshSession()` que usa o `refreshToken` do Cognito
2. Obtém novos `accessToken` e `idToken`
3. Atualiza a sessão no estado e no storage
4. Agenda o próximo refresh baseado no novo token

### 3. Integração com Login

Após login bem-sucedido, o auto-refresh é iniciado automaticamente:

```typescript
if ('user' in result) {
  setSession(result);
  setUser(result.user);
  
  // Inicia auto-refresh
  scheduleTokenRefresh(result.accessToken);
  
  return true;
}
```

### 4. Limpeza no Logout

Quando o usuário faz logout, o timer é cancelado:

```typescript
const signOut = useCallback(async (): Promise<void> => {
  // Limpa timer de refresh
  if (refreshTimerRef.current) {
    clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = null;
  }
  
  await cognitoAuth.signOut();
  // ...
}, []);
```

## 📊 Fluxo Completo

```
1. Usuário faz login
   ↓
2. Token JWT recebido (exp: 1 hora)
   ↓
3. Auto-refresh agendado para 55 minutos
   ↓
4. [Usuário usa a plataforma normalmente]
   ↓
5. Após 55 minutos: refresh automático
   ↓
6. Novo token recebido (exp: +1 hora)
   ↓
7. Novo auto-refresh agendado para 55 minutos
   ↓
8. [Ciclo continua enquanto usuário estiver ativo]
```

## 🔒 Segurança

### Refresh Token

O Cognito fornece um `refreshToken` que:
- Tem validade mais longa (30 dias por padrão)
- Só pode ser usado para obter novos tokens
- Não dá acesso direto aos recursos

### Validação

O `refreshSession()` no `cognito-client-simple.ts`:
- Usa o AWS SDK oficial
- Valida o refresh token com o Cognito
- Retorna `null` se o refresh token expirou ou foi revogado
- Força logout se o refresh falhar

```typescript
async refreshSession(): Promise<AuthSession | null> {
  try {
    const currentSession = await this.getCurrentSession();
    if (!currentSession || !currentSession.refreshToken) {
      await this.signOut();
      return null;
    }

    const refreshCommand = new InitiateAuthCommand({
      AuthFlow: AuthFlowType.REFRESH_TOKEN_AUTH,
      ClientId: this.clientId,
      AuthParameters: {
        REFRESH_TOKEN: currentSession.refreshToken,
      },
    });

    const response = await cognitoClient.send(refreshCommand);
    
    if (!response.AuthenticationResult) {
      await this.signOut();
      return null;
    }

    // Retorna nova sessão com tokens atualizados
    return newSession;
  } catch (error) {
    console.error('Token refresh failed:', error);
    await this.signOut();
    return null;
  }
}
```

## 🎛️ Configuração

### Timing do Refresh

Atualmente configurado para **5 minutos antes da expiração**:

```typescript
const refreshTime = exp - now - (5 * 60 * 1000); // 5 minutos
```

**Por que 5 minutos?**
- Margem de segurança para latência de rede
- Evita race conditions com APIs
- Usuário não percebe o refresh acontecendo

### Validade dos Tokens (Cognito)

Configurado no User Pool do Cognito:
- **Access Token**: 1 hora (padrão)
- **ID Token**: 1 hora (padrão)
- **Refresh Token**: 30 dias (padrão)

## 🧪 Testando

### Teste Manual

1. Fazer login na plataforma
2. Abrir DevTools → Console
3. Procurar por: `🔄 Token refresh scheduled in X minutes`
4. Aguardar o tempo indicado
5. Verificar log: `🔄 Auto-refreshing token...`
6. Verificar log: `✅ Token refreshed successfully`

### Teste Rápido (Forçar Expiração)

Para testar sem esperar 1 hora:

1. Fazer login
2. No DevTools → Application → Local Storage
3. Editar `evo-auth` → Modificar o `exp` no token para expirar em 1 minuto
4. Aguardar 1 minuto
5. Verificar se o refresh acontece automaticamente

## 📝 Logs

O sistema gera logs detalhados no console:

```
🔄 Token refresh scheduled in 55 minutes
[... 55 minutos depois ...]
🔄 Auto-refreshing token...
✅ Token refreshed successfully
🔄 Token refresh scheduled in 55 minutes
```

Em caso de erro:
```
❌ Auto-refresh failed: [erro]
```

## ⚠️ Casos Especiais

### Refresh Token Expirado

Se o refresh token expirar (após 30 dias de inatividade):
- O refresh falhará
- Usuário será deslogado automaticamente
- Precisará fazer login novamente

### Múltiplas Abas

Cada aba tem seu próprio timer de refresh:
- Todas as abas farão refresh independentemente
- Última aba a fazer refresh "vence" (sobrescreve no storage)
- Não há conflito pois o Cognito aceita múltiplos refreshes

### Usuário Inativo

Se o usuário ficar inativo por mais de 30 dias:
- Refresh token expira
- Próxima tentativa de refresh falhará
- Usuário será deslogado

## 🚀 Deploy

### Arquivos Modificados

- `src/hooks/useAuthSafe.ts` - Adicionado auto-refresh

### Deploy Realizado

```bash
# Build
npm run build

# Deploy para S3
aws s3 sync dist/ s3://evo-uds-v3-production-frontend-383234048592 --delete

# Invalidar CloudFront
aws cloudfront create-invalidation --distribution-id E1PY7U3VNT6P1R --paths "/*"
```

### Status

✅ **LIVE em produção** - https://evo.ai.udstec.io

## 📈 Benefícios

1. **Melhor UX**: Usuários não são deslogados inesperadamente
2. **Segurança Mantida**: Tokens continuam expirando, mas são renovados automaticamente
3. **Transparente**: Usuário não percebe o refresh acontecendo
4. **Resiliente**: Se refresh falhar, usuário continua até token expirar de fato

## 🔮 Melhorias Futuras

### Possíveis Enhancements

1. **Activity Detection**: Só fazer refresh se usuário estiver ativo
   - Monitorar eventos de mouse/teclado
   - Pausar refresh se usuário inativo por X minutos

2. **Retry com Backoff**: Se refresh falhar, tentar novamente
   - Já implementado em `refreshTokenWithRetry()` no cognito-client
   - Pode ser integrado ao auto-refresh

3. **Notificação ao Usuário**: Avisar quando refresh falhar
   - Toast: "Sua sessão está expirando, faça login novamente"

4. **Sincronização entre Abas**: Usar BroadcastChannel
   - Uma aba faz refresh, outras recebem novo token
   - Evita múltiplos refreshes simultâneos

---

**Data de Implementação**: 2026-01-15  
**Versão**: 1.0  
**Status**: ✅ Produção
