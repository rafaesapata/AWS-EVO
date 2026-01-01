/**
 * Helpers para interação com serviços AWS
 */
import type { AwsCredentialIdentity } from '@aws-sdk/types';
export interface AWSCredentials {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
    region: string;
}
/**
 * Assume role para obter credenciais temporárias
 */
export declare function assumeRole(roleArn: string, externalId: string, region?: string, sessionName?: string): Promise<AWSCredentials>;
/**
 * Converte credenciais para formato AWS SDK
 */
export declare function toAwsCredentials(creds: AWSCredentials): AwsCredentialIdentity;
/**
 * Resolve credenciais AWS (assume role se necessário)
 */
export declare function resolveAwsCredentials(credential: {
    access_key_id?: string | null;
    secret_access_key?: string | null;
    role_arn?: string | null;
    external_id?: string | null;
    session_token?: string | null;
}, region: string): Promise<AWSCredentials>;
/**
 * Valida se credenciais AWS são válidas
 */
export declare function validateAwsCredentials(creds: AWSCredentials): Promise<boolean>;
//# sourceMappingURL=aws-helpers.d.ts.map