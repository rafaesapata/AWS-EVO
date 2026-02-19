# Plano de Implementação: Sandbox Environment Deployment

## Overview

Implementação incremental do ambiente sandbox, começando pela correção de código (domínios hardcoded), seguido por scripts de infraestrutura, e finalizando com verificação e documentação.

## Tasks

- [ ] 1. Corrigir domínios hardcoded no buildspec e SAM template
  - [ ] 1.1 Corrigir `cicd/buildspec-sam.yml` — bloco sandbox: alterar APP_DOMAIN para `evo.sandbox.nuevacore.com`, API_DOMAIN para `api.evo.sandbox.nuevacore.com`, AZURE_OAUTH_REDIRECT_URI para `https://evo.sandbox.nuevacore.com/azure/callback`
    - Alterar VITE_API_BASE_URL de `https://igyifo56v7.execute-api.us-east-1.amazonaws.com/prod` para `https://api.evo.sandbox.nuevacore.com`
    - Alterar VITE_CLOUDFRONT_DOMAIN de `evo.sandbox.nuevacore.com` (já correto, verificar)
    - Adicionar lógica de custom domain mapping no post_build para sandbox (similar à de produção)
    - _Requirements: 9.1, 9.2, 9.3, 9.4_
  - [ ] 1.2 Corrigir `sam/production-lambdas-only.yaml` — remover defaults hardcoded de AppDomain, ApiDomain e AzureOAuthRedirectUri (deixar Default vazio '')
    - Também corrigir em `sam/template.yaml` se necessário
    - _Requirements: 9.5_
  - [ ] 1.3 Atualizar `.env.development` — alterar VITE_API_BASE_URL para `https://api.evo.sandbox.nuevacore.com`
    - _Requirements: 9.3_

- [ ] 2. Criar script de configuração de SSM Parameters
  - [ ] 2.1 Criar `scripts/setup-sandbox-ssm.sh` que configura todos os parâmetros SSM necessários para o sandbox
    - Gerar TOKEN_ENCRYPTION_KEY exclusivo via `openssl rand -base64 32`
    - Configurar `/evo/sandbox/token-encryption-key` (SecureString)
    - Configurar `/evo/sandbox/azure-oauth-client-secret` (SecureString)
    - Configurar `/evo/sandbox/webauthn-rp-id` = `nuevacore.com` (String)
    - Configurar `/evo/sandbox/webauthn-rp-name` = `EVO Platform (Sandbox)` (String)
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [ ] 3. Criar script de dump/restore do banco de dados
  - [ ] 3.1 Criar `scripts/sandbox-db-restore.sh` que faz dump do banco de produção e restore no sandbox
    - Usar pg_dump com --no-owner --no-privileges para compatibilidade
    - Conectar ao RDS de produção via bastion (SSH tunnel)
    - Restore no RDS do sandbox (acesso público)
    - Incluir tratamento de erro e logging
    - Documentar pré-requisitos (acesso SSH ao bastion, credenciais)
    - _Requirements: 2.2, 2.7_

- [ ] 4. Checkpoint — Verificar correções de código
  - Ensure all tests pass, ask the user if questions arise.
  - Verificar que `npm run build --prefix backend` e `npm run build` passam
  - Verificar que o buildspec tem os domínios corretos no bloco sandbox

- [ ] 5. Criar script de setup do API Gateway Custom Domain
  - [ ] 5.1 Criar `scripts/setup-sandbox-api-domain.sh` que configura o custom domain no API Gateway do sandbox
    - Criar custom domain `api.evo.sandbox.nuevacore.com` no API Gateway
    - Usar certificado wildcard existente (buscar ARN via AWS CLI)
    - Criar base path mapping para o API Gateway HTTP API
    - Criar registro DNS no Route53 (ALIAS para o endpoint regional)
    - _Requirements: 4.3, 4.4, 4.5_

- [ ] 6. Criar script de setup do CloudFront Custom Domain
  - [ ] 6.1 Criar `scripts/setup-sandbox-cloudfront.sh` que configura o alias no CloudFront do sandbox
    - Atualizar distribuição CloudFront `E93EL7AJZ6QAQ` com alias `evo.sandbox.nuevacore.com`
    - Associar certificado wildcard existente
    - Criar registro DNS no Route53 (ALIAS para CloudFront)
    - _Requirements: 5.3, 5.5_

- [ ] 7. Criar script de deploy do CI/CD Pipeline
  - [ ] 7.1 Criar `scripts/setup-sandbox-pipeline.sh` que deploya o CodePipeline para sandbox
    - Usar template `cicd/cloudformation/sam-pipeline-stack.yaml`
    - Configurar para branch `sandbox`
    - Buscar GitHub Connection ARN existente via AWS CLI
    - Deploy via `aws cloudformation deploy`
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

- [ ] 8. Criar script de verificação do ambiente
  - [ ] 8.1 Criar `scripts/verify-sandbox.sh` que valida o ambiente completo
    - Listar todas as Lambdas com prefixo `evo-uds-v3-sandbox-*` e verificar estado Active
    - Verificar arquitetura ARM64 em todas as Lambdas
    - Verificar VPC config (subnets e SG) em todas as Lambdas
    - Verificar que nenhuma env var contém domínio de produção sem prefixo sandbox
    - Fazer HTTP GET em `https://api.evo.sandbox.nuevacore.com/api/functions/health-check`
    - Fazer HTTP GET em `https://evo.sandbox.nuevacore.com`
    - Testar conexão ao RDS do sandbox
    - Verificar SSM parameters existem
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6_
  - [ ]* 8.2 Criar property test para verificar Lambdas do sandbox
    - **Property 1: Todas as Lambdas Active e ARM64**
    - **Property 2: Todas as Lambdas na VPC correta**
    - **Property 3: Nenhuma Lambda referencia domínios de produção**
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.6, 9.1, 10.1**

- [ ] 9. Atualizar documentação steering
  - [ ] 9.1 Atualizar `.kiro/steering/infrastructure.md` com informações completas do sandbox
    - Adicionar todos os resource IDs (VPC, Subnets, SGs, Cognito, CloudFront, RDS)
    - Documentar DATABASE_URL do sandbox
    - Documentar domínios e SSM parameters
    - Documentar diferenças de configuração sandbox vs produção
    - Documentar processo de dump/restore
    - _Requirements: 11.1, 11.2, 11.3, 11.4_

- [ ] 10. Criar script master de setup completo
  - [ ] 10.1 Criar `scripts/setup-sandbox-complete.sh` que orquestra todos os scripts na ordem correta
    - 1. Setup SSM Parameters
    - 2. Setup API Gateway Custom Domain
    - 3. Setup CloudFront Custom Domain
    - 4. Setup CI/CD Pipeline
    - 5. Database dump/restore (com confirmação)
    - 6. Verificação do ambiente
    - Incluir flags para executar steps individuais (--skip-db, --verify-only, etc.)
    - _Requirements: 1-12 (todos)_

- [ ] 11. Final checkpoint — Verificação completa
  - Ensure all tests pass, ask the user if questions arise.
  - Executar `scripts/verify-sandbox.sh` e confirmar que tudo está verde
  - Verificar que o pipeline CI/CD está funcional (fazer push de teste na branch sandbox)

## Notes

- Tasks marcadas com `*` são opcionais e podem ser puladas para MVP mais rápido
- Cada task referencia requisitos específicos para rastreabilidade
- Os scripts são idempotentes (podem ser executados múltiplas vezes sem efeitos colaterais)
- A ordem de execução é importante: SSM → Custom Domains → Pipeline → DB → Verificação
- O buildspec e SAM template são compartilhados entre ambientes, então as correções beneficiam ambos
