# Requirements Document

## Introduction

The EVO Platform has 194 Lambda functions sharing libraries from `backend/src/lib/` and `backend/src/types/`. The incremental deploy strategy (INCREMENTAL) copies compiled `.js` files without esbuild bundling, which can silently break lambdas in production when imports are broken, renamed, or missing transitive dependencies. This feature introduces an automated import validation system that catches broken imports before deploy, generates an accurate dependency graph, and keeps documentation in sync with reality.

## Glossary

- **Import_Validator**: The TypeScript script (`scripts/validate-lambda-imports.ts`) that scans handler source files, resolves imports, and reports broken or circular dependencies.
- **Dependency_Graph**: A data structure mapping each handler file to the set of lib/type files it imports (directly and transitively).
- **Handler**: A TypeScript file in `backend/src/handlers/` that exports a Lambda function entry point.
- **Shared_Lib**: A TypeScript file or directory in `backend/src/lib/` or `backend/src/types/` used by one or more handlers.
- **CI_CD_Pipeline**: The CodeBuild pipeline defined in `cicd/buildspec-sam.yml` that builds and deploys the platform.
- **Domain_Map**: The file `backend/src/domains/index.ts` that documents the logical grouping of handlers and their shared library dependencies.
- **Broken_Import**: An import statement in a handler or lib that references a file path that does not exist on disk.
- **Circular_Import**: A cycle in the import graph where file A imports file B which (directly or transitively) imports file A.
- **Transitive_Dependency**: A lib file that is not directly imported by a handler but is imported by a lib that the handler uses.

## Requirements

### Requirement 1: Import Statement Scanning

**User Story:** As a platform engineer, I want the Import_Validator to scan all handler TypeScript source files for import statements, so that I have a complete picture of what each handler depends on.

#### Acceptance Criteria

1. WHEN the Import_Validator is executed, THE Import_Validator SHALL recursively discover all `.ts` files under `backend/src/handlers/`.
2. WHEN a handler file is discovered, THE Import_Validator SHALL extract all relative import statements (paths starting with `../` or `./`) from the file.
3. WHEN an import statement uses a `.js` extension in the path, THE Import_Validator SHALL resolve the import to the corresponding `.ts` source file.
4. THE Import_Validator SHALL ignore non-relative imports (npm packages, Node.js built-ins).

### Requirement 2: Import Resolution and Validation

**User Story:** As a platform engineer, I want the Import_Validator to verify that every import resolves to an existing file, so that broken imports are caught before deploy.

#### Acceptance Criteria

1. WHEN the Import_Validator resolves an import path, THE Import_Validator SHALL check that the target `.ts` file exists on disk.
2. WHEN an import path resolves to a directory, THE Import_Validator SHALL check for an `index.ts` file inside that directory.
3. IF an import path does not resolve to any existing file, THEN THE Import_Validator SHALL record the import as a Broken_Import with the source file path, the import path, and the resolved target path.
4. WHEN all handler files have been scanned, THE Import_Validator SHALL report all Broken_Imports to standard output with file path and line information.
5. IF one or more Broken_Imports are found, THEN THE Import_Validator SHALL exit with code 1.
6. IF zero Broken_Imports are found, THEN THE Import_Validator SHALL exit with code 0.

### Requirement 3: Transitive Dependency Resolution

**User Story:** As a platform engineer, I want the Import_Validator to follow imports transitively through shared libs, so that deeply nested broken imports are also caught.

#### Acceptance Criteria

1. WHEN the Import_Validator resolves a handler's direct imports, THE Import_Validator SHALL also scan each imported lib file for its own imports.
2. THE Import_Validator SHALL continue resolving imports transitively until all reachable files have been visited.
3. IF a Broken_Import is found in a transitive dependency, THEN THE Import_Validator SHALL report the full import chain from handler to the broken import.

### Requirement 4: Circular Import Detection

**User Story:** As a platform engineer, I want the Import_Validator to detect circular imports between handlers and libs, so that I can fix dependency cycles that cause runtime issues.

#### Acceptance Criteria

1. WHEN the Import_Validator builds the Dependency_Graph, THE Import_Validator SHALL detect all Circular_Imports using depth-first traversal.
2. WHEN a Circular_Import is detected, THE Import_Validator SHALL report the full cycle path (e.g., `A → B → C → A`).
3. IF one or more Circular_Imports are found, THEN THE Import_Validator SHALL include them in the output report and exit with code 1.

### Requirement 5: Dependency Graph Output

**User Story:** As a platform engineer, I want the Import_Validator to output a structured dependency graph, so that I can understand which handlers depend on which libs.

#### Acceptance Criteria

1. WHEN the `--output-graph` flag is provided, THE Import_Validator SHALL write the Dependency_Graph to a JSON file.
2. THE Dependency_Graph JSON SHALL map each handler file path to an array of all lib/type file paths it depends on (direct and transitive).
3. THE Import_Validator SHALL output a summary to stdout showing the total number of handlers scanned, total unique libs referenced, and count of broken imports and circular dependencies.

### Requirement 6: CI/CD Pipeline Integration

**User Story:** As a platform engineer, I want the import validation to run automatically in the CI/CD pipeline before any deploy, so that broken imports never reach production.

#### Acceptance Criteria

1. WHEN the CI_CD_Pipeline reaches the `pre_build` phase, THE CI_CD_Pipeline SHALL execute the Import_Validator before determining the deploy strategy.
2. IF the Import_Validator exits with code 1, THEN THE CI_CD_Pipeline SHALL abort the build and report the validation failure.
3. THE CI_CD_Pipeline SHALL execute the Import_Validator using `npx tsx scripts/validate-lambda-imports.ts`.

### Requirement 7: Domain Map Auto-Update

**User Story:** As a platform engineer, I want the Domain_Map to reflect actual import dependencies from the Dependency_Graph, so that documentation stays accurate without manual effort.

#### Acceptance Criteria

1. WHEN the `--update-domain-map` flag is provided, THE Import_Validator SHALL analyze the Dependency_Graph to determine which shared libs each domain actually uses.
2. THE Import_Validator SHALL update the `sharedLibs` arrays in `backend/src/domains/index.ts` to match the actual imports found in each domain's handlers.
3. THE Import_Validator SHALL preserve the existing domain structure (domain names, descriptions, handler globs) and only modify the `sharedLibs` arrays.
4. IF the Domain_Map file cannot be written, THEN THE Import_Validator SHALL report the error and exit with code 1.

### Requirement 8: Local Developer Validation

**User Story:** As a developer, I want to run import validation locally before pushing, so that I can catch broken imports early in my workflow.

#### Acceptance Criteria

1. THE Import_Validator SHALL be executable locally via `npx tsx scripts/validate-lambda-imports.ts`.
2. WHEN run without flags, THE Import_Validator SHALL perform full validation (scan, resolve, detect cycles) and report results to stdout.
3. WHEN the `--handler` flag is provided with a handler path, THE Import_Validator SHALL validate only that specific handler and its transitive dependencies.
4. THE Import_Validator SHALL complete validation of all 194 handlers in under 10 seconds on a standard development machine.

### Requirement 9: Steering Documentation Update

**User Story:** As a developer, I want updated steering documentation explaining the import validation system, so that I know how to use it and what to do when adding new libs.

#### Acceptance Criteria

1. THE Steering_Documentation SHALL explain how the Import_Validator works and when it runs.
2. THE Steering_Documentation SHALL describe the steps to follow when adding a new shared lib.
3. THE Steering_Documentation SHALL describe how to run validation locally before pushing.
4. THE Steering_Documentation SHALL be added to an existing or new steering file in `.kiro/steering/`.
