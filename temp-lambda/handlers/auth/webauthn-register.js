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
const auth_js_1 = require("../../lib/auth.js");
const middleware_js_1 = require("../../lib/middleware.js");
const crypto = __importStar(require("crypto"));
async function handler(event, context) {
    const origin = (0, middleware_js_1.getOrigin)(event);
    const httpMethod = event.httpMethod || event.requestContext?.http?.method;
    // Handle CORS preflight
    if (httpMethod === 'OPTIONS') {
        return (0, response_js_1.corsOptions)(origin);
    }
    try {
        let authUser;
        let organizationId;
        try {
            authUser = (0, auth_js_1.getUserFromEvent)(event);
            organizationId = (0, auth_js_1.getOrganizationId)(authUser);
        }
        catch (authError) {
            logging_js_1.logger.error('Authentication error:', authError);
            return (0, response_js_1.error)('Authentication required', 401, undefined, origin);
        }
        if (!authUser?.sub && !authUser?.id) {
            return (0, response_js_1.error)('Invalid user data', 401, undefined, origin);
        }
        const userId = authUser.sub || authUser.id;
        const body = event.body ? JSON.parse(event.body) : {};
        const { action } = body;
        logging_js_1.logger.info('WebAuthn registration request:', { action, userId, organizationId });
        if (action === 'generate-challenge') {
            return await generateChallenge(userId, organizationId, body.deviceName, origin);
        }
        else if (action === 'verify-registration') {
            return await verifyRegistration(userId, organizationId, body, origin);
        }
        return (0, response_js_1.badRequest)('Invalid action. Use "generate-challenge" or "verify-registration"', undefined, origin);
    }
    catch (err) {
        logging_js_1.logger.error('WebAuthn registration error:', err);
        return (0, response_js_1.error)('Internal server error', 500, undefined, origin);
    }
}
async function generateChallenge(userId, organizationId, deviceName, origin) {
    const prisma = (0, database_js_1.getPrismaClient)();
    try {
        // Verificar se o usuário existe na tabela users
        let user = await prisma.user.findUnique({
            where: { id: userId }
        });
        // Se não existir, criar o usuário
        if (!user) {
            // Buscar dados do perfil para obter email
            const profile = await prisma.profile.findFirst({
                where: { user_id: userId }
            });
            if (!profile) {
                return (0, response_js_1.error)('User profile not found', 404, undefined, origin);
            }
            user = await prisma.user.create({
                data: {
                    id: userId,
                    email: profile.full_name || `user-${userId}@example.com`, // Fallback email
                    full_name: profile.full_name,
                    is_active: true
                }
            });
        }
        // Gerar challenge com crypto seguro
        const challenge = crypto.randomBytes(32).toString('base64url');
        const challengeExpiry = new Date(Date.now() + 300000); // 5 minutos
        // Salvar challenge
        await prisma.webauthnChallenge.create({
            data: {
                challenge,
                user_id: user.id,
                expires_at: challengeExpiry
            }
        });
        // Gerar opções de registro
        const rpId = process.env.WEBAUTHN_RP_ID || 'evo.ai.udstec.io';
        const rpName = process.env.WEBAUTHN_RP_NAME || 'EVO UDS Platform';
        const registrationOptions = {
            challenge,
            rpName,
            rpId,
            userId: user.id,
            userEmail: user.email,
            userDisplayName: user.full_name || user.email
        };
        logging_js_1.logger.info('Challenge generated successfully:', { userId, challenge: challenge.substring(0, 10) + '...' });
        return (0, response_js_1.success)(registrationOptions, 200, origin);
    }
    catch (error) {
        logging_js_1.logger.error('Error generating challenge:', error);
        return (0, response_js_1.error)('Failed to generate challenge', 500, undefined, origin);
    }
}
async function verifyRegistration(userId, organizationId, body, origin) {
    const prisma = (0, database_js_1.getPrismaClient)();
    const { credential, challengeId } = body;
    if (!credential || !challengeId) {
        return (0, response_js_1.badRequest)('Missing credential or challengeId', undefined, origin);
    }
    try {
        // Verificar se o usuário existe
        const user = await prisma.user.findUnique({
            where: { id: userId }
        });
        if (!user) {
            return (0, response_js_1.error)('User not found', 404, undefined, origin);
        }
        // Verificar challenge
        const storedChallenge = await prisma.webauthnChallenge.findFirst({
            where: {
                challenge: challengeId,
                user_id: user.id,
                expires_at: { gt: new Date() }
            }
        });
        if (!storedChallenge) {
            return (0, response_js_1.badRequest)('Invalid or expired challenge', undefined, origin);
        }
        // Deletar challenge usado
        await prisma.webauthnChallenge.delete({
            where: { id: storedChallenge.id }
        });
        // Salvar credencial WebAuthn
        const webauthnCredential = await prisma.webAuthnCredential.create({
            data: {
                user_id: user.id,
                credential_id: credential.id,
                public_key: credential.publicKey,
                counter: 0,
                device_name: body.deviceName || 'Security Key'
            }
        });
        // Registrar evento de segurança
        await prisma.securityEvent.create({
            data: {
                organization_id: organizationId,
                event_type: 'WEBAUTHN_REGISTERED',
                severity: 'INFO',
                description: `WebAuthn credential registered for device: ${webauthnCredential.device_name}`,
                metadata: {
                    userId: user.id,
                    credentialId: webauthnCredential.id,
                    deviceName: webauthnCredential.device_name
                }
            }
        });
        logging_js_1.logger.info('WebAuthn credential registered successfully:', {
            userId,
            credentialId: webauthnCredential.id,
            deviceName: webauthnCredential.device_name
        });
        return (0, response_js_1.success)({
            success: true,
            credential: {
                id: webauthnCredential.id,
                deviceName: webauthnCredential.device_name,
                createdAt: webauthnCredential.created_at
            }
        }, 200, origin);
    }
    catch (error) {
        logging_js_1.logger.error('Error verifying registration:', error);
        return (0, response_js_1.error)('Failed to verify registration', 500, undefined, origin);
    }
}
//# sourceMappingURL=webauthn-register.js.map