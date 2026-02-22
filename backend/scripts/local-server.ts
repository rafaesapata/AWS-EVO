#!/usr/bin/env npx tsx
/**
 * EVO Local Development Server
 * 
 * Emula o API Gateway + Lambda localmente.
 * Parseia o SAM template para extrair rotas automaticamente.
 * Decodifica JWT real do Cognito para passar claims aos handlers.
 * 
 * Uso:
 *   npx tsx backend/scripts/local-server.ts [options]
 *   npm run serve --prefix backend
 * 
 * Options:
 *   --tunnel, -t    Usar .env.tunnel (DB via SSH tunnel)
 *   --port, -p      Porta do servidor (default: 3001)
 *   --no-auth       Desabilitar validação JWT (usar claims fake)
 *   --user          JSON com claims customizados
 *   --verbose, -v   Log detalhado
 */

import { resolve, join } from 'path';
import { config } from 'dotenv';
import { randomUUID } from 'crypto';
import { readFileSync, existsSync } from 'fs';
import express from 'express';
import type { Request, Response } from 'express';

// ============================================================================
// ENV SETUP
// ============================================================================

const args = process.argv.slice(2);
const hasTunnel = args.includes('--tunnel') || args.includes('-t');
const noAuth = args.includes('--no-auth');
const verbose = args.includes('--verbose') || args.includes('-v');

// Parse port
let port = 4201;
const portIdx = args.findIndex(a => a === '--port' || a === '-p');
if (portIdx >= 0 && args[portIdx + 1]) port = parseInt(args[portIdx + 1], 10);

// Parse custom user
let customUser: Record<string, any> | null = null;
const userIdx = args.findIndex(a => a === '--user');
if (userIdx >= 0 && args[userIdx + 1]) customUser = JSON.parse(args[userIdx + 1]);

// Load env
if (hasTunnel) {
  config({ path: resolve(__dirname, '../.env.tunnel'), override: true });
}
config({ path: resolve(__dirname, '../.env') });
config({ path: resolve(__dirname, '../../.env') });

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL not found');
  process.exit(1);
}

// Lambda-like env vars
process.env.ENVIRONMENT = process.env.ENVIRONMENT || 'development';
process.env.IS_LOCAL = 'true';
process.env.PROJECT_NAME = process.env.PROJECT_NAME || 'evo-uds-v3';
process.env.AWS_REGION = process.env.AWS_REGION || 'us-east-1';
process.env.AWS_PROFILE = process.env.AWS_PROFILE || 'EVO_PRODUCTION';
process.env.COGNITO_USER_POOL_ID = process.env.COGNITO_USER_POOL_ID || process.env.VITE_AWS_USER_POOL_ID || 'us-east-1_local';
process.env.COGNITO_CLIENT_ID = process.env.COGNITO_CLIENT_ID || process.env.VITE_AWS_USER_POOL_CLIENT_ID || 'local-client';
process.env.TOKEN_ENCRYPTION_KEY = process.env.TOKEN_ENCRYPTION_KEY || 'local-test-key-32chars-minimum!!';

// ============================================================================
// ROUTE MAP — parse SAM template
// ============================================================================

interface RouteEntry {
  path: string;           // /api/functions/xxx
  handlerFile: string;    // relative to handlers/ (e.g. security/waf-dashboard-api)
  isPublic: boolean;
}

function parseSamRoutes(): RouteEntry[] {
  const samPath = resolve(__dirname, '../../sam/production-lambdas-only.yaml');
  if (!existsSync(samPath)) {
    console.error('❌ SAM template not found:', samPath);
    process.exit(1);
  }

  const content = readFileSync(samPath, 'utf-8');
  const routes: RouteEntry[] = [];

  // Known public routes from SAM template (Auth: Authorizer: NONE)
  const PUBLIC_ROUTES = new Set([
    '/api/functions/forgot-password',
    '/api/functions/self-register',
    '/api/functions/webauthn-authenticate',
    '/api/functions/webauthn-check',
    '/api/functions/get-executive-dashboard-public',
    '/api/functions/cloudformation-webhook',
    '/api/functions/log-frontend-error',
    '/api/functions/websocket-connect',
    '/api/functions/websocket-disconnect',
  ]);

  // Parse using regex to extract resource blocks
  // Pattern: Handler + CodeUri at resource level, Path at event level
  let currentHandler = '';
  let currentCodeUri = '';

  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    const handlerMatch = trimmed.match(/^Handler:\s+(\S+)/);
    if (handlerMatch) {
      currentHandler = handlerMatch[1].replace('.handler', '');
    }

    const codeUriMatch = trimmed.match(/^CodeUri:\s+(\S+)/);
    if (codeUriMatch) {
      currentCodeUri = codeUriMatch[1]
        .replace(/^\.\.\//, '')
        .replace(/^backend\/src\/handlers\//, '')
        .replace(/\/$/, '');
    }

    const pathMatch = trimmed.match(/^Path:\s+(\/api\/functions\/\S+)/);
    if (pathMatch && currentHandler) {
      const apiPath = pathMatch[1];
      const handlerFile = `${currentCodeUri}/${currentHandler}`.replace(/^\/+/, '');
      routes.push({
        path: apiPath,
        handlerFile,
        isPublic: PUBLIC_ROUTES.has(apiPath),
      });
    }
  }

  return routes;
}

// ============================================================================
// JWT DECODE (no validation — trusts Cognito tokens for local dev)
// ============================================================================

function decodeJWT(token: string): Record<string, any> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = Buffer.from(parts[1], 'base64url').toString('utf-8');
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

function getDefaultClaims(): Record<string, any> {
  return customUser || {
    sub: process.env.LOCAL_USER_SUB || 'test-user-' + randomUUID().slice(0, 8),
    email: process.env.LOCAL_USER_EMAIL || 'local@evo.test',
    email_verified: 'true',
    'custom:organization_id': process.env.LOCAL_ORG_ID || randomUUID(),
    'custom:roles': process.env.LOCAL_USER_ROLES || 'super_admin',
  };
}

// ============================================================================
// HANDLER CACHE & RESOLVER
// ============================================================================

const handlerCache = new Map<string, Function>();

async function resolveHandler(handlerFile: string): Promise<Function> {
  if (handlerCache.has(handlerFile)) {
    return handlerCache.get(handlerFile)!;
  }

  const basePath = resolve(__dirname, '../src/handlers');
  const candidates = [
    join(basePath, handlerFile + '.ts'),
    join(basePath, handlerFile + '.js'),
    join(basePath, handlerFile, 'index.ts'),
  ];

  for (const candidate of candidates) {
    try {
      const mod = await import(candidate);
      const fn = mod.handler || mod.default?.handler || mod.default;
      if (typeof fn === 'function') {
        handlerCache.set(handlerFile, fn);
        return fn;
      }
    } catch (e: any) {
      if (e.code === 'ERR_MODULE_NOT_FOUND' || e.code === 'MODULE_NOT_FOUND') continue;
      throw e;
    }
  }

  throw new Error(`Handler not found: ${handlerFile}`);
}

// ============================================================================
// BUILD LAMBDA EVENT from Express Request
// ============================================================================

function buildLambdaEvent(req: Request, claims: Record<string, any> | null, routePath: string) {
  const method = req.method;
  const queryParams = Object.keys(req.query).length > 0
    ? Object.fromEntries(Object.entries(req.query).map(([k, v]) => [k, String(v)]))
    : null;

  const rawQueryString = req.url.includes('?') ? req.url.split('?')[1] : '';

  const event: any = {
    version: '2.0',
    routeKey: `${method} ${routePath}`,
    rawPath: routePath,
    rawQueryString,
    headers: { ...req.headers } as Record<string, string>,
    queryStringParameters: queryParams,
    body: req.body ? JSON.stringify(req.body) : null,
    isBase64Encoded: false,
    requestContext: {
      accountId: '523115032346',
      apiId: 'local-dev',
      domainName: 'localhost',
      domainPrefix: 'local',
      http: {
        method,
        path: routePath,
        protocol: 'HTTP/1.1',
        sourceIp: req.ip || '127.0.0.1',
        userAgent: req.headers['user-agent'] || 'EVO-Local-Server/1.0',
      },
      requestId: req.headers['x-request-id'] as string || randomUUID(),
      routeKey: `${method} ${routePath}`,
      stage: '$default',
      time: new Date().toISOString(),
      timeEpoch: Date.now(),
    },
  };

  if (claims) {
    event.requestContext.authorizer = {
      jwt: { claims, scopes: [] },
      claims,
    };
  }

  return event;
}

function buildLambdaContext() {
  return {
    callbackWaitsForEmptyEventLoop: true,
    functionName: 'local-dev-server',
    functionVersion: '$LATEST',
    invokedFunctionArn: 'arn:aws:lambda:us-east-1:523115032346:function:local-dev',
    memoryLimitInMB: '512',
    awsRequestId: randomUUID(),
    logGroupName: '/aws/lambda/local-dev',
    logStreamName: 'local',
    getRemainingTimeInMillis: () => 60000,
    done: () => {},
    fail: () => {},
    succeed: () => {},
  };
}

// ============================================================================
// EXPRESS SERVER
// ============================================================================

async function main() {
  console.log('\n🚀 EVO Local Development Server\n');

  // Parse routes from SAM template
  const routes = parseSamRoutes();
  console.log(`📋 Loaded ${routes.length} routes from SAM template`);

  const publicPaths = new Set(routes.filter(r => r.isPublic).map(r => r.path));
  console.log(`🔓 Public routes: ${publicPaths.size}`);

  // Build route lookup: path -> handlerFile
  const routeMap = new Map<string, string>();
  for (const route of routes) {
    routeMap.set(route.path, route.handlerFile);
  }

  const app = express();

  // Parse JSON body
  app.use(express.json({ limit: '10mb' }));

  // CORS — allow everything locally
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Request-ID, X-Correlation-ID, X-Impersonate-Organization, X-CSRF-Token');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Expose-Headers', 'X-Request-ID, X-Correlation-ID');
    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }
    next();
  });

  // Health check
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', routes: routes.length, tunnel: hasTunnel });
  });

  // List all routes
  app.get('/routes', (_req, res) => {
    res.json(routes.map(r => ({
      path: r.path,
      handler: r.handlerFile,
      public: r.isPublic,
    })));
  });

  // Main route handler — catch all /api/functions/*
  app.all('/api/functions/:functionName', async (req: Request, res: Response) => {
    const functionName = req.params.functionName;
    const routePath = `/api/functions/${functionName}`;
    const handlerFile = routeMap.get(routePath);
    const startTime = Date.now();

    if (!handlerFile) {
      console.log(`❌ 404 ${routePath} — no handler mapped`);
      return res.status(404).json({ error: `Unknown function: ${functionName}` });
    }

    // Resolve auth claims
    let claims: Record<string, any> | null = null;
    const isPublicRoute = publicPaths.has(routePath);

    if (!noAuth && !isPublicRoute) {
      const authHeader = req.headers.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.slice(7);
        claims = decodeJWT(token);
        if (!claims) {
          console.log(`⚠️  Invalid JWT for ${routePath}, using default claims`);
          claims = getDefaultClaims();
        }
      } else {
        claims = getDefaultClaims();
        if (verbose) console.log(`ℹ️  No auth header for ${routePath}, using default claims`);
      }

      // Handle impersonation header
      const impersonateOrg = req.headers['x-impersonate-organization'] as string;
      if (impersonateOrg && claims) {
        claims['custom:impersonate_organization_id'] = impersonateOrg;
      }
    } else if (isPublicRoute) {
      // Public routes may still have a token
      const authHeader = req.headers.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        claims = decodeJWT(authHeader.slice(7));
      }
    }

    try {
      const handler = await resolveHandler(handlerFile);
      const event = buildLambdaEvent(req, claims, routePath);
      const context = buildLambdaContext();

      if (verbose) {
        console.log(`\n📨 ${req.method} ${routePath} → ${handlerFile}`);
        if (claims) console.log(`   User: ${claims.email} | Org: ${claims['custom:organization_id']}`);
      }

      const result = await handler(event, context);
      const elapsed = Date.now() - startTime;

      // Set response headers from Lambda result
      if (result.headers) {
        for (const [key, value] of Object.entries(result.headers)) {
          // Don't override CORS headers we already set
          if (!key.toLowerCase().startsWith('access-control-')) {
            res.setHeader(key, value as string);
          }
        }
      }

      const statusCode = result.statusCode || 200;
      const statusEmoji = statusCode < 400 ? '✅' : '❌';
      console.log(`${statusEmoji} ${req.method} ${routePath} → ${statusCode} (${elapsed}ms)`);

      res.status(statusCode);
      if (result.body) {
        res.setHeader('Content-Type', 'application/json');
        res.send(result.body);
      } else {
        res.end();
      }
    } catch (err: any) {
      const elapsed = Date.now() - startTime;
      console.error(`💥 ${req.method} ${routePath} → ERROR (${elapsed}ms):`, err.message);
      if (verbose) console.error(err.stack);

      // Auto-recovery: clear cached handler so next request retries fresh import
      if (handlerFile) handlerCache.delete(handlerFile);

      // Detect DB connection errors and hint about tunnel
      const isDbError = /ECONNREFUSED|ETIMEDOUT|connection.*refused|prisma.*connect/i.test(err.message);
      if (isDbError) {
        console.log(`🔄 DB connection error detected — is the SSH tunnel running?`);
      }

      res.status(500).json({
        success: false,
        error: err.message,
        handler: handlerFile,
        ...(isDbError ? { hint: 'DB connection failed. Run: ./backend/scripts/db-tunnel.sh' } : {}),
      });
    }
  });

  // Start server
  const server = app.listen(port, () => {
    console.log(`\n✅ Server running on http://localhost:${port}`);
    console.log(`   Tunnel: ${hasTunnel ? 'ON (DB via SSH)' : 'OFF'}`);
    console.log(`   Auth: ${noAuth ? 'DISABLED' : 'JWT decode (Cognito tokens)'}`);
    console.log(`\n📡 Frontend proxy: VITE_API_BASE_URL=http://localhost:${port}`);
    console.log(`   Or add proxy to vite.config.ts\n`);
    console.log(`🔗 Endpoints:`);
    console.log(`   GET  http://localhost:${port}/health`);
    console.log(`   GET  http://localhost:${port}/routes`);
    console.log(`   POST http://localhost:${port}/api/functions/<name>\n`);
  });

  // Graceful error recovery — keep server alive on unhandled errors
  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`❌ Port ${port} already in use. Try: --port ${port + 1}`);
      process.exit(1);
    }
    console.error('⚠️  Server error (recovered):', err.message);
  });
}

// Global handlers — prevent process crash
process.on('uncaughtException', (err) => {
  console.error('⚠️  Uncaught exception (server still running):', err.message);
});

process.on('unhandledRejection', (reason: any) => {
  console.error('⚠️  Unhandled rejection (server still running):', reason?.message || reason);
});

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
