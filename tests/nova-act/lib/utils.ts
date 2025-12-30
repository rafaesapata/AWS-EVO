/**
 * Utilities - Funções utilitárias para testes Nova Act
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { config } from '../config/nova-act.config';

/**
 * Aguardar um tempo específico
 */
export function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Gerar timestamp único
 */
export function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

/**
 * Verificar se estamos em CI
 */
export function isCI(): boolean {
  return process.env.CI === 'true';
}

/**
 * Criar diretório se não existir
 */
export async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

/**
 * Salvar screenshot com nome único
 */
export async function saveScreenshot(
  data: Buffer | string,
  name: string,
  dir?: string
): Promise<string> {
  const screenshotDir = dir || path.join(config.novaAct.logsDirectory, 'screenshots');
  await ensureDir(screenshotDir);
  
  const filename = `${name}-${timestamp()}.png`;
  const filepath = path.join(screenshotDir, filename);
  
  if (typeof data === 'string') {
    // Base64 encoded
    await fs.writeFile(filepath, Buffer.from(data, 'base64'));
  } else {
    await fs.writeFile(filepath, data);
  }
  
  return filepath;
}

/**
 * Ler arquivo JSON
 */
export async function readJson<T>(filepath: string): Promise<T> {
  const content = await fs.readFile(filepath, 'utf-8');
  return JSON.parse(content) as T;
}

/**
 * Escrever arquivo JSON
 */
export async function writeJson(filepath: string, data: unknown): Promise<void> {
  await ensureDir(path.dirname(filepath));
  await fs.writeFile(filepath, JSON.stringify(data, null, 2));
}

/**
 * Retry com backoff exponencial
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number;
    delayMs?: number;
    backoffMultiplier?: number;
    onRetry?: (attempt: number, error: Error) => void;
  } = {}
): Promise<T> {
  const {
    maxAttempts = config.retry.maxAttempts,
    delayMs = config.retry.delayMs,
    backoffMultiplier = config.retry.backoffMultiplier,
    onRetry,
  } = options;

  let lastError: Error | undefined;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt < maxAttempts) {
        const delay = delayMs * Math.pow(backoffMultiplier, attempt - 1);
        onRetry?.(attempt, lastError);
        await wait(delay);
      }
    }
  }
  
  throw lastError;
}

/**
 * Timeout wrapper
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage = 'Operation timed out'
): Promise<T> {
  let timeoutId: NodeJS.Timeout;
  
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
  });
  
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId!);
  }
}

/**
 * Formatar duração em formato legível
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = ((ms % 60000) / 1000).toFixed(0);
  return `${minutes}m ${seconds}s`;
}

/**
 * Sanitizar string para uso em nomes de arquivo
 */
export function sanitizeFilename(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Gerar ID único
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Verificar se URL é válida
 */
export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Extrair domínio de URL
 */
export function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

/**
 * Comparar URLs ignorando trailing slash
 */
export function urlsMatch(url1: string, url2: string): boolean {
  const normalize = (url: string) => url.replace(/\/$/, '').toLowerCase();
  return normalize(url1) === normalize(url2);
}

/**
 * Logger com níveis
 */
export const logger = {
  info: (message: string, ...args: unknown[]) => {
    console.log(`ℹ️  ${message}`, ...args);
  },
  
  success: (message: string, ...args: unknown[]) => {
    console.log(`✅ ${message}`, ...args);
  },
  
  warn: (message: string, ...args: unknown[]) => {
    console.warn(`⚠️  ${message}`, ...args);
  },
  
  error: (message: string, ...args: unknown[]) => {
    console.error(`❌ ${message}`, ...args);
  },
  
  debug: (message: string, ...args: unknown[]) => {
    if (process.env.DEBUG === 'true') {
      console.log(`🔍 ${message}`, ...args);
    }
  },
  
  step: (stepNumber: number, message: string) => {
    console.log(`   ${stepNumber}. ${message}`);
  },
};

/**
 * Medir tempo de execução
 */
export function measureTime<T>(
  fn: () => Promise<T>,
  label?: string
): Promise<{ result: T; duration: number }> {
  const start = Date.now();
  
  return fn().then(result => {
    const duration = Date.now() - start;
    if (label) {
      logger.debug(`${label}: ${formatDuration(duration)}`);
    }
    return { result, duration };
  });
}

/**
 * Agrupar array em chunks
 */
export function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Executar funções em paralelo com limite
 */
export async function parallelLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  const chunks = chunk(items, limit);
  
  for (const batch of chunks) {
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
  }
  
  return results;
}

export default {
  wait,
  timestamp,
  isCI,
  ensureDir,
  saveScreenshot,
  readJson,
  writeJson,
  retry,
  withTimeout,
  formatDuration,
  sanitizeFilename,
  generateId,
  isValidUrl,
  extractDomain,
  urlsMatch,
  logger,
  measureTime,
  chunk,
  parallelLimit,
};
