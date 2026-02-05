#!/usr/bin/env tsx
/**
 * Generate OpenAPI 3.0 specification
 * Usage: npx tsx backend/scripts/generate-openapi.ts [--format json|yaml]
 */

import { writeFileSync } from 'fs';
import { join } from 'path';
import { generateOpenAPISpec, getOpenAPIJSON, getOpenAPIYAML, getEndpointCount } from '../src/lib/openapi-generator.js';

const format = process.argv.includes('--yaml') ? 'yaml' : 'json';
const outputDir = join(process.cwd(), 'docs');
const outputFile = join(outputDir, `openapi.${format}`);

console.log('🔧 Generating OpenAPI 3.0 specification...');
console.log(`📊 Total endpoints: ${getEndpointCount()}`);

try {
  const content = format === 'yaml' ? getOpenAPIYAML() : getOpenAPIJSON();
  
  writeFileSync(outputFile, content, 'utf-8');
  
  console.log(`✅ OpenAPI spec generated: ${outputFile}`);
  console.log(`📖 View in Swagger UI: https://editor.swagger.io/`);
} catch (error) {
  console.error('❌ Error generating OpenAPI spec:', error);
  process.exit(1);
}
