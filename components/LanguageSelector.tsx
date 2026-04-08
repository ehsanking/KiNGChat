'use client';

import { useI18n } from '@/lib/i18n';
import { LOCALE_LABELS, LOCALES } from '@/lib/i18n/config';

export default function LanguageSelector({ className = '' }: { className?: string }) {
  const { locale, setLocale } = useI18n();

  return (
    <label className={`inline-flex items-center gap-2 text-xs text-[var(--text-secondary)] ${className}`}>
      <span>Language</span>
      <select
        aria-label="Select language"
        value={locale}
        onChange={(event) => setLocale(event.target.value as typeof locale)}
        className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-2 py-1 text-[var(--text-primary)]"
      >
        {LOCALES.map((item) => (
          <option key={item} value={item}>{LOCALE_LABELS[item]}</option>
        ))}
      </select>
    </label>
  );
}
