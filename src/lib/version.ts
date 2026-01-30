/**
 * Application Version Configuration
 * 
 * ⚠️ SINGLE SOURCE OF TRUTH FOR VERSION ⚠️
 * 
 * All version references in the application should import from this file.
 * DO NOT hardcode version numbers anywhere else.
 * 
 * To update version, run: npx tsx scripts/increment-version.ts [patch|minor|major]
 * 
 * Last updated: 2026-01-30
 */

// Version components - AUTO-GENERATED from version.json
const MAJOR = 3;
const MINOR = 0;
const PATCH = 0;

export const APP_VERSION = {
  major: MAJOR,
  minor: MINOR,
  patch: PATCH,
  full: `${MAJOR}.${MINOR}.${PATCH}`,
  codename: 'Multi-Cloud',
  environment: typeof import.meta !== 'undefined' ? import.meta.env?.MODE || 'development' : 'production',
  deployDate: "2026-01-30T00:50:00.000Z",
} as const;

export const VERSION = APP_VERSION.full;

export const getVersionString = (): string => {
  return `v${APP_VERSION.full}`;
};

export const getFullVersionString = (): string => {
  return `v${APP_VERSION.full}-${APP_VERSION.environment}`;
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
