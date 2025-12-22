#!/usr/bin/env tsx

/**
 * Version Increment Script
 * Automatically increments version numbers on deploy
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

interface VersionConfig {
  major: number;
  minor: number;
  patch: number;
  deployCount: number;
  lastDeploy: string;
}

const VERSION_FILE = join(process.cwd(), 'version.json');
const PACKAGE_JSON = join(process.cwd(), 'package.json');

// Load or create version config
function loadVersionConfig(): VersionConfig {
  try {
    const content = readFileSync(VERSION_FILE, 'utf-8');
    return JSON.parse(content);
  } catch {
    // Create initial version config
    return {
      major: 2,
      minor: 1,
      patch: 0,
      deployCount: 0,
      lastDeploy: new Date().toISOString()
    };
  }
}

// Save version config
function saveVersionConfig(config: VersionConfig): void {
  writeFileSync(VERSION_FILE, JSON.stringify(config, null, 2));
}

// Update package.json version
function updatePackageJson(version: string): void {
  try {
    const packageJson = JSON.parse(readFileSync(PACKAGE_JSON, 'utf-8'));
    packageJson.version = version;
    writeFileSync(PACKAGE_JSON, JSON.stringify(packageJson, null, 2) + '\n');
  } catch (error) {
    console.warn('Could not update package.json:', error);
  }
}

// Generate version.ts file
function generateVersionFile(config: VersionConfig): void {
  const versionTs = `/**
 * Application Version Configuration
 * Auto-generated on deploy - DO NOT EDIT MANUALLY
 * Last updated: ${new Date().toISOString()}
 */

export const APP_VERSION = {
  major: ${config.major},
  minor: ${config.minor},
  patch: ${config.patch},
  deployCount: ${config.deployCount},
  build: "${Date.now().toString().slice(-6)}",
  environment: import.meta.env.MODE || 'development',
  deployDate: "${config.lastDeploy}",
} as const;

export const getVersionString = (): string => {
  return \`v\${APP_VERSION.major}.\${APP_VERSION.minor}.\${APP_VERSION.patch}\`;
};

export const getFullVersionString = (): string => {
  return \`v\${APP_VERSION.major}.\${APP_VERSION.minor}.\${APP_VERSION.patch}-\${APP_VERSION.environment}.\${APP_VERSION.build}\`;
};

export const getBuildInfo = () => {
  return {
    version: getVersionString(),
    fullVersion: getFullVersionString(),
    environment: APP_VERSION.environment,
    buildTime: APP_VERSION.deployDate,
    buildNumber: APP_VERSION.build,
    deployCount: APP_VERSION.deployCount,
  };
};
`;

  writeFileSync(join(process.cwd(), 'src/lib/version.ts'), versionTs);
}

// Main function
function main() {
  const args = process.argv.slice(2);
  const incrementType = args[0] || 'patch'; // patch, minor, major
  
  console.log('🚀 Incrementing version for deploy...');
  
  // Load current version
  const config = loadVersionConfig();
  
  // Increment version based on type
  switch (incrementType) {
    case 'major':
      config.major += 1;
      config.minor = 0;
      config.patch = 0;
      break;
    case 'minor':
      config.minor += 1;
      config.patch = 0;
      break;
    case 'patch':
    default:
      config.patch += 1;
      break;
  }
  
  // Increment deploy count
  config.deployCount += 1;
  config.lastDeploy = new Date().toISOString();
  
  const versionString = `${config.major}.${config.minor}.${config.patch}`;
  
  console.log(`📦 New version: v${versionString}`);
  console.log(`🔢 Deploy count: ${config.deployCount}`);
  console.log(`📅 Deploy time: ${config.lastDeploy}`);
  
  // Save files
  saveVersionConfig(config);
  updatePackageJson(versionString);
  generateVersionFile(config);
  
  console.log('✅ Version incremented successfully!');
  console.log(`   Version file: ${VERSION_FILE}`);
  console.log(`   Source file: src/lib/version.ts`);
  console.log(`   Package.json: ${PACKAGE_JSON}`);
}

// Run if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { main as incrementVersion };