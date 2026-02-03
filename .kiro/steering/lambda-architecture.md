# Lambda Architecture - ARM64 (Graviton2)

## ⚠️ REGRA OBRIGATÓRIA

**TODAS as Lambdas DEVEM usar arquitetura `arm64` (AWS Graviton2).**

## Benefícios

- **~20% mais barato** que x86_64
- **Melhor performance** para workloads Node.js
- **Menor consumo de energia** (sustentabilidade)

## Configuração SAM/CloudFormation

```yaml
Globals:
  Function:
    Architectures:
      - arm64
```

## Configuração de Layer

```yaml
DependenciesLayer:
  Type: AWS::Serverless::LayerVersion
  Properties:
    CompatibleArchitectures:
      - arm64
  Metadata:
    BuildArchitecture: arm64
```

## ⛔ NUNCA USAR

```yaml
# ❌ ERRADO - x86_64 é mais caro
Architectures:
  - x86_64
```

## Compatibilidade

- ✅ Node.js 18.x/20.x - totalmente compatível
- ✅ Prisma - binários ARM64 disponíveis
- ✅ AWS SDK - totalmente compatível
- ✅ Azure SDK - totalmente compatível

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
