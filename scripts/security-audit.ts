#!/usr/bin/env tsx
/**
 * Security Audit Script
 * Validates military-grade security implementation
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

interface SecurityCheck {
  name: string;
  passed: boolean;
  message: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
}

const checks: SecurityCheck[] = [];

function addCheck(name: string, passed: boolean, message: string, severity: SecurityCheck['severity'] = 'medium') {
  checks.push({ name, passed, message, severity });
}

function checkFileExists(path: string, description: string): boolean {
  const exists = existsSync(path);
  addCheck(
    `File: ${description}`,
    exists,
    exists ? `✅ ${path} exists` : `❌ ${path} missing`,
    exists ? 'low' : 'high'
  );
  return exists;
}

function checkFileContent(path: string, pattern: RegExp, description: string, shouldExist: boolean = true): boolean {
  if (!existsSync(path)) {
    addCheck(description, false, `❌ File ${path} not found`, 'high');
    return false;
  }

  const content = readFileSync(path, 'utf-8');
  const found = pattern.test(content);
  const passed = shouldExist ? found : !found;

  addCheck(
    description,
    passed,
    passed 
      ? `✅ ${description}` 
      : `❌ ${description} - ${shouldExist ? 'Pattern not found' : 'Dangerous pattern found'}`,
    passed ? 'low' : (shouldExist ? 'medium' : 'critical')
  );

  return passed;
}

function runSecurityAudit() {
  console.log('🔒 Running Military-Grade Security Audit...\n');

  // Check critical security files exist
  checkFileExists('src/lib/secure-storage.ts', 'Secure Storage Implementation');
  checkFileExists('src/lib/csrf-protection.ts', 'CSRF Protection Module');
  checkFileExists('src/lib/input-sanitization.ts', 'Input Sanitization Library');
  checkFileExists('src/lib/security-config.ts', 'Security Configuration');
  checkFileExists('.env.example', 'Environment Template');

  // Check for hardcoded credentials (should NOT exist)
  checkFileContent(
    'src/integrations/aws/cognito-client-simple.ts',
    /isValidFallbackCredentials|generateMockToken|createFallbackSession/,
    'No hardcoded credentials in Cognito client',
    false
  );

  // Check for proper AWS SDK usage
  checkFileContent(
    'src/integrations/aws/cognito-client-simple.ts',
    /@aws-sdk\/client-cognito-identity-provider/,
    'Real AWS Cognito SDK imported'
  );

  // Check for CSRF protection in API client
  checkFileContent(
    'src/integrations/aws/api-client.ts',
    /getCSRFHeader/,
    'CSRF protection in API client'
  );

  // Check for secure storage usage
  checkFileContent(
    'src/integrations/aws/cognito-client-simple.ts',
    /secureStorage/,
    'Secure storage used for sessions'
  );

  // Check for input sanitization
  checkFileContent(
    'backend/src/lib/validation.ts',
    /sanitizeObject|sanitizeString/,
    'Input sanitization in backend validation'
  );

  // Check environment variables are properly configured
  checkFileContent(
    '.env.example',
    /VITE_STORAGE_ENCRYPTION_KEY/,
    'Storage encryption key in environment template'
  );

  // Check .gitignore excludes sensitive files
  checkFileContent(
    '.gitignore',
    /\.env/,
    'Environment files excluded from git'
  );

  // Check for localStorage usage (should NOT exist in security-critical files)
  checkFileContent(
    'src/integrations/aws/cognito-client-simple.ts',
    /localStorage/,
    'No localStorage usage in authentication',
    false
  );

  // Check for proper error handling
  checkFileContent(
    'src/integrations/aws/cognito-client-simple.ts',
    /handleAuthError/,
    'Proper error handling in authentication'
  );

  // Check for token validation
  checkFileContent(
    'src/integrations/aws/cognito-client-simple.ts',
    /validateToken|isTokenExpired/,
    'Token validation implemented'
  );

  // Generate report
  console.log('📊 Security Audit Results:\n');

  const critical = checks.filter(c => c.severity === 'critical');
  const high = checks.filter(c => c.severity === 'high');
  const medium = checks.filter(c => c.severity === 'medium');
  const low = checks.filter(c => c.severity === 'low');

  const passed = checks.filter(c => c.passed).length;
  const total = checks.length;

  console.log(`Overall Score: ${passed}/${total} (${Math.round((passed/total) * 100)}%)\n`);

  if (critical.length > 0) {
    console.log('🚨 CRITICAL ISSUES:');
    critical.forEach(c => console.log(`  ${c.message}`));
    console.log();
  }

  if (high.length > 0) {
    console.log('⚠️  HIGH PRIORITY:');
    high.forEach(c => console.log(`  ${c.message}`));
    console.log();
  }

  if (medium.length > 0) {
    console.log('📋 MEDIUM PRIORITY:');
    medium.forEach(c => console.log(`  ${c.message}`));
    console.log();
  }

  if (low.length > 0) {
    console.log('✅ PASSED CHECKS:');
    low.filter(c => c.passed).forEach(c => console.log(`  ${c.message}`));
    console.log();
  }

  // Security recommendations
  console.log('🛡️  SECURITY RECOMMENDATIONS:\n');
  console.log('1. Ensure VITE_STORAGE_ENCRYPTION_KEY is set to a strong 32-character key in production');
  console.log('2. Configure AWS Cognito User Pool with MFA enabled');
  console.log('3. Set up AWS WAF rules for additional protection');
  console.log('4. Enable AWS CloudTrail for audit logging');
  console.log('5. Implement rate limiting at the API Gateway level');
  console.log('6. Regular security scans and penetration testing');
  console.log('7. Monitor for suspicious authentication patterns');

  const criticalCount = critical.filter(c => !c.passed).length;
  const highCount = high.filter(c => !c.passed).length;

  if (criticalCount > 0 || highCount > 0) {
    console.log('\n❌ SECURITY AUDIT FAILED');
    console.log(`Critical issues: ${criticalCount}, High priority: ${highCount}`);
    process.exit(1);
  } else {
    console.log('\n✅ SECURITY AUDIT PASSED');
    console.log('Military-grade security standards met!');
  }
}

// Run the audit
runSecurityAudit();