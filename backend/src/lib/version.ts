/**
 * Backend Version Configuration
 * 
 * ⚠️ SINGLE SOURCE OF TRUTH FOR VERSION ⚠️
 * 
 * Reads from root version.json at build time.
 * To update version, run: npx tsx scripts/increment-version.ts [patch|minor|major]
 */

// Version synced from root version.json
export const VERSION = '3.0.0';
export const CODENAME = 'Multi-Cloud';

export const APP_VERSION = {
  major: 3,
  minor: 0,
  patch: 0,
  full: VERSION,
  codename: CODENAME,
} as const;

export const getVersionString = (): string => {
  return `v${VERSION}`;
};
