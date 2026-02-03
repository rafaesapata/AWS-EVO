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
```

### External Dependencies
Pacotes no `External` são excluídos do bundle e carregados da Layer:
- `@prisma/client` - Prisma Client (na layer)
- `.prisma/client` - Prisma Engine binaries (na layer)

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

**Última atualização:** 2026-02-03
