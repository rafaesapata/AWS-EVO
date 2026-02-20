/**
 * Tag Validation — Smart Resource Tagging
 * Centralized validation for tag operations
 */

// ============================================================================
// CONSTANTS
// ============================================================================

export const TAG_KEY_REGEX = /^[a-z0-9\-_]+$/;
export const TAG_KEY_MAX_LENGTH = 64;
export const TAG_VALUE_MAX_LENGTH = 128;
export const TAG_VALUE_REGEX = /^[a-z0-9 \-_.]+$/;
export const TAG_DESCRIPTION_MAX_LENGTH = 256;
export const MAX_TAGS_PER_ORG = 500;
export const MAX_TAGS_PER_RESOURCE = 50;
export const MAX_BULK_RESOURCES = 1000;
export const BULK_BATCH_SIZE = 100;

export const PREDEFINED_COLORS = [
  '#EF4444', '#F97316', '#F59E0B', '#84CC16',
  '#22C55E', '#14B8A6', '#06B6D4', '#3B82F6',
  '#6366F1', '#8B5CF6', '#EC4899', '#64748B',
] as const;

export const TAG_CATEGORIES = [
  'COST_CENTER', 'ENVIRONMENT', 'TEAM', 'PROJECT',
  'COMPLIANCE', 'CRITICALITY', 'CUSTOM',
] as const;

export type TagCategory = typeof TAG_CATEGORIES[number];

// ============================================================================
// TYPES
// ============================================================================

export interface TagValidationError {
  field: string;
  message: string;
  code: string;
}

export interface TagValidationResult {
  valid: boolean;
  errors: TagValidationError[];
}

export interface CreateTagInput {
  key: string;
  value: string;
  color: string;
  category?: string;
  description?: string;
}

export interface UpdateTagInput {
  color?: string;
  category?: string;
  description?: string;
}

// ============================================================================
// NORMALIZATION
// ============================================================================

export function normalizeTagKey(key: string): string {
  return key.trim().toLowerCase();
}

export function normalizeTagValue(value: string): string {
  return value.trim().toLowerCase();
}

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================

export function validateTagKey(key: string): TagValidationResult {
  const errors: TagValidationError[] = [];
  const normalized = normalizeTagKey(key);

  if (!normalized || normalized.length === 0) {
    errors.push({ field: 'key', message: 'Tag key is required', code: 'REQUIRED' });
  } else if (normalized.length > TAG_KEY_MAX_LENGTH) {
    errors.push({ field: 'key', message: `Tag key must be at most ${TAG_KEY_MAX_LENGTH} characters`, code: 'MAX_LENGTH' });
  } else if (!TAG_KEY_REGEX.test(normalized)) {
    errors.push({ field: 'key', message: 'Tag key must contain only lowercase letters, numbers, hyphens, and underscores', code: 'INVALID_FORMAT' });
  }

  return { valid: errors.length === 0, errors };
}

export function validateTagValue(value: string): TagValidationResult {
  const errors: TagValidationError[] = [];
  const normalized = normalizeTagValue(value);

  if (!normalized || normalized.length === 0) {
    errors.push({ field: 'value', message: 'Tag value is required', code: 'REQUIRED' });
  } else if (normalized.length > TAG_VALUE_MAX_LENGTH) {
    errors.push({ field: 'value', message: `Tag value must be at most ${TAG_VALUE_MAX_LENGTH} characters`, code: 'MAX_LENGTH' });
  } else if (!TAG_VALUE_REGEX.test(normalized)) {
    errors.push({ field: 'value', message: 'Tag value must contain only letters, numbers, spaces, hyphens, underscores, and dots', code: 'INVALID_FORMAT' });
  }

  return { valid: errors.length === 0, errors };
}

export function validateTagColor(color: string): TagValidationResult {
  const errors: TagValidationError[] = [];

  if (!color) {
    errors.push({ field: 'color', message: 'Color is required', code: 'REQUIRED' });
  } else if (!(PREDEFINED_COLORS as readonly string[]).includes(color.toUpperCase())) {
    errors.push({
      field: 'color',
      message: `Color must be one of: ${PREDEFINED_COLORS.join(', ')}`,
      code: 'INVALID_COLOR',
    });
  }

  return { valid: errors.length === 0, errors };
}

export function validateTagCategory(category?: string): TagValidationResult {
  const errors: TagValidationError[] = [];

  if (category && !(TAG_CATEGORIES as readonly string[]).includes(category)) {
    errors.push({
      field: 'category',
      message: `Category must be one of: ${TAG_CATEGORIES.join(', ')}`,
      code: 'INVALID_CATEGORY',
    });
  }

  return { valid: errors.length === 0, errors };
}

export function validateTagDescription(description?: string): TagValidationResult {
  const errors: TagValidationError[] = [];

  if (description && description.length > TAG_DESCRIPTION_MAX_LENGTH) {
    errors.push({
      field: 'description',
      message: `Description must be at most ${TAG_DESCRIPTION_MAX_LENGTH} characters`,
      code: 'MAX_LENGTH',
    });
  }

  return { valid: errors.length === 0, errors };
}

// ============================================================================
// SANITIZATION (XSS Prevention)
// ============================================================================

export function sanitizeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

// ============================================================================
// COMPOSITE VALIDATORS
// ============================================================================

export function validateCreateTagInput(input: CreateTagInput): TagValidationResult {
  const errors: TagValidationError[] = [];

  errors.push(...validateTagKey(input.key || '').errors);
  errors.push(...validateTagValue(input.value || '').errors);
  errors.push(...validateTagColor(input.color || '').errors);
  errors.push(...validateTagCategory(input.category).errors);
  errors.push(...validateTagDescription(input.description).errors);

  return { valid: errors.length === 0, errors };
}

export function validateUpdateTagInput(input: UpdateTagInput): TagValidationResult {
  const errors: TagValidationError[] = [];

  if (input.color !== undefined) {
    errors.push(...validateTagColor(input.color).errors);
  }
  if (input.category !== undefined) {
    errors.push(...validateTagCategory(input.category).errors);
  }
  if (input.description !== undefined) {
    errors.push(...validateTagDescription(input.description).errors);
  }

  return { valid: errors.length === 0, errors };
}

// ============================================================================
// RESOURCE TYPE NORMALIZATION (Multi-Cloud)
// ============================================================================

export function normalizeAwsResourceType(arn: string): { resourceType: string; normalized: boolean } {
  // ARN format: arn:aws:service:region:account-id:resource-type/resource-id
  const arnParts = arn.match(/^arn:aws:([^:]+):[^:]*:[^:]*:([^/]+)/);
  if (arnParts) {
    const service = arnParts[1];
    const resourcePart = arnParts[2].split('/')[0].split(':')[0];
    return { resourceType: `aws:${service}:${resourcePart}`, normalized: true };
  }
  return { resourceType: arn, normalized: false };
}

export function normalizeAzureResourceType(resourceId: string): { resourceType: string; normalized: boolean } {
  // Azure format: /subscriptions/{sub}/resourceGroups/{rg}/providers/{namespace}/{type}/{name}
  const azureParts = resourceId.match(/\/providers\/([^/]+)\/([^/]+)/i);
  if (azureParts) {
    const namespace = azureParts[1].replace('Microsoft.', '').toLowerCase();
    const type = azureParts[2].toLowerCase();
    return { resourceType: `azure:${namespace}:${type}`, normalized: true };
  }
  return { resourceType: resourceId, normalized: false };
}

export function normalizeResourceType(
  resourceId: string,
  cloudProvider: string
): { resourceType: string; normalized: boolean } {
  if (cloudProvider === 'aws') return normalizeAwsResourceType(resourceId);
  if (cloudProvider === 'azure') return normalizeAzureResourceType(resourceId);
  return { resourceType: resourceId, normalized: false };
}
