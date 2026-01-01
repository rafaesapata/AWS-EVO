/**
 * Delete WebAuthn Credential Handler
 * Removes a WebAuthn/Passkey credential for the authenticated user
 */
import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
export declare function handler(event: AuthorizedEvent, context: LambdaContext): Promise<APIGatewayProxyResultV2>;
//# sourceMappingURL=delete-webauthn-credential.d.ts.map