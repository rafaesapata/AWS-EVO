/**
 * Application Version Configuration
 * Auto-generated on deploy - DO NOT EDIT MANUALLY
 * Last updated: 2025-12-15T23:36:46.193Z
 */

export const APP_VERSION = {
  major: 2,
  minor: 5,
  patch: 3,
  deployCount: 12,
  build: "806193",
  environment: import.meta.env.MODE || 'development',
  deployDate: "2025-12-15T23:36:46.191Z",
} as const;

export const getVersionString = (): string => {
  return `v${APP_VERSION.major}.${APP_VERSION.minor}.${APP_VERSION.patch}`;
};

export const getFullVersionString = (): string => {
  return `v${APP_VERSION.major}.${APP_VERSION.minor}.${APP_VERSION.patch}-${APP_VERSION.environment}.${APP_VERSION.build}`;
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
