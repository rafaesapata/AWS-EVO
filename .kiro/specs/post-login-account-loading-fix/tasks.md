# Plano de Implementação: Correção de Carregamento de Contas Pós-Login

## Visão Geral

Correção da race condition entre carregamento do organizationId e queries de contas cloud. Todas as mudanças são no frontend React/TypeScript.

## Tasks

- [x] 1. Corrigir reatividade da query no CloudAccountContext
  - [x] 1.1 Adicionar refetch explícito na transição do organizationId em `src/contexts/CloudAccountContext.tsx`
    - Adicionar `useRef` para rastrear valor anterior do organizationId
    - Adicionar `useEffect` que detecta transição de null para valor válido e chama `refetch()`
    - Expor `orgLoading` no `CloudAccountContextType` e no value do provider
    - Atualizar `defaultContext` com `orgLoading: false`
    - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.4, 4.1_

  - [x] 1.2 Aplicar mesma correção de reatividade no AwsAccountContext em `src/contexts/AwsAccountContext.tsx`
    - Adicionar `useRef` para rastrear valor anterior do organizationId
    - Adicionar `useEffect` que detecta transição de null para valor válido e chama `refetch()`
    - _Requirements: 4.1, 4.2, 4.3_

  - [ ]* 1.3 Escrever teste de propriedade para reatividade da query
    - **Property 1: Reatividade da query na transição do organizationId**
    - **Validates: Requirements 1.1, 4.1**

  - [ ]* 1.4 Escrever teste de propriedade para query desabilitada
    - **Property 2: Query desabilitada enquanto organizationId é null**
    - **Validates: Requirements 1.2**

- [x] 2. Corrigir AwsAccountGuard para aguardar organização
  - [x] 2.1 Atualizar `src/components/AwsAccountGuard.tsx` para usar orgLoading
    - Consumir `orgLoading` do `useCloudAccount()`
    - Adicionar check de `orgLoading` no useEffect antes de avaliar contas
    - Adicionar `orgLoading` na condição de loading do render
    - Adicionar mensagem "Carregando organização..." quando `orgLoading` é true
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 5.1_

  - [ ]* 2.2 Escrever teste de propriedade para guard não redirecionar durante loading
    - **Property 4: Guard não redireciona durante loading**
    - **Validates: Requirements 3.1, 3.2, 5.1**

  - [ ]* 2.3 Escrever teste de propriedade para guard renderizar children
    - **Property 5: Guard renderiza children quando carregado com contas**
    - **Validates: Requirements 3.3**

- [x] 3. Checkpoint - Verificar que contexts e guard estão corretos
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Invalidar cache pós-login no Auth.tsx
  - [x] 4.1 Adicionar invalidação de queries em `src/pages/Auth.tsx`
    - Importar `useQueryClient` do `@tanstack/react-query`
    - Antes de cada `navigate("/app")` (handleLogin, handleMFAVerified, handleWebAuthnLogin), invalidar queries `['cloud-accounts']` e `['aws-accounts']`
    - _Requirements: 5.2_

  - [ ]* 4.2 Escrever teste unitário para invalidação de cache pós-login
    - Verificar que `queryClient.invalidateQueries` é chamado com keys corretas
    - _Requirements: 5.2_

- [x] 5. Testes de propriedade complementares
  - [ ]* 5.1 Escrever teste de propriedade para invariante do isLoading
    - **Property 3: Invariante do isLoading**
    - **Validates: Requirements 2.1, 2.2, 2.3**

  - [ ]* 5.2 Escrever teste de propriedade para propagação de resultados da API
    - **Property 6: Context propaga resultados da API**
    - **Validates: Requirements 1.3**

- [x] 6. Checkpoint final - Verificar todos os testes e build
  - Ensure all tests pass, ask the user if questions arise.
  - Rodar `npm run build` para garantir que não há erros de compilação

## Notas

- Tasks marcadas com `*` são opcionais e podem ser puladas para um MVP mais rápido
- Todas as mudanças são no frontend (`src/`), deploy será FRONTEND_ONLY (~2min)
- Nenhuma alteração no backend é necessária
- Os testes de propriedade usam `fast-check` como biblioteca PBT
