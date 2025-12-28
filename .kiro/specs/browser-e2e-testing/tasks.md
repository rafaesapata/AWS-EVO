# Implementation Plan: Browser E2E Testing

## Overview

This implementation plan creates an automated E2E browser testing system using Playwright. The system will authenticate, navigate all menus, capture console errors, and generate reports iteratively until zero errors remain.

## Status: ✅ COMPLETE - All tests passing with 0 errors

## Tasks

- [x] 1. Set up Playwright and project structure
  - Install Playwright and dependencies
  - Create tests/e2e directory structure
  - Configure Playwright for the project
  - _Requirements: 1.1, 1.2, 1.4_

- [x] 2. Implement Test Configuration
  - [x] 2.1 Create TestConfig interface and default configuration
    - Define all configuration options
    - Set default values for production testing
    - Support environment variable overrides
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [x] 3. Implement Console Monitor
  - [x] 3.1 Create ConsoleMonitor class with event listeners
    - Attach to page console events
    - Capture errors, warnings, and exceptions
    - Capture network failures
    - Filter expected aborted requests during navigation
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [x] 3.2 Implement error categorization logic
    - Create categorizeError function
    - Handle CORS, AUTH, API, JS, NETWORK categories
    - _Requirements: 3.6_

- [x] 4. Implement Authentication Module
  - [x] 4.1 Create authentication flow
    - Navigate to login page
    - Enter credentials
    - Wait for redirect
    - Verify dashboard presence
    - _Requirements: 2.1, 2.2, 2.3, 2.5_

  - [x] 4.2 Implement retry logic for authentication failures
    - Retry up to 3 times
    - Capture errors on failure
    - _Requirements: 2.4_

- [x] 5. Implement Menu Navigator
  - [x] 5.1 Create MenuItem definitions from AppSidebar
    - Define all 37 menu items
    - Include sub-items and routes
    - Mark super-admin only items
    - _Requirements: 4.4_

  - [x] 5.2 Implement menu navigation logic
    - Click menu items in sidebar
    - Expand sub-menus
    - Wait for page load
    - _Requirements: 4.1, 4.2, 4.3_

- [x] 6. Implement Page Functionality Testing
  - [x] 6.1 Create element detection for tables, forms, buttons
    - Detect data tables on page
    - Detect form fields
    - Detect action buttons
    - Detect cards and charts
    - _Requirements: 5.1, 5.2, 5.3_

  - [x] 6.2 Implement functionality verification
    - Verify tables have data or loading state
    - Verify form fields are interactive
    - Verify buttons are clickable
    - _Requirements: 5.1, 5.2, 5.3_

- [x] 7. Implement Error Reporter
  - [x] 7.1 Create report generation in Markdown format
    - Group errors by page
    - Include error details
    - Add summary section
    - _Requirements: 6.1, 6.2, 6.3, 6.6_

  - [x] 7.2 Implement screenshot capture on errors
    - Capture screenshot when error occurs
    - Save with page identifier in filename
    - Include path in report
    - _Requirements: 1.5, 6.4_

  - [x] 7.3 Implement iteration comparison and tracking
    - Track new vs. fixed errors
    - Compare between iterations
    - Track iteration count
    - _Requirements: 6.5, 7.3, 7.5_

- [x] 8. Implement E2E Test Runner
  - [x] 8.1 Create main test runner class
    - Initialize browser and page
    - Coordinate all components
    - Handle cleanup
    - _Requirements: 1.3_

  - [x] 8.2 Implement single iteration execution
    - Authenticate
    - Navigate all menus
    - Collect errors
    - Generate report
    - _Requirements: 7.1_

  - [x] 8.3 Implement iterative testing until clean
    - Run iterations
    - Compare results
    - Output success on zero errors
    - _Requirements: 7.2, 7.4_

- [x] 9. Checkpoint - Verify core functionality
  - All tests pass with 0 errors

- [x] 10. Create CLI and npm scripts
  - [x] 10.1 Create CLI entry point
    - Parse command line arguments
    - Support headed/headless mode
    - Support verbose mode
    - _Requirements: 8.1, 8.3_

  - [x] 10.2 Add npm scripts for running tests
    - `npm run e2e` - headless mode
    - `npm run e2e:headed` - headed mode for debugging
    - `npm run e2e:debug` - verbose mode
    - `npm run e2e:full` - full iterative testing
    - _Requirements: 8.1_

- [x] 11. Integration testing
  - [x] 11.1 Run full E2E test against production
    - Execute complete test cycle
    - Verify all 37 menus are tested
    - Generate error report
    - All tests passing with 0 errors
    - _Requirements: 4.4, 7.1_

- [x] 12. Final checkpoint - All tests pass
  - ✅ E2E tests complete with 0 errors across 37 menu items
  - ✅ 37 warnings (expected - mostly security/debug logs)

## Additional Fixes Applied

During E2E testing, the following issues were identified and fixed:

1. **Centralized AWS Credentials API Calls** - Refactored 9 components to use shared `AwsAccountContext` instead of making duplicate API calls, eliminating race conditions

2. **Improved Error Handling** - Added graceful handling for aborted/cancelled requests in `AwsAccountContext` and `CostForecast` components

3. **E2E Test Framework Enhancement** - Updated `ConsoleMonitor` to filter expected `ERR_ABORTED` errors during navigation

## Notes

- Credentials for testing: rafael@uds.com.br / Evo2024!
- Production URL: https://evo.ai.udstec.io
- Reports saved to: test-results/e2e/
