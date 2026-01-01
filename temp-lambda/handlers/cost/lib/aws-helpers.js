"use strict";
/**
 * Helpers para interação com serviços AWS
 */
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
exports.assumeRole = assumeRole;
exports.toAwsCredentials = toAwsCredentials;
exports.resolveAwsCredentials = resolveAwsCredentials;
exports.validateAwsCredentials = validateAwsCredentials;
const client_sts_1 = require("@aws-sdk/client-sts");
/**
 * Assume role para obter credenciais temporárias
 */
async function assumeRole(roleArn, externalId, region = 'us-east-1', sessionName = 'evo-uds-session') {
    const stsClient = new client_sts_1.STSClient({ region });
    const command = new client_sts_1.AssumeRoleCommand({
        RoleArn: roleArn,
        RoleSessionName: sessionName,
        ExternalId: externalId,
        DurationSeconds: 3600, // 1 hora
    });
    const response = await stsClient.send(command);
    if (!response.Credentials) {
        throw new Error('Failed to assume role: no credentials returned');
    }
    return {
        accessKeyId: response.Credentials.AccessKeyId,
        secretAccessKey: response.Credentials.SecretAccessKey,
        sessionToken: response.Credentials.SessionToken,
        region,
    };
}
/**
 * Converte credenciais para formato AWS SDK
 */
function toAwsCredentials(creds) {
    return {
        accessKeyId: creds.accessKeyId,
        secretAccessKey: creds.secretAccessKey,
        sessionToken: creds.sessionToken,
    };
}
/**
 * Resolve credenciais AWS (assume role se necessário)
 */
async function resolveAwsCredentials(credential, region) {
    // Check if access_key_id contains ROLE: prefix (CloudFormation deployment pattern)
    // In this case, the role ARN is stored in access_key_id with ROLE: prefix
    // and external_id is stored in secret_access_key with EXTERNAL_ID: prefix
    if (credential.access_key_id?.startsWith('ROLE:')) {
        const roleArn = credential.access_key_id.replace('ROLE:', '');
        const externalId = credential.external_id ||
            credential.secret_access_key?.replace('EXTERNAL_ID:', '') || '';
        console.log('🔐 Assuming role (from ROLE: prefix):', roleArn);
        console.log('🔐 External ID:', externalId ? `${externalId.substring(0, 8)}...` : 'EMPTY');
        console.log('🔐 credential.external_id:', credential.external_id ? 'SET' : 'NULL');
        console.log('🔐 credential.secret_access_key starts with EXTERNAL_ID:', credential.secret_access_key?.startsWith('EXTERNAL_ID:'));
        return assumeRole(roleArn, externalId, region);
    }
    // Se tem role_arn, usa AssumeRole
    if (credential.role_arn && credential.external_id) {
        console.log('🔐 Assuming role:', credential.role_arn);
        return assumeRole(credential.role_arn, credential.external_id, region);
    }
    // Senão, usa credenciais diretas
    if (credential.access_key_id && credential.secret_access_key) {
        console.log('🔑 Using direct credentials');
        return {
            accessKeyId: credential.access_key_id,
            secretAccessKey: credential.secret_access_key,
            sessionToken: credential.session_token || undefined,
            region,
        };
    }
    throw new Error('No valid AWS credentials found');
}
/**
 * Valida se credenciais AWS são válidas
 */
async function validateAwsCredentials(creds) {
    try {
        const stsClient = new client_sts_1.STSClient({
            region: creds.region,
            credentials: toAwsCredentials(creds),
        });
        const { GetCallerIdentityCommand } = await Promise.resolve().then(() => __importStar(require('@aws-sdk/client-sts')));
        await stsClient.send(new GetCallerIdentityCommand({}));
        return true;
    }
    catch (error) {
        console.error('❌ Invalid AWS credentials:', error);
        return false;
    }
}
//# sourceMappingURL=aws-helpers.js.map