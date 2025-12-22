#!/usr/bin/env node

/**
 * Fix Syntax Errors from Migration
 * 
 * This script fixes the syntax errors introduced by the cleanup script
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';

// Files that need syntax fixes
const filesToFix = [
  'src/components/dashboard/ExecutiveDashboard.tsx',
  'src/components/dashboard/AnomalyDetection.tsx',
  'src/components/dashboard/BudgetForecasting.tsx',
  'src/components/dashboard/MonthlyInvoices.tsx',
  'src/components/dashboard/IAMAnalysis.tsx',
  'src/components/dashboard/InfrastructureTopology.tsx',
  'src/components/dashboard/DriftDetection.tsx',
  'src/components/dashboard/well-architected/WellArchitectedHistory.tsx',
  'src/components/dashboard/PredictiveIncidentsHistory.tsx',
  'src/components/dashboard/AnomalyHistoryView.tsx'
];

function fixSyntaxErrors(filePath) {
  if (!existsSync(filePath)) {
    console.log(`⚠️  File not found: ${filePath}`);
    return false;
  }
  
  let content = readFileSync(filePath, 'utf8');
  let hasChanges = false;
  
  // Fix common syntax errors from the cleanup
  const fixes = [
    // Fix "query = queryeq:" pattern
    {
      pattern: /query = queryeq:/g,
      replacement: 'const filters = '
    },
    
    // Fix broken query chains
    {
      pattern: /const { data, error } = await query\s*order:/g,
      replacement: 'const response = await apiClient.select(tableName, {\n        eq: filters,\n        order:'
    },
    
    // Fix limit patterns
    {
      pattern: /limit: (\d+);/g,
      replacement: 'limit: $1\n      });\n      const data = response.data;\n      const error = response.error;'
    },
    
    // Fix incomplete API calls
    {
      pattern: /apiClient\.select\(tableName, \{\s*select: '\*',\s*eq: filters,\s*order: \{ column: 'created_at', ascending: false \}\s*\}\)/g,
      replacement: `apiClient.select(tableName, {
        select: '*',
        eq: filters,
        order: { column: 'created_at', ascending: false }
      })`
    }
  ];
  
  fixes.forEach(({ pattern, replacement }) => {
    const originalContent = content;
    content = content.replace(pattern, replacement);
    if (content !== originalContent) {
      hasChanges = true;
    }
  });
  
  // Specific fixes for each file
  if (filePath.includes('ExecutiveDashboard.tsx')) {
    content = content.replace(
      /\/\/ Only filter by account if not in TV mode\s*if \(!isTVMode && selectedAccountId\) \{\s*const filters = \{ aws_account_id: selectedAccountId \};\s*\}/g,
      `// Only filter by account if not in TV mode
      const filters: any = { organization_id: organizationId };
      if (!isTVMode && selectedAccountId) {
        filters.aws_account_id = selectedAccountId;
      }`
    );
    hasChanges = true;
  }
  
  // Add missing imports
  if (content.includes('apiClient') && !content.includes("from '@/integrations/aws/api-client'")) {
    const importRegex = /^import\s+.*?;$/gm;
    const imports = content.match(importRegex) || [];
    
    if (imports.length > 0) {
      const lastImport = imports[imports.length - 1];
      const lastImportIndex = content.lastIndexOf(lastImport) + lastImport.length;
      
      const newImport = "\nimport { apiClient } from '@/integrations/aws/api-client';";
      
      content = content.slice(0, lastImportIndex) + newImport + content.slice(lastImportIndex);
      hasChanges = true;
    }
  }
  
  if (hasChanges) {
    writeFileSync(filePath, content);
    return true;
  }
  
  return false;
}

// Main execution
console.log('🔧 Fixing syntax errors from migration...\n');

let fixedCount = 0;

filesToFix.forEach(file => {
  console.log(`🔄 Fixing: ${file}`);
  if (fixSyntaxErrors(file)) {
    fixedCount++;
    console.log(`   ✅ Fixed`);
  } else {
    console.log(`   ⚪ No changes needed`);
  }
});

console.log(`\n📊 Syntax Fix Summary:`);
console.log(`   Files processed: ${filesToFix.length}`);
console.log(`   Files fixed: ${fixedCount}`);

console.log('\n🔧 Manual fixes may still be needed for complex queries');