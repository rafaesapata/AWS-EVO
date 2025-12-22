#!/usr/bin/env tsx
/**
 * Script para corrigir importações duplicadas
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';

function getAllTsFiles(dir: string, files: string[] = []): string[] {
  const items = readdirSync(dir);
  
  for (const item of items) {
    const fullPath = join(dir, item);
    const stat = statSync(fullPath);
    
    if (stat.isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
      getAllTsFiles(fullPath, files);
    } else if (stat.isFile() && (extname(item) === '.ts' || extname(item) === '.tsx')) {
      files.push(fullPath);
    }
  }
  
  return files;
}

function fixDuplicateImports(filePath: string): boolean {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    
    const importLines: string[] = [];
    const nonImportLines: string[] = [];
    const seenImports = new Set<string>();
    let hasChanges = false;
    
    let inImportSection = true;
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      
      // Detectar se ainda estamos na seção de imports
      if (inImportSection) {
        if (trimmedLine.startsWith('import ') || trimmedLine === '' || trimmedLine.startsWith('//') || trimmedLine.startsWith('/*') || trimmedLine.startsWith('*')) {
          // Ainda na seção de imports
          if (trimmedLine.startsWith('import ')) {
            // Normalizar o import para detectar duplicatas
            const normalizedImport = trimmedLine.replace(/'/g, '"').replace(/\s+/g, ' ');
            
            if (!seenImports.has(normalizedImport)) {
              seenImports.add(normalizedImport);
              importLines.push(line);
            } else {
              console.log(`  🔧 Removendo import duplicado: ${trimmedLine}`);
              hasChanges = true;
            }
          } else {
            importLines.push(line);
          }
        } else {
          // Saiu da seção de imports
          inImportSection = false;
          nonImportLines.push(line);
        }
      } else {
        nonImportLines.push(line);
      }
    }
    
    if (hasChanges) {
      const newContent = [...importLines, ...nonImportLines].join('\n');
      writeFileSync(filePath, newContent, 'utf-8');
      return true;
    }
    
    return false;
  } catch (error) {
    console.error(`❌ Erro ao processar ${filePath}:`, error);
    return false;
  }
}

console.log('🔧 Corrigindo importações duplicadas...\n');

const files = getAllTsFiles('src');
let totalFixed = 0;

for (const file of files) {
  const content = readFileSync(file, 'utf-8');
  
  // Verificar se há importações duplicadas do cognitoAuth ou apiClient
  const cognitoImports = content.match(/import.*cognito-client-simple.*/g);
  const apiImports = content.match(/import.*api-client.*/g);
  
  if ((cognitoImports && cognitoImports.length > 1) || (apiImports && apiImports.length > 1)) {
    console.log(`📄 ${file}:`);
    if (cognitoImports && cognitoImports.length > 1) {
      cognitoImports.forEach(imp => console.log(`  - ${imp}`));
    }
    if (apiImports && apiImports.length > 1) {
      apiImports.forEach(imp => console.log(`  - ${imp}`));
    }
    
    if (fixDuplicateImports(file)) {
      totalFixed++;
      console.log(`  ✅ Corrigido!`);
    }
    console.log();
  }
}

console.log(`🎯 Resumo: ${totalFixed} arquivos corrigidos`);

if (totalFixed > 0) {
  console.log('\n✅ Importações duplicadas corrigidas com sucesso!');
  console.log('🔄 Reinicie o servidor de desenvolvimento para aplicar as mudanças.');
} else {
  console.log('\n✅ Nenhuma importação duplicada encontrada!');
}