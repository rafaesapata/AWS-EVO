import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseCLIArgs, discoverHandlers, extractImports, resolveImport, buildDependencyGraph, detectCycles, reportResults, writeGraphJson, updateDomainMap, parseDomainConfigs, findHandlersForDomain, collectLibsForHandlers, collapseLibPath, replaceSharedLibsInContent } from '../validate-lambda-imports.js';
import type { ValidationResult, BrokenImport, Cycle, DependencyGraph } from '../validate-lambda-imports.js';
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'fs';
import { join, resolve, dirname } from 'path';

// ---------------------------------------------------------------------------
// CLI Argument Parsing
// ---------------------------------------------------------------------------

describe('parseCLIArgs', () => {
  it('returns empty options when no args provided', () => {
    const result = parseCLIArgs([]);
    expect(result).toEqual({});
  });

  it('parses --handler flag with path', () => {
    const result = parseCLIArgs(['--handler', 'backend/src/handlers/auth/login.ts']);
    expect(result.handler).toBe('backend/src/handlers/auth/login.ts');
  });

  it('parses --output-graph flag with path', () => {
    const result = parseCLIArgs(['--output-graph', 'graph.json']);
    expect(result.outputGraph).toBe('graph.json');
  });

  it('parses --update-domain-map flag', () => {
    const result = parseCLIArgs(['--update-domain-map']);
    expect(result.updateDomainMap).toBe(true);
  });

  it('parses all flags together', () => {
    const result = parseCLIArgs([
      '--handler', 'some/handler.ts',
      '--output-graph', 'out.json',
      '--update-domain-map',
    ]);
    expect(result.handler).toBe('some/handler.ts');
    expect(result.outputGraph).toBe('out.json');
    expect(result.updateDomainMap).toBe(true);
  });

  it('ignores unknown flags', () => {
    const result = parseCLIArgs(['--unknown', 'value']);
    expect(result).toEqual({});
  });

  it('ignores --handler when no value follows', () => {
    const result = parseCLIArgs(['--handler']);
    expect(result.handler).toBeUndefined();
  });

  it('ignores --output-graph when no value follows', () => {
    const result = parseCLIArgs(['--output-graph']);
    expect(result.outputGraph).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// File Discovery
// ---------------------------------------------------------------------------

describe('discoverHandlers', () => {
  const tmpDir = join(resolve('.'), '__test_handlers_tmp__');
  const handlersDir = join(tmpDir, 'handlers');

  beforeEach(() => {
    // Create temp directory structure
    mkdirSync(join(handlersDir, 'auth'), { recursive: true });
    mkdirSync(join(handlersDir, 'security'), { recursive: true });
    mkdirSync(join(handlersDir, '_templates'), { recursive: true });

    writeFileSync(join(handlersDir, 'auth', 'login.ts'), 'export const handler = () => {};');
    writeFileSync(join(handlersDir, 'auth', 'logout.ts'), 'export const handler = () => {};');
    writeFileSync(join(handlersDir, 'security', 'scan.ts'), 'export const handler = () => {};');
    writeFileSync(join(handlersDir, '_templates', 'template.ts'), 'export const handler = () => {};');
    // Non-ts file should be ignored
    writeFileSync(join(handlersDir, 'auth', 'README.md'), '# Auth');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('discovers all .ts files recursively', () => {
    const handlers = discoverHandlers(tmpDir);
    expect(handlers).toHaveLength(3);
  });

  it('excludes _templates/ directory', () => {
    const handlers = discoverHandlers(tmpDir);
    const hasTemplate = handlers.some((h) => h.includes('_templates'));
    expect(hasTemplate).toBe(false);
  });

  it('only includes .ts files', () => {
    const handlers = discoverHandlers(tmpDir);
    expect(handlers.every((h) => h.endsWith('.ts'))).toBe(true);
  });

  it('returns absolute paths', () => {
    const handlers = discoverHandlers(tmpDir);
    expect(handlers.every((h) => h.startsWith('/'))).toBe(true);
  });

  it('returns single handler when singleHandler is provided', () => {
    const handlerPath = join(handlersDir, 'auth', 'login.ts');
    const handlers = discoverHandlers(tmpDir, handlerPath);
    expect(handlers).toHaveLength(1);
    expect(handlers[0]).toBe(resolve(handlerPath));
  });

  it('exits with code 1 when singleHandler does not exist', () => {
    const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as any);
    const mockError = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => {
      discoverHandlers(tmpDir, '/nonexistent/handler.ts');
    }).toThrow('process.exit called');

    expect(mockExit).toHaveBeenCalledWith(1);
    mockExit.mockRestore();
    mockError.mockRestore();
  });

  it('returns empty array when handlers directory is empty', () => {
    // Remove all files from handlers subdirs
    rmSync(handlersDir, { recursive: true, force: true });
    mkdirSync(handlersDir, { recursive: true });

    const handlers = discoverHandlers(tmpDir);
    expect(handlers).toHaveLength(0);
  });
});


// ---------------------------------------------------------------------------
// Import Extraction (Task 2.1)
// ---------------------------------------------------------------------------

describe('extractImports', () => {
  const tmpDir = join(resolve('.'), '__test_extract_tmp__');

  beforeEach(() => {
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('extracts import ... from with single quotes', () => {
    const filePath = join(tmpDir, 'test.ts');
    writeFileSync(filePath, `import { foo } from '../../lib/response.js';\n`);
    const imports = extractImports(filePath);
    expect(imports).toHaveLength(1);
    expect(imports[0].importPath).toBe('../../lib/response.js');
    expect(imports[0].line).toBe(1);
    expect(imports[0].sourcePath).toBe(resolve(filePath));
  });

  it('extracts import ... from with double quotes', () => {
    const filePath = join(tmpDir, 'test.ts');
    writeFileSync(filePath, `import { bar } from "../../lib/auth.js";\n`);
    const imports = extractImports(filePath);
    expect(imports).toHaveLength(1);
    expect(imports[0].importPath).toBe('../../lib/auth.js');
  });

  it('extracts require() statements', () => {
    const filePath = join(tmpDir, 'test.ts');
    writeFileSync(filePath, `const db = require('../../lib/database.js');\n`);
    const imports = extractImports(filePath);
    expect(imports).toHaveLength(1);
    expect(imports[0].importPath).toBe('../../lib/database.js');
  });

  it('filters out non-relative imports (npm packages)', () => {
    const filePath = join(tmpDir, 'test.ts');
    writeFileSync(filePath, [
      `import { PrismaClient } from '@prisma/client';`,
      `import express from 'express';`,
      `import { foo } from '../../lib/foo.js';`,
    ].join('\n'));
    const imports = extractImports(filePath);
    expect(imports).toHaveLength(1);
    expect(imports[0].importPath).toBe('../../lib/foo.js');
  });

  it('filters out Node.js built-in imports', () => {
    const filePath = join(tmpDir, 'test.ts');
    writeFileSync(filePath, [
      `import { readFileSync } from 'fs';`,
      `import path from 'path';`,
      `import { join } from './utils.js';`,
    ].join('\n'));
    const imports = extractImports(filePath);
    expect(imports).toHaveLength(1);
    expect(imports[0].importPath).toBe('./utils.js');
  });

  it('extracts multiple imports with correct line numbers', () => {
    const filePath = join(tmpDir, 'test.ts');
    writeFileSync(filePath, [
      `import type { AuthorizedEvent } from '../../types/lambda.js';`,
      `import { success } from '../../lib/response.js';`,
      ``,
      `import { logger } from '../../lib/logging.js';`,
    ].join('\n'));
    const imports = extractImports(filePath);
    expect(imports).toHaveLength(3);
    expect(imports[0].line).toBe(1);
    expect(imports[1].line).toBe(2);
    expect(imports[2].line).toBe(4);
  });

  it('returns empty array for file with no imports', () => {
    const filePath = join(tmpDir, 'test.ts');
    writeFileSync(filePath, `export const handler = () => {};\n`);
    const imports = extractImports(filePath);
    expect(imports).toHaveLength(0);
  });

  it('returns empty array for file with only npm imports', () => {
    const filePath = join(tmpDir, 'test.ts');
    writeFileSync(filePath, [
      `import { PrismaClient } from '@prisma/client';`,
      `import AWS from 'aws-sdk';`,
    ].join('\n'));
    const imports = extractImports(filePath);
    expect(imports).toHaveLength(0);
  });

  it('handles imports starting with ./', () => {
    const filePath = join(tmpDir, 'test.ts');
    writeFileSync(filePath, `import { helper } from './helper.js';\n`);
    const imports = extractImports(filePath);
    expect(imports).toHaveLength(1);
    expect(imports[0].importPath).toBe('./helper.js');
  });

  it('handles import type statements', () => {
    const filePath = join(tmpDir, 'test.ts');
    writeFileSync(filePath, `import type { Foo } from '../../types/foo.js';\n`);
    const imports = extractImports(filePath);
    expect(imports).toHaveLength(1);
    expect(imports[0].importPath).toBe('../../types/foo.js');
  });

  it('handles import * as namespace syntax', () => {
    const filePath = join(tmpDir, 'test.ts');
    writeFileSync(filePath, `import * as crypto from '../../lib/crypto-utils.js';\n`);
    const imports = extractImports(filePath);
    expect(imports).toHaveLength(1);
    expect(imports[0].importPath).toBe('../../lib/crypto-utils.js');
  });

  it('handles default import syntax', () => {
    const filePath = join(tmpDir, 'test.ts');
    writeFileSync(filePath, `import logger from '../../lib/logging.js';\n`);
    const imports = extractImports(filePath);
    expect(imports).toHaveLength(1);
    expect(imports[0].importPath).toBe('../../lib/logging.js');
  });

  it('skips imports inside block comments', () => {
    const filePath = join(tmpDir, 'test.ts');
    writeFileSync(filePath, [
      `/* import { old } from '../../lib/old.js'; */`,
      `import { real } from '../../lib/real.js';`,
    ].join('\n'));
    const imports = extractImports(filePath);
    expect(imports).toHaveLength(1);
    expect(imports[0].importPath).toBe('../../lib/real.js');
  });

  it('skips imports inside template literals', () => {
    const filePath = join(tmpDir, 'test.ts');
    writeFileSync(filePath, [
      `import { real } from '../../lib/real.js';`,
      'const sql = `',
      `  import { fake } from '../../lib/fake.js';`,
      '`;',
    ].join('\n'));
    const imports = extractImports(filePath);
    expect(imports).toHaveLength(1);
    expect(imports[0].importPath).toBe('../../lib/real.js');
  });

  it('handles require with extra spaces', () => {
    const filePath = join(tmpDir, 'test.ts');
    writeFileSync(filePath, `const db = require(  '../../lib/database.js'  );\n`);
    const imports = extractImports(filePath);
    expect(imports).toHaveLength(1);
    expect(imports[0].importPath).toBe('../../lib/database.js');
  });

  it('rejects import paths with shell injection characters', () => {
    const filePath = join(tmpDir, 'test.ts');
    writeFileSync(filePath, [
      `import { x } from '../../lib/ok.js';`,
      `import { y } from '../../lib/bad | rm.js';`,
      `import { z } from '../../lib/bad\${x}.js';`,
    ].join('\n'));
    const imports = extractImports(filePath);
    expect(imports).toHaveLength(1);
    expect(imports[0].importPath).toBe('../../lib/ok.js');
  });
});

// ---------------------------------------------------------------------------
// Import Resolution (Task 2.2)
// ---------------------------------------------------------------------------

describe('resolveImport', () => {
  const tmpDir = join(resolve('.'), '__test_resolve_tmp__');

  beforeEach(() => {
    mkdirSync(join(tmpDir, 'lib'), { recursive: true });
    mkdirSync(join(tmpDir, 'types'), { recursive: true });
    mkdirSync(join(tmpDir, 'lib', 'subdir'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('resolves .js extension to .ts file', () => {
    writeFileSync(join(tmpDir, 'lib', 'response.ts'), 'export const success = () => {};');
    const result = resolveImport(tmpDir, './lib/response.js');
    expect(result).toBe(resolve(tmpDir, 'lib', 'response.ts'));
  });

  it('resolves .ts extension directly', () => {
    writeFileSync(join(tmpDir, 'lib', 'auth.ts'), 'export const auth = () => {};');
    const result = resolveImport(tmpDir, './lib/auth.ts');
    expect(result).toBe(resolve(tmpDir, 'lib', 'auth.ts'));
  });

  it('resolves path without extension to .ts file', () => {
    writeFileSync(join(tmpDir, 'lib', 'database.ts'), 'export const db = {};');
    const result = resolveImport(tmpDir, './lib/database');
    expect(result).toBe(resolve(tmpDir, 'lib', 'database.ts'));
  });

  it('resolves directory to index.ts', () => {
    writeFileSync(join(tmpDir, 'lib', 'subdir', 'index.ts'), 'export const sub = {};');
    const result = resolveImport(tmpDir, './lib/subdir');
    expect(result).toBe(resolve(tmpDir, 'lib', 'subdir', 'index.ts'));
  });

  it('prefers .ts file over directory index.ts', () => {
    writeFileSync(join(tmpDir, 'lib', 'subdir.ts'), 'export const direct = {};');
    writeFileSync(join(tmpDir, 'lib', 'subdir', 'index.ts'), 'export const index = {};');
    const result = resolveImport(tmpDir, './lib/subdir');
    expect(result).toBe(resolve(tmpDir, 'lib', 'subdir.ts'));
  });

  it('returns null for non-existent file', () => {
    const result = resolveImport(tmpDir, './lib/nonexistent.js');
    expect(result).toBeNull();
  });

  it('returns null for non-existent directory without index.ts', () => {
    const result = resolveImport(tmpDir, './lib/missing');
    expect(result).toBeNull();
  });

  it('resolves relative paths with ../', () => {
    const subDir = join(tmpDir, 'handlers', 'auth');
    mkdirSync(subDir, { recursive: true });
    writeFileSync(join(tmpDir, 'lib', 'response.ts'), 'export const r = {};');
    const result = resolveImport(subDir, '../../lib/response.js');
    expect(result).toBe(resolve(tmpDir, 'lib', 'response.ts'));
  });

  it('returns absolute path', () => {
    writeFileSync(join(tmpDir, 'lib', 'response.ts'), 'export const r = {};');
    const result = resolveImport(tmpDir, './lib/response.js');
    expect(result).not.toBeNull();
    expect(result!.startsWith('/')).toBe(true);
  });

  it('returns null for .ts import that does not exist', () => {
    const result = resolveImport(tmpDir, './lib/ghost.ts');
    expect(result).toBeNull();
  });

  it('returns null for .js import when .ts equivalent does not exist', () => {
    const result = resolveImport(tmpDir, './lib/ghost.js');
    expect(result).toBeNull();
  });

  it('resolves extensionless import to directory index.ts when no .ts file exists', () => {
    mkdirSync(join(tmpDir, 'lib', 'engine'), { recursive: true });
    writeFileSync(join(tmpDir, 'lib', 'engine', 'index.ts'), 'export const e = 1;');
    const result = resolveImport(tmpDir, './lib/engine');
    expect(result).toBe(resolve(tmpDir, 'lib', 'engine', 'index.ts'));
  });
});


// ---------------------------------------------------------------------------
// Dependency Graph Builder (Task 3.1)
// ---------------------------------------------------------------------------

describe('buildDependencyGraph', () => {
  const tmpDir = join(resolve('.'), '__test_graph_tmp__');
  const handlersDir = join(tmpDir, 'handlers', 'auth');
  const libDir = join(tmpDir, 'lib');
  const typesDir = join(tmpDir, 'types');

  beforeEach(() => {
    mkdirSync(handlersDir, { recursive: true });
    mkdirSync(libDir, { recursive: true });
    mkdirSync(typesDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('builds graph with direct imports only', () => {
    const handlerPath = join(handlersDir, 'login.ts');
    writeFileSync(join(libDir, 'response.ts'), 'export const success = () => {};');
    writeFileSync(handlerPath, `import { success } from '../../lib/response.js';\nexport const handler = () => {};`);

    const { graph, brokenImports, adjacencyMap } = buildDependencyGraph([handlerPath], tmpDir);

    expect(brokenImports).toHaveLength(0);
    expect(graph[handlerPath]).toHaveLength(1);
    expect(graph[handlerPath][0]).toBe(resolve(libDir, 'response.ts'));
    expect(adjacencyMap.get(handlerPath)).toEqual([resolve(libDir, 'response.ts')]);
  });

  it('follows transitive imports through libs', () => {
    const handlerPath = join(handlersDir, 'login.ts');
    writeFileSync(handlerPath, `import { auth } from '../../lib/auth.js';\n`);
    writeFileSync(join(libDir, 'auth.ts'), `import { db } from './database.js';\nexport const auth = () => {};`);
    writeFileSync(join(libDir, 'database.ts'), `export const db = {};`);

    const { graph, brokenImports } = buildDependencyGraph([handlerPath], tmpDir);

    expect(brokenImports).toHaveLength(0);
    expect(graph[handlerPath]).toContain(resolve(libDir, 'auth.ts'));
    expect(graph[handlerPath]).toContain(resolve(libDir, 'database.ts'));
    expect(graph[handlerPath]).toHaveLength(2);
  });

  it('follows deeply nested transitive imports', () => {
    const handlerPath = join(handlersDir, 'login.ts');
    writeFileSync(handlerPath, `import { a } from '../../lib/a.js';\n`);
    writeFileSync(join(libDir, 'a.ts'), `import { b } from './b.js';\nexport const a = 1;`);
    writeFileSync(join(libDir, 'b.ts'), `import { c } from './c.js';\nexport const b = 2;`);
    writeFileSync(join(libDir, 'c.ts'), `export const c = 3;`);

    const { graph, brokenImports } = buildDependencyGraph([handlerPath], tmpDir);

    expect(brokenImports).toHaveLength(0);
    expect(graph[handlerPath]).toHaveLength(3);
    expect(graph[handlerPath]).toContain(resolve(libDir, 'a.ts'));
    expect(graph[handlerPath]).toContain(resolve(libDir, 'b.ts'));
    expect(graph[handlerPath]).toContain(resolve(libDir, 'c.ts'));
  });

  it('records broken imports with correct fields', () => {
    const handlerPath = join(handlersDir, 'login.ts');
    writeFileSync(handlerPath, `import { missing } from '../../lib/nonexistent.js';\n`);

    const { brokenImports } = buildDependencyGraph([handlerPath], tmpDir);

    expect(brokenImports).toHaveLength(1);
    expect(brokenImports[0].sourcePath).toBe(resolve(handlerPath));
    expect(brokenImports[0].importPath).toBe('../../lib/nonexistent.js');
    expect(brokenImports[0].resolvedAttempt).toBe(resolve(libDir, 'nonexistent.ts'));
    expect(brokenImports[0].line).toBe(1);
  });

  it('records full chain for broken imports in transitive deps', () => {
    const handlerPath = join(handlersDir, 'login.ts');
    writeFileSync(handlerPath, `import { auth } from '../../lib/auth.js';\n`);
    writeFileSync(join(libDir, 'auth.ts'), `import { missing } from './nonexistent.js';\nexport const auth = () => {};`);

    const { brokenImports } = buildDependencyGraph([handlerPath], tmpDir);

    expect(brokenImports).toHaveLength(1);
    expect(brokenImports[0].sourcePath).toBe(resolve(libDir, 'auth.ts'));
    expect(brokenImports[0].chain[0]).toBe(handlerPath);
    expect(brokenImports[0].chain[1]).toBe(resolve(libDir, 'auth.ts'));
    expect(brokenImports[0].chain[2]).toBe(resolve(libDir, 'nonexistent.ts'));
  });

  it('handles circular imports without infinite loop', () => {
    const handlerPath = join(handlersDir, 'login.ts');
    writeFileSync(handlerPath, `import { a } from '../../lib/a.js';\n`);
    writeFileSync(join(libDir, 'a.ts'), `import { b } from './b.js';\nexport const a = 1;`);
    writeFileSync(join(libDir, 'b.ts'), `import { a } from './a.js';\nexport const b = 2;`);

    const { graph, brokenImports } = buildDependencyGraph([handlerPath], tmpDir);

    expect(brokenImports).toHaveLength(0);
    expect(graph[handlerPath]).toContain(resolve(libDir, 'a.ts'));
    expect(graph[handlerPath]).toContain(resolve(libDir, 'b.ts'));
  });

  it('handles handler with no imports', () => {
    const handlerPath = join(handlersDir, 'login.ts');
    writeFileSync(handlerPath, `export const handler = () => {};\n`);

    const { graph, brokenImports } = buildDependencyGraph([handlerPath], tmpDir);

    expect(brokenImports).toHaveLength(0);
    expect(graph[handlerPath]).toEqual([]);
  });

  it('builds graph for multiple handlers', () => {
    const handler1 = join(handlersDir, 'login.ts');
    const handler2 = join(handlersDir, 'logout.ts');
    writeFileSync(join(libDir, 'response.ts'), 'export const success = () => {};');
    writeFileSync(join(libDir, 'auth.ts'), 'export const auth = () => {};');
    writeFileSync(handler1, `import { success } from '../../lib/response.js';\n`);
    writeFileSync(handler2, `import { auth } from '../../lib/auth.js';\nimport { success } from '../../lib/response.js';\n`);

    const { graph, brokenImports } = buildDependencyGraph([handler1, handler2], tmpDir);

    expect(brokenImports).toHaveLength(0);
    expect(graph[handler1]).toHaveLength(1);
    expect(graph[handler2]).toHaveLength(2);
  });

  it('adjacencyMap includes all files (handlers + libs)', () => {
    const handlerPath = join(handlersDir, 'login.ts');
    writeFileSync(handlerPath, `import { auth } from '../../lib/auth.js';\n`);
    writeFileSync(join(libDir, 'auth.ts'), `import { db } from './database.js';\nexport const auth = () => {};`);
    writeFileSync(join(libDir, 'database.ts'), `export const db = {};`);

    const { adjacencyMap } = buildDependencyGraph([handlerPath], tmpDir);

    expect(adjacencyMap.has(handlerPath)).toBe(true);
    expect(adjacencyMap.has(resolve(libDir, 'auth.ts'))).toBe(true);
    expect(adjacencyMap.has(resolve(libDir, 'database.ts'))).toBe(true);
    // handler → auth
    expect(adjacencyMap.get(handlerPath)).toEqual([resolve(libDir, 'auth.ts')]);
    // auth → database
    expect(adjacencyMap.get(resolve(libDir, 'auth.ts'))).toEqual([resolve(libDir, 'database.ts')]);
    // database → nothing
    expect(adjacencyMap.get(resolve(libDir, 'database.ts'))).toEqual([]);
  });

  it('does not include broken imports in adjacencyMap', () => {
    const handlerPath = join(handlersDir, 'login.ts');
    writeFileSync(handlerPath, `import { missing } from '../../lib/nonexistent.js';\nimport { ok } from '../../lib/response.js';\n`);
    writeFileSync(join(libDir, 'response.ts'), 'export const ok = () => {};');

    const { adjacencyMap } = buildDependencyGraph([handlerPath], tmpDir);

    // Only the resolved import should be in adjacencyMap
    expect(adjacencyMap.get(handlerPath)).toEqual([resolve(libDir, 'response.ts')]);
  });

  it('handles shared transitive deps across handlers without duplication in each handler graph', () => {
    const handler1 = join(handlersDir, 'login.ts');
    const handler2 = join(handlersDir, 'logout.ts');
    writeFileSync(join(libDir, 'shared.ts'), 'export const shared = 1;');
    writeFileSync(join(libDir, 'auth.ts'), `import { shared } from './shared.js';\nexport const auth = () => {};`);
    writeFileSync(handler1, `import { auth } from '../../lib/auth.js';\n`);
    writeFileSync(handler2, `import { auth } from '../../lib/auth.js';\n`);

    const { graph } = buildDependencyGraph([handler1, handler2], tmpDir);

    expect(graph[handler1]).toContain(resolve(libDir, 'auth.ts'));
    expect(graph[handler1]).toContain(resolve(libDir, 'shared.ts'));
    expect(graph[handler2]).toContain(resolve(libDir, 'auth.ts'));
    expect(graph[handler2]).toContain(resolve(libDir, 'shared.ts'));
  });

  it('includes cross-handler imports when one handler imports another handler file', () => {
    const handler1 = join(handlersDir, 'login.ts');
    const handler2Dir = join(tmpDir, 'handlers', 'security');
    mkdirSync(handler2Dir, { recursive: true });
    const handler2 = join(handler2Dir, 'scan.ts');
    writeFileSync(handler2, `export const scan = () => {};`);
    writeFileSync(handler1, `import { scan } from '../security/scan.js';\n`);

    const { graph, brokenImports } = buildDependencyGraph([handler1], tmpDir);

    expect(brokenImports).toHaveLength(0);
    expect(graph[handler1]).toContain(resolve(handler2));
  });

  it('uses import cache — same lib parsed once across multiple handlers', () => {
    const handler1 = join(handlersDir, 'login.ts');
    const handler2 = join(handlersDir, 'logout.ts');
    writeFileSync(join(libDir, 'response.ts'), 'export const ok = () => {};');
    writeFileSync(handler1, `import { ok } from '../../lib/response.js';\n`);
    writeFileSync(handler2, `import { ok } from '../../lib/response.js';\n`);

    const { graph, brokenImports } = buildDependencyGraph([handler1, handler2], tmpDir);

    expect(brokenImports).toHaveLength(0);
    expect(graph[handler1]).toHaveLength(1);
    expect(graph[handler2]).toHaveLength(1);
    // Both should resolve to the same lib
    expect(graph[handler1][0]).toBe(graph[handler2][0]);
  });
});


// ---------------------------------------------------------------------------
// Cycle Detection (Task 4.1)
// ---------------------------------------------------------------------------

describe('detectCycles', () => {
  it('returns empty array for acyclic graph', () => {
    const adj = new Map<string, string[]>();
    adj.set('A.ts', ['B.ts']);
    adj.set('B.ts', ['C.ts']);
    adj.set('C.ts', []);

    const cycles = detectCycles(adj);
    expect(cycles).toHaveLength(0);
  });

  it('detects a simple 2-node cycle', () => {
    const adj = new Map<string, string[]>();
    adj.set('A.ts', ['B.ts']);
    adj.set('B.ts', ['A.ts']);

    const cycles = detectCycles(adj);
    expect(cycles).toHaveLength(1);
    expect(cycles[0].path[0]).toBe(cycles[0].path[cycles[0].path.length - 1]);
    expect(cycles[0].path).toHaveLength(3); // A → B → A
  });

  it('detects a 3-node cycle', () => {
    const adj = new Map<string, string[]>();
    adj.set('A.ts', ['B.ts']);
    adj.set('B.ts', ['C.ts']);
    adj.set('C.ts', ['A.ts']);

    const cycles = detectCycles(adj);
    expect(cycles).toHaveLength(1);
    const cycle = cycles[0];
    // First and last should be the same
    expect(cycle.path[0]).toBe(cycle.path[cycle.path.length - 1]);
    // All consecutive pairs should be valid edges
    for (let i = 0; i < cycle.path.length - 1; i++) {
      const from = cycle.path[i];
      const to = cycle.path[i + 1];
      expect(adj.get(from)).toContain(to);
    }
  });

  it('detects self-loop', () => {
    const adj = new Map<string, string[]>();
    adj.set('A.ts', ['A.ts']);

    const cycles = detectCycles(adj);
    expect(cycles).toHaveLength(1);
    expect(cycles[0].path).toEqual(['A.ts', 'A.ts']);
  });

  it('detects multiple independent cycles', () => {
    const adj = new Map<string, string[]>();
    // Cycle 1: A → B → A
    adj.set('A.ts', ['B.ts']);
    adj.set('B.ts', ['A.ts']);
    // Cycle 2: C → D → C
    adj.set('C.ts', ['D.ts']);
    adj.set('D.ts', ['C.ts']);

    const cycles = detectCycles(adj);
    expect(cycles).toHaveLength(2);
  });

  it('does not report duplicate cycles', () => {
    // A → B → A is the same cycle regardless of starting point
    const adj = new Map<string, string[]>();
    adj.set('A.ts', ['B.ts']);
    adj.set('B.ts', ['A.ts']);

    const cycles = detectCycles(adj);
    expect(cycles).toHaveLength(1);
  });

  it('returns empty array for empty graph', () => {
    const adj = new Map<string, string[]>();
    const cycles = detectCycles(adj);
    expect(cycles).toHaveLength(0);
  });

  it('returns empty array for graph with no edges', () => {
    const adj = new Map<string, string[]>();
    adj.set('A.ts', []);
    adj.set('B.ts', []);

    const cycles = detectCycles(adj);
    expect(cycles).toHaveLength(0);
  });

  it('handles graph with cycle and acyclic branches', () => {
    const adj = new Map<string, string[]>();
    adj.set('handler.ts', ['A.ts', 'B.ts']);
    adj.set('A.ts', ['B.ts']);
    adj.set('B.ts', ['A.ts']); // cycle: A → B → A
    adj.set('C.ts', []);       // disconnected, no cycle

    const cycles = detectCycles(adj);
    expect(cycles).toHaveLength(1);
    const cycle = cycles[0];
    expect(cycle.path[0]).toBe(cycle.path[cycle.path.length - 1]);
  });

  it('cycle path contains valid edges from adjacencyMap', () => {
    const adj = new Map<string, string[]>();
    adj.set('X.ts', ['Y.ts']);
    adj.set('Y.ts', ['Z.ts']);
    adj.set('Z.ts', ['X.ts']);

    const cycles = detectCycles(adj);
    expect(cycles).toHaveLength(1);
    const cycle = cycles[0];

    // Verify every consecutive pair is a real edge
    for (let i = 0; i < cycle.path.length - 1; i++) {
      const from = cycle.path[i];
      const to = cycle.path[i + 1];
      expect(adj.get(from)).toContain(to);
    }
  });

  it('handles node referenced as neighbor but not in adjacencyMap keys', () => {
    const adj = new Map<string, string[]>();
    adj.set('A.ts', ['B.ts']);
    // B.ts is not a key in the map — should not crash

    const cycles = detectCycles(adj);
    expect(cycles).toHaveLength(0);
  });

  it('detects nested cycles (cycle within a larger cycle)', () => {
    const adj = new Map<string, string[]>();
    // Large cycle: A → B → C → A
    // Small cycle: B → C → B
    adj.set('A.ts', ['B.ts']);
    adj.set('B.ts', ['C.ts']);
    adj.set('C.ts', ['A.ts', 'B.ts']);

    const cycles = detectCycles(adj);
    // Should detect at least 2 cycles
    expect(cycles.length).toBeGreaterThanOrEqual(2);
    // All cycles should have valid first=last
    for (const cycle of cycles) {
      expect(cycle.path[0]).toBe(cycle.path[cycle.path.length - 1]);
    }
  });

  it('detects self-loop combined with regular cycle', () => {
    const adj = new Map<string, string[]>();
    adj.set('A.ts', ['A.ts', 'B.ts']); // self-loop + edge to B
    adj.set('B.ts', ['C.ts']);
    adj.set('C.ts', ['B.ts']); // cycle B → C → B

    const cycles = detectCycles(adj);
    // Should detect self-loop on A and cycle B↔C
    expect(cycles.length).toBeGreaterThanOrEqual(2);
  });

  it('handles large linear chain with no cycles', () => {
    const adj = new Map<string, string[]>();
    for (let i = 0; i < 20; i++) {
      adj.set(`node${i}.ts`, i < 19 ? [`node${i + 1}.ts`] : []);
    }
    const cycles = detectCycles(adj);
    expect(cycles).toHaveLength(0);
  });
});


// ---------------------------------------------------------------------------
// Reporting (Task 6.1)
// ---------------------------------------------------------------------------

describe('reportResults', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('prints summary with correct counts', () => {
    const result: ValidationResult = {
      handlersScanned: 10,
      uniqueLibs: 5,
      brokenImports: [],
      cycles: [],
    };

    reportResults(result);

    const output = logSpy.mock.calls.map((c: any[]) => c[0]).join('\n');
    expect(output).toContain('Handlers scanned: 10');
    expect(output).toContain('Unique libs referenced: 5');
    expect(output).toContain('Broken imports: 0');
    expect(output).toContain('Circular dependencies: 0');
  });

  it('prints broken imports section with file path and line number', () => {
    const result: ValidationResult = {
      handlersScanned: 1,
      uniqueLibs: 0,
      brokenImports: [
        {
          sourcePath: join(resolve('.'), 'backend/src/handlers/auth/login.ts'),
          importPath: '../../lib/nonexistent.js',
          resolvedAttempt: join(resolve('.'), 'backend/src/lib/nonexistent.ts'),
          line: 3,
          chain: [
            join(resolve('.'), 'backend/src/handlers/auth/login.ts'),
            join(resolve('.'), 'backend/src/lib/nonexistent.ts'),
          ],
        },
      ],
      cycles: [],
    };

    reportResults(result);

    const output = logSpy.mock.calls.map((c: any[]) => c[0]).join('\n');
    expect(output).toContain('❌ BROKEN IMPORTS FOUND:');
    expect(output).toContain('backend/src/handlers/auth/login.ts:3');
    expect(output).toContain("import '../../lib/nonexistent.js'");
    expect(output).toContain('backend/src/lib/nonexistent.ts (FILE NOT FOUND)');
    expect(output).toContain('chain: login.ts → nonexistent.ts');
    expect(output).toContain('Total: 1 broken import(s) across 1 handler(s)');
  });

  it('prints cycles section with cycle paths', () => {
    const result: ValidationResult = {
      handlersScanned: 5,
      uniqueLibs: 3,
      brokenImports: [],
      cycles: [
        { path: ['/src/lib/auth.ts', '/src/lib/database.ts', '/src/lib/auth.ts'] },
        { path: ['/src/lib/middleware.ts', '/src/lib/logging.ts', '/src/lib/middleware.ts'] },
      ],
    };

    reportResults(result);

    const output = logSpy.mock.calls.map((c: any[]) => c[0]).join('\n');
    expect(output).toContain('🔄 CIRCULAR IMPORTS DETECTED:');
    expect(output).toContain('Cycle 1: auth.ts → database.ts → auth.ts');
    expect(output).toContain('Cycle 2: middleware.ts → logging.ts → middleware.ts');
    expect(output).toContain('Total: 2 circular dependency cycle(s)');
  });

  it('does not print broken imports section when there are none', () => {
    const result: ValidationResult = {
      handlersScanned: 1,
      uniqueLibs: 1,
      brokenImports: [],
      cycles: [],
    };

    reportResults(result);

    const output = logSpy.mock.calls.map((c: any[]) => c[0]).join('\n');
    expect(output).not.toContain('❌ BROKEN IMPORTS FOUND:');
  });

  it('does not print cycles section when there are none', () => {
    const result: ValidationResult = {
      handlersScanned: 1,
      uniqueLibs: 1,
      brokenImports: [],
      cycles: [],
    };

    reportResults(result);

    const output = logSpy.mock.calls.map((c: any[]) => c[0]).join('\n');
    expect(output).not.toContain('🔄 CIRCULAR IMPORTS DETECTED:');
  });

  it('counts unique handlers in broken imports total', () => {
    const handler1 = join(resolve('.'), 'backend/src/handlers/auth/login.ts');
    const handler2 = join(resolve('.'), 'backend/src/handlers/auth/logout.ts');
    const result: ValidationResult = {
      handlersScanned: 2,
      uniqueLibs: 0,
      brokenImports: [
        {
          sourcePath: handler1,
          importPath: '../../lib/a.js',
          resolvedAttempt: join(resolve('.'), 'backend/src/lib/a.ts'),
          line: 1,
          chain: [handler1, join(resolve('.'), 'backend/src/lib/a.ts')],
        },
        {
          sourcePath: handler2,
          importPath: '../../lib/b.js',
          resolvedAttempt: join(resolve('.'), 'backend/src/lib/b.ts'),
          line: 2,
          chain: [handler2, join(resolve('.'), 'backend/src/lib/b.ts')],
        },
        {
          sourcePath: handler1,
          importPath: '../../lib/c.js',
          resolvedAttempt: join(resolve('.'), 'backend/src/lib/c.ts'),
          line: 3,
          chain: [handler1, join(resolve('.'), 'backend/src/lib/c.ts')],
        },
      ],
      cycles: [],
    };

    reportResults(result);

    const output = logSpy.mock.calls.map((c: any[]) => c[0]).join('\n');
    expect(output).toContain('Total: 3 broken import(s) across 2 handler(s)');
  });
});

// ---------------------------------------------------------------------------
// Graph JSON Output (Task 6.1)
// ---------------------------------------------------------------------------

describe('writeGraphJson', () => {
  const tmpDir = join(resolve('.'), '__test_graph_json_tmp__');

  beforeEach(() => {
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes valid JSON file with correct schema', () => {
    const cwd = process.cwd();
    const handlerPath = join(cwd, 'backend/src/handlers/auth/login.ts');
    const libPath = join(cwd, 'backend/src/lib/response.ts');

    const graph: DependencyGraph = { [handlerPath]: [libPath] };
    const adjacencyMap = new Map<string, string[]>();
    adjacencyMap.set(handlerPath, [libPath]);
    adjacencyMap.set(libPath, []);

    const result: ValidationResult = {
      handlersScanned: 1,
      uniqueLibs: 1,
      brokenImports: [],
      cycles: [],
    };

    const outputPath = join(tmpDir, 'graph.json');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    writeGraphJson(graph, adjacencyMap, result, outputPath);
    logSpy.mockRestore();

    expect(existsSync(outputPath)).toBe(true);
    const parsed = JSON.parse(readFileSync(outputPath, 'utf-8'));

    expect(parsed.metadata).toBeDefined();
    expect(parsed.metadata.handlersScanned).toBe(1);
    expect(parsed.metadata.uniqueLibs).toBe(1);
    expect(parsed.metadata.brokenImports).toBe(0);
    expect(parsed.metadata.circularDependencies).toBe(0);
    expect(parsed.metadata.generatedAt).toBeDefined();
    expect(parsed.handlers).toBeDefined();
  });

  it('uses relative paths in the output', () => {
    const cwd = process.cwd();
    const handlerPath = join(cwd, 'backend/src/handlers/auth/login.ts');
    const libPath = join(cwd, 'backend/src/lib/response.ts');

    const graph: DependencyGraph = { [handlerPath]: [libPath] };
    const adjacencyMap = new Map<string, string[]>();
    adjacencyMap.set(handlerPath, [libPath]);

    const result: ValidationResult = {
      handlersScanned: 1,
      uniqueLibs: 1,
      brokenImports: [],
      cycles: [],
    };

    const outputPath = join(tmpDir, 'graph.json');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    writeGraphJson(graph, adjacencyMap, result, outputPath);
    logSpy.mockRestore();

    const parsed = JSON.parse(readFileSync(outputPath, 'utf-8'));
    const handlerKey = Object.keys(parsed.handlers)[0];
    expect(handlerKey).toBe('backend/src/handlers/auth/login.ts');
    expect(parsed.handlers[handlerKey].directImports[0]).toBe('backend/src/lib/response.ts');
    expect(parsed.handlers[handlerKey].transitiveImports[0]).toBe('backend/src/lib/response.ts');
  });

  it('distinguishes direct from transitive imports', () => {
    const cwd = process.cwd();
    const handlerPath = join(cwd, 'backend/src/handlers/auth/login.ts');
    const libAuth = join(cwd, 'backend/src/lib/auth.ts');
    const libDb = join(cwd, 'backend/src/lib/database.ts');

    // handler imports auth directly; auth imports database (transitive)
    const graph: DependencyGraph = { [handlerPath]: [libAuth, libDb] };
    const adjacencyMap = new Map<string, string[]>();
    adjacencyMap.set(handlerPath, [libAuth]); // only direct import
    adjacencyMap.set(libAuth, [libDb]);
    adjacencyMap.set(libDb, []);

    const result: ValidationResult = {
      handlersScanned: 1,
      uniqueLibs: 2,
      brokenImports: [],
      cycles: [],
    };

    const outputPath = join(tmpDir, 'graph.json');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    writeGraphJson(graph, adjacencyMap, result, outputPath);
    logSpy.mockRestore();

    const parsed = JSON.parse(readFileSync(outputPath, 'utf-8'));
    const entry = parsed.handlers['backend/src/handlers/auth/login.ts'];
    expect(entry.directImports).toHaveLength(1);
    expect(entry.directImports[0]).toBe('backend/src/lib/auth.ts');
    expect(entry.transitiveImports).toHaveLength(2);
    expect(entry.transitiveImports).toContain('backend/src/lib/auth.ts');
    expect(entry.transitiveImports).toContain('backend/src/lib/database.ts');
  });

  it('creates parent directories if they do not exist', () => {
    const cwd = process.cwd();
    const graph: DependencyGraph = {};
    const adjacencyMap = new Map<string, string[]>();
    const result: ValidationResult = {
      handlersScanned: 0,
      uniqueLibs: 0,
      brokenImports: [],
      cycles: [],
    };

    const outputPath = join(tmpDir, 'nested', 'deep', 'graph.json');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    writeGraphJson(graph, adjacencyMap, result, outputPath);
    logSpy.mockRestore();

    expect(existsSync(outputPath)).toBe(true);
  });

  it('includes metadata with correct broken import and cycle counts', () => {
    const cwd = process.cwd();
    const graph: DependencyGraph = {};
    const adjacencyMap = new Map<string, string[]>();
    const result: ValidationResult = {
      handlersScanned: 50,
      uniqueLibs: 20,
      brokenImports: [
        { sourcePath: '/a.ts', importPath: './b.js', resolvedAttempt: '/b.ts', line: 1, chain: ['/a.ts', '/b.ts'] },
        { sourcePath: '/c.ts', importPath: './d.js', resolvedAttempt: '/d.ts', line: 2, chain: ['/c.ts', '/d.ts'] },
      ],
      cycles: [
        { path: ['x.ts', 'y.ts', 'x.ts'] },
      ],
    };

    const outputPath = join(tmpDir, 'graph.json');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    writeGraphJson(graph, adjacencyMap, result, outputPath);
    logSpy.mockRestore();

    const parsed = JSON.parse(readFileSync(outputPath, 'utf-8'));
    expect(parsed.metadata.handlersScanned).toBe(50);
    expect(parsed.metadata.uniqueLibs).toBe(20);
    expect(parsed.metadata.brokenImports).toBe(2);
    expect(parsed.metadata.circularDependencies).toBe(1);
  });

  it('outputs empty arrays for handler with zero dependencies', () => {
    const cwd = process.cwd();
    const handlerPath = join(cwd, 'backend/src/handlers/auth/noop.ts');

    const graph: DependencyGraph = { [handlerPath]: [] };
    const adjacencyMap = new Map<string, string[]>();
    adjacencyMap.set(handlerPath, []);

    const result: ValidationResult = {
      handlersScanned: 1,
      uniqueLibs: 0,
      brokenImports: [],
      cycles: [],
    };

    const outputPath = join(tmpDir, 'graph.json');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    writeGraphJson(graph, adjacencyMap, result, outputPath);
    logSpy.mockRestore();

    const parsed = JSON.parse(readFileSync(outputPath, 'utf-8'));
    const entry = parsed.handlers['backend/src/handlers/auth/noop.ts'];
    expect(entry).toBeDefined();
    expect(entry.directImports).toEqual([]);
    expect(entry.transitiveImports).toEqual([]);
  });
});


// ---------------------------------------------------------------------------
// Domain Map Updater (Task 7.1)
// ---------------------------------------------------------------------------

describe('collapseLibPath', () => {
  it('collapses lib subdirectory files to directory path', () => {
    expect(collapseLibPath('lib/security-engine/index.ts')).toBe('lib/security-engine/');
    expect(collapseLibPath('lib/security-engine/scanner.ts')).toBe('lib/security-engine/');
    expect(collapseLibPath('lib/cost/helpers/deep.ts')).toBe('lib/cost/');
  });

  it('keeps direct lib files as-is', () => {
    expect(collapseLibPath('lib/response.ts')).toBe('lib/response.ts');
    expect(collapseLibPath('lib/auth.ts')).toBe('lib/auth.ts');
  });

  it('keeps types files as-is', () => {
    expect(collapseLibPath('types/lambda.ts')).toBe('types/lambda.ts');
    expect(collapseLibPath('types/cloud.ts')).toBe('types/cloud.ts');
  });

  it('handles single-segment paths', () => {
    expect(collapseLibPath('response.ts')).toBe('response.ts');
  });

  it('handles types subdirectory paths as-is (no collapse)', () => {
    expect(collapseLibPath('types/sub/deep.ts')).toBe('types/sub/deep.ts');
  });
});

describe('parseDomainConfigs', () => {
  it('parses domain names and handler globs from content', () => {
    const content = `export const DOMAIN_MAP = {
  security: {
    description: 'Security scanning',
    handlers: [
      'handlers/security/*',
    ],
    sharedLibs: ['lib/security-engine/'],
  },
  cloud: {
    description: 'Cloud providers',
    handlers: [
      'handlers/aws/*',
      'handlers/azure/*',
    ],
    sharedLibs: ['lib/aws-helpers.ts'],
  },
} as const;`;

    const configs = parseDomainConfigs(content);
    expect(configs.size).toBe(2);
    expect(configs.get('security')!.handlerGlobs).toEqual(['handlers/security/*']);
    expect(configs.get('cloud')!.handlerGlobs).toEqual(['handlers/aws/*', 'handlers/azure/*']);
  });

  it('parses shared domain with empty handlers', () => {
    const content = `export const DOMAIN_MAP = {
  shared: {
    description: 'Core libraries',
    handlers: [],
    sharedLibs: ['lib/response.ts'],
  },
} as const;`;

    const configs = parseDomainConfigs(content);
    expect(configs.get('shared')!.handlerGlobs).toEqual([]);
  });
});

describe('findHandlersForDomain', () => {
  it('matches handlers by glob prefix', () => {
    const basePath = '/project/backend/src';
    const graph: DependencyGraph = {
      '/project/backend/src/handlers/security/scan.ts': [],
      '/project/backend/src/handlers/security/waf.ts': [],
      '/project/backend/src/handlers/auth/login.ts': [],
    };

    const result = findHandlersForDomain(graph, ['handlers/security/*'], basePath);
    expect(result).toHaveLength(2);
    expect(result).toContain('/project/backend/src/handlers/security/scan.ts');
    expect(result).toContain('/project/backend/src/handlers/security/waf.ts');
  });

  it('matches multiple globs for a domain', () => {
    const basePath = '/project/backend/src';
    const graph: DependencyGraph = {
      '/project/backend/src/handlers/aws/creds.ts': [],
      '/project/backend/src/handlers/azure/setup.ts': [],
      '/project/backend/src/handlers/auth/login.ts': [],
    };

    const result = findHandlersForDomain(graph, ['handlers/aws/*', 'handlers/azure/*'], basePath);
    expect(result).toHaveLength(2);
    expect(result).toContain('/project/backend/src/handlers/aws/creds.ts');
    expect(result).toContain('/project/backend/src/handlers/azure/setup.ts');
  });

  it('returns empty array when no handlers match', () => {
    const graph: DependencyGraph = {
      '/project/backend/src/handlers/auth/login.ts': [],
    };
    const result = findHandlersForDomain(graph, ['handlers/security/*'], '/project/backend/src');
    expect(result).toHaveLength(0);
  });
});

describe('collectLibsForHandlers', () => {
  it('collects unique lib paths from handler dependencies', () => {
    const basePath = '/project/backend/src';
    const graph: DependencyGraph = {
      '/project/backend/src/handlers/security/scan.ts': [
        '/project/backend/src/lib/response.ts',
        '/project/backend/src/lib/security-engine/index.ts',
      ],
    };

    const result = collectLibsForHandlers(
      graph,
      ['/project/backend/src/handlers/security/scan.ts'],
      basePath,
    );
    expect(result).toContain('lib/response.ts');
    expect(result).toContain('lib/security-engine/');
  });

  it('deduplicates libs across multiple handlers', () => {
    const basePath = '/project/backend/src';
    const graph: DependencyGraph = {
      '/project/backend/src/handlers/security/scan.ts': [
        '/project/backend/src/lib/response.ts',
      ],
      '/project/backend/src/handlers/security/waf.ts': [
        '/project/backend/src/lib/response.ts',
        '/project/backend/src/lib/auth.ts',
      ],
    };

    const result = collectLibsForHandlers(
      graph,
      [
        '/project/backend/src/handlers/security/scan.ts',
        '/project/backend/src/handlers/security/waf.ts',
      ],
      basePath,
    );
    expect(result).toEqual(['lib/auth.ts', 'lib/response.ts']);
  });

  it('excludes non-lib/types paths', () => {
    const basePath = '/project/backend/src';
    const graph: DependencyGraph = {
      '/project/backend/src/handlers/auth/login.ts': [
        '/project/backend/src/lib/response.ts',
        '/project/backend/src/handlers/auth/helper.ts',
      ],
    };

    const result = collectLibsForHandlers(
      graph,
      ['/project/backend/src/handlers/auth/login.ts'],
      basePath,
    );
    expect(result).toEqual(['lib/response.ts']);
  });

  it('returns sorted results', () => {
    const basePath = '/project/backend/src';
    const graph: DependencyGraph = {
      '/project/backend/src/handlers/auth/login.ts': [
        '/project/backend/src/lib/database.ts',
        '/project/backend/src/lib/auth.ts',
        '/project/backend/src/types/lambda.ts',
      ],
    };

    const result = collectLibsForHandlers(
      graph,
      ['/project/backend/src/handlers/auth/login.ts'],
      basePath,
    );
    expect(result).toEqual(['lib/auth.ts', 'lib/database.ts', 'types/lambda.ts']);
  });
});

describe('replaceSharedLibsInContent', () => {
  it('replaces sharedLibs array for a specific domain', () => {
    const content = `export const DOMAIN_MAP = {
  security: {
    description: 'Security scanning',
    handlers: ['handlers/security/*'],
    sharedLibs: [
      'lib/old-lib.ts',
    ],
  },
} as const;`;

    const result = replaceSharedLibsInContent(content, 'security', ['lib/new-lib.ts', 'lib/security-engine/']);
    expect(result).toContain("'lib/new-lib.ts'");
    expect(result).toContain("'lib/security-engine/'");
    expect(result).not.toContain("'lib/old-lib.ts'");
  });

  it('preserves other domains when replacing one', () => {
    const content = `export const DOMAIN_MAP = {
  security: {
    description: 'Security',
    handlers: ['handlers/security/*'],
    sharedLibs: [
      'lib/old.ts',
    ],
  },
  cloud: {
    description: 'Cloud',
    handlers: ['handlers/aws/*'],
    sharedLibs: [
      'lib/aws-helpers.ts',
    ],
  },
} as const;`;

    const result = replaceSharedLibsInContent(content, 'security', ['lib/new.ts']);
    expect(result).toContain("'lib/new.ts'");
    // cloud domain should be unchanged
    expect(result).toContain("'lib/aws-helpers.ts'");
  });

  it('handles empty libs array', () => {
    const content = `export const DOMAIN_MAP = {
  ai: {
    description: 'AI',
    handlers: ['handlers/ai/*'],
    sharedLibs: [
      'lib/bedrock-client.ts',
    ],
  },
} as const;`;

    const result = replaceSharedLibsInContent(content, 'ai', []);
    expect(result).toContain('sharedLibs: []');
  });

  it('returns content unchanged if domain not found', () => {
    const content = `export const DOMAIN_MAP = {
  security: {
    description: 'Security',
    handlers: ['handlers/security/*'],
    sharedLibs: ['lib/old.ts'],
  },
} as const;`;

    const result = replaceSharedLibsInContent(content, 'nonexistent', ['lib/new.ts']);
    expect(result).toBe(content);
  });
});

describe('updateDomainMap', () => {
  const tmpDir = join(resolve('.'), '__test_domain_map_tmp__');

  beforeEach(() => {
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('updates sharedLibs based on dependency graph', () => {
    const basePath = join(tmpDir, 'backend', 'src');
    const domainMapPath = join(basePath, 'domains', 'index.ts');
    mkdirSync(dirname(domainMapPath), { recursive: true });

    const domainMapContent = `export const DOMAIN_MAP = {
  security: {
    description: 'Security scanning',
    handlers: [
      'handlers/security/*',
    ],
    sharedLibs: [
      'lib/old-security-lib.ts',
    ],
  },
  auth: {
    description: 'Authentication',
    handlers: [
      'handlers/auth/*',
    ],
    sharedLibs: [
      'lib/old-auth-lib.ts',
    ],
  },
  shared: {
    description: 'Core libraries',
    handlers: [],
    sharedLibs: [
      'lib/old-shared.ts',
    ],
  },
} as const;`;

    writeFileSync(domainMapPath, domainMapContent);

    // Build a graph where:
    // - security handler uses lib/security-engine/index.ts and lib/response.ts
    // - auth handler uses lib/auth.ts and lib/response.ts
    const graph: DependencyGraph = {
      [join(basePath, 'handlers/security/scan.ts')]: [
        join(basePath, 'lib/security-engine/index.ts'),
        join(basePath, 'lib/response.ts'),
      ],
      [join(basePath, 'handlers/auth/login.ts')]: [
        join(basePath, 'lib/auth.ts'),
        join(basePath, 'lib/response.ts'),
      ],
    };

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    updateDomainMap(graph, domainMapPath);
    logSpy.mockRestore();

    const updated = readFileSync(domainMapPath, 'utf-8');
    // Security should have its actual libs
    expect(updated).toContain("'lib/response.ts'");
    expect(updated).toContain("'lib/security-engine/'");
    expect(updated).not.toContain("'lib/old-security-lib.ts'");
    // Auth should have its actual libs
    expect(updated).toContain("'lib/auth.ts'");
    expect(updated).not.toContain("'lib/old-auth-lib.ts'");
    // Shared should be empty (only 2 domains, need 3+ for shared)
    // The 'as const' should be preserved
    expect(updated).toContain('as const');
  });

  it('computes shared libs from 3+ domain usage', () => {
    const basePath = join(tmpDir, 'backend', 'src');
    const domainMapPath = join(basePath, 'domains', 'index.ts');
    mkdirSync(dirname(domainMapPath), { recursive: true });

    const domainMapContent = `export const DOMAIN_MAP = {
  security: {
    description: 'Security',
    handlers: ['handlers/security/*'],
    sharedLibs: [],
  },
  auth: {
    description: 'Auth',
    handlers: ['handlers/auth/*'],
    sharedLibs: [],
  },
  cloud: {
    description: 'Cloud',
    handlers: ['handlers/cloud/*'],
    sharedLibs: [],
  },
  shared: {
    description: 'Core',
    handlers: [],
    sharedLibs: [],
  },
} as const;`;

    writeFileSync(domainMapPath, domainMapContent);

    // lib/response.ts used by all 3 domains → should be in shared
    // lib/auth.ts used by only 2 → should NOT be in shared
    const graph: DependencyGraph = {
      [join(basePath, 'handlers/security/scan.ts')]: [
        join(basePath, 'lib/response.ts'),
        join(basePath, 'lib/auth.ts'),
      ],
      [join(basePath, 'handlers/auth/login.ts')]: [
        join(basePath, 'lib/response.ts'),
        join(basePath, 'lib/auth.ts'),
      ],
      [join(basePath, 'handlers/cloud/list.ts')]: [
        join(basePath, 'lib/response.ts'),
      ],
    };

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    updateDomainMap(graph, domainMapPath);
    logSpy.mockRestore();

    const updated = readFileSync(domainMapPath, 'utf-8');
    // Find the shared domain's sharedLibs
    const sharedMatch = updated.match(/shared:\s*\{[\s\S]*?sharedLibs:\s*\[([\s\S]*?)\]/);
    expect(sharedMatch).not.toBeNull();
    expect(sharedMatch![1]).toContain("'lib/response.ts'");
    expect(sharedMatch![1]).not.toContain("'lib/auth.ts'");
  });

  it('preserves domain descriptions and handler globs', () => {
    const basePath = join(tmpDir, 'backend', 'src');
    const domainMapPath = join(basePath, 'domains', 'index.ts');
    mkdirSync(dirname(domainMapPath), { recursive: true });

    const domainMapContent = `export const DOMAIN_MAP = {
  security: {
    description: 'Security scanning, compliance, WAF, threat detection',
    handlers: [
      'handlers/security/*',
    ],
    sharedLibs: [
      'lib/old.ts',
    ],
  },
} as const;`;

    writeFileSync(domainMapPath, domainMapContent);

    const graph: DependencyGraph = {
      [join(basePath, 'handlers/security/scan.ts')]: [
        join(basePath, 'lib/new.ts'),
      ],
    };

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    updateDomainMap(graph, domainMapPath);
    logSpy.mockRestore();

    const updated = readFileSync(domainMapPath, 'utf-8');
    expect(updated).toContain("description: 'Security scanning, compliance, WAF, threat detection'");
    expect(updated).toContain("'handlers/security/*'");
  });

  it('exits with code 1 when domain map file not found', () => {
    const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as any);
    const mockError = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => {
      updateDomainMap({}, join(tmpDir, 'nonexistent.ts'));
    }).toThrow('process.exit called');

    expect(mockExit).toHaveBeenCalledWith(1);
    mockExit.mockRestore();
    mockError.mockRestore();
  });

  it('sorts sharedLibs alphabetically', () => {
    const basePath = join(tmpDir, 'backend', 'src');
    const domainMapPath = join(basePath, 'domains', 'index.ts');
    mkdirSync(dirname(domainMapPath), { recursive: true });

    const domainMapContent = `export const DOMAIN_MAP = {
  security: {
    description: 'Security',
    handlers: ['handlers/security/*'],
    sharedLibs: [],
  },
  shared: {
    description: 'Core',
    handlers: [],
    sharedLibs: [],
  },
} as const;`;

    writeFileSync(domainMapPath, domainMapContent);

    const graph: DependencyGraph = {
      [join(basePath, 'handlers/security/scan.ts')]: [
        join(basePath, 'lib/zebra.ts'),
        join(basePath, 'lib/alpha.ts'),
        join(basePath, 'lib/middle.ts'),
      ],
    };

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    updateDomainMap(graph, domainMapPath);
    logSpy.mockRestore();

    const updated = readFileSync(domainMapPath, 'utf-8');
    const secMatch = updated.match(/security:\s*\{[\s\S]*?sharedLibs:\s*\[([\s\S]*?)\]/);
    expect(secMatch).not.toBeNull();
    const libsStr = secMatch![1];
    const alphaIdx = libsStr.indexOf("'lib/alpha.ts'");
    const middleIdx = libsStr.indexOf("'lib/middle.ts'");
    const zebraIdx = libsStr.indexOf("'lib/zebra.ts'");
    expect(alphaIdx).toBeLessThan(middleIdx);
    expect(middleIdx).toBeLessThan(zebraIdx);
  });
});
