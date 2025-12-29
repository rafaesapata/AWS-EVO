import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Parse a date string (YYYY-MM-DD) without timezone conversion.
 * This ensures dates from AWS (UTC) are displayed correctly in local timezone.
 * 
 * Problem: new Date("2025-12-27") creates Dec 27 00:00 UTC, which becomes Dec 26 21:00 in Brazil (UTC-3)
 * Solution: Parse as local date by adding T12:00:00 (noon) to avoid day boundary issues
 */
export function parseDateString(dateStr: string | Date): Date {
  if (dateStr instanceof Date) {
    return dateStr;
  }
  
  // If it's already a full ISO string with time, parse normally
  if (dateStr.includes('T')) {
    return new Date(dateStr);
  }
  
  // For date-only strings (YYYY-MM-DD), parse as local noon to avoid timezone issues
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day, 12, 0, 0);
}

/**
 * Format a date string for display in pt-BR locale without timezone issues
 */
export function formatDateBR(dateStr: string | Date, options?: Intl.DateTimeFormatOptions): string {
  const date = parseDateString(dateStr);
  return date.toLocaleDateString('pt-BR', options);
}

/**
 * Format a date string for display with custom locale without timezone issues
 */
export function formatDate(dateStr: string | Date, locale: string = 'pt-BR', options?: Intl.DateTimeFormatOptions): string {
  const date = parseDateString(dateStr);
  return date.toLocaleDateString(locale, options);
}

/**
 * Get the day of month from a date string without timezone issues
 */
export function getDayOfMonth(dateStr: string | Date): number {
  const date = parseDateString(dateStr);
  return date.getDate();
}

/**
 * Compare two date strings for sorting without timezone issues
 */
export function compareDates(a: string | Date, b: string | Date): number {
  return parseDateString(a).getTime() - parseDateString(b).getTime();
}