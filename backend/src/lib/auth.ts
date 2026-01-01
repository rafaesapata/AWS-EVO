/**
 * Helpers para autenticação com Cognito - Military Grade Security
 */

import type { AuthorizedEvent, CognitoUser } from '../types/lambda.js';

// ============================================================================
// TYPES E INTERFACES
// ============================================================================

interface ClaimValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Roles permitidas no sistema (whitelist)
 */
const ALLOWED_ROLES = [
  'user',
  'admin',
  'super_admin',
  'auditor',
  'viewer',
  'billing_admin',
  'security_admin'
] as const;

type AllowedRole = typeof ALLOWED_ROLES[number];

/**
 * Helper para parsear exp que pode vir como número ou string
 */
function parseExpClaim(exp: any): number | null {
  if (typeof exp === 'number') {
    return exp;
  }
  if (typeof exp === 'string') {
    // Tentar parsear como número primeiro
    const numExp = parseInt(exp, 10);
    if (!isNaN(numExp)) {
      return numExp;
    }
    // Tentar parsear como data string (ex: "Tue Dec 23 18:50:26 UTC 2025")
    const dateExp = Date.parse(exp);
    if (!isNaN(dateExp)) {
      return Math.floor(dateExp / 1000); // Converter para segundos
    }
  }
  return null;
}

/**
 * Claims obrigatórios com validadores
 */
const REQUIRED_CLAIMS: Record<string, (value: any) => boolean> = {
  'sub': (v) => typeof v === 'string' && v.length > 0,
  'email': (v) => typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
  'exp': (v) => {
    const expNum = parseExpClaim(v);
    return expNum !== null && expNum * 1000 > Date.now();
  },
};

// ============================================================================
// ERROS CUSTOMIZADOS
// ============================================================================

export class AuthValidationError extends Error {
  public readonly errors: string[];

  constructor(message: string, errors: string[]) {
    super(message);
    this.name = 'AuthValidationError';
    this.errors = errors;
  }
}

export class RateLimitError extends Error {
  public readonly retryAfter: number;

  constructor(message: string, retryAfter: number) {
    super(message);
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

// ============================================================================
// VALIDAÇÃO DE CLAIMS
// ============================================================================

/**
 * Valida todos os claims obrigatórios do token
 */
export function validateAuthClaims(claims: Record<string, any>): void {
  const errors: string[] = [];

  for (const [claim, validator] of Object.entries(REQUIRED_CLAIMS)) {
    const value = claims[claim];

    if (value === undefined || value === null) {
      errors.push(`Missing required claim: ${claim}`);
      continue;
    }

    if (!validator(value)) {
      errors.push(`Invalid value for claim: ${claim}`);
    }
  }

  // Validações adicionais de segurança
  if (claims.exp && claims.iat) {
    const tokenLifetime = (claims.exp - claims.iat) * 1000;
    const maxLifetime = 24 * 60 * 60 * 1000; // 24 horas

    if (tokenLifetime > maxLifetime) {
      errors.push('Token lifetime exceeds maximum allowed');
    }
  }

  // Verificar se token não foi emitido no futuro
  if (claims.iat && claims.iat * 1000 > Date.now() + 60000) {
    errors.push('Token issued in the future');
  }

  if (errors.length > 0) {
    throw new AuthValidationError(errors.join('; '), errors);
  }
}

// ============================================================================
// FUNÇÕES PRINCIPAIS
// ============================================================================

export function getUserFromEvent(event: AuthorizedEvent): CognitoUser {
  // Support both REST API v1 (claims directly) and HTTP API v2 (jwt.claims)
  const claims = event.requestContext.authorizer?.claims || 
                 event.requestContext.authorizer?.jwt?.claims;

  if (!claims) {
    throw new Error('No authentication claims found');
  }

  // Validar claims obrigatórios
  validateAuthClaims(claims);

  return claims;
}

/**
 * UUID v4 regex - Military Grade validation
 * Matches: xxxxxxxx-xxxx-4xxx-[89ab]xxx-xxxxxxxxxxxx
 */
const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * General UUID regex (v1-v5)
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function getOrganizationId(user: CognitoUser): string {
  const orgId = user['custom:organization_id'];

  if (!orgId) {
    throw new Error('Organization not found. Please logout and login again to refresh your session.');
  }

  // MILITARY GRADE: Validar formato do organizationId (APENAS UUID válido)
  // Não aceita mais formato org-prefix para consistência
  if (!UUID_REGEX.test(orgId)) {
    console.error(`[SECURITY] Invalid organization ID format detected: ${orgId.substring(0, 8)}...`);
    throw new Error('Session expired or invalid. Please logout and login again to refresh your session.');
  }

  return orgId;
}

export function getTenantId(user: CognitoUser): string | undefined {
  return user['custom:tenant_id'];
}

/**
 * Obtém roles do usuário de forma segura com whitelist
 */
export function getUserRoles(user: CognitoUser): AllowedRole[] {
  const rolesStr = user['custom:roles'];

  // Se não houver roles, retornar role padrão mínima
  if (!rolesStr || typeof rolesStr !== 'string') {
    return ['user'];
  }

  try {
    // Tentar parsear como JSON
    const parsed = JSON.parse(rolesStr);

    // Garantir que é um array
    const rolesArray = Array.isArray(parsed) ? parsed : [parsed];

    // Filtrar apenas roles válidas (whitelist)
    const validRoles = rolesArray.filter((role): role is AllowedRole => {
      if (typeof role !== 'string') return false;
      return ALLOWED_ROLES.includes(role.toLowerCase() as AllowedRole);
    });

    // Retornar pelo menos a role padrão se nenhuma válida foi encontrada
    return validRoles.length > 0 ? validRoles : ['user'];

  } catch {
    console.warn('Failed to parse user roles, defaulting to user role');
    return ['user'];
  }
}

/**
 * Alias para compatibilidade
 */
export function getUserRolesSafe(user: CognitoUser): AllowedRole[] {
  return getUserRoles(user);
}

export function hasRole(user: CognitoUser, role: string): boolean {
  const roles = getUserRoles(user);
  return roles.includes(role as AllowedRole);
}

/**
 * Verifica se o usuário tem pelo menos uma das roles especificadas
 */
export function hasAnyRole(user: CognitoUser, requiredRoles: AllowedRole[]): boolean {
  const userRoles = getUserRoles(user);
  return requiredRoles.some(role => userRoles.includes(role));
}

export function requireRole(user: CognitoUser, role: string): void {
  if (!hasRole(user, role)) {
    throw new Error(`User does not have required role: ${role}`);
  }
}

export function isSuperAdmin(user: CognitoUser): boolean {
  return hasRole(user, 'super_admin');
}

export function isAdmin(user: CognitoUser): boolean {
  return hasRole(user, 'admin') || isSuperAdmin(user);
}

// ============================================================================
// RATE LIMITING POR USUÁRIO
// ============================================================================

interface RateLimitEntry {
  count: number;
  resetTime: number;
  blocked: boolean;
  blockExpiry?: number;
}

const userRateLimits = new Map<string, RateLimitEntry>();

const RATE_LIMIT_CONFIG: Record<string, { maxRequests: number; windowMs: number; blockDurationMs: number }> = {
  'default': { maxRequests: 100, windowMs: 60000, blockDurationMs: 300000 },
  'auth': { maxRequests: 10, windowMs: 60000, blockDurationMs: 900000 },
  'sensitive': { maxRequests: 5, windowMs: 60000, blockDurationMs: 1800000 },
  'export': { maxRequests: 3, windowMs: 300000, blockDurationMs: 3600000 },
};

/**
 * Verifica rate limit do usuário
 */
export function checkUserRateLimit(
  userId: string,
  operationType: keyof typeof RATE_LIMIT_CONFIG = 'default'
): void {
  const now = Date.now();
  const config = RATE_LIMIT_CONFIG[operationType] || RATE_LIMIT_CONFIG['default'];
  const key = `${userId}:${operationType}`;

  let entry = userRateLimits.get(key);

  // Verificar se usuário está bloqueado
  if (entry?.blocked && entry.blockExpiry && entry.blockExpiry > now) {
    const remainingBlock = Math.ceil((entry.blockExpiry - now) / 1000);
    throw new RateLimitError(
      `User temporarily blocked. Try again in ${remainingBlock} seconds.`,
      remainingBlock
    );
  }

  // Reset se janela expirou
  if (!entry || now > entry.resetTime) {
    entry = {
      count: 1,
      resetTime: now + config.windowMs,
      blocked: false
    };
    userRateLimits.set(key, entry);
    return;
  }

  // Incrementar contador
  entry.count++;

  // Verificar se excedeu limite
  if (entry.count > config.maxRequests) {
    entry.blocked = true;
    entry.blockExpiry = now + config.blockDurationMs;

    throw new RateLimitError(
      `Rate limit exceeded for ${operationType}. User blocked temporarily.`,
      Math.ceil(config.blockDurationMs / 1000)
    );
  }
}

/**
 * Limpa entradas expiradas do cache de rate limiting
 * NOTA: Em ambiente Lambda, este cache é local à instância.
 * Para rate limiting distribuído real, usar Redis via redis-cache.ts
 */
export function cleanupRateLimitCache(): void {
  const now = Date.now();

  for (const [key, entry] of userRateLimits.entries()) {
    if (now > entry.resetTime && (!entry.blocked || (entry.blockExpiry && now > entry.blockExpiry))) {
      userRateLimits.delete(key);
    }
  }
}

// NOTA: setInterval removido - não funciona corretamente em Lambda
// O cleanup é feito automaticamente quando checkUserRateLimit é chamado
// Para cleanup periódico, usar EventBridge Scheduler ou chamar cleanupRateLimitCache() no início do handler
