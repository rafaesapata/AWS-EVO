/**
 * Generate Azure Certificate Handler
 * 
 * Generates a self-signed X.509 certificate (RSA 2048, 10-year validity)
 * for Azure Service Principal certificate-based authentication.
 * 
 * The combined PEM (cert + private key) is encrypted and stored in the
 * azure_credentials record. The PUBLIC certificate PEM is returned so
 * the admin can upload it to Azure Portal.
 */

import * as crypto from 'crypto';
if (typeof globalThis.crypto === 'undefined') {
  (globalThis as any).crypto = crypto.webcrypto || crypto;
}

import type { AuthorizedEvent, LambdaContext, APIGatewayProxyResultV2 } from '../../types/lambda.js';
import { success, error, corsOptions } from '../../lib/response.js';
import { getUserFromEvent, getOrganizationId, isSuperAdmin } from '../../lib/auth.js';
import { getPrismaClient } from '../../lib/database.js';
import { logger } from '../../lib/logger.js';
import { getHttpMethod } from '../../lib/middleware.js';
import { encryptToken, serializeEncryptedToken } from '../../lib/token-encryption.js';
import { logAuditAsync, getIpFromEvent, getUserAgentFromEvent } from '../../lib/audit-service.js';
import { z } from 'zod';
import { parseAndValidateBody } from '../../lib/validation.js';

const generateCertSchema = z.object({
  action: z.literal('generate'),
  credentialId: z.string().uuid('Invalid credential ID'),
  commonName: z.string().min(1).max(200).optional().default('EVO Azure Service Principal'),
  validityYears: z.number().min(1).max(30).optional().default(10),
});

const listCertsSchema = z.object({
  action: z.literal('list'),
});

const requestSchema = z.discriminatedUnion('action', [
  generateCertSchema,
  listCertsSchema,
]);

/**
 * Generate a self-signed X.509 certificate using Node.js crypto.
 * Returns { publicPem, combinedPem, thumbprint, expiresAt }.
 */
function generateSelfSignedCertificate(commonName: string, validityYears: number) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  // Build self-signed X.509 certificate using the new Node.js X509Certificate API
  // Node 18 doesn't have createCertificate, so we use the forge-free approach:
  // Generate a CSR-like structure and self-sign it.
  // Since Node.js 18 doesn't natively create X.509 certs, we build one manually
  // using ASN.1 DER encoding.

  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setFullYear(expiresAt.getFullYear() + validityYears);

  const certDer = buildSelfSignedCertDer(commonName, now, expiresAt, publicKey, privateKey);
  const certPem = `-----BEGIN CERTIFICATE-----\n${certDer.toString('base64').match(/.{1,64}/g)!.join('\n')}\n-----END CERTIFICATE-----\n`;

  // Combined PEM = cert + private key (what Azure SDK needs)
  const combinedPem = certPem + privateKey;

  // SHA-1 thumbprint of the DER-encoded certificate (Azure uses this)
  const thumbprint = crypto.createHash('sha1').update(certDer).digest('hex').toUpperCase();

  return { publicPem: certPem, combinedPem, thumbprint, expiresAt };
}

// ---- ASN.1 DER helpers for building a minimal self-signed X.509 v3 cert ----

function asn1Length(length: number): Buffer {
  if (length < 0x80) return Buffer.from([length]);
  if (length < 0x100) return Buffer.from([0x81, length]);
  return Buffer.from([0x82, (length >> 8) & 0xff, length & 0xff]);
}

function asn1Sequence(...items: Buffer[]): Buffer {
  const body = Buffer.concat(items);
  return Buffer.concat([Buffer.from([0x30]), asn1Length(body.length), body]);
}

function asn1Set(...items: Buffer[]): Buffer {
  const body = Buffer.concat(items);
  return Buffer.concat([Buffer.from([0x31]), asn1Length(body.length), body]);
}

function asn1Integer(value: Buffer | number): Buffer {
  let buf: Buffer;
  if (typeof value === 'number') {
    if (value <= 0x7f) {
      buf = Buffer.from([value]);
    } else {
      const hex = value.toString(16);
      buf = Buffer.from(hex.length % 2 ? '0' + hex : hex, 'hex');
      if (buf[0] & 0x80) buf = Buffer.concat([Buffer.from([0]), buf]);
    }
  } else {
    buf = value;
    if (buf[0] & 0x80) buf = Buffer.concat([Buffer.from([0]), buf]);
  }
  return Buffer.concat([Buffer.from([0x02]), asn1Length(buf.length), buf]);
}

function asn1Oid(oid: string): Buffer {
  const parts = oid.split('.').map(Number);
  const bytes: number[] = [40 * parts[0] + parts[1]];
  for (let i = 2; i < parts.length; i++) {
    let v = parts[i];
    if (v < 128) {
      bytes.push(v);
    } else {
      const enc: number[] = [];
      enc.push(v & 0x7f);
      v >>= 7;
      while (v > 0) {
        enc.push((v & 0x7f) | 0x80);
        v >>= 7;
      }
      bytes.push(...enc.reverse());
    }
  }
  const buf = Buffer.from(bytes);
  return Buffer.concat([Buffer.from([0x06]), asn1Length(buf.length), buf]);
}

function asn1Utf8String(str: string): Buffer {
  const buf = Buffer.from(str, 'utf8');
  return Buffer.concat([Buffer.from([0x0c]), asn1Length(buf.length), buf]);
}

function asn1BitString(data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from([0x00]), data]); // 0 unused bits
  return Buffer.concat([Buffer.from([0x03]), asn1Length(body.length), body]);
}

function asn1Explicit(tag: number, ...items: Buffer[]): Buffer {
  const body = Buffer.concat(items);
  return Buffer.concat([Buffer.from([0xa0 | tag]), asn1Length(body.length), body]);
}

function asn1GeneralizedTime(date: Date): Buffer {
  const str = date.toISOString().replace(/[-:T]/g, '').replace(/\.\d+Z/, 'Z');
  const buf = Buffer.from(str, 'ascii');
  return Buffer.concat([Buffer.from([0x18]), asn1Length(buf.length), buf]);
}

function asn1UtcTime(date: Date): Buffer {
  const y = date.getUTCFullYear() % 100;
  const str = [
    y.toString().padStart(2, '0'),
    (date.getUTCMonth() + 1).toString().padStart(2, '0'),
    date.getUTCDate().toString().padStart(2, '0'),
    date.getUTCHours().toString().padStart(2, '0'),
    date.getUTCMinutes().toString().padStart(2, '0'),
    date.getUTCSeconds().toString().padStart(2, '0'),
    'Z',
  ].join('');
  const buf = Buffer.from(str, 'ascii');
  return Buffer.concat([Buffer.from([0x17]), asn1Length(buf.length), buf]);
}

function buildSelfSignedCertDer(
  commonName: string,
  notBefore: Date,
  notAfter: Date,
  publicKeyPem: string,
  privateKeyPem: string
): Buffer {
  // Serial number (random 16 bytes)
  const serial = crypto.randomBytes(16);
  serial[0] &= 0x7f; // Ensure positive

  // SHA-256 with RSA OID
  const sha256WithRsa = asn1Sequence(
    asn1Oid('1.2.840.113549.1.1.11'), // sha256WithRSAEncryption
    Buffer.from([0x05, 0x00]) // NULL
  );

  // Issuer/Subject: CN=commonName
  const rdnSequence = asn1Sequence(
    asn1Set(
      asn1Sequence(
        asn1Oid('2.5.4.3'), // commonName
        asn1Utf8String(commonName)
      )
    )
  );

  // Validity
  const useGeneralized = notAfter.getUTCFullYear() >= 2050;
  const validity = asn1Sequence(
    asn1UtcTime(notBefore),
    useGeneralized ? asn1GeneralizedTime(notAfter) : asn1UtcTime(notAfter)
  );

  // Extract public key DER from PEM
  const pubKeyBase64 = publicKeyPem
    .replace(/-----BEGIN PUBLIC KEY-----/, '')
    .replace(/-----END PUBLIC KEY-----/, '')
    .replace(/\s/g, '');
  const pubKeyDer = Buffer.from(pubKeyBase64, 'base64');

  // TBS (To Be Signed) Certificate
  const tbs = asn1Sequence(
    asn1Explicit(0, asn1Integer(2)), // version v3
    asn1Integer(serial),
    sha256WithRsa,
    rdnSequence, // issuer
    validity,
    rdnSequence, // subject (same as issuer for self-signed)
    pubKeyDer    // subjectPublicKeyInfo (already a SEQUENCE from spki encoding)
  );

  // Sign the TBS with the private key
  const signer = crypto.createSign('SHA256');
  signer.update(tbs);
  const signature = signer.sign(privateKeyPem);

  // Full certificate
  const cert = asn1Sequence(
    tbs,
    sha256WithRsa,
    asn1BitString(signature)
  );

  return cert;
}

export async function handler(
  event: AuthorizedEvent,
  _context: LambdaContext
): Promise<APIGatewayProxyResultV2> {
  if (getHttpMethod(event) === 'OPTIONS') return corsOptions();

  const origin = event.headers?.['origin'] || event.headers?.['Origin'] || '*';

  try {
    const user = getUserFromEvent(event);

    if (!isSuperAdmin(user)) {
      return error('Forbidden: super_admin role required', 403, undefined, origin);
    }

    const organizationId = getOrganizationId(user);
    const prisma = getPrismaClient();

    let body: any;
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return error('Invalid JSON body', 400, undefined, origin);
    }

    // Default action to 'generate' if not specified
    if (!body.action) body.action = 'generate';

    const validation = parseAndValidateBody(requestSchema, JSON.stringify(body));
    if (!validation.success) {
      return validation.error;
    }

    const data = validation.data;

    if (data.action === 'list') {
      // List all Azure credentials with certificate info
      const credentials = await prisma.azureCredential.findMany({
        where: { organization_id: organizationId, auth_type: 'certificate' },
        select: {
          id: true,
          subscription_id: true,
          subscription_name: true,
          tenant_id: true,
          client_id: true,
          certificate_thumbprint: true,
          certificate_expires_at: true,
          is_active: true,
          created_at: true,
          updated_at: true,
        },
        orderBy: { created_at: 'desc' },
      });

      return success({ credentials }, 200, origin);
    }

    // action === 'generate'
    const { credentialId, commonName, validityYears } = data;

    // Verify credential exists and belongs to organization
    const credential = await prisma.azureCredential.findFirst({
      where: {
        id: credentialId,
        organization_id: organizationId,
      },
    });

    if (!credential) {
      return error('Azure credential not found', 404, undefined, origin);
    }

    logger.info('Generating Azure certificate', {
      organizationId,
      credentialId,
      commonName,
      validityYears,
    });

    // Generate the certificate
    const { publicPem, combinedPem, thumbprint, expiresAt } = generateSelfSignedCertificate(
      commonName!,
      validityYears!
    );

    // Encrypt the combined PEM (cert + private key) before storing
    const encrypted = encryptToken(combinedPem);
    const encryptedPem = serializeEncryptedToken(encrypted);

    // Update the credential with certificate data and switch auth_type
    await prisma.azureCredential.update({
      where: { id: credentialId },
      data: {
        auth_type: 'certificate',
        certificate_pem: encryptedPem,
        certificate_thumbprint: thumbprint,
        certificate_expires_at: expiresAt,
        // Clear client_secret since we're switching to certificate
        client_secret: null,
      },
    });

    // Audit log
    logAuditAsync({
      organizationId,
      userId: user.sub,
      action: 'AZURE_CERTIFICATE_GENERATED',
      resourceType: 'azure_credential',
      resourceId: credentialId,
      details: {
        thumbprint,
        expires_at: expiresAt.toISOString(),
        validity_years: validityYears,
        common_name: commonName,
        subscription_id: credential.subscription_id,
      },
      ipAddress: getIpFromEvent(event),
      userAgent: getUserAgentFromEvent(event),
    });

    logger.info('Azure certificate generated and stored', {
      organizationId,
      credentialId,
      thumbprint,
      expiresAt: expiresAt.toISOString(),
    });

    // Return the PUBLIC certificate PEM for the admin to upload to Azure Portal
    return success({
      message: 'Certificate generated successfully. Upload the public certificate to Azure Portal > App registrations > Certificates & secrets.',
      publicCertificatePem: publicPem,
      thumbprint,
      expiresAt: expiresAt.toISOString(),
      credentialId,
      subscriptionId: credential.subscription_id,
      subscriptionName: credential.subscription_name,
      instructions: [
        '1. Copie o certificado público (publicCertificatePem) abaixo',
        '2. Acesse Azure Portal > App registrations > seu app',
        '3. Vá em Certificates & secrets > Certificates > Upload certificate',
        '4. Cole o certificado e confirme',
        `5. Verifique que o thumbprint no Azure é: ${thumbprint}`,
      ],
    }, 200, origin);
  } catch (err: any) {
    logger.error('Error generating Azure certificate', { error: err.message, stack: err.stack });
    return error(err.message || 'Failed to generate certificate', 500, undefined, origin);
  }
}
