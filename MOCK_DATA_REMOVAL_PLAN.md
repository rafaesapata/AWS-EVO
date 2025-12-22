# Plano de Remoção de Dados Mocados - Sistema EVO UDS

## Resumo Executivo

Após análise completa do sistema, identifiquei várias implementações mocadas que precisam ser substituídas por soluções reais. Este documento detalha o plano de implementação para garantir que o sistema funcione com dados e serviços reais.

## Dados Mocados Identificados

### 1. Backend - Segurança de Headers (`backend/src/lib/security-headers.ts`)

**Problema**: Implementação mocada para análise de headers de segurança
```typescript
// Mock implementation - in production, this would make actual HTTP requests
const mockHeaders = securityHeaders.getHeaders();
```

**Solução**: Implementar análise real de headers HTTP

### 2. Backend - Segurança de Containers (`backend/src/lib/container-security.ts`)

**Problema**: Dados de vulnerabilidades simulados
```typescript
// Mock vulnerability data - in real implementation, this would call actual scanners
const mockVulnerabilities: Vulnerability[] = [...]
```

**Solução**: Integrar com scanners reais (Trivy, Clair, AWS ECR)

### 3. Backend - Rate Limiting (`backend/src/lib/rate-limiting.ts`)

**Problema**: Implementação mocada para Redis
```typescript
// Redis-based implementation would go here
// For now, return a mock implementation
```

**Solução**: Implementar Redis real para rate limiting distribuído

### 4. Backend - Monitoramento (`backend/src/lib/monitoring-alerting.ts`)

**Problema**: Health checks simulados
```typescript
// In a real implementation, this would test database connectivity
```

**Solução**: Implementar health checks reais

### 5. Backend - CI/CD Pipeline (`backend/src/lib/cicd-pipeline.ts`)

**Problema**: Execução de comandos simulada
```typescript
// Mock command execution - in real implementation, would use child_process
```

**Solução**: Implementar execução real de comandos

## Plano de Implementação

### Fase 1: Infraestrutura Base (Prioridade Alta)

#### 1.1 Implementar Rate Limiting Real com Redis

**Arquivo**: `backend/src/lib/rate-limiting.ts`

**Implementação**:
```typescript
import Redis from 'ioredis';

export class DistributedRateLimiter {
  private redis: Redis;

  constructor(config: RateLimitConfig) {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
    });
  }

  async checkLimit(key: string): Promise<RateLimitResult> {
    const pipeline = this.redis.pipeline();
    const now = Date.now();
    const window = this.config.windowMs;
    const limit = this.config.maxRequests;

    // Remove expired entries
    pipeline.zremrangebyscore(key, 0, now - window);
    
    // Count current requests
    pipeline.zcard(key);
    
    // Add current request
    pipeline.zadd(key, now, `${now}-${Math.random()}`);
    
    // Set expiration
    pipeline.expire(key, Math.ceil(window / 1000));

    const results = await pipeline.exec();
    const count = results?.[1]?.[1] as number || 0;

    return {
      allowed: count < limit,
      info: {
        limit,
        remaining: Math.max(0, limit - count - 1),
        reset: Math.ceil((now + window) / 1000),
      },
    };
  }
}
```

#### 1.2 Implementar Health Checks Reais

**Arquivo**: `backend/src/lib/monitoring-alerting.ts`

**Implementação**:
```typescript
import { Pool } from 'pg';
import { S3Client, HeadBucketCommand } from '@aws-sdk/client-s3';

export class RealHealthChecker {
  private dbPool: Pool;
  private s3Client: S3Client;

  async checkDatabaseHealth(): Promise<HealthCheckResult> {
    try {
      const client = await this.dbPool.connect();
      const result = await client.query('SELECT 1');
      client.release();
      
      return {
        healthy: true,
        responseTime: Date.now() - startTime,
        details: { connection: 'active', query: 'success' }
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message,
        details: { connection: 'failed' }
      };
    }
  }

  async checkS3Health(): Promise<HealthCheckResult> {
    try {
      const command = new HeadBucketCommand({
        Bucket: process.env.S3_BUCKET_NAME
      });
      
      await this.s3Client.send(command);
      
      return {
        healthy: true,
        details: { bucket: 'accessible' }
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message
      };
    }
  }
}
```

### Fase 2: Segurança Real (Prioridade Alta)

#### 2.1 Implementar Scanner de Vulnerabilidades Real

**Arquivo**: `backend/src/lib/container-security.ts`

**Implementação**:
```typescript
import { execSync } from 'child_process';

export class RealVulnerabilityScanner {
  async scanWithTrivy(imageId: string): Promise<Vulnerability[]> {
    try {
      // Executar Trivy scanner
      const command = `trivy image --format json ${imageId}`;
      const output = execSync(command, { encoding: 'utf8' });
      const scanResult = JSON.parse(output);
      
      return this.parseTrivy Results(scanResult);
    } catch (error) {
      throw new Error(`Trivy scan failed: ${error.message}`);
    }
  }

  async scanWithECR(imageUri: string): Promise<Vulnerability[]> {
    const ecrClient = new ECRClient({ region: process.env.AWS_REGION });
    
    try {
      const command = new DescribeImageScanFindingsCommand({
        repositoryName: this.extractRepoName(imageUri),
        imageId: { imageTag: this.extractTag(imageUri) }
      });
      
      const response = await ecrClient.send(command);
      return this.parseECRFindings(response.imageScanFindings);
    } catch (error) {
      throw new Error(`ECR scan failed: ${error.message}`);
    }
  }

  private parseTrivy Results(scanResult: any): Vulnerability[] {
    const vulnerabilities: Vulnerability[] = [];
    
    scanResult.Results?.forEach((result: any) => {
      result.Vulnerabilities?.forEach((vuln: any) => {
        vulnerabilities.push({
          id: vuln.VulnerabilityID,
          cve: vuln.VulnerabilityID,
          severity: vuln.Severity?.toLowerCase(),
          title: vuln.Title,
          description: vuln.Description,
          package: vuln.PkgName,
          version: vuln.InstalledVersion,
          fixedVersion: vuln.FixedVersion,
          publishedDate: new Date(vuln.PublishedDate),
          modifiedDate: new Date(vuln.LastModifiedDate),
          score: vuln.CVSS?.nvd?.V3Score || 0,
          vector: vuln.CVSS?.nvd?.V3Vector,
          references: vuln.References || []
        });
      });
    });
    
    return vulnerabilities;
  }
}
```

#### 2.2 Implementar Análise Real de Headers de Segurança

**Arquivo**: `backend/src/lib/security-headers.ts`

**Implementação**:
```typescript
import axios from 'axios';

export class RealSecurityHeaderAnalyzer {
  async analyzeHeaders(url: string): Promise<SecurityAnalysisResult> {
    try {
      const response = await axios.head(url, {
        timeout: 10000,
        validateStatus: () => true // Accept any status code
      });
      
      const headers = response.headers;
      const validation = this.validateHeaders(headers);
      
      return {
        score: this.calculateScore(validation),
        grade: this.calculateGrade(validation),
        headers,
        issues: validation.issues,
        recommendations: validation.recommendations
      };
    } catch (error) {
      throw new Error(`Header analysis failed: ${error.message}`);
    }
  }

  private validateHeaders(headers: Record<string, string>): ValidationResult {
    const issues: string[] = [];
    const recommendations: string[] = [];

    // Check for security headers
    if (!headers['strict-transport-security']) {
      issues.push('Missing Strict-Transport-Security header');
      recommendations.push('Add HSTS header to enforce HTTPS');
    }

    if (!headers['content-security-policy']) {
      issues.push('Missing Content-Security-Policy header');
      recommendations.push('Implement CSP to prevent XSS attacks');
    }

    if (!headers['x-frame-options']) {
      issues.push('Missing X-Frame-Options header');
      recommendations.push('Add X-Frame-Options to prevent clickjacking');
    }

    if (!headers['x-content-type-options']) {
      issues.push('Missing X-Content-Type-Options header');
      recommendations.push('Add X-Content-Type-Options: nosniff');
    }

    return { issues, recommendations };
  }
}
```

### Fase 3: CI/CD Real (Prioridade Média)

#### 3.1 Implementar Execução Real de Comandos

**Arquivo**: `backend/src/lib/cicd-pipeline.ts`

**Implementação**:
```typescript
import { spawn, exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class RealCommandExecutor {
  async runCommand(command: string, workingDirectory: string): Promise<CommandResult> {
    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: workingDirectory,
        timeout: 300000, // 5 minutes timeout
        maxBuffer: 1024 * 1024 * 10 // 10MB buffer
      });

      return {
        success: true,
        stdout,
        stderr,
        exitCode: 0
      };
    } catch (error) {
      return {
        success: false,
        stdout: error.stdout || '',
        stderr: error.stderr || error.message,
        exitCode: error.code || 1
      };
    }
  }

  async runCommandWithStreaming(
    command: string, 
    workingDirectory: string,
    onOutput: (data: string) => void
  ): Promise<CommandResult> {
    return new Promise((resolve) => {
      const child = spawn('sh', ['-c', command], {
        cwd: workingDirectory,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        const output = data.toString();
        stdout += output;
        onOutput(output);
      });

      child.stderr.on('data', (data) => {
        const output = data.toString();
        stderr += output;
        onOutput(output);
      });

      child.on('close', (code) => {
        resolve({
          success: code === 0,
          stdout,
          stderr,
          exitCode: code || 0
        });
      });
    });
  }
}
```

### Fase 4: Testes e Validação (Prioridade Média)

#### 4.1 Remover Mocks dos Testes e Implementar Testes de Integração

**Arquivos**: `src/hooks/__tests__/*.test.ts`

**Ação**: Substituir mocks por testes de integração reais com banco de dados de teste

### Fase 5: Monitoramento Real (Prioridade Baixa)

#### 5.1 Implementar Coleta Real de Métricas

**Implementação**: Integrar com CloudWatch, Prometheus ou DataDog para métricas reais

## Cronograma de Implementação

### Semana 1-2: Fase 1 (Infraestrutura Base)
- [ ] Configurar Redis para rate limiting
- [ ] Implementar health checks reais
- [ ] Testes de conectividade

### Semana 3-4: Fase 2 (Segurança Real)
- [ ] Integrar Trivy scanner
- [ ] Implementar análise real de headers
- [ ] Configurar ECR scanning

### Semana 5-6: Fase 3 (CI/CD Real)
- [ ] Implementar execução real de comandos
- [ ] Configurar pipelines de deployment
- [ ] Testes de integração

### Semana 7-8: Fase 4 (Testes e Validação)
- [ ] Refatorar testes unitários
- [ ] Implementar testes de integração
- [ ] Validação end-to-end

## Dependências e Pré-requisitos

### Infraestrutura Necessária
1. **Redis Cluster**: Para rate limiting distribuído
2. **Trivy Scanner**: Para análise de vulnerabilidades
3. **AWS ECR**: Para scanning de imagens
4. **Banco de Dados de Teste**: Para testes de integração

### Variáveis de Ambiente
```bash
# Redis
REDIS_HOST=your-redis-host
REDIS_PORT=6379
REDIS_PASSWORD=your-redis-password

# Scanning
TRIVY_CACHE_DIR=/tmp/trivy
ECR_REGION=us-east-1

# Monitoring
HEALTH_CHECK_INTERVAL=30000
METRICS_ENDPOINT=https://your-metrics-endpoint
```

## Riscos e Mitigações

### Riscos Identificados
1. **Performance**: Scanners reais podem ser lentos
2. **Disponibilidade**: Dependência de serviços externos
3. **Custos**: Aumento de custos operacionais

### Mitigações
1. **Cache**: Implementar cache para resultados de scan
2. **Fallback**: Manter fallbacks para serviços críticos
3. **Otimização**: Configurar scanning apenas quando necessário

## Validação e Testes

### Critérios de Aceitação
- [ ] Todos os mocks removidos
- [ ] Testes de integração passando
- [ ] Performance mantida ou melhorada
- [ ] Monitoramento funcionando
- [ ] Alertas configurados

### Plano de Rollback
1. Manter versões anteriores em branches separadas
2. Feature flags para alternar entre implementações
3. Monitoramento contínuo durante deploy
4. Rollback automático em caso de falhas

## Conclusão

Este plano garante a remoção completa de dados mocados e implementação de soluções reais, mantendo a qualidade e confiabilidade do sistema EVO UDS.