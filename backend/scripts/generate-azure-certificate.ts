#!/usr/bin/env npx tsx
/**
 * Generate a self-signed certificate for Azure Service Principal authentication.
 * Valid for 10 years. Outputs PEM files for upload to Azure AD and use in the app.
 *
 * Usage:
 *   npx tsx backend/scripts/generate-azure-certificate.ts [--cn <common-name>] [--out <directory>]
 *
 * Output files:
 *   azure-cert.pem         — Public certificate (upload to Azure AD > App registrations > Certificates)
 *   azure-cert-private.pem — Private key (store securely, used by the app)
 *   azure-cert-combined.pem — Combined cert+key (used by @azure/identity ClientCertificateCredential)
 *   azure-cert-thumbprint.txt — SHA-1 thumbprint (for reference)
 *
 * After generating:
 *   1. Upload azure-cert.pem to Azure Portal > App registrations > Certificates & secrets > Certificates
 *   2. Store the combined PEM content in SSM Parameter Store or as encrypted DB field
 *   3. Configure the app to use auth_type='certificate' with the combined PEM
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

// Parse CLI args
const args = process.argv.slice(2);
let cn = 'evo-azure-service-principal';
let outDir = './certs';

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--cn' && args[i + 1]) cn = args[++i];
  if (args[i] === '--out' && args[i + 1]) outDir = args[++i];
}

// Ensure output directory exists
fs.mkdirSync(outDir, { recursive: true });

const certPath = path.join(outDir, 'azure-cert.pem');
const keyPath = path.join(outDir, 'azure-cert-private.pem');
const combinedPath = path.join(outDir, 'azure-cert-combined.pem');
const thumbprintPath = path.join(outDir, 'azure-cert-thumbprint.txt');

console.log(`Generating self-signed certificate for Azure AD...`);
console.log(`  CN: ${cn}`);
console.log(`  Validity: 10 years (3650 days)`);
console.log(`  Output: ${outDir}/`);
console.log('');

try {
  // Generate RSA 2048-bit private key + self-signed cert valid for 10 years
  execSync(
    `openssl req -x509 -newkey rsa:2048 -keyout "${keyPath}" -out "${certPath}" ` +
    `-days 3650 -nodes -subj "/CN=${cn}" -sha256`,
    { stdio: 'pipe' }
  );

  // Read generated files
  const cert = fs.readFileSync(certPath, 'utf-8');
  const key = fs.readFileSync(keyPath, 'utf-8');

  // Create combined PEM (cert + key) — required by @azure/identity
  const combined = cert + key;
  fs.writeFileSync(combinedPath, combined, { mode: 0o600 });

  // Calculate SHA-1 thumbprint (Azure uses this to identify the cert)
  const thumbprintOutput = execSync(
    `openssl x509 -in "${certPath}" -fingerprint -noout -sha1`,
    { encoding: 'utf-8' }
  ).trim();
  // Format: SHA1 Fingerprint=XX:XX:XX:...
  const thumbprint = thumbprintOutput.split('=')[1].replace(/:/g, '').toUpperCase();
  fs.writeFileSync(thumbprintPath, thumbprint);

  // Set restrictive permissions on private key files
  fs.chmodSync(keyPath, 0o600);
  fs.chmodSync(combinedPath, 0o600);

  console.log('✅ Certificate generated successfully!\n');
  console.log(`  📄 Public cert:   ${certPath}`);
  console.log(`  🔑 Private key:   ${keyPath}`);
  console.log(`  📦 Combined PEM:  ${combinedPath}`);
  console.log(`  🔍 Thumbprint:    ${thumbprint}`);
  console.log('');
  console.log('Next steps:');
  console.log('  1. Upload the PUBLIC cert to Azure Portal:');
  console.log('     Azure AD > App registrations > [Your App] > Certificates & secrets > Upload certificate');
  console.log(`     File: ${certPath}`);
  console.log('');
  console.log('  2. Store the COMBINED PEM securely (SSM Parameter Store or encrypted in DB):');
  console.log(`     File: ${combinedPath}`);
  console.log('');
  console.log('  3. Use auth_type="certificate" when saving Azure credentials in EVO');
  console.log('');
  console.log('  ⚠️  NEVER commit private key files to git!');
  console.log(`     Add "${outDir}/" to .gitignore`);

} catch (err: any) {
  console.error('❌ Failed to generate certificate:', err.message);
  console.error('');
  console.error('Make sure OpenSSL is installed:');
  console.error('  macOS: brew install openssl');
  console.error('  Ubuntu: sudo apt-get install openssl');
  process.exit(1);
}
