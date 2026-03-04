# Documento de Requisitos — Sandbox Environment Setup

## Introdução

Este documento define os requisitos para duas frentes complementares:

1. **Atualização dos documentos steering** (`deployment-rules.md` e `infrastructure.md`) para incorporar o uso de AWS SSO (`aws sso login --profile EVO_SANDBOX`) como método padrão de acesso e deploy no ambiente sandbox.

2. **Garantia de paridade perfeita** entre sandbox (`971354623291`) e produção (`523115032346`), assegurando que todos os componentes de infraestrutura, configurações, Lambda functions, schema de banco, SSM parameters, API Gateway, CloudFront, Cognito, etc. sejam idênticos — com exceção apenas das diferenças esperadas por ambiente (account IDs, endpoints, domínios, e otimizações de custo documentadas).

O ambiente sandbox já está provisionado (VPC, RDS, Cognito, CloudFront, API Gateway, Pipeline, Lambda Layer). Este spec foca em validar a paridade, corrigir divergências, e documentar o acesso via SSO nos steering docs.

## Glossário

- **Steering_Doc**: Arquivo de orientação em `.kiro/steering/` que guia o desenvolvimento e operações do projeto
- **AWS_SSO**: AWS IAM Identity Center (antigo AWS SSO), usado para autenticação federada via `aws sso login`
- **Profile_EVO_SANDBOX**: Profile AWS CLI configurado para acessar a conta `971354623291` via SSO
- **Profile_EVO_PRODUCTION**: Profile AWS CLI configurado para acessar a conta `523115032346` via SSO
- **Paridade**: Estado em que sandbox e produção possuem componentes e configurações funcionalmente idênticos
- **SAM_Template**: Arquivo `sam/production-lambdas-only.yaml` compartilhado entre ambos os ambientes
- **Buildspec**: Arquivo `cicd/buildspec-sam.yml` com lógica condicional por ENVIRONMENT
- **SSM_Parameters**: Parâmetros no AWS Systems Manager Parameter Store sob `/evo/sandbox/` ou `/evo/production/`
- **Lambda_Function**: Função serverless AWS Lambda com runtime Node.js 24.x e arquitetura ARM64
- **Sandbox**: Ambiente AWS na conta `971354623291`, branch `sandbox`
- **Produção**: Ambiente AWS na conta `523115032346`, branch `production`
- **Diferenças_Esperadas**: Variações intencionais entre sandbox e produção para controle de custo (RDS instance size, MultiAZ, NAT Gateways, CloudFront PriceClass, WAF, CloudTrail)

## Requisitos

### Requirement 1: Documentação de Acesso via AWS SSO no Steering

**User Story:** Como desenvolvedor, quero que os steering docs documentem o uso de AWS SSO para acessar o sandbox, para que qualquer membro da equipe saiba como autenticar e operar no ambiente.

#### Acceptance Criteria

1. THE Steering_Doc `deployment-rules.md` SHALL incluir uma seção de acesso via AWS SSO com os comandos `aws sso login --profile EVO_SANDBOX` e `aws sso login --profile EVO_PRODUCTION`
2. THE Steering_Doc `deployment-rules.md` SHALL documentar que o Profile_EVO_SANDBOX é obrigatório para operações locais no sandbox (scripts, SAM deploy local, verificações)
3. THE Steering_Doc `deployment-rules.md` SHALL documentar que o CI/CD pipeline usa IAM Role própria e não depende de SSO para deploy automático
4. THE Steering_Doc `infrastructure.md` SHALL incluir uma seção de configuração do AWS SSO com exemplo de `~/.aws/config` para ambos os profiles (EVO_SANDBOX e EVO_PRODUCTION)
5. THE Steering_Doc `infrastructure.md` SHALL documentar o comando de verificação de sessão SSO ativa (`aws sts get-caller-identity --profile EVO_SANDBOX`)

### Requirement 2: Atualização do Steering deployment-rules.md

**User Story:** Como desenvolvedor, quero que o deployment-rules.md reflita a existência do sandbox como ambiente de deploy equivalente, para que as regras de deploy cubram ambos os ambientes.

#### Acceptance Criteria

1. THE Steering_Doc `deployment-rules.md` SHALL documentar que operações manuais de verificação e scripts de setup requerem sessão SSO ativa no profile correspondente
2. THE Steering_Doc `deployment-rules.md` SHALL incluir na tabela de troubleshooting o erro "ExpiredTokenException" com causa "Sessão SSO expirada" e solução "Executar `aws sso login --profile EVO_SANDBOX`"
3. THE Steering_Doc `deployment-rules.md` SHALL documentar que o `sam deploy` local para sandbox usa `--config-env sandbox` e requer Profile_EVO_SANDBOX ativo
4. THE Steering_Doc `deployment-rules.md` SHALL documentar que scripts em `scripts/setup-sandbox-*.sh` e `scripts/verify-sandbox.sh` requerem `--profile EVO_SANDBOX` ou `AWS_PROFILE=EVO_SANDBOX`

### Requirement 3: Atualização do Steering infrastructure.md

**User Story:** Como desenvolvedor, quero que o infrastructure.md contenha todas as informações necessárias para operar o sandbox via SSO, para que seja a referência única e completa do ambiente.

#### Acceptance Criteria

1. THE Steering_Doc `infrastructure.md` SHALL incluir uma seção "Acesso via AWS SSO" com instruções de login, verificação de sessão, e configuração de profile
2. THE Steering_Doc `infrastructure.md` SHALL documentar o exemplo completo de `~/.aws/config` com os blocos `[profile EVO_SANDBOX]` e `[profile EVO_PRODUCTION]` incluindo sso_start_url, sso_region, sso_account_id, sso_role_name, e region
3. THE Steering_Doc `infrastructure.md` SHALL documentar que todos os scripts de setup do sandbox aceitam o parâmetro `--profile` ou usam a variável `AWS_PROFILE`
4. THE Steering_Doc `infrastructure.md` SHALL manter a tabela de Resource IDs do sandbox atualizada com todos os valores atuais

### Requirement 4: Paridade de Lambda Functions

**User Story:** Como engenheiro de infraestrutura, quero garantir que todas as 194 Lambda functions do sandbox sejam idênticas às de produção, para que o comportamento funcional seja o mesmo.

#### Acceptance Criteria

1. THE Sandbox SHALL possuir exatamente as mesmas 194 Lambda_Function definidas no SAM_Template que a Produção
2. THE Sandbox SHALL configurar todas as Lambda_Function com a mesma arquitetura ARM64, runtime Node.js 18.x, e esbuild bundling de Produção
3. THE Sandbox SHALL configurar todas as Lambda_Function com os mesmos timeout, memory, e environment variables de Produção (substituindo apenas valores específicos de ambiente: DATABASE_URL, COGNITO_USER_POOL_ID, COGNITO_CLIENT_ID, APP_DOMAIN, API_DOMAIN)
4. THE Sandbox SHALL configurar todas as Lambda_Function na VPC do sandbox com as mesmas subnets privadas e security groups equivalentes
5. THE Sandbox SHALL possuir uma Lambda Layer com as mesmas dependências e versão de Prisma Client de Produção
6. IF uma Lambda_Function existir em Produção e não existir no Sandbox, THEN o sistema de verificação SHALL reportar a divergência com o nome da função ausente

### Requirement 5: Paridade de API Gateway

**User Story:** Como engenheiro de infraestrutura, quero que o API Gateway do sandbox tenha exatamente as mesmas rotas e configurações de produção, para que todas as APIs funcionem identicamente.

#### Acceptance Criteria

1. THE Sandbox SHALL possuir todas as mesmas rotas HTTP (paths e methods) no API_Gateway que a Produção
2. THE Sandbox SHALL configurar o JWT Authorizer com os mesmos parâmetros (issuer, audience) apontando para o Cognito_Pool do sandbox
3. THE Sandbox SHALL configurar CORS com exatamente os mesmos headers permitidos de Produção
4. THE Sandbox SHALL possuir o Custom_Domain `api.evo.sandbox.nuevacore.com` mapeado ao API_Gateway com certificado ACM válido
5. WHEN o SAM deploy atualizar o API_Gateway ID, THEN o Buildspec SHALL atualizar o mapeamento do Custom_Domain automaticamente

### Requirement 6: Paridade de Cognito

**User Story:** Como engenheiro de infraestrutura, quero que o Cognito do sandbox tenha a mesma configuração de produção, para que autenticação e autorização funcionem identicamente.

#### Acceptance Criteria

1. THE Sandbox SHALL possuir um Cognito_Pool com os mesmos atributos customizados de Produção (organization_id, organization_name, roles, tenant_id)
2. THE Sandbox SHALL possuir um User Pool Client com os mesmos ExplicitAuthFlows de Produção
3. THE Sandbox SHALL configurar MFA como OPTIONAL com SOFTWARE_TOKEN_MFA habilitado, idêntico a Produção
4. THE Sandbox SHALL possuir os mesmos grupos (admin, user) no Cognito_Pool que Produção
5. THE Sandbox SHALL possuir um Identity Pool vinculado ao Cognito_Pool com roles equivalentes às de Produção

### Requirement 7: Paridade de SSM Parameters e Variáveis de Ambiente

**User Story:** Como engenheiro de infraestrutura, quero que todos os SSM parameters e variáveis de ambiente do sandbox espelhem os de produção, para que nenhuma Lambda falhe por configuração ausente.

#### Acceptance Criteria

1. THE Sandbox SHALL possuir todos os SSM_Parameters sob `/evo/sandbox/` equivalentes aos existentes sob `/evo/production/`
2. THE Sandbox SHALL gerar valores exclusivos para secrets (token-encryption-key) diferentes dos de Produção
3. THE Sandbox SHALL configurar todas as variáveis de ambiente das Lambda functions com valores equivalentes aos de Produção, substituindo apenas domínios e endpoints específicos do sandbox
4. IF um SSM_Parameter existir em Produção sob `/evo/production/` e não existir no Sandbox sob `/evo/sandbox/`, THEN o sistema de verificação SHALL reportar o parâmetro ausente
5. THE Sandbox SHALL configurar WEBAUTHN_RP_ID como `nuevacore.com` (mesmo valor de Produção, pois é o domínio registrável compartilhado)

### Requirement 8: Paridade de CloudFront e Frontend

**User Story:** Como engenheiro de infraestrutura, quero que o frontend do sandbox seja servido com a mesma configuração de CloudFront de produção, para que a experiência do usuário seja idêntica.

#### Acceptance Criteria

1. THE Sandbox SHALL possuir uma CloudFront_Distribution com as mesmas configurações de cache behavior de Produção
2. THE Sandbox SHALL configurar os mesmos custom error responses (404→index.html, 403→index.html) de Produção
3. THE Sandbox SHALL configurar o alias `evo.sandbox.nuevacore.com` com certificado ACM válido
4. THE Sandbox SHALL possuir o bucket S3 frontend com a mesma política de OAI de Produção
5. THE Sandbox SHALL configurar as variáveis VITE_* no build do frontend com valores específicos do sandbox (VITE_API_BASE_URL, VITE_CLOUDFRONT_DOMAIN)

### Requirement 9: Paridade de CI/CD Pipeline

**User Story:** Como engenheiro de infraestrutura, quero que o pipeline CI/CD do sandbox execute exatamente os mesmos passos de produção, para que o processo de deploy seja idêntico.

#### Acceptance Criteria

1. THE Sandbox SHALL possuir um CodePipeline com a mesma estrutura de stages de Produção (Source → Build → Deploy)
2. THE Sandbox SHALL possuir um CodeBuild project com o mesmo buildspec, compute type (BUILD_GENERAL1_LARGE), e ARM container de Produção
3. THE Sandbox SHALL usar o mesmo SAM_Template (`sam/production-lambdas-only.yaml`) de Produção com parâmetro Environment=sandbox
4. THE Sandbox SHALL executar a mesma validação de imports (`scripts/validate-lambda-imports.ts`) no pre_build de Produção
5. WHEN um push é feito na branch `sandbox`, THEN o Pipeline SHALL executar o mesmo fluxo completo de build e deploy que Produção executa na branch `production`

### Requirement 10: Paridade de Database Schema

**User Story:** Como engenheiro de infraestrutura, quero que o schema do banco de dados do sandbox seja idêntico ao de produção, para que todas as queries e migrations funcionem da mesma forma.

#### Acceptance Criteria

1. THE Sandbox SHALL possuir o mesmo schema PostgreSQL de Produção (todas as tabelas, colunas, índices, constraints, e triggers)
2. THE Sandbox SHALL executar as mesmas Prisma migrations de Produção
3. WHEN uma nova migration é criada em Produção, THEN o Sandbox SHALL receber a mesma migration no próximo deploy
4. THE Sandbox SHALL possuir dados restaurados de Produção via dump/restore para garantir que cenários reais são testáveis
5. IF o schema do Sandbox divergir do de Produção, THEN o processo de verificação SHALL reportar as diferenças encontradas

### Requirement 11: Script de Verificação de Paridade

**User Story:** Como engenheiro de infraestrutura, quero um script que compare sandbox e produção automaticamente, para que divergências sejam detectadas antes de causar problemas.

#### Acceptance Criteria

1. THE script `scripts/verify-sandbox.sh` SHALL comparar o número de Lambda functions entre Sandbox e Produção
2. THE script `scripts/verify-sandbox.sh` SHALL comparar as rotas do API_Gateway entre Sandbox e Produção
3. THE script `scripts/verify-sandbox.sh` SHALL verificar que todos os SSM_Parameters de Produção possuem equivalentes no Sandbox
4. THE script `scripts/verify-sandbox.sh` SHALL verificar que o schema do banco de dados do Sandbox é idêntico ao de Produção
5. THE script `scripts/verify-sandbox.sh` SHALL gerar um relatório com status PASS/FAIL para cada verificação
6. THE script `scripts/verify-sandbox.sh` SHALL requerer sessão SSO ativa em ambos os profiles (EVO_SANDBOX e EVO_PRODUCTION) para executar a comparação

### Requirement 12: Diferenças Esperadas Documentadas

**User Story:** Como desenvolvedor, quero que as diferenças intencionais entre sandbox e produção estejam claramente documentadas, para que ninguém tente "corrigir" uma diferença que é proposital.

#### Acceptance Criteria

1. THE Steering_Doc `infrastructure.md` SHALL manter a tabela de Diferenças_Esperadas atualizada com todas as variações intencionais entre Sandbox e Produção
2. THE Steering_Doc `infrastructure.md` SHALL documentar a justificativa de custo para cada Diferença_Esperada (RDS instance size, MultiAZ, NAT Gateways, CloudFront PriceClass, WAF, CloudTrail)
3. THE script `scripts/verify-sandbox.sh` SHALL ignorar as Diferenças_Esperadas documentadas ao comparar os ambientes
4. IF uma nova diferença intencional for introduzida, THEN o Steering_Doc `infrastructure.md` SHALL ser atualizado com a nova entrada na tabela de Diferenças_Esperadas
