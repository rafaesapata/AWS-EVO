# Implementation Plan: Sistema de Autenticação EVO

## Overview

Implementação do sistema de autenticação híbrido que combina AWS Cognito com controles locais para MFA e WebAuthn, garantindo máxima segurança e flexibilidade.

## Tasks

- [x] 1. Corrigir carregamento síncrono de contexto do usuário
  - Modificar Layout.tsx para carregar userRole de forma síncrona
  - Evitar AppSidebar receber userRole undefined inicialmente
  - Garantir contexto consistente entre componentes
  - _Requirements: 10.1, 10.4, 10.5_

- [ ]* 1.1 Escrever testes para carregamento de contexto
  - **Property 4: Session Consistency**
  - **Validates: Requirements 5.2, 10.4**

- [ ] 2. Implementar controle local de MFA
  - [x] 2.1 Criar tabela mfa_settings no banco PostgreSQL
    - Definir schema com user_id, organization_id, totp_secret
    - Adicionar campos para backup_codes e configurações
    - _Requirements: 2.1, 2.2_

  - [ ] 2.2 Implementar MFA Service backend
    - Criar handlers para setup, verificação e gerenciamento MFA
    - Implementar geração de TOTP secrets e QR codes
    - Adicionar validação de códigos TOTP com tolerância
    - _Requirements: 2.3, 2.4, 2.5_

  - [ ]* 2.3 Escrever testes de propriedade para MFA
    - **Property 1: MFA Local Control Enforcement**
    - **Validates: Requirements 2.1, 2.6**

- [ ] 3. Implementar verificação MFA no fluxo de login
  - [ ] 3.1 Modificar Auth-simple.tsx para verificar MFA local
    - Adicionar chamada para verificar se usuário tem MFA habilitado
    - Implementar tela de verificação MFA após login Cognito
    - _Requirements: 2.2, 2.3_

  - [ ] 3.2 Criar componente MFAVerify.tsx
    - Interface para inserção de código TOTP
    - Validação em tempo real
    - Opções de backup codes
    - _Requirements: 2.3, 2.5_

  - [ ]* 3.3 Escrever testes unitários para componentes MFA
    - Testar validação de códigos
    - Testar interface de usuário
    - _Requirements: 2.3, 2.5_

- [ ] 4. Corrigir fluxo WebAuthn existente
  - [ ] 4.1 Verificar configuração rpId para evo.nuevacore.com
    - Garantir que todas as chamadas WebAuthn usem rpId correto
    - Limpar credenciais antigas com rpId incorreto
    - _Requirements: 3.5_

  - [ ] 4.2 Implementar verificação obrigatória de WebAuthn
    - Modificar fluxo para exigir WebAuthn quando registrado
    - Adicionar fallback para MFA em caso de falha
    - _Requirements: 3.2, 3.4_

  - [ ]* 4.3 Escrever testes de propriedade para WebAuthn
    - **Property 3: WebAuthn Enforcement**
    - **Validates: Requirements 3.2, 3.4**

- [ ] 5. Implementar gerenciamento de sessão robusto
  - [ ] 5.1 Criar tabela user_sessions
    - Schema com session_token, expires_at, mfa_verified
    - Índices para performance
    - _Requirements: 5.1, 5.2_

  - [ ] 5.2 Implementar validação contínua de sessão
    - Verificar validade em todos os componentes protegidos
    - Implementar refresh automático de tokens
    - _Requirements: 5.3, 5.4_

  - [ ]* 5.3 Escrever testes de propriedade para sessões
    - **Property 7: Token Validation Consistency**
    - **Validates: Requirements 1.4, 5.3, 5.4**

- [ ] 6. Checkpoint - Testar fluxo completo de autenticação
  - Verificar login básico com Cognito
  - Testar MFA local quando habilitado
  - Validar WebAuthn obrigatório quando registrado
  - Confirmar isolamento por organização

- [ ] 7. Implementar isolamento por organização
  - [ ] 7.1 Validar organization_id em formato UUID
    - Adicionar validação rigorosa de formato
    - Forçar logout quando inválido
    - _Requirements: 6.3, 6.4_

  - [ ] 7.2 Filtrar todas as queries por organization_id
    - Auditar todos os handlers Lambda
    - Garantir filtro em todas as operações de banco
    - _Requirements: 6.1, 6.2_

  - [ ]* 7.3 Escrever testes de propriedade para isolamento
    - **Property 2: Organization Isolation**
    - **Validates: Requirements 6.1, 6.2, 6.3**

- [ ] 8. Melhorar tratamento de erros
  - [ ] 8.1 Implementar mensagens user-friendly
    - Mapear todos os erros Cognito para mensagens claras
    - Adicionar sugestões de resolução
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

  - [ ] 8.2 Implementar logging detalhado
    - Logar eventos de autenticação para auditoria
    - Adicionar alertas de segurança
    - _Requirements: 9.5_

  - [ ]* 8.3 Escrever testes de propriedade para erros
    - **Property 8: Error Message Clarity**
    - **Validates: Requirements 9.1, 9.2, 9.3, 9.4**

- [ ] 9. Implementar políticas de senha
  - [ ] 9.1 Validação em tempo real
    - Mostrar requisitos visuais durante digitação
    - Validar força da senha
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

  - [ ]* 9.2 Escrever testes de propriedade para senhas
    - **Property 6: Password Policy Enforcement**
    - **Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5**

- [ ] 10. Implementar recuperação de senha melhorada
  - [ ] 10.1 Fluxo completo via Cognito
    - Integrar com ForgotPassword.tsx existente
    - Adicionar validação de políticas na recuperação
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [ ]* 10.2 Escrever testes unitários para recuperação
    - Testar fluxo completo
    - Validar integração com Cognito
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [ ] 11. Implementar monitoramento e auditoria
  - [ ] 11.1 Criar logs de eventos de autenticação
    - Registrar tentativas de login
    - Monitorar uso de MFA e WebAuthn
    - Alertas para atividades suspeitas

  - [ ] 11.2 Dashboard de segurança
    - Métricas de autenticação
    - Relatórios de uso de MFA
    - Análise de tentativas de acesso

- [ ] 12. Checkpoint final - Validação completa do sistema
  - Executar todos os testes de propriedade
  - Validar fluxos end-to-end
  - Confirmar políticas de segurança
  - Verificar performance e monitoramento

## Notes

- Tasks marcadas com `*` são opcionais e podem ser implementadas posteriormente
- Cada task referencia requirements específicos para rastreabilidade
- Checkpoints garantem validação incremental
- Foco em segurança e isolamento de dados por organização
- **CRÍTICO**: MFA é controlado localmente, não via Cognito
- **CRÍTICO**: WebAuthn deve usar rpId "evo.nuevacore.com"
- **CRÍTICO**: Todas as queries devem filtrar por organization_id