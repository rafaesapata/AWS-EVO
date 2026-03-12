/**
 * Health Event Classifier
 *
 * Pure function library for classifying AWS Health events by severity.
 * No external dependencies — deterministic and idempotent.
 */

export interface HealthEventInput {
  typeCode: string;
  category: string;
  statusCode: string;
}

export type Severity = 'critical' | 'high' | 'medium' | 'low';

/**
 * Classifies an AWS Health event into a severity level.
 *
 * Priority rules (evaluated in order):
 * 1. typeCode contains RISK_CREDENTIALS_EXPOSED or RISK_CREDENTIALS_COMPROMISED → critical
 * 2. typeCode contains RISK AND category is accountNotification → high
 * 3. category is issue AND statusCode is open → medium
 * 4. Everything else → low
 */
export function classifySeverity(event: HealthEventInput): Severity {
  const typeCodeUpper = event.typeCode.toUpperCase();

  if (
    typeCodeUpper.includes('RISK_CREDENTIALS_EXPOSED') ||
    typeCodeUpper.includes('RISK_CREDENTIALS_COMPROMISED')
  ) {
    return 'critical';
  }

  if (
    typeCodeUpper.includes('RISK') &&
    event.category.toLowerCase() === 'accountnotification'
  ) {
    return 'high';
  }

  if (
    event.category.toLowerCase() === 'issue' &&
    event.statusCode.toLowerCase() === 'open'
  ) {
    return 'medium';
  }

  return 'low';
}

/**
 * Returns true if the typeCode indicates a credential exposure event.
 */
export function isCredentialExposure(typeCode: string): boolean {
  const upper = typeCode.toUpperCase();
  return (
    upper.includes('RISK_CREDENTIALS_EXPOSED') ||
    upper.includes('RISK_CREDENTIALS_COMPROMISED')
  );
}
