# Requirements Document - Sistema de Autenticação EVO

## Introduction

Sistema de autenticação multi-camadas da plataforma EVO que combina AWS Cognito para autenticação básica com controles locais para MFA e WebAuthn, garantindo máxima segurança e flexibilidade.

## Glossary

- **Cognito**: AWS Cognito User Pools para autenticação básica (usuário/senha)
- **MFA_Local**: Sistema de MFA controlado localmente via banco PostgreSQL
- **WebAuthn**: Autenticação baseada em chaves de segurança (FIDO2/WebAuthn)
- **Challenge_Flow**: Fluxo de desafios do Cognito (NEW_PASSWORD_REQUIRED, etc.)
- **Session_Management**: Gerenciamento de sessões JWT com validação local
- **Organization_Isolation**: Isolamento de dados por organização (multi-tenancy)

## Requirements

### Requirement 1: Autenticação Básica via Cognito

**User Story:** Como usuário do sistema, quero fazer login com email e senha, para que eu possa acessar a plataforma de forma segura.

#### Acceptance Criteria

1. WHEN um usuário fornece credenciais válidas, THE Sistema SHALL autenticar via AWS Cognito
2. WHEN a autenticação é bem-sucedida, THE Sistema SHALL retornar tokens JWT válidos
3. WHEN as credenciais são inválidas, THE Sistema SHALL retornar erro específico
4. THE Sistema SHALL validar tokens JWT em todas as requisições autenticadas
5. WHEN um token expira, THE Sistema SHALL permitir refresh automático

### Requirement 2: Controle Local de MFA

**User Story:** Como administrador de segurança, quero controlar MFA localmente no banco de dados, para que eu tenha flexibilidade total sobre políticas de segurança.

#### Acceptance Criteria

1. THE Sistema SHALL armazenar configurações MFA no banco PostgreSQL local
2. WHEN um usuário tem MFA habilitado localmente, THE Sistema SHALL solicitar verificação MFA
3. THE Sistema SHALL suportar TOTP (Time-based One-Time Password) como método MFA
4. WHEN MFA é configurado, THE Sistema SHALL gerar QR code para aplicativos autenticadores
5. THE Sistema SHALL validar códigos TOTP com tolerância de tempo apropriada
6. **CRITICAL**: THE Sistema SHALL ignorar configurações MFA do Cognito e usar apenas controle local

### Requirement 3: WebAuthn para Autenticação Avançada

**User Story:** Como usuário com alta necessidade de segurança, quero usar chaves de segurança WebAuthn, para que eu tenha autenticação sem senha.

#### Acceptance Criteria

1. WHEN um usuário registra WebAuthn, THE Sistema SHALL armazenar credenciais no banco local
2. WHEN um usuário possui WebAuthn registrado, THE Sistema SHALL exigir seu uso obrigatoriamente
3. THE Sistema SHALL suportar múltiplas chaves WebAuthn por usuário
4. WHEN WebAuthn falha, THE Sistema SHALL permitir fallback para MFA tradicional
5. THE Sistema SHALL usar domínio correto (evo.nuevacore.com) como rpId

### Requirement 4: Fluxos de Desafio do Cognito

**User Story:** Como usuário com status especial no Cognito, quero que o sistema trate desafios automaticamente, para que eu tenha experiência fluida.

#### Acceptance Criteria

1. WHEN Cognito retorna NEW_PASSWORD_REQUIRED, THE Sistema SHALL mostrar tela de nova senha
2. WHEN nova senha é definida, THE Sistema SHALL completar autenticação automaticamente
3. WHEN Cognito retorna SOFTWARE_TOKEN_MFA, THE Sistema SHALL tratar via controle local
4. THE Sistema SHALL mapear todos os tipos de desafio para fluxos apropriados
5. WHEN desafio é completado, THE Sistema SHALL prosseguir com autenticação normal

### Requirement 5: Gerenciamento de Sessão

**User Story:** Como desenvolvedor do sistema, quero gerenciamento robusto de sessões, para que usuários tenham experiência consistente.

#### Acceptance Criteria

1. THE Sistema SHALL armazenar sessões de forma segura no localStorage
2. WHEN usuário recarrega página, THE Sistema SHALL manter contexto de autenticação
3. THE Sistema SHALL validar sessões em todos os componentes protegidos
4. WHEN sessão expira, THE Sistema SHALL redirecionar para login automaticamente
5. THE Sistema SHALL limpar sessões completamente no logout

### Requirement 6: Isolamento por Organização

**User Story:** Como usuário de uma organização, quero acesso apenas aos dados da minha organização, para que haja isolamento completo de dados.

#### Acceptance Criteria

1. THE Sistema SHALL extrair organization_id do token JWT
2. WHEN usuário não tem organization_id, THE Sistema SHALL negar acesso
3. THE Sistema SHALL validar formato UUID do organization_id
4. WHEN organization_id é inválido, THE Sistema SHALL forçar logout
5. THE Sistema SHALL filtrar todas as queries por organization_id

### Requirement 7: Recuperação de Senha

**User Story:** Como usuário que esqueceu a senha, quero recuperá-la via email, para que eu possa voltar a acessar o sistema.

#### Acceptance Criteria

1. WHEN usuário solicita recuperação, THE Sistema SHALL enviar código via Cognito
2. THE Sistema SHALL validar código de recuperação
3. WHEN código é válido, THE Sistema SHALL permitir definir nova senha
4. THE Sistema SHALL aplicar políticas de senha na recuperação
5. WHEN recuperação é concluída, THE Sistema SHALL fazer login automaticamente

### Requirement 8: Políticas de Senha

**User Story:** Como administrador de segurança, quero políticas rígidas de senha, para que o sistema mantenha alta segurança.

#### Acceptance Criteria

1. THE Sistema SHALL exigir mínimo 8 caracteres
2. THE Sistema SHALL exigir pelo menos uma letra maiúscula
3. THE Sistema SHALL exigir pelo menos uma letra minúscula
4. THE Sistema SHALL exigir pelo menos um número
5. THE Sistema SHALL exigir pelo menos um caractere especial
6. THE Sistema SHALL mostrar validação em tempo real

### Requirement 9: Tratamento de Erros

**User Story:** Como usuário do sistema, quero mensagens de erro claras, para que eu entenda o que fazer em caso de problemas.

#### Acceptance Criteria

1. WHEN credenciais são inválidas, THE Sistema SHALL mostrar "Email ou senha incorretos"
2. WHEN conta não está confirmada, THE Sistema SHALL orientar verificação de email
3. WHEN há muitas tentativas, THE Sistema SHALL informar sobre bloqueio temporário
4. WHEN há erro de rede, THE Sistema SHALL sugerir tentar novamente
5. THE Sistema SHALL logar erros detalhados para debugging

### Requirement 10: Carregamento de Contexto

**User Story:** Como usuário logado, quero que meu contexto carregue rapidamente, para que eu tenha acesso imediato às funcionalidades.

#### Acceptance Criteria

1. THE Sistema SHALL carregar roles do usuário de forma síncrona
2. WHEN roles não estão disponíveis, THE Sistema SHALL usar padrão 'org_user'
3. THE Sistema SHALL mostrar loading states durante carregamento
4. WHEN contexto carrega, THE Sistema SHALL atualizar interface imediatamente
5. THE Sistema SHALL manter contexto consistente entre componentes

## Architecture Notes

### MFA Control Strategy
- **LOCAL CONTROL**: MFA é controlado via banco PostgreSQL, NÃO via AWS Cognito
- **Cognito MFA**: Configurado como "OPTIONAL" mas ignorado pelo sistema
- **Local MFA Table**: Armazena configurações, secrets TOTP, e status por usuário
- **Validation Flow**: Cognito auth → Local MFA check → TOTP validation → Access granted

### WebAuthn Integration
- **Storage**: Credenciais WebAuthn armazenadas no banco local
- **Enforcement**: Usuários com WebAuthn DEVEM usá-lo (não opcional)
- **rpId**: Sempre usar "evo.nuevacore.com" como Relying Party ID
- **Fallback**: Em caso de falha, permitir MFA tradicional

### Session Management
- **JWT Tokens**: Armazenados no localStorage com validação contínua
- **Organization ID**: Extraído do token e validado em formato UUID
- **Refresh Strategy**: Automático com retry exponencial
- **Security**: Tokens validados a cada requisição com revogação check

### Challenge Flows
- **NEW_PASSWORD_REQUIRED**: Tela automática de nova senha
- **SOFTWARE_TOKEN_MFA**: Redirecionado para controle local
- **Custom Challenges**: Mapeados para fluxos específicos
- **Error Handling**: Mensagens user-friendly para todos os casos