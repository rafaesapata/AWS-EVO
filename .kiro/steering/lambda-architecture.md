# Lambda Architecture - ARM64 + esbuild

## ⚠️ REGRAS OBRIGATÓRIAS

1. **TODAS as Lambdas DEVEM usar arquitetura `arm64`** (AWS Graviton2)
2. **TODAS as Lambdas DEVEM usar `esbuild`** para bundling (não NodejsNpmBuilder)

---

## ARM64 (Graviton2)

### Benefícios
- **~20% mais barato** que x86_64
- **Melhor performance** para workloads Node.js
- **Menor consumo de energia** (sustentabilidade)

### Configuração SAM/CloudFormation

```yaml
Globals:
  Function:
    Architectures:
      - arm64
```

### Configuração de Layer

```yaml
DependenciesLayer:
  Type: AWS::Serverless::LayerVersion
  Properties:
    CompatibleArchitectures:
      - arm64
  Metadata:
    BuildArchitecture: arm64
```

---

## esbuild para Bundling

### Benefícios
- **Build ~10x mais rápido** que NodejsNpmBuilder
- **Bundling direto de TypeScript** sem npm install por função
- **Minificação automática** para bundles menores
- **Tree-shaking** remove código não utilizado

### Configuração SAM (Metadata)

```yaml
MyFunction:
  Type: AWS::Serverless::Function
  Properties:
    CodeUri: backend/src/handlers/category/
    Handler: handler-name.handler
  Metadata:
    BuildMethod: esbuild
    BuildProperties:
      Minify: true
      Target: es2022
      Sourcemap: false
      EntryPoints:
        - handler-name.ts
      External:
        - '@prisma/client'
        - '.prisma/client'
        - '@aws-sdk/*'
```

### External Dependencies
Pacotes no `External` são excluídos do bundle e carregados da Layer ou do runtime:
- `@prisma/client` - Prisma Client (na layer)
- `.prisma/client` - Prisma Engine binaries (na layer)
- `@aws-sdk/*` - AWS SDK v3 (excluído do bundle, resolvido pelo SAM build)

### ⚠️ IMPORTANTE: Deploy FULL_SAM vs INCREMENTAL

O `@aws-sdk/*` no External funciona corretamente APENAS quando o deploy é feito via **FULL_SAM** (esbuild bundling pelo SAM). O SAM resolve as dependências externas corretamente.

Quando o deploy é **INCREMENTAL** (copia .js compilados sem esbuild), os pacotes `@aws-sdk/*` NÃO são incluídos no ZIP e o Node.js 20.x runtime NÃO os fornece nativamente. Isso causa `Runtime.ImportModuleError: Cannot find module '@aws-sdk/client-*'`.

**Como identificar o problema:**
- Lambda com CodeSize pequeno (~40KB) = deploy incremental (quebrado se usa AWS SDK)
- Lambda com CodeSize grande (~1-2MB) = deploy via SAM/esbuild (correto)

**Como corrigir:**
Forçar FULL_SAM deploy alterando o `sam/production-lambdas-only.yaml` (ex: bump da Description) junto com a mudança no handler. Isso garante que o CI/CD use SAM build com esbuild.

---

## ⛔ NUNCA USAR

```yaml
# ❌ ERRADO - x86_64 é mais caro
Architectures:
  - x86_64

# ❌ ERRADO - NodejsNpmBuilder é muito lento (npm install por função)
Metadata:
  BuildMethod: nodejs18.x
```

---

## Compatibilidade

- ✅ Node.js 18.x/20.x - totalmente compatível
- ✅ Prisma - binários ARM64 disponíveis
- ✅ AWS SDK - totalmente compatível
- ✅ Azure SDK - totalmente compatível
- ✅ esbuild - suporte nativo a TypeScript

## Prisma em ARM64

O Prisma gera binários específicos por arquitetura. No `schema.prisma`:

```prisma
generator client {
  provider      = "prisma-client-js"
  binaryTargets = ["native", "rhel-openssl-1.0.x", "linux-arm64-openssl-1.0.x"]
}
```

---

**Última atualização:** 2026-02-11
