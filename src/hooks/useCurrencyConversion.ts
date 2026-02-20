/**
 * Currency conversion store using React state + localStorage.
 * Fetches daily USD/BRL exchange rate and allows toggling display currency.
 * AWS values are natively USD, Azure values are natively BRL.
 */

import { useState, useEffect, useCallback, useSyncExternalStore } from 'react';

interface ExchangeRate {
  usdToBrl: number;
  brlToUsd: number;
  fetchedAt: string;
  source: string;
}

interface CurrencyState {
  isConverted: boolean;
  exchangeRate: ExchangeRate | null;
  isLoadingRate: boolean;
}

const STORAGE_KEY = 'evo-currency-conversion';
const RATE_CACHE_KEY = 'evo-exchange-rate';
const RATE_CACHE_DURATION_MS = 12 * 60 * 60 * 1000; // 12 hours

// Simple external store for cross-component reactivity
let state: CurrencyState = {
  isConverted: false,
  exchangeRate: null,
  isLoadingRate: false,
};

// Load persisted state
try {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    const parsed = JSON.parse(stored);
    state = { ...state, isConverted: !!parsed.isConverted, exchangeRate: parsed.exchangeRate || null };
  }
} catch { /* ignore */ }

const listeners = new Set<() => void>();

function getSnapshot(): CurrencyState {
  return state;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setState(partial: Partial<CurrencyState>) {
  state = { ...state, ...partial };
  // Persist to localStorage
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      isConverted: state.isConverted,
      exchangeRate: state.exchangeRate,
    }));
  } catch { /* ignore */ }
  listeners.forEach((l) => l());
}

/** Toggle between native and converted currency */
export function toggleCurrency() {
  setState({ isConverted: !state.isConverted });
}

/** Hook to access the currency conversion store */
export function useCurrencyStore() {
  const current = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return {
    ...current,
    toggleCurrency,
  };
}

/**
 * Fetch exchange rate from free public API.
 * Falls back to cached value if fetch fails.
 */
async function fetchExchangeRate(): Promise<ExchangeRate> {
  // Check localStorage cache first
  const cached = localStorage.getItem(RATE_CACHE_KEY);
  if (cached) {
    try {
      const parsed = JSON.parse(cached) as ExchangeRate;
      const fetchedAt = new Date(parsed.fetchedAt).getTime();
      if (Date.now() - fetchedAt < RATE_CACHE_DURATION_MS) {
        return parsed;
      }
    } catch { /* ignore invalid cache */ }
  }

  try {
    const response = await fetch('https://economia.awesomeapi.com.br/json/last/USD-BRL');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const usdToBrl = parseFloat(data.USDBRL.bid);

    const rate: ExchangeRate = {
      usdToBrl,
      brlToUsd: 1 / usdToBrl,
      fetchedAt: new Date().toISOString(),
      source: 'AwesomeAPI',
    };

    localStorage.setItem(RATE_CACHE_KEY, JSON.stringify(rate));
    return rate;
  } catch {
    // Fallback: try cached even if expired
    if (cached) {
      try { return JSON.parse(cached) as ExchangeRate; } catch { /* ignore */ }
    }
    // Last resort fallback
    return {
      usdToBrl: 5.50,
      brlToUsd: 1 / 5.50,
      fetchedAt: new Date().toISOString(),
      source: 'fallback',
    };
  }
}

/** Initialize exchange rate on app load */
export async function initExchangeRate(): Promise<void> {
  if (state.isLoadingRate) return;
  setState({ isLoadingRate: true });
  const rate = await fetchExchangeRate();
  setState({ exchangeRate: rate, isLoadingRate: false });
}
