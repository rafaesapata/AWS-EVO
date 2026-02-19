/**
 * Property Tests: BudgetInput sync logic (pure)
 *
 * Feature: budget-management-redesign, Property 7: Sincronização bidirecional input/slider
 * Validates: Requirements 2.3, 2.4
 *
 * Extracts the pure synchronization logic from BudgetInput.tsx and tests
 * bidirectional input↔slider consistency without React rendering.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// ─── Pure logic extracted from BudgetInput.tsx ───

/**
 * Sync from input field: parse raw text, clamp negatives to 0, return new state.
 * Returns null if input is invalid (NaN) — mirrors the `if (isNaN(parsed)) return;` guard.
 */
function syncFromInput(rawInput: string, _currentValue: number): { newValue: number; inputText: string } | null {
  const parsed = parseFloat(rawInput);
  if (isNaN(parsed)) return null;
  const clamped = Math.max(0, parsed);
  return { newValue: clamped, inputText: String(clamped) };
}

/**
 * Sync from slider: take the first value from the slider array, update both state fields.
 * Mirrors `handleSliderChange` in BudgetInput.tsx.
 */
function syncFromSlider(sliderValues: number[]): { newValue: number; inputText: string } {
  const newValue = sliderValues[0] ?? 0;
  return { newValue, inputText: String(newValue) };
}

// ─── Generators ───

/** Non-negative finite float for valid budget values */
const validBudgetArb = fc.float({ min: 0, max: Math.fround(100000), noNaN: true, noDefaultInfinity: true });

/** Negative finite float */
const negativeBudgetArb = fc.float({ min: Math.fround(-100000), max: Math.fround(-0.01), noNaN: true, noDefaultInfinity: true })
  .filter(v => v < 0);

/** Strings that parseFloat would return NaN for */
const nanStringArb = fc.constantFrom('', 'abc', 'NaN', '--5', '..', 'hello', '$100', 'e');

/** Valid numeric string (non-negative) */
const validNumericStringArb = validBudgetArb.map(v => String(v));

/** Slider values array (always single non-negative element, matching Slider component) */
const sliderValuesArb = validBudgetArb.map(v => [v]);

// ─── Property Tests ───

// Feature: budget-management-redesign, Property 7: Sincronização bidirecional input/slider
// Validates: Requirements 2.3, 2.4
describe('Property 7: Sincronização bidirecional input/slider', () => {

  it('bidirectional: input→slider and slider→input produce the same value for any valid number >= 0', () => {
    fc.assert(
      fc.property(validBudgetArb, (value) => {
        // Input → Slider: typing a valid value
        const fromInput = syncFromInput(String(value), 0);
        expect(fromInput).not.toBeNull();
        expect(fromInput!.newValue).toBe(value);

        // Slider → Input: moving slider to same value
        const fromSlider = syncFromSlider([value]);
        expect(fromSlider.newValue).toBe(value);

        // Both paths produce identical state
        expect(fromInput!.newValue).toBe(fromSlider.newValue);
        expect(fromInput!.inputText).toBe(fromSlider.inputText);
      }),
      { numRuns: 100 },
    );
  });

  it('negative input values are clamped to 0', () => {
    fc.assert(
      fc.property(negativeBudgetArb, (negValue) => {
        const result = syncFromInput(String(negValue), 500);
        expect(result).not.toBeNull();
        expect(result!.newValue).toBe(0);
        expect(result!.inputText).toBe('0');
      }),
      { numRuns: 100 },
    );
  });

  it('NaN/invalid input is rejected (returns null)', () => {
    fc.assert(
      fc.property(nanStringArb, (invalidStr) => {
        const result = syncFromInput(invalidStr, 1000);
        expect(result).toBeNull();
      }),
      { numRuns: 100 },
    );
  });

  it('slider value always equals input value after sync from slider', () => {
    fc.assert(
      fc.property(sliderValuesArb, (sliderValues) => {
        const result = syncFromSlider(sliderValues);
        // The numeric value and the text representation must be consistent
        expect(result.inputText).toBe(String(result.newValue));
        // The value must match the slider input
        expect(result.newValue).toBe(sliderValues[0]);
      }),
      { numRuns: 100 },
    );
  });

  it('slider value always equals input value after sync from input', () => {
    fc.assert(
      fc.property(validNumericStringArb, (numStr) => {
        const result = syncFromInput(numStr, 0);
        if (result !== null) {
          // inputText and newValue must be consistent
          expect(result.inputText).toBe(String(result.newValue));
          // Value must be >= 0
          expect(result.newValue).toBeGreaterThanOrEqual(0);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('empty slider array defaults to 0', () => {
    const result = syncFromSlider([]);
    expect(result.newValue).toBe(0);
    expect(result.inputText).toBe('0');
  });
});
