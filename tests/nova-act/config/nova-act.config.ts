/**
 * Amazon Nova Act Configuration
 * Configuração principal para testes E2E com Nova Act
 */

import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory of this config file
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from tests/nova-act directory
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Schema de validação da configuração
const ConfigSchema = z.object({
  // Nova Act Settings
  novaAct: z.object({
    apiKey: z.string().optional(),
    useIAM: z.boolean().default(false),
    region: z.string().default('us-east-1'),
    modelId: z.string().default('nova-act-latest'),
    timeout: z.number().default(120000), // 2 minutos
    maxSteps: z.number().default(30),
    headless: z.boolean().default(true),
    recordVideo: z.boolean().default(true),
    logsDirectory: z.string().default('./reports/traces'),
  }),

  // Application Settings
  app: z.object({
    baseUrl: z.string().url(),
    apiUrl: z.string().url(),
    environment: z.enum(['development', 'staging', 'production']),
  }),

  // Test User Credentials
  testUser: z.object({
    email: z.string().email(),
    password: z.string().min(6),
    mfaSecret: z.string().optional(),
  }),

  // Admin User (for admin tests)
  adminUser: z.object({
    email: z.string().email(),
    password: z.string().min(6),
  }).optional(),

  // Browser Settings
  browser: z.object({
    userAgent: z.string().optional(),
    viewport: z.object({
      width: z.number().default(1920),
      height: z.number().default(1080),
    }),
    locale: z.string().default('pt-BR'),
    timezone: z.string().default('America/Sao_Paulo'),
  }),

  // Retry Settings
  retry: z.object({
    maxAttempts: z.number().default(3),
    delayMs: z.number().default(1000),
    backoffMultiplier: z.number().default(2),
  }),

  // Reporting
  reporting: z.object({
    screenshotOnFailure: z.boolean().default(true),
    screenshotOnSuccess: z.boolean().default(false),
    htmlReport: z.boolean().default(true),
    s3Bucket: z.string().optional(),
    s3Prefix: z.string().default('nova-act-reports/'),
  }),
});

export type NovaActConfig = z.infer<typeof ConfigSchema>;

// Carregar configuração do ambiente
function loadConfig(): NovaActConfig {
  const config = {
    novaAct: {
      apiKey: process.env.NOVA_ACT_API_KEY,
      useIAM: process.env.NOVA_ACT_USE_IAM === 'true',
      region: process.env.AWS_REGION || 'us-east-1',
      modelId: process.env.NOVA_ACT_MODEL_ID || 'nova-act-latest',
      timeout: parseInt(process.env.NOVA_ACT_TIMEOUT || '120000'),
      maxSteps: parseInt(process.env.NOVA_ACT_MAX_STEPS || '30'),
      headless: process.env.NOVA_ACT_HEADLESS !== 'false',
      recordVideo: process.env.NOVA_ACT_RECORD_VIDEO === 'true',
      logsDirectory: process.env.NOVA_ACT_LOGS_DIR || './reports/traces',
    },
    app: {
      baseUrl: process.env.APP_URL || 'https://evo.ai.udstec.io',
      apiUrl: process.env.API_URL || 'https://api-evo.ai.udstec.io',
      environment: (process.env.APP_ENV || 'production') as 'development' | 'staging' | 'production',
    },
    testUser: {
      email: process.env.TEST_USER_EMAIL || '',
      password: process.env.TEST_USER_PASSWORD || '',
      mfaSecret: process.env.TEST_USER_MFA_SECRET,
    },
    adminUser: process.env.ADMIN_USER_EMAIL ? {
      email: process.env.ADMIN_USER_EMAIL,
      password: process.env.ADMIN_USER_PASSWORD || '',
    } : undefined,
    browser: {
      userAgent: process.env.BROWSER_USER_AGENT,
      viewport: {
        width: parseInt(process.env.BROWSER_WIDTH || '1920'),
        height: parseInt(process.env.BROWSER_HEIGHT || '1080'),
      },
      locale: process.env.BROWSER_LOCALE || 'pt-BR',
      timezone: process.env.BROWSER_TIMEZONE || 'America/Sao_Paulo',
    },
    retry: {
      maxAttempts: parseInt(process.env.RETRY_MAX_ATTEMPTS || '3'),
      delayMs: parseInt(process.env.RETRY_DELAY_MS || '1000'),
      backoffMultiplier: parseFloat(process.env.RETRY_BACKOFF || '2'),
    },
    reporting: {
      screenshotOnFailure: process.env.SCREENSHOT_ON_FAILURE !== 'false',
      screenshotOnSuccess: process.env.SCREENSHOT_ON_SUCCESS === 'true',
      htmlReport: process.env.HTML_REPORT !== 'false',
      s3Bucket: process.env.REPORT_S3_BUCKET,
      s3Prefix: process.env.REPORT_S3_PREFIX || 'nova-act-reports/',
    },
  };

  return ConfigSchema.parse(config);
}

export const config = loadConfig();

// URLs da aplicação
export const URLS = {
  auth: `${config.app.baseUrl}/`,
  login: `${config.app.baseUrl}/auth`,
  dashboard: `${config.app.baseUrl}/app`,
  awsSettings: `${config.app.baseUrl}/aws-settings`,
  securityScans: `${config.app.baseUrl}/security-scans`,
  securityPosture: `${config.app.baseUrl}/security-posture`,
  compliance: `${config.app.baseUrl}/compliance`,
  threatDetection: `${config.app.baseUrl}/threat-detection`,
  costOptimization: `${config.app.baseUrl}/cost-optimization`,
  riSavingsPlans: `${config.app.baseUrl}/ri-savings-plans`,
  resourceMonitoring: `${config.app.baseUrl}/resource-monitoring`,
  systemMonitoring: `${config.app.baseUrl}/system-monitoring`,
  wellArchitected: `${config.app.baseUrl}/well-architected`,
  knowledgeBase: `${config.app.baseUrl}/knowledge-base`,
  organizations: `${config.app.baseUrl}/organizations`,
  cloudtrailAudit: `${config.app.baseUrl}/cloudtrail-audit`,
  intelligentAlerts: `${config.app.baseUrl}/intelligent-alerts`,
  copilotAI: `${config.app.baseUrl}/copilot-ai`,
  tvDashboard: `${config.app.baseUrl}/tv`,
} as const;

export default config;
