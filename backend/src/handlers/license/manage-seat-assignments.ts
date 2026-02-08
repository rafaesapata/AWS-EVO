/**
 * Manage Seat Assignments Handler
 * Proxy to manage-seats handler for backward compatibility
 * 
 * This handler delegates to the manage-seats handler which contains
 * the full seat management implementation (list, allocate, deallocate, cleanup).
 */

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { handler as manageSeatsHandler } from './manage-seats.js';

export async function handler(
  event: AuthorizedEvent,
  context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  return manageSeatsHandler(event, context);
}
