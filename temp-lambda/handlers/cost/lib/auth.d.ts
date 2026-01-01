/**
 * Helpers para autenticação com Cognito - Military Grade Security
 */
import type { AuthorizedEvent, CognitoUser } from '../types/lambda.js';
/**
 * Roles permitidas no sistema (whitelist)
 */
declare const ALLOWED_ROLES: readonly ["user", "admin", "super_admin", "auditor", "viewer", "billing_admin", "security_admin"];
type AllowedRole = typeof ALLOWED_ROLES[number];
export declare class AuthValidationError extends Error {
    readonly errors: string[];
    constructor(message: string, errors: string[]);
}
export declare class RateLimitError extends Error {
    readonly retryAfter: number;
    constructor(message: string, retryAfter: number);
}
/**
 * Valida todos os claims obrigatórios do token
 */
export declare function validateAuthClaims(claims: Record<string, any>): void;
export declare function getUserFromEvent(event: AuthorizedEvent): CognitoUser;
export declare function getOrganizationId(user: CognitoUser): string;
export declare function getTenantId(user: CognitoUser): string | undefined;
/**
 * Obtém roles do usuário de forma segura com whitelist
 */
export declare function getUserRoles(user: CognitoUser): AllowedRole[];
/**
 * Alias para compatibilidade
 */
export declare function getUserRolesSafe(user: CognitoUser): AllowedRole[];
export declare function hasRole(user: CognitoUser, role: string): boolean;
/**
 * Verifica se o usuário tem pelo menos uma das roles especificadas
 */
export declare function hasAnyRole(user: CognitoUser, requiredRoles: AllowedRole[]): boolean;
export declare function requireRole(user: CognitoUser, role: string): void;
export declare function isSuperAdmin(user: CognitoUser): boolean;
export declare function isAdmin(user: CognitoUser): boolean;
declare const RATE_LIMIT_CONFIG: Record<string, {
    maxRequests: number;
    windowMs: number;
    blockDurationMs: number;
}>;
/**
 * Verifica rate limit do usuário
 */
export declare function checkUserRateLimit(userId: string, operationType?: keyof typeof RATE_LIMIT_CONFIG): void;
/**
 * Limpa entradas expiradas do cache de rate limiting
 * NOTA: Em ambiente Lambda, este cache é local à instância.
 * Para rate limiting distribuído real, usar Redis via redis-cache.ts
 */
export declare function cleanupRateLimitCache(): void;
export {};
//# sourceMappingURL=auth.d.ts.map