#!/usr/bin/env npx tsx
/**
 * Local Lambda Invoker — testa handlers localmente sem deploy
 * 
 * Uso:
 *   npx tsx backend/scripts/invoke-local.ts <handler-path> [options]
 * 
 * Exemplos:
 *   # POST com body (action-based routing)
 *   npx tsx backend/scripts/invoke-local.ts security/waf-dashboard-api --body '{"action":"events"}'
 * 
 *   # GET request
 *   npx tsx backend/scripts/invoke-local.ts monitoring/health-check --method GET
 * 
 *   # Com query string
 *   npx tsx backend/scripts/invoke-local.ts cost/cost-explorer --method GET --query 'period=30d&account=123'
 * 
 *   # Com impersonation
 *   npx tsx backend/scripts/invoke-local.ts security/waf-dashboard-api --body '{"action":"diagnose"}' --impersonate <org-id>
 * 
 *   # Sem auth (para handlers públicos)
 *   npx tsx backend/scripts/invoke-local.ts auth/login --no-auth --body '{"email":"test@test.com"}'
 * 
 *   # Com user customizado
 *   npx tsx backend/scripts/invoke-local.ts admin/users --user '{"sub":"abc","email":"admin@test.com","custom:organization_id":"org-123","custom:roles":"super_admin"}'
 * 
 * Variáveis de ambiente:
 *   DATABASE_URL — lido do backend/.env automaticamente
 *   LOCAL_USER_SUB — sub do usuário (default: test-user-local)
 *   LOCAL_USER_EMAIL — email do usuário (default: local@evo.test)
 *   LOCAL_ORG_ID — organization_id (default: uuid gerado)
 *   LOCAL_USER_ROLES — roles (default: admin)
 */

import { resolve, join } from 'path';
import { config } from 'dotenv';
import { randomUUID } from 'crypto';

// Load backend/.env
config({ path: resolve(__dirname, '../.env') });

// Also load root .env for extra vars
config({ path: resolve(__dirname, '../../.env') });

// Ensure required env vars
if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL not found in backend/.env');
  process.exit(1);
}

// Set Lambda-like env vars
process.env.ENVIRONMENT = process.env.ENVIRONMENT || 'development';
process.env.PROJECT_NAME = process.env.PROJECT_NAME || 'evo-uds-v3';
process.env.AWS_REGION = process.env.AWS_REGION || 'us-east-1';
process.env.COGNITO_USER_POOL_ID = process.env.COGNITO_USER_POOL_ID || process.env.VITE_AWS_USER_POOL_ID || 'us-east-1_local';
process.env.COGNITO_CLIENT_ID = process.env.COGNITO_CLIENT_ID || process.env.VITE_AWS_USER_POOL_CLIENT_ID || 'local-client';
process.env.TOKEN_ENCRYPTION_KEY = process.env.TOKEN_ENCRYPTION_KEY || 'local-test-key-32chars-minimum!!';

interface CliArgs {
  handlerPath: string;
  method: string;
  body: string | null;
  query: string | null;
  noAuth: boolean;
  impersonate: string | null;
  user: string | null;
  headers: Record<string, string>;
  verbose: boolean;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(`
📦 EVO Local Lambda Invoker

Uso: npx tsx backend/scripts/invoke-local.ts <handler-path> [options]

  handler-path    Path relativo a handlers/ (ex: security/waf-dashboard-api)

Options:
  --method, -m    HTTP method (default: POST)
  --body, -b      JSON body string
  --query, -q     Query string (ex: 'key=val&key2=val2')
  --impersonate   Organization ID para impersonar
  --user          JSON string com claims customizados
  --no-auth       Sem autenticação (handlers públicos)
  --header, -H    Header extra (ex: -H 'X-Custom: value')
  --verbose, -v   Output detalhado
  --help, -h      Mostra esta ajuda
`);
    process.exit(0);
  }

  const result: CliArgs = {
    handlerPath: args[0],
    method: 'POST',
    body: null,
    query: null,
    noAuth: false,
    impersonate: null,
    user: null,
    headers: {},
    verbose: false,
  };

  for (let i = 1; i < args.length; i++) {
    switch (args[i]) {
      case '--method': case '-m':
        result.method = (args[++i] || 'POST').toUpperCase();
        break;
      case '--body': case '-b':
        result.body = args[++i] || null;
        break;
      case '--query': case '-q':
        result.query = args[++i] || null;
        break;
      case '--no-auth':
        result.noAuth = true;
        break;
      case '--impersonate':
        result.impersonate = args[++i] || null;
        break;
      case '--user':
        result.user = args[++i] || null;
        break;
      case '--header': case '-H': {
        const hdr = args[++i] || '';
        const colonIdx = hdr.indexOf(':');
        if (colonIdx > 0) {
          result.headers[hdr.substring(0, colonIdx).trim()] = hdr.substring(colonIdx + 1).trim();
        }
        break;
      }
      case '--verbose': case '-v':
        result.verbose = true;
        break;
    }
  }

  return result;
}

function buildEvent(args: CliArgs) {
  const userClaims = args.user ? JSON.parse(args.user) : {
    sub: process.env.LOCAL_USER_SUB || 'test-user-' + randomUUID().slice(0, 8),
    email: process.env.LOCAL_USER_EMAIL || 'local@evo.test',
    email_verified: 'true',
    'custom:organization_id': process.env.LOCAL_ORG_ID || randomUUID(),
    'custom:roles': process.env.LOCAL_USER_ROLES || 'admin',
  };

  const queryParams: Record<string, string> = {};
  if (args.query) {
    for (const pair of args.query.split('&')) {
      const [k, v] = pair.split('=');
      if (k) queryParams[k] = v || '';
    }
  }

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'user-agent': 'EVO-Local-Invoker/1.0',
    'x-forwarded-for': '127.0.0.1',
    ...args.headers,
  };

  if (args.impersonate) {
    headers['x-impersonate-organization'] = args.impersonate;
  }

  const event: any = {
    version: '2.0',
    routeKey: `${args.method} /local/${args.handlerPath}`,
    rawPath: `/local/${args.handlerPath}`,
    rawQueryString: args.query || '',
    headers,
    queryStringParameters: Object.keys(queryParams).length > 0 ? queryParams : null,
    body: args.body || null,
    isBase64Encoded: false,
    requestContext: {
      accountId: '123456789012',
      apiId: 'local',
      domainName: 'localhost',
      domainPrefix: 'local',
      http: {
        method: args.method,
        path: `/local/${args.handlerPath}`,
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'EVO-Local-Invoker/1.0',
      },
      requestId: randomUUID(),
      routeKey: `${args.method} /local/${args.handlerPath}`,
      stage: '$default',
      time: new Date().toISOString(),
      timeEpoch: Date.now(),
    },
  };

  if (!args.noAuth) {
    event.requestContext.authorizer = {
      jwt: { claims: userClaims, scopes: [] },
      claims: userClaims,
    };
  }

  return event;
}

function buildContext() {
  return {
    callbackWaitsForEmptyEventLoop: true,
    functionName: 'local-invoke',
    functionVersion: '$LATEST',
    invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:local-invoke',
    memoryLimitInMB: '256',
    awsRequestId: randomUUID(),
    logGroupName: '/aws/lambda/local-invoke',
    logStreamName: 'local',
    getRemainingTimeInMillis: () => 30000,
    done: () => {},
    fail: () => {},
    succeed: () => {},
  };
}

async function resolveHandler(handlerPath: string): Promise<{ handler: Function }> {
  // Try multiple resolution patterns
  const basePath = resolve(__dirname, '../src/handlers');
  const candidates = [
    join(basePath, handlerPath + '.ts'),
    join(basePath, handlerPath + '.js'),
    join(basePath, handlerPath, 'index.ts'),
    join(basePath, handlerPath, 'index.js'),
  ];

  // For tsx, we import the .ts file directly
  for (const candidate of candidates) {
    try {
      const mod = await import(candidate);
      if (mod.handler && typeof mod.handler === 'function') {
        return { handler: mod.handler };
      }
      // Some handlers export default
      if (mod.default?.handler && typeof mod.default.handler === 'function') {
        return { handler: mod.default.handler };
      }
      // Try the module itself as handler
      if (typeof mod.default === 'function') {
        return { handler: mod.default };
      }
    } catch (e: any) {
      // File not found, try next
      if (e.code === 'ERR_MODULE_NOT_FOUND' || e.code === 'MODULE_NOT_FOUND') continue;
      throw e;
    }
  }

  throw new Error(
    `Handler not found: ${handlerPath}\n` +
    `Tried: ${candidates.join('\n  ')}\n` +
    `Hint: use path relative to handlers/ (ex: security/waf-dashboard-api)`
  );
}

async function main() {
  const args = parseArgs();
  const event = buildEvent(args);
  const context = buildContext();

  console.log(`\n🚀 Invoking: handlers/${args.handlerPath}`);
  console.log(`   Method: ${args.method}`);
  if (args.body) console.log(`   Body: ${args.body.substring(0, 100)}${args.body.length > 100 ? '...' : ''}`);
  if (args.impersonate) console.log(`   Impersonate: ${args.impersonate}`);
  if (!args.noAuth) {
    const claims = event.requestContext.authorizer.claims;
    console.log(`   User: ${claims.email} (${claims.sub})`);
    console.log(`   Org: ${claims['custom:organization_id']}`);
  }
  console.log('');

  if (args.verbose) {
    console.log('📋 Event:', JSON.stringify(event, null, 2));
    console.log('');
  }

  const startTime = Date.now();

  try {
    const { handler } = await resolveHandler(args.handlerPath);
    const result = await handler(event, context);
    const elapsed = Date.now() - startTime;

    console.log(`✅ Status: ${result.statusCode} (${elapsed}ms)\n`);

    if (result.body) {
      try {
        const parsed = JSON.parse(result.body);
        console.log(JSON.stringify(parsed, null, 2));
      } catch {
        console.log(result.body);
      }
    }

    if (args.verbose && result.headers) {
      console.log('\n📋 Response Headers:', JSON.stringify(result.headers, null, 2));
    }

    // Exit with non-zero if error status
    if (result.statusCode >= 400) process.exit(1);
  } catch (err: any) {
    const elapsed = Date.now() - startTime;
    console.error(`❌ Error (${elapsed}ms):`, err.message);
    if (args.verbose) console.error(err.stack);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
