#!/usr/bin/env tsx

/**
 * Version Increment Script
 * 
 * ⚠️ SINGLE SOURCE OF TRUTH: version.json ⚠️
 * 
 * This script reads from version.json and updates all version references:
 * - version.json (source of truth)
 * - package.json (frontend)
 * - backend/package.json
 * - cli/package.json
 * - src/lib/version.ts (frontend runtime)
 * 
 * Usage:
 *   npx tsx scripts/increment-version.ts patch   # 3.0.0 -> 3.0.1
 *   npx tsx scripts/increment-version.ts minor   # 3.0.0 -> 3.1.0
 *   npx tsx scripts/increment-version.ts major   # 3.0.0 -> 4.0.0
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

interface VersionConfig {
  version: string;
  major: number;
  minor: number;
  patch: number;
  releaseDate: string;
  codename: string;
}

const ROOT = process.cwd();
const VERSION_FILE = join(ROOT, 'version.json');

// Files to update with version
const PACKAGE_FILES = [
  join(ROOT, 'package.json'),
  join(ROOT, 'backend/package.json'),
  join(ROOT, 'cli/package.json'),
];

// Load version config
function loadVersionConfig(): VersionConfig {
  if (!existsSync(VERSION_FILE)) {
    console.error('❌ version.json not found! Creating default...');
    const defaultConfig: VersionConfig = {
      version: '3.0.0',
      major: 3,
      minor: 0,
      patch: 0,
      releaseDate: new Date().toISOString().split('T')[0],
      codename: 'Multi-Cloud'
    };
    saveVersionConfig(defaultConfig);
    return defaultConfig;
  }
  return JSON.parse(readFileSync(VERSION_FILE, 'utf-8'));
}

// Save version config
function saveVersionConfig(config: VersionConfig): void {
  writeFileSync(VERSION_FILE, JSON.stringify(config, null, 2) + '\n');
}

// Update package.json files
function updatePackageJsonFiles(version: string): void {
  for (const filePath of PACKAGE_FILES) {
    if (!existsSync(filePath)) {
      console.warn(`⚠️  Skipping ${filePath} (not found)`);
      continue;
    }
    try {
      const packageJson = JSON.parse(readFileSync(filePath, 'utf-8'));
      packageJson.version = version;
      writeFileSync(filePath, JSON.stringify(packageJson, null, 2) + '\n');
      console.log(`✅ Updated ${filePath}`);
    } catch (error) {
      console.warn(`⚠️  Could not update ${filePath}:`, error);
    }
  }
}

// Generate src/lib/version.ts
function generateVersionTs(config: VersionConfig): void {
  const content = `/**
 * Application Version Configuration
 * 
 * ⚠️ SINGLE SOURCE OF TRUTH FOR VERSION ⚠️
 * 
 * All version references in the application should import from this file.
 * DO NOT hardcode version numbers anywhere else.
 * 
 * To update version, run: npx tsx scripts/increment-version.ts [patch|minor|major]
 * 
 * Last updated: ${config.releaseDate}
 */

// Version components - AUTO-GENERATED from version.json
const MAJOR = ${config.major};
const MINOR = ${config.minor};
const PATCH = ${config.patch};

export const APP_VERSION = {
  major: MAJOR,
  minor: MINOR,
  patch: PATCH,
  full: \`\${MAJOR}.\${MINOR}.\${PATCH}\`,
  codename: '${config.codename}',
  environment: typeof import.meta !== 'undefined' ? import.meta.env?.MODE || 'development' : 'production',
  deployDate: "${new Date().toISOString()}",
} as const;

export const VERSION = APP_VERSION.full;

export const getVersionString = (): string => {
  return \`v\${APP_VERSION.full}\`;
};

export const getFullVersionString = (): string => {
  return \`v\${APP_VERSION.full}-\${APP_VERSION.environment}\`;
};

export const getBuildInfo = () => {
  return {
    version: getVersionString(),
    fullVersion: getFullVersionString(),
    codename: APP_VERSION.codename,
    environment: APP_VERSION.environment,
    buildTime: APP_VERSION.deployDate,
  };
};
`;

  const versionTsPath = join(ROOT, 'src/lib/version.ts');
  writeFileSync(versionTsPath, content);
  console.log(`✅ Updated ${versionTsPath}`);
}

// Main function
function main() {
  const args = process.argv.slice(2);
  const incrementType = args[0] || 'patch';
  
  console.log('🚀 EVO Version Manager');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  // Load current version
  const config = loadVersionConfig();
  const oldVersion = config.version;
  
  console.log(`📦 Current version: v${oldVersion}`);
  
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
      config.patch += 1;
      break;
    case 'show':
      console.log(`\n📋 Version Info:`);
      console.log(`   Version: ${config.version}`);
      console.log(`   Codename: ${config.codename}`);
      console.log(`   Release Date: ${config.releaseDate}`);
      return;
    default:
      console.log(`\n❌ Unknown increment type: ${incrementType}`);
      console.log('   Valid options: patch, minor, major, show');
      process.exit(1);
  }
  
  // Update version string
  config.version = `${config.major}.${config.minor}.${config.patch}`;
  config.releaseDate = new Date().toISOString().split('T')[0];
  
  console.log(`📦 New version: v${config.version}`);
  console.log(`📅 Release date: ${config.releaseDate}`);
  console.log('');
  
  // Save all files
  console.log('📝 Updating files...');
  saveVersionConfig(config);
  console.log(`✅ Updated version.json`);
  
  updatePackageJsonFiles(config.version);
  generateVersionTs(config);
  
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`✅ Version updated: v${oldVersion} → v${config.version}`);
  console.log('');
  console.log('Next steps:');
  console.log('  1. npm run build');
  console.log('  2. Deploy frontend and backend');
}

main();
