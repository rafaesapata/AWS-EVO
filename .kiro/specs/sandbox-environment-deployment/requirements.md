# Documento de Requisitos — Sandbox Environment Deployment

## Introdução

Provisionamento completo de um ambiente SANDBOX na conta AWS `971354623291` (profile `EVO_SANDBOX`) que replique fielmente o ambiente de PRODUÇÃO (`523115032346`). O objetivo é ter um ambiente funcional para testes com custo controlado, usando a branch `sandbox` do GitHub para CI/CD, com domínios `evo.sandbox.nuevacore.com` e `api.evo.sandbox.nuevacore.com`.

## Glossário

- **Sandbox**: Ambiente AWS na conta `971354623291` usado para testes e desenvolvimento
- **Produção**: Ambiente AWS na conta `523115032346` com dados e tráfego real
- **SAM_Template**: Arquivo `sam/production-lambdas-only.yaml` que define as 194 Lambda functions
- **Buildspec**: Arquivo `cicd/buildspec-sam.yml` que orquestra build e deploy via CodeBuild
- **Pipeline_Stack**: CloudFormation stack `cicd/cloudformation/sam-pipeline-stack.yaml` que define CodePipeline + CodeBuild
- **SSM_Parameters**: Parâmetros no AWS Systems Manager Parameter Store sob o path `/evo/sandbox/`
- **Bastion**: Servidor EC2 com acesso à VPC de produção para operações de banco de dados
- **Custom_Domain**: Domínio personalizado mapeado ao API Gateway via Route53 + ACM
- **Lambda_Function**: Função serverless AWS Lambda com runtime Node.js 18.x e arquitetura ARM64
- **VPC**: Virtual Private Cloud que isola a rede do ambiente sandbox
- **RDS**: Instância de banco de dados PostgreSQL gerenciada pela AWS
- **Cognito_Pool**: AWS Cognito User Pool para autenticação e autorização de usuários
- **CloudFront_Distribution**: CDN da AWS para servir o frontend com baixa latência
- **API_Gateway**: AWS API Gateway HTTP API que roteia requisições para as Lambda functions
- **NAT_Gateway**: Componente de rede que permite acesso à internet a partir de subnets privadas

## Requisitos

### Requirement 1: Infraestrutura de Rede (VPC)

**User Story:** Como engenheiro de infraestrutura, quero uma VPC no sandbox idêntica à de produção, para que as Lambda functions e o RDS funcionem com a mesma topologia de rede.

#### Acceptance Criteria

1. THE Sandbox SHALL possuir uma VPC com 2 subnets públicas e 2 subnets privadas em zonas de disponibilidade distintas
2. THE Sandbox SHALL possuir um NAT_Gateway em uma subnet pública para permitir acesso à internet pelas Lambda functions nas subnets privadas
3. THE Sandbox SHALL possuir VPC Endpoints para S3 nas route tables privadas
4. THE Sandbox SHALL possuir um Security Group para Lambda functions com egress irrestrito (0.0.0.0/0)
5. THE Sandbox SHALL possuir um Security Group para RDS que permita conexões PostgreSQL (porta 5432) a partir do Security Group das Lambda functions e de IPs públicos autorizados

### Requirement 2: Banco de Dados PostgreSQL (RDS)

**User Story:** Como engenheiro de infraestrutura, quero um banco de dados PostgreSQL no sandbox com dados reais de produção, para que os testes reflitam cenários reais.

#### Acceptance Criteria

1. THE Sandbox SHALL possuir uma instância RDS PostgreSQL 15.x com instance class `db.t3.micro`
2. THE Sandbox SHALL ter o banco de dados populado via dump completo (pg_dump/pg_restore) do banco de Produção, gerado através do Bastion
3. THE Sandbox SHALL configurar o RDS com acesso público habilitado (PubliclyAccessible=true) para facilitar testes diretos
4. THE Sandbox SHALL configurar o RDS com MultiAZ desabilitado
5. THE Sandbox SHALL configurar backup automático com retenção de 7 dias
6. THE Sandbox SHALL configurar storage type gp3 com allocated storage de 20GB e auto-scaling até 100GB
7. IF o dump de Produção falhar, THEN o Sandbox SHALL reportar o erro com detalhes e permitir retry manual

### Requirement 3: Autenticação (Cognito)

**User Story:** Como engenheiro de infraestrutura, quero um Cognito_Pool no sandbox configurado identicamente ao de produção, para que autenticação e autorização funcionem da mesma forma.

#### Acceptance Criteria

1. THE Sandbox SHALL possuir um Cognito_Pool com os mesmos atributos customizados de Produção (organization_id, organization_name, roles, tenant_id)
2. THE Sandbox SHALL possuir um User Pool Client com os mesmos ExplicitAuthFlows de Produção (USER_SRP_AUTH, REFRESH_TOKEN_AUTH, USER_PASSWORD_AUTH, ADMIN_USER_PASSWORD_AUTH)
3. THE Sandbox SHALL configurar MFA como OPTIONAL com SOFTWARE_TOKEN_MFA habilitado
4. THE Sandbox SHALL possuir um Identity Pool vinculado ao Cognito_Pool com roles autenticadas e não-autenticadas
5. THE Sandbox SHALL possuir grupos admin e user no Cognito_Pool

### Requirement 4: API Gateway e Custom Domain

**User Story:** Como engenheiro de infraestrutura, quero o API_Gateway do sandbox configurado com custom domain, para que a API seja acessível via `api.evo.sandbox.nuevacore.com`.

#### Acceptance Criteria

1. THE Sandbox SHALL possuir um API_Gateway HTTP API com JWT Authorizer vinculado ao Cognito_Pool do sandbox
2. THE Sandbox SHALL configurar CORS no API_Gateway com os headers: Content-Type, Authorization, X-Requested-With, X-API-Key, X-Request-ID, X-CSRF-Token, X-Correlation-ID, X-Amz-Date, X-Amz-Security-Token, X-Impersonate-Organization
3. THE Sandbox SHALL possuir um Custom_Domain `api.evo.sandbox.nuevacore.com` mapeado ao API_Gateway usando certificado wildcard existente
4. THE Sandbox SHALL configurar um registro DNS (Route53 ALIAS) apontando `api.evo.sandbox.nuevacore.com` para o endpoint regional do API_Gateway
5. WHEN o SAM deploy criar um novo API_Gateway ID, THEN o Buildspec SHALL atualizar o mapeamento do Custom_Domain automaticamente

### Requirement 5: Frontend (S3 + CloudFront)

**User Story:** Como engenheiro de infraestrutura, quero o frontend do sandbox servido via CloudFront com custom domain, para que seja acessível via `evo.sandbox.nuevacore.com`.

#### Acceptance Criteria

1. THE Sandbox SHALL possuir um bucket S3 para frontend com nome `evo-uds-v3-sandbox-frontend-971354623291`
2. THE Sandbox SHALL possuir uma CloudFront_Distribution com OAI apontando para o bucket S3
3. THE Sandbox SHALL configurar a CloudFront_Distribution com alias `evo.sandbox.nuevacore.com` usando certificado wildcard existente
4. THE Sandbox SHALL configurar custom error responses (404→index.html, 403→index.html) para suportar SPA routing
5. THE Sandbox SHALL configurar um registro DNS apontando `evo.sandbox.nuevacore.com` para a CloudFront_Distribution

### Requirement 6: Lambda Functions e SAM Deploy

**User Story:** Como engenheiro de infraestrutura, quero todas as 194 Lambda functions deployadas no sandbox com as mesmas configurações de produção, para que a funcionalidade seja idêntica.

#### Acceptance Criteria

1. THE Sandbox SHALL deployar todas as 194 Lambda functions usando o SAM_Template com Environment=sandbox
2. THE Sandbox SHALL configurar todas as Lambda functions com arquitetura ARM64 e esbuild bundling
3. THE Sandbox SHALL configurar todas as Lambda functions na VPC do sandbox (subnets privadas + security group)
4. THE Sandbox SHALL criar uma Lambda Layer com Prisma Client e zod compatível com ARM64
5. THE Sandbox SHALL configurar a IAM Role das Lambda functions com as mesmas permissões de Produção (Cognito, S3, SES, STS, CloudWatch)
6. THE Sandbox SHALL passar todos os parâmetros de ambiente corretos (DATABASE_URL, COGNITO_USER_POOL_ID, COGNITO_CLIENT_ID, APP_DOMAIN, API_DOMAIN) com valores específicos do sandbox

### Requirement 7: Parâmetros e Secrets (SSM + Secrets Manager)

**User Story:** Como engenheiro de infraestrutura, quero todos os parâmetros e secrets configurados no sandbox, para que as Lambda functions funcionem sem erros de configuração.

#### Acceptance Criteria

1. THE Sandbox SHALL possuir SSM_Parameters sob `/evo/sandbox/` para: token-encryption-key, azure-oauth-client-secret, webauthn-rp-id, webauthn-rp-name
2. THE Sandbox SHALL gerar um TOKEN_ENCRYPTION_KEY exclusivo para o sandbox (diferente do de Produção)
3. THE Sandbox SHALL configurar WEBAUTHN_RP_ID como `nuevacore.com` (domínio registrável compartilhado)
4. THE Sandbox SHALL configurar APP_DOMAIN como `evo.sandbox.nuevacore.com` e API_DOMAIN como `api.evo.sandbox.nuevacore.com`
5. THE Sandbox SHALL configurar AZURE_OAUTH_REDIRECT_URI como `https://evo.sandbox.nuevacore.com/azure/callback`

### Requirement 8: CI/CD Pipeline

**User Story:** Como engenheiro de infraestrutura, quero um pipeline CI/CD no sandbox acionado pela branch `sandbox`, para que deploys sejam automáticos via push.

#### Acceptance Criteria

1. THE Sandbox SHALL possuir um CodePipeline conectado ao repositório GitHub `rafaesapata/AWS-EVO` na branch `sandbox`
2. THE Sandbox SHALL possuir um CodeBuild project usando ARM container (amazonlinux2-aarch64-standard:3.0) com compute BUILD_GENERAL1_LARGE
3. THE Sandbox SHALL usar o Buildspec `cicd/buildspec-sam.yml` com ENVIRONMENT=sandbox
4. THE Sandbox SHALL possuir um S3 bucket `evo-sam-artifacts-971354623291` para artefatos SAM
5. THE Sandbox SHALL possuir uma GitHub Connection (CodeStar/CodeConnections) autorizada para o repositório
6. WHEN um push é feito na branch `sandbox`, THEN o Pipeline_Stack SHALL iniciar automaticamente o build e deploy

### Requirement 9: Correção de Domínios Hardcoded

**User Story:** Como desenvolvedor, quero que o Buildspec e variáveis de ambiente usem domínios corretos para sandbox, para que não haja referências cruzadas com Produção.

#### Acceptance Criteria

1. WHILE ENVIRONMENT=sandbox, THE Buildspec SHALL configurar APP_DOMAIN como `evo.sandbox.nuevacore.com` e API_DOMAIN como `api.evo.sandbox.nuevacore.com`
2. WHILE ENVIRONMENT=sandbox, THE Buildspec SHALL configurar AZURE_OAUTH_REDIRECT_URI como `https://evo.sandbox.nuevacore.com/azure/callback`
3. WHILE ENVIRONMENT=sandbox, THE Buildspec SHALL configurar VITE_API_BASE_URL como `https://api.evo.sandbox.nuevacore.com`
4. WHILE ENVIRONMENT=sandbox, THE Buildspec SHALL configurar VITE_CLOUDFRONT_DOMAIN como `evo.sandbox.nuevacore.com`
5. THE SAM_Template SHALL usar valores parametrizados para AppDomain e ApiDomain sem defaults hardcoded para Produção

### Requirement 10: Verificação e Validação do Ambiente

**User Story:** Como engenheiro de infraestrutura, quero um checklist de verificação completo, para garantir que o sandbox está 100% funcional antes de declarar pronto.

#### Acceptance Criteria

1. WHEN o deploy completa, THEN o Sandbox SHALL verificar que todas as 194 Lambda functions estão no estado Active
2. WHEN o deploy completa, THEN o Sandbox SHALL verificar que o API_Gateway responde em `https://api.evo.sandbox.nuevacore.com`
3. WHEN o deploy completa, THEN o Sandbox SHALL verificar que o frontend carrega em `https://evo.sandbox.nuevacore.com`
4. WHEN o deploy completa, THEN o Sandbox SHALL verificar que o RDS aceita conexões e contém dados
5. WHEN o deploy completa, THEN o Sandbox SHALL verificar que o Cognito_Pool aceita autenticação com credenciais válidas
6. WHEN o deploy completa, THEN o Sandbox SHALL verificar que o endpoint health check retorna status HTTP 200

### Requirement 11: Documentação Steering

**User Story:** Como desenvolvedor, quero documentação steering atualizada com todos os detalhes do sandbox, para que nenhuma informação de configuração se perca.

#### Acceptance Criteria

1. THE Sandbox SHALL atualizar o arquivo `.kiro/steering/infrastructure.md` com todos os resource IDs do sandbox (VPC, Subnets, Security Groups, Cognito_Pool, CloudFront_Distribution, RDS endpoint)
2. THE Sandbox SHALL documentar os domínios do sandbox, DATABASE_URL, e SSM_Parameters
3. THE Sandbox SHALL documentar o processo de dump/restore do banco de dados para referência futura
4. THE Sandbox SHALL documentar as diferenças de configuração entre sandbox e Produção (instance sizes, MultiAZ)

### Requirement 12: Controle de Custos

**User Story:** Como administrador, quero que o sandbox tenha custos minimizados, para que o ambiente de testes não gere gastos desnecessários.

#### Acceptance Criteria

1. THE Sandbox SHALL usar instância RDS `db.t3.micro` (em vez de `db.t3.medium` de Produção)
2. THE Sandbox SHALL desabilitar MultiAZ no RDS
3. THE Sandbox SHALL usar apenas 1 NAT_Gateway (em vez de 2)
4. THE Sandbox SHALL usar retenção padrão de 7 dias para Performance Insights do RDS
5. THE Sandbox SHALL configurar CloudFront_Distribution com PriceClass_100 (apenas América do Norte e Europa)
6. THE Sandbox SHALL desabilitar WAF e CloudTrail detalhado
