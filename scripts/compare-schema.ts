#!/usr/bin/env npx tsx
/**
 * Compare Prisma schema with actual database NOT NULL columns
 * Finds mismatches where DB has NOT NULL but Prisma has optional (?)
 * or where DB has a column that Prisma doesn't know about
 */

import { readFileSync } from 'fs';

// Parse Prisma schema
const schema = readFileSync('backend/prisma/schema.prisma', 'utf-8');

// Parse DB NOT NULL columns from file
const dbLines = readFileSync('/tmp/db_not_null_columns.txt', 'utf-8').trim().split('\n');

interface DbColumn {
  table: string;
  column: string;
}

const dbNotNull: DbColumn[] = dbLines.map(line => {
  const [table, column] = line.split('|');
  return { table, column };
});

// Parse Prisma models
interface PrismaField {
  name: string;
  dbName?: string;
  isOptional: boolean;
  hasDefault: boolean;
  isId: boolean;
  isRelation: boolean;
}

interface PrismaModel {
  name: string;
  tableName: string;
  fields: PrismaField[];
}

const models: PrismaModel[] = [];
const modelRegex = /model\s+(\w+)\s*\{([^}]+)\}/g;
let match;

while ((match = modelRegex.exec(schema)) !== null) {
  const modelName = match[1];
  const body = match[2];
  
  // Find @@map
  const mapMatch = body.match(/@@map\("(\w+)"\)/);
  const tableName = mapMatch ? mapMatch[1] : modelName.toLowerCase() + 's';
  
  const fields: PrismaField[] = [];
  const lines = body.split('\n');
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('@@')) continue;
    
    // Parse field: name Type? @attributes
    const fieldMatch = trimmed.match(/^(\w+)\s+(\w+)(\?)?/);
    if (!fieldMatch) continue;
    
    const fieldName = fieldMatch[1];
    const fieldType = fieldMatch[2];
    const isOptional = fieldMatch[3] === '?';
    
    // Check if it's a relation (type starts with uppercase and is a model name)
    const isRelation = /^[A-Z]/.test(fieldType) && !['String', 'Int', 'Float', 'Boolean', 'DateTime', 'Json', 'BigInt', 'Decimal', 'Bytes'].includes(fieldType);
    
    // Check for @id
    const isId = trimmed.includes('@id');
    
    // Check for @default
    const hasDefault = trimmed.includes('@default');
    
    // Check for @map (column name mapping)
    const dbNameMatch = trimmed.match(/@map\("(\w+)"\)/);
    const dbName = dbNameMatch ? dbNameMatch[1] : undefined;
    
    if (!isRelation) {
      fields.push({
        name: fieldName,
        dbName,
        isOptional,
        hasDefault,
        isId,
        isRelation,
      });
    }
  }
  
  models.push({ name: modelName, tableName, fields });
}

// Compare
console.log('=== PRISMA SCHEMA vs DATABASE AUDIT ===\n');

let issueCount = 0;

// Group DB columns by table
const dbByTable = new Map<string, Set<string>>();
for (const col of dbNotNull) {
  if (!dbByTable.has(col.table)) dbByTable.set(col.table, new Set());
  dbByTable.get(col.table)!.add(col.column);
}

for (const model of models) {
  const dbColumns = dbByTable.get(model.tableName);
  if (!dbColumns) continue;
  
  const issues: string[] = [];
  
  for (const dbCol of dbColumns) {
    // Skip id columns (always handled by Prisma)
    if (dbCol === 'id') continue;
    
    // Find matching Prisma field
    const prismaField = model.fields.find(f => 
      (f.dbName === dbCol) || (f.name === dbCol) || 
      // Handle snake_case to camelCase
      (f.name === dbCol.replace(/_([a-z])/g, (_, c) => c.toUpperCase()))
    );
    
    if (!prismaField) {
      issues.push(`  ❌ MISSING: DB has NOT NULL column "${dbCol}" but Prisma model has no matching field`);
      issueCount++;
    } else if (prismaField.isOptional && !prismaField.hasDefault && !prismaField.isId) {
      issues.push(`  ⚠️  NULLABLE MISMATCH: DB "${dbCol}" is NOT NULL, but Prisma "${prismaField.name}" is optional (?)`);
      issueCount++;
    }
  }
  
  if (issues.length > 0) {
    console.log(`📋 ${model.name} (table: ${model.tableName}) - ${issues.length} issue(s):`);
    issues.forEach(i => console.log(i));
    console.log('');
  }
}

console.log(`\n=== TOTAL ISSUES: ${issueCount} ===`);
