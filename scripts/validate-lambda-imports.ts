#!/usr/bin/env tsx
/**
 * Lambda Import Validator
 *
 * Statically analyzes handler source files under backend/src/handlers/ to build
 * a complete dependency graph, detect broken imports and circular dependencies,
 * and optionally update the domain map.
 *
 * Usage:
 *   npx tsx scripts/validate-lambda-imports.ts
 *   npx tsx scripts/validate-lambda-imports.ts --handler backend/src/handlers/auth/login.ts
 *   npx tsx scripts/validate-lambda-imports.ts --output-graph graph.json
 *   npx tsx scripts/validate-lambda-imports.ts --update-domain-map
 */

import { readdirSync, statSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, resolve, relative, dirname, basename } from 'path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CLIOptions {
  handler?: string;
  outputGraph?: string;
  updateDomainMap?: boolean;
}

export interface ImportInfo {
  sourcePath: string;
  importPath: string;
  line: number;
}

export interface DependencyGraph {
  [handlerPath: string]: string[];
}

export interface BrokenImport {
  sourcePath: string;
  importPath: string;
  resolvedAttempt: string;
  line: number;
  chain: string[];
}

export interface Cycle {
  path: string[];
}

export interface ValidationResult {
  handlersScanned: number;
  uniqueLibs: number;
  brokenImports: BrokenImport[];
  cycles: Cycle[];
}

// ---------------------------------------------------------------------------
// CLI Argument Parsing
// ---------------------------------------------------------------------------

export function parseCLIArgs(args: string[]): CLIOptions {
  const options: CLIOptions = {};

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--handler':
        if (i + 1 < args.length) {
          options.handler = args[++i];
        }
        break;
      case '--output-graph':
        if (i + 1 < args.length) {
          options.outputGraph = args[++i];
        }
        break;
      case '--update-domain-map':
        options.updateDomainMap = true;
        break;
    }
  }

  return options;
}

// ---------------------------------------------------------------------------
// File Discovery
// ---------------------------------------------------------------------------

/**
 * Recursively discovers all .ts handler files under basePath/handlers/.
 * If singleHandler is provided, validates it exists and returns only that file.
 * Excludes _templates/ directory.
 */
export function discoverHandlers(basePath: string, singleHandler?: string): string[] {
  if (singleHandler) {
    const handlerPath = resolve(singleHandler);
    if (!existsSync(handlerPath)) {
      console.error(`❌ Handler not found: ${singleHandler}`);
      process.exit(1);
    }
    return [handlerPath];
  }

  const handlersDir = join(basePath, 'handlers');
  if (!existsSync(handlersDir)) {
    console.error(`❌ Handlers directory not found: ${handlersDir}`);
    process.exit(1);
  }

  return walkDirectory(handlersDir);
}

function walkDirectory(dir: string): string[] {
  const results: string[] = [];
  const entries = readdirSync(dir);

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      // Exclude _templates/ directory
      if (entry === '_templates') continue;
      results.push(...walkDirectory(fullPath));
    } else if (stat.isFile() && entry.endsWith('.ts')) {
      results.push(fullPath);
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Import Extraction
// ---------------------------------------------------------------------------

// Regex patterns (compiled once, reused across calls)
const IMPORT_FROM_REGEX = /import\s+.*?\s+from\s+['"](.+?)['"]/;
const REQUIRE_REGEX = /require\(\s*['"](.+?)['"]\s*\)/;
const SHELL_CHARS_REGEX = /[|>\s${}]/;

/** Minimum number of domains that must use a lib for it to be classified as "shared" */
const MIN_SHARED_DOMAIN_COUNT = 3;

/** Convert .js extension to .ts (project convention: CommonJS with .js imports mapping to .ts sources) */
function jsToTs(importPath: string): string {
  return importPath.endsWith('.js') ? importPath.slice(0, -3) + '.ts' : importPath;
}

/** Extract the import/require path from a line, or null if none found. */
function matchImportPath(line: string): string | null {
  const importMatch = line.match(IMPORT_FROM_REGEX);
  if (importMatch) return importMatch[1];
  const requireMatch = line.match(REQUIRE_REGEX);
  if (requireMatch) return requireMatch[1];
  return null;
}

function isRelativeImport(importPath: string): boolean {
  return importPath.startsWith('./') || importPath.startsWith('../');
}

function isCommentLine(line: string): boolean {
  const trimmed = line.trimStart();
  return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*');
}

export function extractImports(filePath: string): ImportInfo[] {
  const absolutePath = resolve(filePath);
  const content = readFileSync(absolutePath, 'utf-8');
  const lines = content.split('\n');
  const results: ImportInfo[] = [];

  let inTemplateLiteral = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Track template literal boundaries (backtick counting)
    const backtickCount = (line.match(/`/g) || []).length;
    if (inTemplateLiteral) {
      if (backtickCount % 2 === 1) inTemplateLiteral = false;
      continue; // skip lines inside template literals
    }
    if (backtickCount % 2 === 1) {
      inTemplateLiteral = true;
      // Check for imports before the opening backtick on this line
      const backtickIdx = line.indexOf('`');
      const importPath = matchImportPath(line);
      if (importPath && isRelativeImport(importPath) && !SHELL_CHARS_REGEX.test(importPath)) {
        const matchIdx = line.indexOf(importPath);
        if (matchIdx >= 0 && matchIdx < backtickIdx) {
          results.push({ sourcePath: absolutePath, importPath, line: i + 1 });
        }
      }
      continue;
    }

    if (isCommentLine(line)) continue;

    const importPath = matchImportPath(line);
    if (importPath && isRelativeImport(importPath) && !SHELL_CHARS_REGEX.test(importPath)) {
      results.push({ sourcePath: absolutePath, importPath, line: i + 1 });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Import Resolution
// ---------------------------------------------------------------------------

export function resolveImport(sourceDir: string, importPath: string): string | null {
  let candidate = importPath;

  // Step 1: Replace .js extension with .ts
  candidate = jsToTs(candidate);

  // Step 2: Resolve to absolute path
  const absolutePath = resolve(sourceDir, candidate);

  // If candidate already has .ts extension, check directly
  if (candidate.endsWith('.ts')) {
    return existsSync(absolutePath) ? absolutePath : null;
  }

  // Step 3: No extension — try .ts, then /index.ts
  const withTs = absolutePath + '.ts';
  if (existsSync(withTs)) return withTs;

  const withIndex = join(absolutePath, 'index.ts');
  if (existsSync(withIndex)) return withIndex;

  return null;
}

// ---------------------------------------------------------------------------
// Dependency Graph Builder
// ---------------------------------------------------------------------------

export function buildDependencyGraph(
  handlers: string[],
  _basePath: string
): { graph: DependencyGraph; brokenImports: BrokenImport[]; adjacencyMap: Map<string, string[]> } {
  const graph: DependencyGraph = {};
  const brokenImports: BrokenImport[] = [];
  const adjacencyMap = new Map<string, string[]>();
  // Cache extractImports results to avoid re-parsing shared libs across handlers
  const importCache = new Map<string, ImportInfo[]>();

  // For each handler, DFS to collect all transitive deps and broken imports
  for (const handler of handlers) {
    const visited = new Set<string>();
    const allDeps: string[] = [];

    // DFS stack: [filePath, chain from handler to this file]
    const stack: Array<[string, string[]]> = [[handler, [handler]]];

    while (stack.length > 0) {
      const [currentFile, chain] = stack.pop()!;

      if (visited.has(currentFile)) continue;
      visited.add(currentFile);

      // Track as dependency if it's not the handler itself
      if (currentFile !== handler) {
        allDeps.push(currentFile);
      }

      // Extract imports from current file (cached)
      if (!importCache.has(currentFile)) {
        importCache.set(currentFile, extractImports(currentFile));
      }
      const imports = importCache.get(currentFile)!;
      const sourceDir = dirname(currentFile);
      const resolvedForAdjacency: string[] = [];

      for (const imp of imports) {
        const resolvedPath = resolveImport(sourceDir, imp.importPath);

        if (resolvedPath) {
          resolvedForAdjacency.push(resolvedPath);

          if (!visited.has(resolvedPath)) {
            stack.push([resolvedPath, [...chain, resolvedPath]]);
          }
        } else {
          // Broken import — compute resolvedAttempt
          const attempt = jsToTs(imp.importPath);
          const resolvedAttempt = resolve(sourceDir, attempt);

          brokenImports.push({
            sourcePath: imp.sourcePath,
            importPath: imp.importPath,
            resolvedAttempt,
            line: imp.line,
            chain: [...chain, resolvedAttempt],
          });
        }
      }

      // Update adjacencyMap for this file
      if (!adjacencyMap.has(currentFile)) {
        adjacencyMap.set(currentFile, resolvedForAdjacency);
      }
    }

    graph[handler] = allDeps;
  }

  return { graph, brokenImports, adjacencyMap };
}

// ---------------------------------------------------------------------------
// Cycle Detection
// ---------------------------------------------------------------------------

export function detectCycles(adjacencyMap: Map<string, string[]>): Cycle[] {
  const WHITE = 0; // unvisited
  const GRAY = 1;  // in current DFS path
  const BLACK = 2; // fully processed

  const color = new Map<string, number>();
  const cycles: Cycle[] = [];
  const seen = new Set<string>(); // normalized cycle signatures to avoid duplicates

  // Initialize all nodes as WHITE
  for (const node of adjacencyMap.keys()) {
    color.set(node, WHITE);
  }

  function dfs(node: string, stack: string[]): void {
    color.set(node, GRAY);
    stack.push(node);

    const neighbors = adjacencyMap.get(node) || [];
    for (const neighbor of neighbors) {
      const neighborColor = color.get(neighbor);

      if (neighborColor === GRAY) {
        // Back-edge found — extract cycle from stack
        const cycleStart = stack.indexOf(neighbor);
        if (cycleStart !== -1) {
          const cyclePath = stack.slice(cycleStart);
          cyclePath.push(neighbor); // close the cycle

          // Normalize: rotate so smallest node is first, then create signature
          const nodesInCycle = cyclePath.slice(0, -1);
          const minIdx = nodesInCycle.indexOf(
            nodesInCycle.reduce((a, b) => (a < b ? a : b))
          );
          const rotated = [
            ...nodesInCycle.slice(minIdx),
            ...nodesInCycle.slice(0, minIdx),
          ];
          const sig = rotated.join('|');

          if (!seen.has(sig)) {
            seen.add(sig);
            cycles.push({ path: cyclePath });
          }
        }
      } else if (neighborColor === WHITE || neighborColor === undefined) {
        dfs(neighbor, stack);
      }
      // BLACK nodes are fully processed, skip
    }

    stack.pop();
    color.set(node, BLACK);
  }

  for (const node of adjacencyMap.keys()) {
    if (color.get(node) === WHITE) {
      dfs(node, []);
    }
  }

  return cycles;
}


// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

export function reportResults(result: ValidationResult): void {
  const cwd = process.cwd();

  // Broken imports section
  if (result.brokenImports.length > 0) {
    console.log('\n❌ BROKEN IMPORTS FOUND:\n');

    const handlerSet = new Set<string>();
    for (const bi of result.brokenImports) {
      handlerSet.add(bi.chain[0]);
      const relSource = relative(cwd, bi.sourcePath);
      console.log(`  ${relSource}:${bi.line}`);
      console.log(`    import '${bi.importPath}'`);
      console.log(`    → resolved to: ${relative(cwd, bi.resolvedAttempt)} (FILE NOT FOUND)`);
      console.log(`    chain: ${bi.chain.map(f => basename(f)).join(' → ')}`);
      console.log('');
    }

    console.log(`  Total: ${result.brokenImports.length} broken import(s) across ${handlerSet.size} handler(s)\n`);
  }

  // Cycles section
  if (result.cycles.length > 0) {
    console.log('\n🔄 CIRCULAR IMPORTS DETECTED:\n');

    for (let i = 0; i < result.cycles.length; i++) {
      const cycle = result.cycles[i];
      const names = cycle.path.map(f => basename(f));
      console.log(`  Cycle ${i + 1}: ${names.join(' → ')}`);
    }

    console.log(`\n  Total: ${result.cycles.length} circular dependency cycle(s)\n`);
  }

  // Summary
  console.log('📊 Summary:');
  console.log(`  Handlers scanned: ${result.handlersScanned}`);
  console.log(`  Unique libs referenced: ${result.uniqueLibs}`);
  console.log(`  Broken imports: ${result.brokenImports.length}`);
  console.log(`  Circular dependencies: ${result.cycles.length}`);
}

export function writeGraphJson(
  graph: DependencyGraph,
  adjacencyMap: Map<string, string[]>,
  result: ValidationResult,
  outputPath: string
): void {
  const cwd = process.cwd();

  // Build handlers object with direct vs transitive imports
  const handlers: Record<string, { directImports: string[]; transitiveImports: string[] }> = {};

  for (const [handlerPath, allDeps] of Object.entries(graph)) {
    const relHandler = relative(cwd, handlerPath);
    const directAbsolute = adjacencyMap.get(handlerPath) || [];
    const directImports = directAbsolute.map(d => relative(cwd, d));
    const transitiveImports = allDeps.map(d => relative(cwd, d));

    handlers[relHandler] = { directImports, transitiveImports };
  }

  const output = {
    metadata: {
      generatedAt: new Date().toISOString(),
      handlersScanned: result.handlersScanned,
      uniqueLibs: result.uniqueLibs,
      brokenImports: result.brokenImports.length,
      circularDependencies: result.cycles.length,
    },
    handlers,
  };

  // Create parent directories if needed
  const dir = dirname(resolve(outputPath));
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(resolve(outputPath), JSON.stringify(output, null, 2), 'utf-8');
  console.log(`\n📄 Dependency graph written to: ${outputPath}`);
}

// ---------------------------------------------------------------------------
// Domain Map Updater
// ---------------------------------------------------------------------------

export function updateDomainMap(graph: DependencyGraph, domainMapPath: string): void {
  // Step 1: Read the domain map file
  if (!existsSync(domainMapPath)) {
    console.error(`❌ Domain map file not found: ${domainMapPath}`);
    process.exit(1);
  }

  let content: string;
  try {
    content = readFileSync(domainMapPath, 'utf-8');
  } catch (err) {
    console.error(`❌ Cannot read domain map file: ${domainMapPath}`, err);
    process.exit(1);
  }

  // basePath should be the parent of the domains/ directory (i.e., backend/src/)
  // because handler globs like 'handlers/security/*' are relative to backend/src/
  const basePath = resolve(dirname(dirname(domainMapPath)));

  // Step 2: Parse domain configs from the file to extract handler globs
  const domainConfigs = parseDomainConfigs(content);

  // Step 3: For each domain, find matching handlers and collect their libs
  const domainLibs = new Map<string, string[]>();
  // Track which domains use each lib (for computing 'shared')
  const libDomainUsage = new Map<string, Set<string>>();

  for (const [domainName, config] of domainConfigs.entries()) {
    if (domainName === 'shared') continue; // computed separately

    const matchingHandlers = findHandlersForDomain(graph, config.handlerGlobs, basePath);
    const libs = collectLibsForHandlers(graph, matchingHandlers, basePath);

    domainLibs.set(domainName, libs);

    // Track lib usage across domains
    for (const lib of libs) {
      if (!libDomainUsage.has(lib)) {
        libDomainUsage.set(lib, new Set());
      }
      libDomainUsage.get(lib)!.add(domainName);
    }
  }

  // Step 4: Compute shared libs (used by MIN_SHARED_DOMAIN_COUNT+ domains)
  const sharedLibs: string[] = [];
  for (const [lib, domains] of libDomainUsage.entries()) {
    if (domains.size >= MIN_SHARED_DOMAIN_COUNT) {
      sharedLibs.push(lib);
    }
  }
  domainLibs.set('shared', sharedLibs.sort());

  // Step 5: Replace sharedLibs arrays in the file content
  let updatedContent = content;
  for (const [domainName, libs] of domainLibs.entries()) {
    updatedContent = replaceSharedLibsInContent(updatedContent, domainName, libs);
  }

  // Step 6: Write the updated file
  try {
    writeFileSync(domainMapPath, updatedContent, 'utf-8');
    console.log(`✅ Domain map updated: ${domainMapPath}`);
  } catch (err) {
    console.error(`❌ Cannot write domain map file: ${domainMapPath}`, err);
    process.exit(1);
  }
}

/**
 * Parses domain configurations from the domain map file content.
 * Extracts domain names and their handler glob patterns.
 */
export function parseDomainConfigs(content: string): Map<string, { handlerGlobs: string[] }> {
  const configs = new Map<string, { handlerGlobs: string[] }>();

  // Match each domain block: domainName: { ... handlers: [...] ... }
  const domainRegex = /(\w+):\s*\{[^}]*?handlers:\s*\[([\s\S]*?)\]/g;
  let match: RegExpExecArray | null;

  while ((match = domainRegex.exec(content)) !== null) {
    const domainName = match[1];
    const handlersBlock = match[2];

    // Extract quoted strings from the handlers array
    const globs: string[] = [];
    const stringRegex = /'([^']+)'|"([^"]+)"/g;
    let strMatch: RegExpExecArray | null;
    while ((strMatch = stringRegex.exec(handlersBlock)) !== null) {
      globs.push(strMatch[1] || strMatch[2]);
    }

    configs.set(domainName, { handlerGlobs: globs });
  }

  return configs;
}

/**
 * Finds handlers from the dependency graph that match a domain's handler globs.
 * Globs like 'handlers/security/*' match handler paths starting with that directory prefix.
 */
export function findHandlersForDomain(
  graph: DependencyGraph,
  handlerGlobs: string[],
  basePath: string
): string[] {
  const matchingHandlers: string[] = [];

  for (const handlerAbsPath of Object.keys(graph)) {
    const handlerRelPath = relative(basePath, handlerAbsPath);

    for (const glob of handlerGlobs) {
      // Convert glob like 'handlers/security/*' to a directory prefix 'handlers/security/'
      const prefix = glob.endsWith('/*') ? glob.slice(0, -1) : glob;
      if (handlerRelPath.startsWith(prefix)) {
        matchingHandlers.push(handlerAbsPath);
        break;
      }
    }
  }

  return matchingHandlers;
}

/**
 * Collects all unique lib paths used by a set of handlers from the dependency graph.
 * Returns paths relative to basePath, with directory-based libs collapsed to directory paths.
 */
export function collectLibsForHandlers(
  graph: DependencyGraph,
  handlers: string[],
  basePath: string
): string[] {
  const libSet = new Set<string>();

  for (const handler of handlers) {
    const deps = graph[handler] || [];
    for (const dep of deps) {
      const relPath = relative(basePath, dep);
      // Only include lib/ and types/ paths
      if (!relPath.startsWith('lib/') && !relPath.startsWith('types/')) continue;

      // For files inside lib subdirectories (e.g., lib/security-engine/index.ts),
      // collapse to the directory path with trailing slash (e.g., lib/security-engine/)
      const libPath = collapseLibPath(relPath);
      libSet.add(libPath);
    }
  }

  return Array.from(libSet).sort();
}

/**
 * Collapses a lib file path to a directory path if it's inside a subdirectory of lib/.
 * e.g., 'lib/security-engine/index.ts' → 'lib/security-engine/'
 * e.g., 'lib/security-engine/scanner.ts' → 'lib/security-engine/'
 * e.g., 'lib/response.ts' → 'lib/response.ts'
 * e.g., 'types/lambda.ts' → 'types/lambda.ts'
 */
export function collapseLibPath(relPath: string): string {
  // Split the path into parts
  const parts = relPath.split('/');

  // For lib/ paths with 3+ parts (lib/subdir/file.ts), collapse to lib/subdir/
  if (parts[0] === 'lib' && parts.length >= 3) {
    return `${parts[0]}/${parts[1]}/`;
  }

  // For types/ or direct lib/ files, keep as-is
  return relPath;
}

/**
 * Replaces the sharedLibs array for a specific domain in the file content.
 */
export function replaceSharedLibsInContent(
  content: string,
  domainName: string,
  libs: string[]
): string {
  // Build regex to find the sharedLibs array for this domain
  // Pattern: domainName: { ... sharedLibs: [ ... ], }
  // We need to find the sharedLibs array within the specific domain block
  const domainPattern = new RegExp(
    `(${domainName}:\\s*\\{[\\s\\S]*?sharedLibs:\\s*)\\[[\\s\\S]*?\\]`,
  );

  const match = domainPattern.exec(content);
  if (!match) return content;

  // Build the new sharedLibs array string
  let newArray: string;
  if (libs.length === 0) {
    newArray = '[]';
  } else {
    const indent = '      '; // 6 spaces to match existing formatting
    const items = libs.map(lib => `${indent}'${lib}',`).join('\n');
    newArray = `[\n${items}\n    ]`;
  }

  return content.slice(0, match.index) +
    match[1] + newArray +
    content.slice(match.index + match[0].length);
}


// ---------------------------------------------------------------------------
// Main Entry Point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const options = parseCLIArgs(process.argv.slice(2));
  const basePath = resolve('backend/src');

  // 1. Discover handlers
  const handlers = discoverHandlers(basePath, options.handler);
  console.log(`📂 Discovered ${handlers.length} handler(s)`);

  // 2. Build dependency graph (includes transitive crawl + broken import detection)
  const { graph, brokenImports, adjacencyMap } = buildDependencyGraph(handlers, basePath);

  // 3. Detect cycles
  const cycles = detectCycles(adjacencyMap);

  // 4. Compute unique libs count
  const allLibs = new Set<string>();
  for (const deps of Object.values(graph)) {
    for (const dep of deps) {
      allLibs.add(dep);
    }
  }

  // 5. Build validation result
  const result: ValidationResult = {
    handlersScanned: handlers.length,
    uniqueLibs: allLibs.size,
    brokenImports,
    cycles,
  };

  // 6. Report results
  reportResults(result);

  // 7. Optionally write graph JSON
  if (options.outputGraph) {
    writeGraphJson(graph, adjacencyMap, result, options.outputGraph);
  }

  // 8. Optionally update domain map
  if (options.updateDomainMap) {
    const domainMapPath = resolve('backend/src/domains/index.ts');
    updateDomainMap(graph, domainMapPath);
  }

  // 9. Exit with appropriate code
  if (brokenImports.length > 0 || cycles.length > 0) {
    process.exit(1);
  }
}

// Run only when executed directly (not imported)
const isDirectExecution = process.argv[1]?.includes('validate-lambda-imports');
if (isDirectExecution) {
  main().catch((err) => {
    console.error('❌ Unexpected error:', err);
    process.exit(1);
  });
}
