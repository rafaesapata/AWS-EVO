/**
 * Sandbox Verification Utilities
 * Funções de comparação cross-account para verificar paridade sandbox ↔ produção
 */

export type CheckStatus = 'PASS' | 'FAIL' | 'SKIP';

export interface CheckResult {
  name: string;
  status: CheckStatus;
  message: string;
  details?: string[];
}

export interface LambdaInfo {
  name: string;
  architecture?: string;
  state?: string;
  vpcId?: string;
  subnetIds?: string[];
  securityGroupIds?: string[];
}

export interface EnvVarMap {
  [key: string]: string;
}

export interface ApiRoute {
  path: string;
  method: string;
}

export interface SsmParameter {
  name: string;
  type?: string;
}

export interface Difference {
  category: string;
  detail: string;
}

export interface CheckSummary {
  pass: number;
  fail: number;
  skip: number;
  total: number;
  results: CheckResult[];
}

/** Known env var substitutions that differ between sandbox and production */
export const KNOWN_SUBSTITUTIONS = new Set([
  'DATABASE_URL',
  'COGNITO_USER_POOL_ID',
  'COGNITO_CLIENT_ID',
  'COGNITO_USER_POOL_ARN',
  'APP_DOMAIN',
  'API_DOMAIN',
  'AZURE_OAUTH_REDIRECT_URI',
  'WEBAUTHN_ORIGIN',
  'ENVIRONMENT',
  'REDIS_URL',
  'FRONTEND_BUCKET',
  'CF_DIST_ID',
  'S3_BUCKET',
  'LAMBDA_PREFIX',
  'STACK_NAME',
  'TOKEN_ENCRYPTION_KEY',
  'AZURE_OAUTH_CLIENT_SECRET',
  'SES_ACCESS_KEY_ID',
  'SES_SECRET_ACCESS_KEY',
  'STORAGE_ENCRYPTION_KEY',
  'VITE_API_BASE_URL',
  'VITE_CLOUDFRONT_DOMAIN',
  'VITE_AWS_ACCOUNT_ID',
  'VITE_STORAGE_ENCRYPTION_KEY',
  'VITE_ENVIRONMENT',
]);

/** Production domain patterns to detect in env vars */
const PROD_DOMAIN_PATTERNS = [
  'evo.nuevacore.com',
  'api.evo.nuevacore.com',
];

/** Env vars that legitimately contain the base domain without sandbox prefix */
const PROD_DOMAIN_EXCEPTIONS = new Set([
  'WEBAUTHN_RP_ID', // nuevacore.com is shared across environments
]);

/** Expected infrastructure differences (not flagged as FAIL) */
export const EXPECTED_DIFFERENCES = new Set([
  'RDS instance size',
  'RDS MultiAZ',
  'RDS PubliclyAccessible',
  'NAT Gateways count',
  'CloudFront PriceClass',
  'WAF enabled',
  'Performance Insights retention',
  'CloudTrail detailed',
]);

/**
 * Compare Lambda function lists between sandbox and production.
 * Returns missing Lambdas in sandbox.
 */
export function compareLambdaLists(
  sandboxLambdas: LambdaInfo[],
  prodLambdas: LambdaInfo[],
  sandboxPrefix = 'evo-uds-v3-sandbox-',
  prodPrefix = 'evo-uds-v3-prod-'
): CheckResult {
  const sandboxNames = new Set(
    sandboxLambdas.map((l) => l.name.replace(sandboxPrefix, ''))
  );
  const prodNames = prodLambdas.map((l) => l.name.replace(prodPrefix, ''));

  const missing = prodNames.filter((name) => !sandboxNames.has(name));

  if (missing.length === 0) {
    return {
      name: 'Lambda Function Parity',
      status: 'PASS',
      message: `All ${prodNames.length} Lambda functions exist in sandbox (${sandboxLambdas.length}/${prodLambdas.length})`,
    };
  }

  return {
    name: 'Lambda Function Parity',
    status: 'FAIL',
    message: `${missing.length} Lambda(s) missing in sandbox`,
    details: missing.map((n) => `Missing: ${n}`),
  };
}

/**
 * Compare environment variables between sandbox and production Lambda.
 * Only flags differences outside of known substitutions.
 */
export function compareEnvVars(
  sandboxEnvVars: EnvVarMap,
  prodEnvVars: EnvVarMap,
  knownSubstitutions: Set<string> = KNOWN_SUBSTITUTIONS
): CheckResult {
  const divergent: string[] = [];

  for (const key of Object.keys(prodEnvVars)) {
    if (knownSubstitutions.has(key)) continue;
    if (!(key in sandboxEnvVars)) {
      divergent.push(`Missing in sandbox: ${key}`);
    } else if (sandboxEnvVars[key] !== prodEnvVars[key]) {
      divergent.push(`Different value for: ${key}`);
    }
  }

  if (divergent.length === 0) {
    return {
      name: 'Lambda Env Var Parity',
      status: 'PASS',
      message: 'All environment variables match (excluding known substitutions)',
    };
  }

  return {
    name: 'Lambda Env Var Parity',
    status: 'FAIL',
    message: `${divergent.length} env var(s) divergent`,
    details: divergent,
  };
}

/**
 * Detect references to production domains in sandbox env vars.
 * WEBAUTHN_RP_ID is excluded (uses base domain nuevacore.com in both).
 */
export function detectProdDomainRefs(
  envVars: EnvVarMap,
  exceptions: Set<string> = PROD_DOMAIN_EXCEPTIONS
): CheckResult {
  const violations: string[] = [];

  for (const [key, value] of Object.entries(envVars)) {
    if (exceptions.has(key)) continue;
    for (const pattern of PROD_DOMAIN_PATTERNS) {
      // Match exact prod domain but not sandbox subdomain
      if (value.includes(pattern) && !value.includes(`sandbox.${pattern.replace('evo.', '')}`)) {
        // More precise: check if it's the prod domain without sandbox prefix
        if (!value.includes('sandbox.nuevacore.com')) {
          violations.push(`${key} references production domain: ${pattern}`);
        }
      }
    }
  }

  if (violations.length === 0) {
    return {
      name: 'No Production Domain References',
      status: 'PASS',
      message: 'No production domain references found in sandbox env vars',
    };
  }

  return {
    name: 'No Production Domain References',
    status: 'FAIL',
    message: `${violations.length} production domain reference(s) found`,
    details: violations,
  };
}

/**
 * Compare API Gateway routes between sandbox and production.
 */
export function compareApiRoutes(
  sandboxRoutes: ApiRoute[],
  prodRoutes: ApiRoute[]
): CheckResult {
  const sandboxSet = new Set(
    sandboxRoutes.map((r) => `${r.method} ${r.path}`)
  );
  const missing = prodRoutes.filter(
    (r) => !sandboxSet.has(`${r.method} ${r.path}`)
  );

  if (missing.length === 0) {
    return {
      name: 'API Gateway Route Parity',
      status: 'PASS',
      message: `All ${prodRoutes.length} API routes exist in sandbox`,
    };
  }

  return {
    name: 'API Gateway Route Parity',
    status: 'FAIL',
    message: `${missing.length} route(s) missing in sandbox`,
    details: missing.map((r) => `Missing: ${r.method} ${r.path}`),
  };
}

/**
 * Compare SSM parameters between sandbox and production.
 * Strips environment prefix to compare parameter names.
 */
export function compareSsmParameters(
  sandboxParams: SsmParameter[],
  prodParams: SsmParameter[],
  sandboxPrefix = '/evo/sandbox/',
  prodPrefix = '/evo/production/'
): CheckResult {
  const sandboxNames = new Set(
    sandboxParams.map((p) => p.name.replace(sandboxPrefix, ''))
  );
  const prodNames = prodParams.map((p) => p.name.replace(prodPrefix, ''));

  const missing = prodNames.filter((name) => !sandboxNames.has(name));

  if (missing.length === 0) {
    return {
      name: 'SSM Parameter Parity',
      status: 'PASS',
      message: `All ${prodNames.length} SSM parameters have sandbox equivalents`,
    };
  }

  return {
    name: 'SSM Parameter Parity',
    status: 'FAIL',
    message: `${missing.length} SSM parameter(s) missing in sandbox`,
    details: missing.map((n) => `Missing: ${sandboxPrefix}${n}`),
  };
}

/**
 * Filter out expected/documented differences from a list of differences.
 * Returns only unexpected differences.
 */
export function filterExpectedDifferences(
  differences: Difference[],
  expectedDiffs: Set<string> = EXPECTED_DIFFERENCES
): { unexpected: Difference[]; skipped: Difference[] } {
  const unexpected: Difference[] = [];
  const skipped: Difference[] = [];

  for (const diff of differences) {
    if (expectedDiffs.has(diff.category)) {
      skipped.push(diff);
    } else {
      unexpected.push(diff);
    }
  }

  return { unexpected, skipped };
}

/**
 * Generate a summary of check results with PASS/FAIL/SKIP counts.
 */
export function generateCheckSummary(results: CheckResult[]): CheckSummary {
  let pass = 0;
  let fail = 0;
  let skip = 0;

  for (const r of results) {
    switch (r.status) {
      case 'PASS':
        pass++;
        break;
      case 'FAIL':
        fail++;
        break;
      case 'SKIP':
        skip++;
        break;
    }
  }

  return {
    pass,
    fail,
    skip,
    total: results.length,
    results,
  };
}
