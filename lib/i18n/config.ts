export const LOCALES = [
  'en', 'fa', 'ar', 'ru', 'zh', 'es', 'pt', 'de', 'tr', 'da', 'sv', 'th',
] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';

const RTL_LOCALES: ReadonlySet<string> = new Set<string>(['fa', 'ar']);

export const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  fa: 'فارسی',
  ar: 'العربية',
  ru: 'Русский',
  zh: '中文',
  es: 'Español',
  pt: 'Português',
  de: 'Deutsch',
  tr: 'Türkçe',
  da: 'Dansk',
  sv: 'Svenska',
  th: 'ไทย',
};

export function getDirection(locale: Locale): 'rtl' | 'ltr' {
  return RTL_LOCALES.has(locale) ? 'rtl' : 'ltr';
}

export function isRtl(locale: Locale): boolean {
  return RTL_LOCALES.has(locale);
}

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

export function resolveLocale(cookieValue: string | null | undefined, acceptLanguage: string | null | undefined): Locale {
  if (cookieValue && isLocale(cookieValue)) return cookieValue;

  if (acceptLanguage) {
    const parts = acceptLanguage
      .split(',')
      .map((p) => p.trim().split(';')[0].split('-')[0].trim().toLowerCase());

    for (const part of parts) {
      if (isLocale(part)) return part;
    }
  }

  return DEFAULT_LOCALE;
}

export const locales = LOCALES;
export const defaultLocale = DEFAULT_LOCALE;
export const localeNames = LOCALE_LABELS;
