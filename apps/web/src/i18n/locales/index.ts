import type { Locale } from '../config';
import { es } from './es';

/** The reference locale defines the required key set for every other locale. */
export type TranslationKey = keyof typeof es;

/** A complete translation table. Partial tables are rejected at compile time. */
export type Translations = Record<TranslationKey, string>;

/**
 * Register new locales here.
 *
 *   import { en } from './en';
 *   export const translations: Record<Locale, Translations> = { es, en };
 */
export const translations: Record<Locale, Translations> = {
  es,
};
