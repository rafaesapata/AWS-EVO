# Implementation Plan: Lambda Import Safety

## Overview

Build `scripts/validate-lambda-imports.ts` incrementally — starting with core parsing/resolution functions, adding graph traversal, then CLI/reporting, and finally CI/CD integration and documentation updates. Each step builds on the previous and is testable independently.

## Tasks

- [x] 1. Create script skeleton with CLI parsing and file discovery
  - [x] 1.1 Create `scripts/validate-lambda-imports.ts` with CLI argument parsing (`--handler`, `--output-graph`, `--update-domain-map`) and the `discoverHandlers` function that recursively finds all `.ts` files under `backend/src/handlers/` (excluding `_templates/`)
    - _Requirements: 1.1, 8.1, 8.2, 8.3_

  - [x]* 1.2 Write property test for file discovery
    - **Property 1: Import extraction filters correctly**
    - **Validates: Requirements 1.2, 1.4**

- [x] 2. Implement import extraction and resolution
  - [x] 2.1 Implement `extractImports` function that parses `import ... from` and `require()` statements, returning `ImportInfo[]` with source path, import path, and line number. Filter to relative imports only.
    - _Requirements: 1.2, 1.3, 1.4_

  - [x] 2.2 Implement `resolveImport` function that resolves import paths: `.js` → `.ts` mapping, directory → `index.ts` fallback, and file existence check via `fs.existsSync`
    - _Requirements: 2.1, 2.2_

  - [x]* 2.3 Write property tests for import extraction and resolution
    - **Property 1: Import extraction filters correctly** — For any file content with mixed import types, extraction returns exactly the relative imports
    - **Property 2: .js to .ts resolution mapping** — For any import path ending in .js, resolver produces .ts equivalent
    - **Validates: Requirements 1.2, 1.3, 1.4**

- [x] 3. Implement dependency graph builder with transitive crawl
  - [x] 3.1 Implement `buildDependencyGraph` function that starts from each handler, follows imports transitively through libs using a visited set, and collects all `BrokenImport` records with full import chains
    - _Requirements: 2.3, 3.1, 3.2, 3.3_

  - [x]* 3.2 Write property tests for transitive closure and broken import reporting
    - **Property 5: Transitive closure completeness** — For any DAG, the built graph equals the transitive closure
    - **Property 3: Broken import record completeness** — For any unresolvable import, the record contains sourcePath, importPath, and resolvedAttempt
    - **Property 6: Transitive broken import chain reporting** — For any broken import at depth > 1, the chain contains the full path with valid edges
    - **Validates: Requirements 2.3, 3.1, 3.2, 3.3**

- [x] 4. Implement cycle detection
  - [x] 4.1 Implement `detectCycles` function using DFS with white/gray/black coloring to find all back-edges in the import graph, returning `Cycle[]` with full cycle paths
    - _Requirements: 4.1, 4.2_

  - [x]* 4.2 Write property tests for cycle detection
    - **Property 7: Cycle detection completeness** — For any graph with cycles, at least one cycle is reported per strongly connected component
    - **Property 8: Cycle path validity** — For any reported cycle, first equals last node and all consecutive pairs are valid edges
    - **Validates: Requirements 4.1, 4.2**

- [x] 5. Checkpoint - Core logic validation
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement reporting and graph output
  - [x] 6.1 Implement `reportResults` function that formats broken imports and cycles to stdout with file paths and line numbers, and `writeGraphJson` that serializes the dependency graph to JSON
    - _Requirements: 2.4, 2.5, 2.6, 4.3, 5.1, 5.2, 5.3_

  - [x]* 6.2 Write property tests for reporting and serialization
    - **Property 4: Broken import report completeness** — For any list of broken imports, the report contains every source path and line number
    - **Property 9: Dependency graph serialization round-trip** — For any graph, serialize then parse equals original
    - **Property 10: Summary statistics accuracy** — For any ValidationResult, summary numbers match actual counts
    - **Validates: Requirements 2.4, 5.1, 5.2, 5.3**

- [x] 7. Implement domain map updater
  - [x] 7.1 Implement `updateDomainMap` function that reads `backend/src/domains/index.ts`, computes actual sharedLibs per domain from the dependency graph, and updates only the `sharedLibs` arrays while preserving all other structure
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [x]* 7.2 Write property tests for domain map update
    - **Property 11: Domain map libs match dependency graph** — Computed sharedLibs equals union of libs used by domain's handlers
    - **Property 12: Domain map update preserves structure** — Domain names, descriptions, and handler globs remain identical after update
    - **Validates: Requirements 7.1, 7.2, 7.3**

- [x] 8. Wire everything together in main entry point
  - [x] 8.1 Wire all components into the main CLI entry point: parse args, discover handlers (or single handler via `--handler`), build graph, detect cycles, report results, optionally write graph JSON and update domain map. Set exit code based on validation result.
    - _Requirements: 2.5, 2.6, 4.3, 8.2, 8.3_

  - [x]* 8.2 Write property test for single handler subset
    - **Property 13: Single handler validation is subset of full** — For any handler, --handler result is a subset of the full graph
    - **Validates: Requirements 8.3**

- [x] 9. Checkpoint - Full script validation
  - Ensure all tests pass. Run the script against the actual codebase: `npx tsx scripts/validate-lambda-imports.ts`. Ask the user if questions arise.

- [x] 10. Integrate into CI/CD pipeline
  - [x] 10.1 Add the import validation step to `cicd/buildspec-sam.yml` in the `pre_build` phase, before the deploy strategy analysis. Use `npx tsx scripts/validate-lambda-imports.ts` so the build aborts on broken imports.
    - _Requirements: 6.1, 6.2, 6.3_

- [x] 11. Update steering documentation
  - [x] 11.1 Add or update a steering file in `.kiro/steering/` explaining the import validation system: how it works, when it runs in CI/CD, how to run locally, and what to do when adding new shared libs.
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

- [x] 12. Final checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Property tests use `fast-check` library with minimum 100 iterations
- The script uses `tsx` for direct TypeScript execution, no compilation needed
- Integration with CI/CD uses `set -euo pipefail` to abort on non-zero exit codes
