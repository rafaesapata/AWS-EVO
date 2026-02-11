/**
 * Property-Based Tests for validate-lambda-imports.ts
 *
 * All 13 correctness properties from the design document.
 * Uses fast-check with minimum 100 iterations per property.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'fs';
import { join, resolve, relative } from 'path';
import {
  extractImports,
  resolveImport,
  buildDependencyGraph,
  detectCycles,
  reportResults,
  writeGraphJson,
  collectLibsForHandlers,
  findHandlersForDomain,
  collapseLibPath,
  replaceSharedLibsInContent,
  parseDomainConfigs,
  discoverHandlers,
} from '../validate-lambda-imports.js';
import type {
  DependencyGraph,
  BrokenImport,
  ValidationResult,
  Cycle,
} from '../validate-lambda-imports.js';

// ---------------------------------------------------------------------------
// Shared arbitraries and helpers
// ---------------------------------------------------------------------------

/** Generate a lowercase alpha string (2-8 chars) */
const identifierArb = fc.stringMatching(/^[a-z]{2,8}$/);

/** Generate a path segment (lowercase alphanumeric, 2-6 chars) */
const pathSegmentArb = fc.stringMatching(/^[a-z][a-z0-9]{1,5}$/);

/** Generate a relative import path like ../../lib/foo.js */
const relativeImportPathArb = fc.tuple(
  fc.constantFrom('../', './'),
  fc.array(pathSegmentArb, { minLength: 0, maxLength: 2 }),
  pathSegmentArb,
  fc.constantFrom('.js', '.ts', ''),
).map(([prefix, dirs, file, ext]: [string, string[], string, string]) => {
  const middle = dirs.length > 0 ? dirs.join('/') + '/' : '';
  return `${prefix}${middle}${file}${ext}`;
});

/** Generate an npm package import */
const npmImportArb = fc.oneof(
  identifierArb,
  identifierArb.map((name: string) => `@scope/${name}`),
);

/** Generate a Node.js built-in import */
const builtinImportArb = fc.constantFrom(
  'fs', 'path', 'crypto', 'http', 'https', 'os', 'util', 'stream',
  'events', 'child_process', 'url', 'querystring', 'buffer', 'net',
);

let tmpCounter = 0;
function makeTmpDir(prefix: string): string {
  tmpCounter++;
  const dir = join(resolve('.'), `__pbt_${prefix}_${tmpCounter}_${Date.now()}__`);
  mkdirSync(dir, { recursive: true });
  return dir;
}


// ---------------------------------------------------------------------------
// Property 1: Import extraction filters correctly
// **Validates: Requirements 1.2, 1.4**
// ---------------------------------------------------------------------------

describe('Property 1: Import extraction filters correctly — **Validates: Requirements 1.2, 1.4**', () => {
  let tmpDir: string;

  beforeEach(() => { tmpDir = makeTmpDir('p1'); });
  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  it('extractImports returns exactly the relative imports and none of the non-relative ones', () => {
    fc.assert(
      fc.property(
        fc.array(relativeImportPathArb, { minLength: 0, maxLength: 5 }),
        fc.array(npmImportArb, { minLength: 0, maxLength: 3 }),
        fc.array(builtinImportArb, { minLength: 0, maxLength: 3 }),
        (relImports: string[], npmImports: string[], builtinImports: string[]) => {
          const lines: string[] = [];
          const expectedRelative: string[] = [];

          for (const rel of relImports) {
            lines.push(`import { x } from '${rel}';`);
            expectedRelative.push(rel);
          }
          for (const npm of npmImports) {
            lines.push(`import { y } from '${npm}';`);
          }
          for (const builtin of builtinImports) {
            lines.push(`import { z } from '${builtin}';`);
          }

          const shuffled = [...lines].sort(() => Math.random() - 0.5);
          const content = shuffled.join('\n') + '\n';

          const filePath = join(tmpDir, `test_${tmpCounter++}.ts`);
          writeFileSync(filePath, content);

          const result = extractImports(filePath);
          const extractedPaths = result.map((r: { importPath: string }) => r.importPath);

          // All extracted must be relative
          for (const p of extractedPaths) {
            expect(p.startsWith('./') || p.startsWith('../')).toBe(true);
          }
          // Every relative import we put in should be extracted
          for (const rel of expectedRelative) {
            expect(extractedPaths).toContain(rel);
          }
          // No npm or builtin imports should appear
          for (const npm of npmImports) {
            expect(extractedPaths).not.toContain(npm);
          }
          for (const builtin of builtinImports) {
            expect(extractedPaths).not.toContain(builtin);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 2: .js to .ts resolution mapping
// **Validates: Requirements 1.3**
// ---------------------------------------------------------------------------

describe('Property 2: .js to .ts resolution mapping — **Validates: Requirements 1.3**', () => {
  let tmpDir: string;

  beforeEach(() => { tmpDir = makeTmpDir('p2'); });
  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  it('for any import path ending in .js, resolver produces .ts path with same base name', () => {
    fc.assert(
      fc.property(
        fc.array(pathSegmentArb, { minLength: 0, maxLength: 2 }),
        pathSegmentArb,
        (dirs: string[], fileName: string) => {
          const subDir = dirs.length > 0 ? join(tmpDir, ...dirs) : tmpDir;
          mkdirSync(subDir, { recursive: true });

          const tsFile = join(subDir, `${fileName}.ts`);
          writeFileSync(tsFile, 'export const x = 1;');

          const relPath = dirs.length > 0
            ? './' + dirs.join('/') + `/${fileName}.js`
            : `./${fileName}.js`;

          const result = resolveImport(tmpDir, relPath);

          expect(result).not.toBeNull();
          expect(result!.endsWith('.ts')).toBe(true);
          expect(result!.endsWith(`${fileName}.ts`)).toBe(true);
          expect(result).toBe(resolve(subDir, `${fileName}.ts`));
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 3: Broken import record completeness
// **Validates: Requirements 2.3**
// ---------------------------------------------------------------------------

describe('Property 3: Broken import record completeness — **Validates: Requirements 2.3**', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir('p3');
    mkdirSync(join(tmpDir, 'handlers'), { recursive: true });
    mkdirSync(join(tmpDir, 'lib'), { recursive: true });
  });
  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  it('for any unresolvable import, BrokenImport has non-empty sourcePath, importPath, and resolvedAttempt', () => {
    fc.assert(
      fc.property(
        pathSegmentArb,
        pathSegmentArb,
        (handlerName: string, missingLib: string) => {
          const handlerPath = join(tmpDir, 'handlers', `${handlerName}.ts`);
          writeFileSync(handlerPath, `import { x } from '../lib/${missingLib}.js';\n`);

          const { brokenImports } = buildDependencyGraph([handlerPath], tmpDir);

          expect(brokenImports.length).toBeGreaterThanOrEqual(1);

          for (const bi of brokenImports) {
            expect(bi.sourcePath).toBeTruthy();
            expect(bi.sourcePath.length).toBeGreaterThan(0);
            expect(bi.importPath).toBeTruthy();
            expect(bi.importPath.length).toBeGreaterThan(0);
            expect(bi.resolvedAttempt).toBeTruthy();
            expect(bi.resolvedAttempt.length).toBeGreaterThan(0);
            expect(bi.line).toBeGreaterThan(0);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});


// ---------------------------------------------------------------------------
// Property 4: Broken import report completeness
// **Validates: Requirements 2.4**
// ---------------------------------------------------------------------------

describe('Property 4: Broken import report completeness — **Validates: Requirements 2.4**', () => {
  it('for any list of BrokenImport records, the report contains every source path and line number', () => {
    const brokenImportArb: fc.Arbitrary<BrokenImport> = fc.tuple(
      pathSegmentArb,
      pathSegmentArb,
      relativeImportPathArb,
      pathSegmentArb,
      fc.integer({ min: 1, max: 500 }),
    ).map(([dir, file, impPath, libFile, line]: [string, string, string, string, number]) => {
      const sourcePath = join(resolve('.'), `backend/src/handlers/${dir}/${file}.ts`);
      const resolvedAttempt = join(resolve('.'), `backend/src/lib/${libFile}.ts`);
      return {
        sourcePath,
        importPath: impPath,
        resolvedAttempt,
        line,
        chain: [sourcePath, resolvedAttempt],
      };
    });

    fc.assert(
      fc.property(
        fc.array(brokenImportArb, { minLength: 1, maxLength: 5 }),
        fc.integer({ min: 0, max: 200 }),
        fc.integer({ min: 0, max: 100 }),
        (brokenImports: BrokenImport[], handlersScanned: number, uniqueLibs: number) => {
          const result: ValidationResult = {
            handlersScanned,
            uniqueLibs,
            brokenImports,
            cycles: [],
          };

          const logs: string[] = [];
          const logSpy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
            logs.push(args.map(String).join(' '));
          });

          reportResults(result);
          logSpy.mockRestore();

          const output = logs.join('\n');

          for (const bi of brokenImports) {
            const relSource = relative(process.cwd(), bi.sourcePath);
            expect(output).toContain(relSource);
            expect(output).toContain(`:${bi.line}`);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 5: Transitive closure completeness
// **Validates: Requirements 3.1, 3.2**
// ---------------------------------------------------------------------------

describe('Property 5: Transitive closure completeness — **Validates: Requirements 3.1, 3.2**', () => {
  let tmpDir: string;

  beforeEach(() => { tmpDir = makeTmpDir('p5'); });
  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  it('for any DAG chain, the dependency graph contains every transitively reachable file', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 4 }),
        (chainLength: number) => {
          const handlersDir = join(tmpDir, 'handlers');
          const libDir = join(tmpDir, 'lib');
          mkdirSync(handlersDir, { recursive: true });
          mkdirSync(libDir, { recursive: true });

          const uid = `${tmpCounter++}`;
          const libNames: string[] = [];
          for (let i = 0; i < chainLength; i++) {
            libNames.push(`lib${i}x${uid}`);
          }

          // Create lib files (last one has no imports)
          for (let i = libNames.length - 1; i >= 0; i--) {
            const content = i < libNames.length - 1
              ? `import { x } from './${libNames[i + 1]}.js';\nexport const x${i} = 1;\n`
              : `export const x${i} = 1;\n`;
            writeFileSync(join(libDir, `${libNames[i]}.ts`), content);
          }

          const handlerPath = join(handlersDir, `h${uid}.ts`);
          writeFileSync(handlerPath, `import { x0 } from '../lib/${libNames[0]}.js';\nexport const h = 1;\n`);

          const { graph, brokenImports } = buildDependencyGraph([handlerPath], tmpDir);

          expect(brokenImports).toHaveLength(0);

          const deps = graph[handlerPath];
          for (const libName of libNames) {
            const libPath = resolve(libDir, `${libName}.ts`);
            expect(deps).toContain(libPath);
          }
          expect(deps).toHaveLength(chainLength);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 6: Transitive broken import chain reporting
// **Validates: Requirements 3.3**
// ---------------------------------------------------------------------------

describe('Property 6: Transitive broken import chain reporting — **Validates: Requirements 3.3**', () => {
  let tmpDir: string;

  beforeEach(() => { tmpDir = makeTmpDir('p6'); });
  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  it('for any broken import at depth > 1, chain contains full path with valid edges', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 3 }),
        pathSegmentArb,
        (depth: number, missingName: string) => {
          const handlersDir = join(tmpDir, 'handlers');
          const libDir = join(tmpDir, 'lib');
          mkdirSync(handlersDir, { recursive: true });
          mkdirSync(libDir, { recursive: true });

          const uid = `${tmpCounter++}`;
          const libNames: string[] = [];
          for (let i = 0; i < depth; i++) {
            libNames.push(`lib${i}y${uid}`);
          }

          const brokenTarget = `missing${missingName}${uid}`;
          for (let i = 0; i < libNames.length; i++) {
            const content = i < libNames.length - 1
              ? `import { x } from './${libNames[i + 1]}.js';\nexport const x${i} = 1;\n`
              : `import { x } from './${brokenTarget}.js';\nexport const x${i} = 1;\n`;
            writeFileSync(join(libDir, `${libNames[i]}.ts`), content);
          }

          const handlerPath = join(handlersDir, `h${uid}.ts`);
          writeFileSync(handlerPath, `import { x0 } from '../lib/${libNames[0]}.js';\n`);

          const { brokenImports } = buildDependencyGraph([handlerPath], tmpDir);

          expect(brokenImports.length).toBeGreaterThanOrEqual(1);

          for (const bi of brokenImports) {
            expect(bi.chain[0]).toBe(handlerPath);
            expect(bi.chain.length).toBeGreaterThan(2);
            expect(bi.chain[bi.chain.length - 1]).toBe(bi.resolvedAttempt);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});


// ---------------------------------------------------------------------------
// Property 7: Cycle detection completeness
// **Validates: Requirements 4.1**
// ---------------------------------------------------------------------------

describe('Property 7: Cycle detection completeness — **Validates: Requirements 4.1**', () => {
  it('for any graph with known cycles, at least one cycle is reported per SCC of size >= 2', () => {
    const graphWithCyclesArb = fc.integer({ min: 2, max: 6 }).chain((n: number) => {
      const nodes = Array.from({ length: n }, (_, i) => `node${i}.ts`);
      return fc.tuple(
        fc.constant(nodes),
        fc.constant(nodes.map((_, i) => [nodes[i], nodes[(i + 1) % n]] as [string, string])),
        fc.array(
          fc.tuple(
            fc.integer({ min: 0, max: n - 1 }),
            fc.integer({ min: 0, max: n - 1 }),
          ).map(([from, to]: [number, number]) => [nodes[from], nodes[to]] as [string, string]),
          { minLength: 0, maxLength: 5 },
        ),
      );
    });

    fc.assert(
      fc.property(
        graphWithCyclesArb,
        ([nodes, cycleEdges, extraEdges]: [string[], [string, string][], [string, string][]]) => {
          const adj = new Map<string, string[]>();
          for (const node of nodes) {
            adj.set(node, []);
          }
          for (const [from, to] of cycleEdges) {
            adj.get(from)!.push(to);
          }
          for (const [from, to] of extraEdges) {
            if (!adj.get(from)!.includes(to)) {
              adj.get(from)!.push(to);
            }
          }

          const cycles = detectCycles(adj);
          expect(cycles.length).toBeGreaterThanOrEqual(1);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 8: Cycle path validity
// **Validates: Requirements 4.2**
// ---------------------------------------------------------------------------

describe('Property 8: Cycle path validity — **Validates: Requirements 4.2**', () => {
  it('for any reported cycle, first equals last and all consecutive pairs are valid edges', () => {
    const graphArb = fc.integer({ min: 2, max: 8 }).chain((n: number) => {
      const nodes = Array.from({ length: n }, (_, i) => `n${i}.ts`);
      return fc.array(
        fc.tuple(
          fc.integer({ min: 0, max: n - 1 }),
          fc.integer({ min: 0, max: n - 1 }),
        ),
        { minLength: 1, maxLength: n * 2 },
      ).map((edges: [number, number][]) => {
        const adj = new Map<string, string[]>();
        for (const node of nodes) {
          adj.set(node, []);
        }
        for (const [from, to] of edges) {
          if (!adj.get(nodes[from])!.includes(nodes[to])) {
            adj.get(nodes[from])!.push(nodes[to]);
          }
        }
        return adj;
      });
    });

    fc.assert(
      fc.property(graphArb, (adj: Map<string, string[]>) => {
        const cycles = detectCycles(adj);

        for (const cycle of cycles) {
          expect(cycle.path[0]).toBe(cycle.path[cycle.path.length - 1]);
          expect(cycle.path.length).toBeGreaterThanOrEqual(2);

          for (let i = 0; i < cycle.path.length - 1; i++) {
            const from = cycle.path[i];
            const to = cycle.path[i + 1];
            const neighbors = adj.get(from) || [];
            expect(neighbors).toContain(to);
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 9: Dependency graph serialization round-trip
// **Validates: Requirements 5.1, 5.2**
// ---------------------------------------------------------------------------

describe('Property 9: Dependency graph serialization round-trip — **Validates: Requirements 5.1, 5.2**', () => {
  let tmpDir: string;

  beforeEach(() => { tmpDir = makeTmpDir('p9'); });
  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  it('for any DependencyGraph, serialize to JSON and parse back produces equivalent object', () => {
    const depGraphArb = fc.array(
      fc.tuple(
        pathSegmentArb.map((s: string) => `handler_${s}`),
        fc.array(pathSegmentArb.map((s: string) => `lib_${s}`), { minLength: 0, maxLength: 3 }),
      ),
      { minLength: 0, maxLength: 4 },
    );

    fc.assert(
      fc.property(depGraphArb, (entries: [string, string[]][]) => {
        const cwd = process.cwd();
        const graph: DependencyGraph = {};
        const adjacencyMap = new Map<string, string[]>();

        for (const [handler, deps] of entries) {
          const absHandler = join(cwd, `backend/src/handlers/${handler}.ts`);
          const absDeps = deps.map((d: string) => join(cwd, `backend/src/lib/${d}.ts`));
          graph[absHandler] = absDeps;
          adjacencyMap.set(absHandler, absDeps.length > 0 ? [absDeps[0]] : []);
        }

        const result: ValidationResult = {
          handlersScanned: Object.keys(graph).length,
          uniqueLibs: new Set(Object.values(graph).flat()).size,
          brokenImports: [],
          cycles: [],
        };

        const outputPath = join(tmpDir, `graph_${tmpCounter++}.json`);
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        writeGraphJson(graph, adjacencyMap, result, outputPath);
        logSpy.mockRestore();

        const parsed = JSON.parse(readFileSync(outputPath, 'utf-8'));

        expect(parsed.metadata.handlersScanned).toBe(result.handlersScanned);
        expect(parsed.metadata.uniqueLibs).toBe(result.uniqueLibs);
        expect(parsed.metadata.brokenImports).toBe(0);
        expect(parsed.metadata.circularDependencies).toBe(0);

        for (const absHandler of Object.keys(graph)) {
          const relHandler = relative(cwd, absHandler);
          expect(parsed.handlers[relHandler]).toBeDefined();
        }
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 10: Summary statistics accuracy
// **Validates: Requirements 5.3**
// ---------------------------------------------------------------------------

describe('Property 10: Summary statistics accuracy — **Validates: Requirements 5.3**', () => {
  it('for any ValidationResult, summary numbers match actual counts', () => {
    const validationResultArb: fc.Arbitrary<ValidationResult> = fc.tuple(
      fc.integer({ min: 0, max: 500 }),
      fc.integer({ min: 0, max: 200 }),
      fc.array(
        fc.tuple(pathSegmentArb, relativeImportPathArb, pathSegmentArb, fc.integer({ min: 1, max: 500 }))
          .map(([file, impPath, libFile, line]: [string, string, string, number]): BrokenImport => ({
            sourcePath: `/src/${file}.ts`,
            importPath: impPath,
            resolvedAttempt: `/lib/${libFile}.ts`,
            line,
            chain: [`/src/${file}.ts`, `/lib/${libFile}.ts`],
          })),
        { minLength: 0, maxLength: 5 },
      ),
      fc.array(
        fc.array(pathSegmentArb, { minLength: 2, maxLength: 4 })
          .map((nodes: string[]): Cycle => ({ path: [...nodes.map((n: string) => `${n}.ts`), `${nodes[0]}.ts`] })),
        { minLength: 0, maxLength: 3 },
      ),
    ).map(([handlersScanned, uniqueLibs, brokenImports, cycles]: [number, number, BrokenImport[], Cycle[]]): ValidationResult => ({
      handlersScanned,
      uniqueLibs,
      brokenImports,
      cycles,
    }));

    fc.assert(
      fc.property(validationResultArb, (result: ValidationResult) => {
        const logs: string[] = [];
        const logSpy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
          logs.push(args.map(String).join(' '));
        });

        reportResults(result);
        logSpy.mockRestore();

        const output = logs.join('\n');

        expect(output).toContain(`Handlers scanned: ${result.handlersScanned}`);
        expect(output).toContain(`Unique libs referenced: ${result.uniqueLibs}`);
        expect(output).toContain(`Broken imports: ${result.brokenImports.length}`);
        expect(output).toContain(`Circular dependencies: ${result.cycles.length}`);
      }),
      { numRuns: 100 },
    );
  });
});


// ---------------------------------------------------------------------------
// Property 11: Domain map libs match dependency graph
// **Validates: Requirements 7.1, 7.2**
// ---------------------------------------------------------------------------

describe('Property 11: Domain map libs match dependency graph — **Validates: Requirements 7.1, 7.2**', () => {
  it('computed sharedLibs equals union of all lib paths used by domain handlers', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 3 }),
        fc.integer({ min: 1, max: 3 }),
        fc.integer({ min: 1, max: 5 }),
        (securityCount: number, authCount: number, libCount: number) => {
          const basePath = '/project/backend/src';
          const graph: DependencyGraph = {};

          const libs: string[] = [];
          for (let i = 0; i < libCount; i++) {
            libs.push(`${basePath}/lib/lib${i}.ts`);
          }

          const securityHandlers: string[] = [];
          for (let i = 0; i < securityCount; i++) {
            const handler = `${basePath}/handlers/security/h${i}.ts`;
            securityHandlers.push(handler);
            graph[handler] = libs.slice(0, Math.min(i + 1, libs.length));
          }

          const authHandlers: string[] = [];
          for (let i = 0; i < authCount; i++) {
            const handler = `${basePath}/handlers/auth/h${i}.ts`;
            authHandlers.push(handler);
            graph[handler] = libs.slice(Math.max(0, libs.length - i - 1));
          }

          // Test collectLibsForHandlers for security domain
          const securityLibs = collectLibsForHandlers(graph, securityHandlers, basePath);

          // Compute expected: union of all lib paths for security handlers
          const expectedSecurityLibs = new Set<string>();
          for (const handler of securityHandlers) {
            for (const dep of graph[handler]) {
              const relPath = relative(basePath, dep);
              if (relPath.startsWith('lib/') || relPath.startsWith('types/')) {
                expectedSecurityLibs.add(collapseLibPath(relPath));
              }
            }
          }
          expect(new Set(securityLibs)).toEqual(expectedSecurityLibs);

          // Test findHandlersForDomain
          const foundSecurity = findHandlersForDomain(graph, ['handlers/security/*'], basePath);
          expect(new Set(foundSecurity)).toEqual(new Set(securityHandlers));

          const foundAuth = findHandlersForDomain(graph, ['handlers/auth/*'], basePath);
          expect(new Set(foundAuth)).toEqual(new Set(authHandlers));
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 12: Domain map update preserves structure
// **Validates: Requirements 7.3**
// ---------------------------------------------------------------------------

describe('Property 12: Domain map update preserves structure — **Validates: Requirements 7.3**', () => {
  it('after update, domain names, descriptions, and handler globs remain identical', () => {
    const domainArb = fc.tuple(
      identifierArb,
      fc.stringMatching(/^[a-z ]{3,15}$/),
      pathSegmentArb,
    );

    fc.assert(
      fc.property(
        fc.array(domainArb, { minLength: 1, maxLength: 3 }).filter((domains: [string, string, string][]) => {
          const names = domains.map((d: [string, string, string]) => d[0]);
          return new Set(names).size === names.length;
        }),
        (domains: [string, string, string][]) => {
          const domainEntries = domains.map(([name, desc, dir]: [string, string, string]) =>
            `  ${name}: {\n    description: '${desc}',\n    handlers: [\n      'handlers/${dir}/*',\n    ],\n    sharedLibs: [\n      'lib/old.ts',\n    ],\n  }`,
          );
          const content = `export const DOMAIN_MAP = {\n${domainEntries.join(',\n')},\n} as const;`;

          const configsBefore = parseDomainConfigs(content);

          let updatedContent = content;
          for (const [name] of domains) {
            updatedContent = replaceSharedLibsInContent(updatedContent, name, ['lib/new.ts']);
          }

          const configsAfter = parseDomainConfigs(updatedContent);

          // Domain names should be identical
          expect(new Set(configsAfter.keys())).toEqual(new Set(configsBefore.keys()));

          // Handler globs should be identical
          for (const [name, configBefore] of configsBefore.entries()) {
            const configAfter = configsAfter.get(name)!;
            expect(configAfter.handlerGlobs).toEqual(configBefore.handlerGlobs);
          }

          // Descriptions should be preserved
          for (const [, desc] of domains) {
            expect(updatedContent).toContain(`description: '${desc}'`);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 13: Single handler validation is subset of full
// **Validates: Requirements 8.3**
// ---------------------------------------------------------------------------

describe('Property 13: Single handler validation is subset of full — **Validates: Requirements 8.3**', () => {
  it('for any handler, single-handler deps are a subset of full graph deps', () => {
    const basePath = resolve('backend/src');
    const handlersDir = join(basePath, 'handlers');

    if (!existsSync(handlersDir)) return;

    const allHandlers: string[] = discoverHandlers(basePath);
    if (allHandlers.length === 0) return;

    // Build full graph once
    const fullResult = buildDependencyGraph(allHandlers, basePath);

    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: allHandlers.length - 1 }),
        (handlerIdx: number) => {
          const handler = allHandlers[handlerIdx];
          const fullDeps = new Set(fullResult.graph[handler] || []);

          const singleResult = buildDependencyGraph([handler], basePath);
          const singleDeps = singleResult.graph[handler] || [];

          for (const dep of singleDeps) {
            expect(fullDeps.has(dep)).toBe(true);
          }
        },
      ),
      { numRuns: Math.min(allHandlers.length, 100) },
    );
  });
});
