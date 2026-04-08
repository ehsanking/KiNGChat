'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { TranslationDictionary } from './dictionaries/en';
import enDict from './dictionaries/en';
import { DEFAULT_LOCALE, getDirection, isLocale } from './config';
import type { Locale } from './config';

// ── Lazy dictionary loader ──────────────────────────────────────
const dictionaries: Record<string, TranslationDictionary> = { en: enDict };

async function loadDictionary(locale: Locale): Promise<TranslationDictionary> {
  if (dictionaries[locale]) return dictionaries[locale];

  try {
    // Dynamic import ensures only the needed locale is bundled on-demand
    const mod = await import(`./dictionaries/${locale}.ts`);
    dictionaries[locale] = mod.default;
    return mod.default;
  } catch {
    return enDict; // Fallback
  }
}

// ── Nested key resolver ─────────────────────────────────────────
type NestedKeyOf<T> = T extends Record<string, unknown>
  ? {
      [K in keyof T & string]: T[K] extends Record<string, unknown>
        ? `${K}.${NestedKeyOf<T[K]>}`
        : K;
    }[keyof T & string]
  : never;

export type TranslationKey = NestedKeyOf<TranslationDictionary>;

function resolveKey(dict: TranslationDictionary, key: string): string {
  const parts = key.split('.');
  let current: unknown = dict;
  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return key; // Return the key itself as fallback
    }
  }
  return typeof current === 'string' ? current : key;
}

// ── Context ─────────────────────────────────────────────────────
type I18nContextValue = {
  locale: Locale;
  direction: 'rtl' | 'ltr';
  t: (key: TranslationKey) => string;
  setLocale: (locale: Locale) => void;
};

const I18nContext = createContext<I18nContextValue>({
  locale: DEFAULT_LOCALE,
  direction: 'ltr',
  t: (key) => key,
  setLocale: () => {},
});

// ── Provider ────────────────────────────────────────────────────
export function I18nProvider({
  children,
  initialLocale,
}: {
  children: ReactNode;
  initialLocale?: Locale;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale ?? DEFAULT_LOCALE);
  const [dict, setDict] = useState<TranslationDictionary>(dictionaries[locale] ?? enDict);

  const setLocale = useCallback(
    (newLocale: Locale) => {
      if (!isLocale(newLocale) || newLocale === locale) return;
      setLocaleState(newLocale);

      // Persist to cookie
      document.cookie = `elahe_locale=${newLocale};path=/;max-age=${365 * 24 * 60 * 60};samesite=strict`;

      // Update <html> attributes
      document.documentElement.lang = newLocale;
      document.documentElement.dir = getDirection(newLocale);

      // Load the new dictionary
      void loadDictionary(newLocale).then(setDict);
    },
    [locale],
  );

  const t = useCallback(
    (key: TranslationKey) => resolveKey(dict, key),
    [dict],
  );

  const direction = getDirection(locale);

  const value = useMemo<I18nContextValue>(
    () => ({ locale, direction, t, setLocale }),
    [locale, direction, t, setLocale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

// ── Hook ────────────────────────────────────────────────────────
export function useI18n() {
  return useContext(I18nContext);
}

export function useTranslation() {
  const { t, locale, direction } = useContext(I18nContext);
  return { t, locale, direction };
}
