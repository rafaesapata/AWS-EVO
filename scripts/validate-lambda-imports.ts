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

import { readdirSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
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
  unsafeHandlers: UnsafeHandler[];
  awsSdkHandlers: AwsSdkHandler[];
}

interface AwsSdkHandler {
  filePath: string;
  line: number;
  importPath: string;
}

interface UnsafeHandler {
  filePath: string;
  line: number;
  code: string;
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
  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (entry.name === '_templates') continue;
      results.push(...walkDirectory(join(dir, entry.name)));
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      results.push(join(dir, entry.name));
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Import Extraction
// ---------------------------------------------------------------------------

// Regex patterns (compiled once, reused across calls)
const IMPORT_FROM_REGEX = /(?:import|export)\s+.*?\s+from\s+['"](.+?)['"]/;
const REQUIRE_REGEX = /require\(\s*['"](.+?)['"]\s*\)/;
const DYNAMIC_IMPORT_REGEX = /import\(\s*['"](.+?)['"]\s*\)/;
const SHELL_CHARS_REGEX = /[|>\s${}]/;

/** Minimum number of domains that must use a lib for it to be classified as "shared" */
const MIN_SHARED_DOMAIN_COUNT = 3;

/** Max lines to scan between handler declaration and first try block */
const MAX_LINES_TO_TRY_BLOCK = 40;

/** Convert .js extension to .ts (project convention: CommonJS with .js imports mapping to .ts sources) */
function jsToTs(importPath: string): string {
  return importPath.endsWith('.js') ? importPath.slice(0, -3) + '.ts' : importPath;
}

/** Extract the import/require/re-export/dynamic-import path from a line, or null if none found. */
function matchImportPath(line: string): string | null {
  const importMatch = line.match(IMPORT_FROM_REGEX);
  if (importMatch) return importMatch[1];
  const requireMatch = line.match(REQUIRE_REGEX);
  if (requireMatch) return requireMatch[1];
  const dynamicMatch = line.match(DYNAMIC_IMPORT_REGEX);
  if (dynamicMatch) return dynamicMatch[1];
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
  let inBlockComment = false;

  /** Try to extract a valid relative import from `line`; push to results if found before `beforeIdx`. */
  function tryPush(line: string, lineNum: number, beforeIdx = Infinity): void {
    const importPath = matchImportPath(line);
    if (!importPath || !isRelativeImport(importPath) || SHELL_CHARS_REGEX.test(importPath)) return;
    const matchIdx = line.indexOf(importPath);
    if (matchIdx >= 0 && matchIdx < beforeIdx) {
      results.push({ sourcePath: absolutePath, importPath, line: lineNum });
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Track multiline block comments (/* ... */)
    if (inBlockComment) {
      if (line.includes('*/')) {
        inBlockComment = false;
        // Check for import AFTER the closing */ on this same line
        const afterIdx = line.indexOf('*/') + 2;
        const afterComment = line.substring(afterIdx);
        if (afterComment.trim().length > 0) {
          tryPush(afterComment, lineNum);
        }
      }
      continue;
    }
    // Check for block comment opening on this line
    if (line.includes('/*')) {
      if (!line.includes('*/')) {
        // Multiline block comment starts — check for import before the comment
        tryPush(line, lineNum, line.indexOf('/*'));
        inBlockComment = true;
        continue;
      }
      // Single-line block comment (/* ... */ on same line) — skip if import is inside it
      const commentStart = line.indexOf('/*');
      const commentEnd = line.indexOf('*/') + 2; // +2 for length of '*/'
      const importPath = matchImportPath(line);
      if (importPath && isRelativeImport(importPath) && !SHELL_CHARS_REGEX.test(importPath)) {
        const matchIdx = line.indexOf(importPath);
        if (matchIdx >= 0 && (matchIdx < commentStart || matchIdx > commentEnd)) {
          results.push({ sourcePath: absolutePath, importPath, line: lineNum });
        }
      }
      continue;
    }

    // Track template literal boundaries (backtick counting)
    const backtickCount = (line.match(/`/g) || []).length;
    if (inTemplateLiteral) {
      if (backtickCount % 2 === 1) inTemplateLiteral = false;
      continue;
    }
    if (backtickCount % 2 === 1) {
      inTemplateLiteral = true;
      tryPush(line, lineNum, line.indexOf('`'));
      continue;
    }

    if (isCommentLine(line)) continue;

    tryPush(line, lineNum);
  }

  return results;
}

// ---------------------------------------------------------------------------
// Import Resolution
// ---------------------------------------------------------------------------

export function resolveImport(sourceDir: string, importPath: string, projectRoot?: string): string | null {
  let candidate = importPath;

  // Step 1: Replace .js extension with .ts
  candidate = jsToTs(candidate);

  // Step 2: Resolve to absolute path
  const absolutePath = resolve(sourceDir, candidate);

  // Security: reject paths that escape the project root (path traversal)
  const root = projectRoot ?? resolve('.');
  if (!absolutePath.startsWith(root)) {
    return null;
  }

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
  _basePath: string, // reserved for future use (e.g., relative path output); kept for API stability
  projectRoot?: string,
): { graph: DependencyGraph; brokenImports: BrokenImport[]; adjacencyMap: Map<string, string[]> } {
  const graph: DependencyGraph = {};
  const brokenImports: BrokenImport[] = [];
  const adjacencyMap = new Map<string, string[]>();
  // Cache extractImports results to avoid re-parsing shared libs across handlers
  const importCache = new Map<string, ImportInfo[]>();
  // Deduplicate broken imports by sourcePath:line to avoid reporting the same broken import
  // multiple times when multiple handlers transitively reach the same broken lib
  const seenBrokenKeys = new Set<string>();

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
        const resolvedPath = resolveImport(sourceDir, imp.importPath, projectRoot);

        if (resolvedPath) {
          resolvedForAdjacency.push(resolvedPath);

          if (!visited.has(resolvedPath)) {
            stack.push([resolvedPath, [...chain, resolvedPath]]);
          }
        } else {
          // Broken import — compute resolvedAttempt
          const attempt = jsToTs(imp.importPath);
          const resolvedAttempt = resolve(sourceDir, attempt);

          // Deduplicate: same source file + same line = same broken import
          const brokenKey = `${imp.sourcePath}:${imp.line}`;
          if (!seenBrokenKeys.has(brokenKey)) {
            seenBrokenKeys.add(brokenKey);
            brokenImports.push({
              sourcePath: imp.sourcePath,
              importPath: imp.importPath,
              resolvedAttempt,
              line: imp.line,
              chain: [...chain, resolvedAttempt],
            });
          }
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

  function dfs(node: string, stack: string[], stackSet: Map<string, number>): void {
    color.set(node, GRAY);
    stack.push(node);
    stackSet.set(node, stack.length - 1);

    const neighbors = adjacencyMap.get(node) || [];
    for (const neighbor of neighbors) {
      const neighborColor = color.get(neighbor);

      if (neighborColor === GRAY) {
        // Back-edge found — extract cycle from stack using O(1) index lookup
        const cycleStart = stackSet.get(neighbor);
        if (cycleStart !== undefined) {
          const cyclePath = stack.slice(cycleStart);
          cyclePath.push(neighbor); // close the cycle

          // Normalize: rotate so smallest node is first, then create signature
          const nodesInCycle = cyclePath.slice(0, -1);
          let minIdx = 0;
          for (let j = 1; j < nodesInCycle.length; j++) {
            if (nodesInCycle[j] < nodesInCycle[minIdx]) minIdx = j;
          }
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
        dfs(neighbor, stack, stackSet);
      }
      // BLACK nodes are fully processed, skip
    }

    stack.pop();
    stackSet.delete(node);
    color.set(node, BLACK);
  }

  for (const node of adjacencyMap.keys()) {
    if (color.get(node) === WHITE) {
      dfs(node, [], new Map());
    }
  }

  return cycles;
}

// ---------------------------------------------------------------------------
// Unsafe Handler Detection (auth code outside try/catch)
// ---------------------------------------------------------------------------

function detectUnsafeHandlers(handlers: string[]): UnsafeHandler[] {
  const unsafe: UnsafeHandler[] = [];
  // Only detect actual function calls, not property access like event.organizationId
  const dangerousCallPatterns = [
    /getUserFromEvent\s*\(/,
    /getOrganizationId\s*\(/,
    /getOrganizationIdWithImpersonation\s*\(/,
  ];

  for (const handlerPath of handlers) {
    let content: string;
    try {
      content = readFileSync(handlerPath, 'utf-8');
    } catch {
      continue;
    }

    const lines = content.split('\n');

    // Find exported handler functions
    const functionHandlerRegex = /export\s+(?:async\s+)?function\s+handler\s*\(/;
    const constHandlerRegex = /export\s+const\s+handler\s*=/;
    const safeHandlerRegex = /safeHandler\s*\(/;
    
    for (let i = 0; i < lines.length; i++) {
      const isFunctionHandler = functionHandlerRegex.test(lines[i]);
      const isConstHandler = constHandlerRegex.test(lines[i]);
      
      if (!isFunctionHandler && !isConstHandler) continue;
      
      // Skip if handler is wrapped with safeHandler (already protected)
      if (safeHandlerRegex.test(lines[i])) continue;

      // Scan forward from handler declaration to find first try {
      let braceDepth = 0;
      let foundOpenBrace = false;
      let tryLineIndex = -1;

      for (let j = i; j < lines.length; j++) {
        const line = lines[j];
        for (const ch of line) {
          if (ch === '{') { braceDepth++; foundOpenBrace = true; }
          if (ch === '}') braceDepth--;
        }
        if (foundOpenBrace && /\btry\s*\{/.test(line)) {
          tryLineIndex = j;
          break;
        }
        // If we've gone too deep without finding try, stop
        if (j - i > MAX_LINES_TO_TRY_BLOCK) break;
      }

      if (tryLineIndex === -1) continue;

      // Check lines between handler start and try for dangerous calls
      for (let j = i; j < tryLineIndex; j++) {
        const line = lines[j];
        // Skip comments
        if (/^\s*(\/\/|\/\*|\*)/.test(line)) continue;
        for (const pattern of dangerousCallPatterns) {
          if (pattern.test(line)) {
            unsafe.push({
              filePath: handlerPath,
              line: j + 1,
              code: line.trim(),
            });
          }
        }
      }
      break; // Only check first handler per file
    }
  }

  return unsafe;
}

// ---------------------------------------------------------------------------
// @aws-sdk Import Detection (handlers that import @aws-sdk MUST use FULL_SAM)
// ---------------------------------------------------------------------------

const AWS_SDK_IMPORT_REGEX = /^\s*(?:import|const\s+\w+\s*=\s*require\s*\().*['"]@aws-sdk\//;

/**
 * Detect handlers that directly import @aws-sdk/* packages.
 * These handlers CANNOT be deployed via INCREMENTAL — they require FULL_SAM
 * because @aws-sdk is NOT in the Lambda Layer and must be bundled by esbuild.
 * 
 * This is an informational warning (not blocking) to flag handlers that will
 * force FULL_SAM deploy and take ~10min instead of ~1-2min.
 */
function detectAwsSdkHandlers(handlers: string[]): AwsSdkHandler[] {
  const results: AwsSdkHandler[] = [];

  for (const handlerPath of handlers) {
    let content: string;
    try {
      content = readFileSync(handlerPath, 'utf-8');
    } catch {
      continue;
    }

    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Skip comments
      if (/^\s*(\/\/|\/\*|\*)/.test(line)) continue;
      
      if (AWS_SDK_IMPORT_REGEX.test(line)) {
        // Extract the @aws-sdk/... package name
        const match = line.match(/@aws-sdk\/[a-z0-9-]+/);
        results.push({
          filePath: handlerPath,
          line: i + 1,
          importPath: match ? match[0] : '@aws-sdk/*',
        });
      }
    }
  }

  return results;
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

  // Unsafe handlers section (auth code outside try/catch → unhandled 500s)
  if (result.unsafeHandlers.length > 0) {
    console.log('\n⚠️  UNSAFE HANDLERS (auth code outside try/catch → potential 500 errors):\n');

    for (const uh of result.unsafeHandlers) {
      const relPath = relative(cwd, uh.filePath);
      console.log(`  ${relPath}:${uh.line}`);
      console.log(`    ${uh.code}`);
    }

    const uniqueFiles = new Set(result.unsafeHandlers.map(u => u.filePath));
    console.log(`\n  Total: ${uniqueFiles.size} handler(s) with unprotected auth calls\n`);
    console.log('  Fix: Move getUserFromEvent/getOrganizationId inside the try/catch block\n');
  }

  // Summary
  console.log('📊 Summary:');
  console.log(`  Handlers scanned: ${result.handlersScanned}`);
  console.log(`  Unique libs referenced: ${result.uniqueLibs}`);
  console.log(`  Broken imports: ${result.brokenImports.length}`);
  console.log(`  Circular dependencies: ${result.cycles.length}`);
  console.log(`  Unsafe handlers: ${result.unsafeHandlers.length}`);
  console.log(`  @aws-sdk handlers (FULL_SAM required): ${result.awsSdkHandlers.length}`);

  // @aws-sdk handlers section
  if (result.awsSdkHandlers.length > 0) {
    console.log('\n📦 HANDLERS WITH @aws-sdk IMPORTS (require FULL_SAM deploy):\n');

    const byFile = new Map<string, AwsSdkHandler[]>();
    for (const h of result.awsSdkHandlers) {
      const existing = byFile.get(h.filePath) || [];
      existing.push(h);
      byFile.set(h.filePath, existing);
    }

    for (const [filePath, imports] of byFile) {
      const relPath = relative(cwd, filePath);
      const pkgs = imports.map(i => i.importPath).join(', ');
      console.log(`  ${relPath} → ${pkgs}`);
    }

    console.log(`\n  Total: ${byFile.size} handler(s) importing @aws-sdk — these CANNOT use INCREMENTAL deploy`);
    console.log('  CI/CD auto-detects this and forces FULL_SAM (~10min instead of ~1-2min)\n');
  }
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
  // Uses [\s\S]*? to handle any content including } inside strings
  const domainRegex = /(\w+):\s*\{[\s\S]*?handlers:\s*\[([\s\S]*?)\]/g;
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

/** Indentation constants matching the domain map file formatting */
const SHARED_LIBS_ITEM_INDENT = '      '; // 6 spaces
const SHARED_LIBS_CLOSE_INDENT = '    ';  // 4 spaces

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
    const items = libs.map(lib => `${SHARED_LIBS_ITEM_INDENT}'${lib}',`).join('\n');
    newArray = `[\n${items}\n${SHARED_LIBS_CLOSE_INDENT}]`;
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

  const projectRoot = resolve('.');

  // 2. Build dependency graph (includes transitive crawl + broken import detection)
  const { graph, brokenImports, adjacencyMap } = buildDependencyGraph(handlers, basePath, projectRoot);

  // 3. Detect cycles
  const cycles = detectCycles(adjacencyMap);

  // 4. Detect unsafe handlers (auth code outside try/catch)
  const unsafeHandlers = detectUnsafeHandlers(handlers);

  // 4b. Detect handlers importing @aws-sdk (require FULL_SAM deploy)
  const awsSdkHandlers = detectAwsSdkHandlers(handlers);

  // 5. Compute unique libs count from adjacencyMap (all non-handler files)
  const allLibs = new Set<string>();
  for (const deps of Object.values(graph)) {
    for (const dep of deps) {
      allLibs.add(dep);
    }
  }

  // 6. Build validation result
  const result: ValidationResult = {
    handlersScanned: handlers.length,
    uniqueLibs: allLibs.size,
    brokenImports,
    cycles,
    unsafeHandlers,
    awsSdkHandlers,
  };

  // 7. Report results
  reportResults(result);

  // 8. Optionally write graph JSON
  if (options.outputGraph) {
    writeGraphJson(graph, adjacencyMap, result, options.outputGraph);
  }

  // 9. Optionally update domain map
  if (options.updateDomainMap) {
    const domainMapPath = resolve('backend/src/domains/index.ts');
    updateDomainMap(graph, domainMapPath);
  }

  // 10. Exit with appropriate code (broken imports and cycles are blocking errors)
  if (brokenImports.length > 0 || cycles.length > 0) {
    process.exit(1);
  }
  // Unsafe handlers are warnings for now (non-blocking) to avoid breaking existing CI
  // TODO: Make blocking once all 26 handlers are fixed
}

// Run only when executed directly (not imported)
const isDirectExecution = process.argv[1]?.includes('validate-lambda-imports');
if (isDirectExecution) {
  main().catch((err) => {
    console.error('❌ Unexpected error:', err);
    process.exit(1);
  });
}
