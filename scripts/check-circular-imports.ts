#!/usr/bin/env tsx
/**
 * Script para detectar importações circulares
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';

interface ImportGraph {
  [file: string]: string[];
}

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

function extractImports(filePath: string): string[] {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const imports: string[] = [];
    
    // Regex para capturar imports
    const importRegex = /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g;
    let match;
    
    while ((match = importRegex.exec(content)) !== null) {
      const importPath = match[1];
      
      // Apenas imports relativos e do projeto
      if (importPath.startsWith('./') || importPath.startsWith('../') || importPath.startsWith('@/')) {
        imports.push(importPath);
      }
    }
    
    return imports;
  } catch (error) {
    console.error(`Erro ao ler arquivo ${filePath}:`, error);
    return [];
  }
}

function buildImportGraph(): ImportGraph {
  const files = getAllTsFiles('src');
  const graph: ImportGraph = {};
  
  for (const file of files) {
    const imports = extractImports(file);
    graph[file] = imports;
  }
  
  return graph;
}

function findCircularDependencies(graph: ImportGraph): string[][] {
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  const cycles: string[][] = [];
  
  function dfs(node: string, path: string[]): void {
    if (recursionStack.has(node)) {
      // Encontrou um ciclo
      const cycleStart = path.indexOf(node);
      if (cycleStart !== -1) {
        cycles.push(path.slice(cycleStart).concat([node]));
      }
      return;
    }
    
    if (visited.has(node)) {
      return;
    }
    
    visited.add(node);
    recursionStack.add(node);
    
    const imports = graph[node] || [];
    for (const importPath of imports) {
      // Resolver o caminho do import
      const resolvedPath = resolveImportPath(node, importPath);
      if (resolvedPath && graph[resolvedPath]) {
        dfs(resolvedPath, [...path, node]);
      }
    }
    
    recursionStack.delete(node);
  }
  
  for (const node of Object.keys(graph)) {
    if (!visited.has(node)) {
      dfs(node, []);
    }
  }
  
  return cycles;
}

function resolveImportPath(fromFile: string, importPath: string): string | null {
  // Simplificação: apenas para imports @/
  if (importPath.startsWith('@/')) {
    const resolved = importPath.replace('@/', 'src/');
    
    // Tentar com .ts e .tsx
    const candidates = [
      `${resolved}.ts`,
      `${resolved}.tsx`,
      `${resolved}/index.ts`,
      `${resolved}/index.tsx`
    ];
    
    for (const candidate of candidates) {
      try {
        statSync(candidate);
        return candidate;
      } catch {
        // Arquivo não existe
      }
    }
  }
  
  return null;
}

console.log('🔍 Verificando importações circulares...\n');

const graph = buildImportGraph();
const cycles = findCircularDependencies(graph);

if (cycles.length === 0) {
  console.log('✅ Nenhuma importação circular encontrada!');
} else {
  console.log(`❌ Encontradas ${cycles.length} importações circulares:\n`);
  
  cycles.forEach((cycle, index) => {
    console.log(`Ciclo ${index + 1}:`);
    cycle.forEach((file, i) => {
      console.log(`  ${i + 1}. ${file}`);
    });
    console.log();
  });
}

// Verificar especificamente o cognitoAuth
console.log('🔍 Verificando arquivos que importam cognitoAuth:');
const cognitoImporters = Object.entries(graph).filter(([file, imports]) => 
  imports.some(imp => imp.includes('cognito-client-simple'))
);

cognitoImporters.forEach(([file, imports]) => {
  console.log(`📄 ${file}`);
  imports.filter(imp => imp.includes('cognito-client-simple')).forEach(imp => {
    console.log(`  └─ ${imp}`);
  });
});