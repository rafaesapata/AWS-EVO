"use strict";
/**
 * Helpers para autenticação com Cognito - Military Grade Security
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.RateLimitError = exports.AuthValidationError = void 0;
exports.validateAuthClaims = validateAuthClaims;
exports.getUserFromEvent = getUserFromEvent;
exports.getOrganizationId = getOrganizationId;
exports.getTenantId = getTenantId;
exports.getUserRoles = getUserRoles;
exports.getUserRolesSafe = getUserRolesSafe;
exports.hasRole = hasRole;
exports.hasAnyRole = hasAnyRole;
exports.requireRole = requireRole;
exports.isSuperAdmin = isSuperAdmin;
exports.isAdmin = isAdmin;
exports.checkUserRateLimit = checkUserRateLimit;
exports.cleanupRateLimitCache = cleanupRateLimitCache;
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
];
/**
 * Helper para parsear exp que pode vir como número ou string
 */
function parseExpClaim(exp) {
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
const REQUIRED_CLAIMS = {
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
class AuthValidationError extends Error {
    constructor(message, errors) {
        super(message);
        this.name = 'AuthValidationError';
        this.errors = errors;
    }
}
exports.AuthValidationError = AuthValidationError;
class RateLimitError extends Error {
    constructor(message, retryAfter) {
        super(message);
        this.name = 'RateLimitError';
        this.retryAfter = retryAfter;
    }
}
exports.RateLimitError = RateLimitError;
// ============================================================================
// VALIDAÇÃO DE CLAIMS
// ============================================================================
/**
 * Valida todos os claims obrigatórios do token
 */
function validateAuthClaims(claims) {
    const errors = [];
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
function getUserFromEvent(event) {
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
function getOrganizationId(user) {
    const orgId = user['custom:organization_id'];
    if (!orgId) {
        throw new Error('Organization not found. Please logout and login again to refresh your session.');
    }
    // Validar formato do organizationId (UUID format)
    // UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(orgId)) {
        throw new Error('Session expired or invalid. Please logout and login again to refresh your session.');
    }
    return orgId;
}
function getTenantId(user) {
    return user['custom:tenant_id'];
}
/**
 * Obtém roles do usuário de forma segura com whitelist
 */
function getUserRoles(user) {
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
        const validRoles = rolesArray.filter((role) => {
            if (typeof role !== 'string')
                return false;
            return ALLOWED_ROLES.includes(role.toLowerCase());
        });
        // Retornar pelo menos a role padrão se nenhuma válida foi encontrada
        return validRoles.length > 0 ? validRoles : ['user'];
    }
    catch {
        console.warn('Failed to parse user roles, defaulting to user role');
        return ['user'];
    }
}
/**
 * Alias para compatibilidade
 */
function getUserRolesSafe(user) {
    return getUserRoles(user);
}
function hasRole(user, role) {
    const roles = getUserRoles(user);
    return roles.includes(role);
}
/**
 * Verifica se o usuário tem pelo menos uma das roles especificadas
 */
function hasAnyRole(user, requiredRoles) {
    const userRoles = getUserRoles(user);
    return requiredRoles.some(role => userRoles.includes(role));
}
function requireRole(user, role) {
    if (!hasRole(user, role)) {
        throw new Error(`User does not have required role: ${role}`);
    }
}
function isSuperAdmin(user) {
    return hasRole(user, 'super_admin');
}
function isAdmin(user) {
    return hasRole(user, 'admin') || isSuperAdmin(user);
}
const userRateLimits = new Map();
const RATE_LIMIT_CONFIG = {
    'default': { maxRequests: 100, windowMs: 60000, blockDurationMs: 300000 },
    'auth': { maxRequests: 10, windowMs: 60000, blockDurationMs: 900000 },
    'sensitive': { maxRequests: 5, windowMs: 60000, blockDurationMs: 1800000 },
    'export': { maxRequests: 3, windowMs: 300000, blockDurationMs: 3600000 },
};
/**
 * Verifica rate limit do usuário
 */
function checkUserRateLimit(userId, operationType = 'default') {
    const now = Date.now();
    const config = RATE_LIMIT_CONFIG[operationType] || RATE_LIMIT_CONFIG['default'];
    const key = `${userId}:${operationType}`;
    let entry = userRateLimits.get(key);
    // Verificar se usuário está bloqueado
    if (entry?.blocked && entry.blockExpiry && entry.blockExpiry > now) {
        const remainingBlock = Math.ceil((entry.blockExpiry - now) / 1000);
        throw new RateLimitError(`User temporarily blocked. Try again in ${remainingBlock} seconds.`, remainingBlock);
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
        throw new RateLimitError(`Rate limit exceeded for ${operationType}. User blocked temporarily.`, Math.ceil(config.blockDurationMs / 1000));
    }
}
/**
 * Limpa entradas expiradas do cache de rate limiting
 * NOTA: Em ambiente Lambda, este cache é local à instância.
 * Para rate limiting distribuído real, usar Redis via redis-cache.ts
 */
function cleanupRateLimitCache() {
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
//# sourceMappingURL=auth.js.map