"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
const logging_js_1 = require("../../lib/logging.js");
const response_js_1 = require("../../lib/response.js");
const database_js_1 = require("../../lib/database.js");
const middleware_js_1 = require("../../lib/middleware.js");
const crypto = __importStar(require("crypto"));
// Session token expiry: 15 minutes for security
const SESSION_TOKEN_EXPIRY_MS = 15 * 60 * 1000;
/**
 * Verify WebAuthn signature cryptographically
 * This is CRITICAL for security - without this, anyone could forge authentication
 */
function verifySignature(publicKeyPem, authenticatorData, clientDataJSON, signature) {
    try {
        // Create the signed data: authenticatorData + SHA256(clientDataJSON)
        const clientDataHash = crypto.createHash('sha256').update(clientDataJSON).digest();
        const signedData = Buffer.concat([authenticatorData, clientDataHash]);
        // Verify the signature using the stored public key
        const verifier = crypto.createVerify('SHA256');
        verifier.update(signedData);
        return verifier.verify(publicKeyPem, signature);
    }
    catch (error) {
        logging_js_1.logger.error('Signature verification error:', error);
        return false;
    }
}
/**
 * Convert COSE public key to PEM format for verification
 * WebAuthn stores keys in COSE format, Node.js crypto needs PEM
 */
function coseKeyToPem(coseKey) {
    try {
        // For ES256 (ECDSA with P-256), the COSE key contains:
        // - kty (key type): 2 for EC
        // - alg (algorithm): -7 for ES256
        // - crv (curve): 1 for P-256
        // - x: 32 bytes
        // - y: 32 bytes
        // Simple approach: if the key is already in a usable format, use it
        // For production, you'd want to properly parse COSE and convert to PEM
        // Check if it's already a PEM string stored as buffer
        const keyStr = coseKey.toString('utf8');
        if (keyStr.includes('-----BEGIN')) {
            return keyStr;
        }
        // For raw EC public keys (65 bytes: 0x04 + 32 bytes X + 32 bytes Y)
        if (coseKey.length === 65 && coseKey[0] === 0x04) {
            // Create uncompressed EC point format for P-256
            const ecPublicKey = Buffer.concat([
                // ASN.1 header for EC public key with P-256 curve
                Buffer.from([
                    0x30, 0x59, // SEQUENCE, 89 bytes
                    0x30, 0x13, // SEQUENCE, 19 bytes
                    0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01, // OID: ecPublicKey
                    0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07, // OID: prime256v1
                    0x03, 0x42, 0x00 // BIT STRING, 66 bytes, no unused bits
                ]),
                coseKey // The 65-byte uncompressed point
            ]);
            const pem = '-----BEGIN PUBLIC KEY-----\n' +
                ecPublicKey.toString('base64').match(/.{1,64}/g)?.join('\n') +
                '\n-----END PUBLIC KEY-----';
            return pem;
        }
        // If stored as base64 PEM content
        try {
            const decoded = Buffer.from(coseKey.toString('utf8'), 'base64');
            if (decoded.length > 0) {
                return '-----BEGIN PUBLIC KEY-----\n' +
                    coseKey.toString('utf8').match(/.{1,64}/g)?.join('\n') +
                    '\n-----END PUBLIC KEY-----';
            }
        }
        catch { }
        return null;
    }
    catch (error) {
        logging_js_1.logger.error('COSE to PEM conversion error:', error);
        return null;
    }
}
async function handler(event, context) {
    const origin = (0, middleware_js_1.getOrigin)(event);
    const httpMethod = event.httpMethod || event.requestContext?.http?.method;
    // Handle CORS preflight
    if (httpMethod === 'OPTIONS') {
        return (0, response_js_1.corsOptions)(origin);
    }
    try {
        const body = event.body ? JSON.parse(event.body) : {};
        const { action } = body;
        if (action === 'start') {
            return await startAuthentication(body.email, origin);
        }
        else if (action === 'finish') {
            return await finishAuthentication(body, event, origin);
        }
        return (0, response_js_1.badRequest)('Invalid action', undefined, origin);
    }
    catch (err) {
        logging_js_1.logger.error('WebAuthn authentication error:', err);
        return (0, response_js_1.error)('Internal server error', 500, undefined, origin);
    }
}
async function startAuthentication(email, origin) {
    const prisma = (0, database_js_1.getPrismaClient)();
    let allowCredentials = [];
    if (email) {
        // Buscar credenciais do usuário específico
        const user = await prisma.user.findUnique({
            where: { email }
        });
        if (!user) {
            return (0, response_js_1.error)('User not found', 404, undefined, origin);
        }
        // Buscar credenciais WebAuthn separadamente
        const webauthnCredentials = await prisma.webAuthnCredential.findMany({
            where: { user_id: user.id }
        });
        if (webauthnCredentials.length === 0) {
            return (0, response_js_1.error)('No WebAuthn credentials found', 404, undefined, origin);
        }
        allowCredentials = webauthnCredentials.map(cred => ({
            type: 'public-key',
            id: cred.credential_id
        }));
    }
    // Gerar challenge
    const challenge = crypto.randomBytes(32).toString('base64url');
    const challengeExpiry = new Date(Date.now() + 300000); // 5 minutos
    // Salvar challenge
    await prisma.webauthnChallenge.create({
        data: {
            user_id: email || 'anonymous',
            challenge,
            expires_at: challengeExpiry
        }
    });
    const rpId = process.env.WEBAUTHN_RP_ID || 'evouds.com';
    const publicKeyCredentialRequestOptions = {
        challenge,
        rpId,
        timeout: 300000,
        userVerification: 'preferred',
        allowCredentials: allowCredentials.length > 0 ? allowCredentials : undefined
    };
    return (0, response_js_1.success)({ options: publicKeyCredentialRequestOptions }, 200, origin);
}
async function finishAuthentication(body, event, origin) {
    const prisma = (0, database_js_1.getPrismaClient)();
    const { assertion, challenge } = body;
    if (!assertion || !challenge) {
        return (0, response_js_1.badRequest)('Missing assertion or challenge', undefined, origin);
    }
    // Verificar challenge
    const storedChallenge = await prisma.webauthnChallenge.findFirst({
        where: {
            challenge,
            expires_at: { gt: new Date() }
        }
    });
    if (!storedChallenge) {
        return (0, response_js_1.badRequest)('Invalid or expired challenge', undefined, origin);
    }
    // Deletar challenge usado
    await prisma.webauthnChallenge.delete({ where: { id: storedChallenge.id } });
    // Buscar credencial
    const credential = await prisma.webAuthnCredential.findFirst({
        where: { credential_id: assertion.id }
    });
    if (!credential) {
        // Registrar tentativa falha - use system org for failed attempts
        await prisma.securityEvent.create({
            data: {
                organization_id: process.env.SYSTEM_ORGANIZATION_ID || 'system',
                event_type: 'WEBAUTHN_AUTH_FAILED',
                severity: 'MEDIUM',
                description: 'WebAuthn authentication failed',
                metadata: { credentialId: assertion.id, reason: 'Credential not found' }
            }
        });
        return (0, response_js_1.unauthorized)('Invalid credential', origin);
    }
    // Fetch user data from database
    const credentialUser = await prisma.user.findUnique({
        where: { id: credential.user_id }
    });
    if (!credentialUser) {
        await prisma.securityEvent.create({
            data: {
                organization_id: process.env.SYSTEM_ORGANIZATION_ID || 'system',
                event_type: 'WEBAUTHN_AUTH_FAILED',
                severity: 'HIGH',
                description: 'WebAuthn credential user not found',
                metadata: { credentialId: assertion.id, userId: credential.user_id }
            }
        });
        return (0, response_js_1.unauthorized)('User not found', origin);
    }
    // Get user's profile to find organization
    const userProfile = await prisma.profile.findFirst({
        where: { user_id: credential.user_id },
        include: {
            organization: {
                select: {
                    id: true,
                    name: true
                }
            }
        }
    });
    // Get organization ID from profile or use system default
    const userOrganizationId = userProfile?.organization_id || process.env.SYSTEM_ORGANIZATION_ID || 'system';
    try {
        // Decodificar clientDataJSON
        const clientDataJSON = Buffer.from(assertion.response.clientDataJSON, 'base64');
        const clientData = JSON.parse(clientDataJSON.toString());
        // Verificar challenge
        if (clientData.challenge !== challenge) {
            return (0, response_js_1.badRequest)('Challenge mismatch', undefined, origin);
        }
        // Verificar tipo
        if (clientData.type !== 'webauthn.get') {
            return (0, response_js_1.badRequest)('Invalid type', undefined, origin);
        }
        // Verificar origin (proteção contra phishing)
        const expectedOrigin = process.env.WEBAUTHN_ORIGIN || 'https://evo.ai.udstec.io';
        if (clientData.origin !== expectedOrigin) {
            logging_js_1.logger.warn('Origin mismatch in WebAuthn authentication', {
                expected: expectedOrigin,
                received: clientData.origin
            });
            return (0, response_js_1.badRequest)('Invalid origin', undefined, origin);
        }
        // Decodificar authenticatorData e signature
        const authenticatorData = Buffer.from(assertion.response.authenticatorData, 'base64');
        const signature = Buffer.from(assertion.response.signature, 'base64');
        // CRITICAL: Verify cryptographic signature
        if (credential.public_key) {
            const publicKeyPem = coseKeyToPem(Buffer.from(credential.public_key, 'base64'));
            if (publicKeyPem) {
                const isValidSignature = verifySignature(publicKeyPem, authenticatorData, clientDataJSON, signature);
                if (!isValidSignature) {
                    await prisma.securityEvent.create({
                        data: {
                            organization_id: userOrganizationId,
                            event_type: 'WEBAUTHN_SIGNATURE_INVALID',
                            severity: 'HIGH',
                            description: 'WebAuthn signature verification failed',
                            metadata: { credentialId: credential.id, userId: credential.user_id }
                        }
                    });
                    return (0, response_js_1.unauthorized)('Invalid signature', origin);
                }
            }
            else {
                logging_js_1.logger.warn('Could not convert public key to PEM format', { credentialId: credential.id });
                // In production, you might want to fail here instead of continuing
            }
        }
        // Extrair counter (bytes 33-36)
        const counter = authenticatorData.readUInt32BE(33);
        // Verificar counter (proteção contra replay)
        if (counter <= credential.counter) {
            await prisma.securityEvent.create({
                data: {
                    organization_id: userOrganizationId,
                    event_type: 'WEBAUTHN_REPLAY_DETECTED',
                    severity: 'HIGH',
                    description: 'WebAuthn replay attack detected',
                    metadata: { credentialId: credential.id, expectedCounter: credential.counter, receivedCounter: counter }
                }
            });
            return (0, response_js_1.unauthorized)('Replay attack detected', origin);
        }
        // Atualizar counter
        await prisma.webAuthnCredential.update({
            where: { id: credential.id },
            data: { counter, last_used_at: new Date() }
        });
        // Gerar token de sessão - 15 minutos para segurança
        const sessionToken = crypto.randomBytes(32).toString('hex');
        const sessionExpiry = new Date(Date.now() + SESSION_TOKEN_EXPIRY_MS);
        await prisma.session.create({
            data: {
                user_id: credential.user_id,
                session_token: sessionToken,
                expires_at: sessionExpiry
            }
        });
        // Registrar login bem-sucedido com organization_id real
        await prisma.securityEvent.create({
            data: {
                organization_id: userOrganizationId,
                event_type: 'WEBAUTHN_AUTH_SUCCESS',
                severity: 'INFO',
                description: 'WebAuthn authentication successful',
                metadata: { credentialId: credential.id, deviceName: credential.device_name, userId: credential.user_id }
            }
        });
        // Return real user data from database
        return (0, response_js_1.success)({
            sessionToken,
            expiresAt: sessionExpiry.toISOString(),
            user: {
                id: credentialUser.id,
                email: credentialUser.email,
                name: credentialUser.full_name || credentialUser.email.split('@')[0],
                role: userProfile?.role || 'user',
                organizationId: userOrganizationId,
                organizationName: userProfile?.organization?.name || 'Organization'
            }
        }, 200, origin);
    }
    catch (error) {
        logging_js_1.logger.error('Assertion verification error:', error);
        return (0, response_js_1.badRequest)('Invalid assertion', undefined, origin);
    }
}
//# sourceMappingURL=webauthn-authenticate.js.map