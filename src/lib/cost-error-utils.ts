import type { TFunction } from 'i18next';

const PERMISSION_ERROR_PATTERNS = ['AccessDenied', 'not authorized', 'UnauthorizedOperation'] as const;

/**
 * Returns the appropriate error description for cost-related errors,
 * choosing between AWS and Azure i18n keys based on the cloud provider.
 */
export function getCostErrorDescription(
  errorMsg: string,
  provider: string | undefined,
  t: TFunction
): string {
  const isPermissionError = PERMISSION_ERROR_PATTERNS.some(p => errorMsg.includes(p));
  const isAzure = provider === 'AZURE';

  if (isPermissionError) {
    return t(isAzure ? 'costAnalysis.insufficientPermissionAzure' : 'costAnalysis.insufficientPermission');
  }

  const credentialsKey = isAzure ? 'costAnalysis.checkCredentialsAzure' : 'costAnalysis.checkCredentials';
  return `${errorMsg}. ${t(credentialsKey)}`;
}
