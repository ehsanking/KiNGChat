import type { Metadata, Viewport } from 'next';
import { cookies, headers } from 'next/headers';
import './globals.css';
import PwaPromptClient from '@/components/PwaPromptClient';
import { ClientProviders } from '@/components/ClientProviders';
import { resolveLocale, getDirection } from '@/lib/i18n/config';
import type { Locale } from '@/lib/i18n/config';

export const viewport: Viewport = {
  themeColor: '#0f365b',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
};

export const metadata: Metadata = {
  title: 'Elahe Messenger',
  description: 'Privacy-first, self-hosted end-to-end encrypted messenger. Own your data.',
  manifest: '/manifest.json',
  icons: {
    icon: '/logo.png',
    apple: '/logo.png',
  },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const headerStore = await headers();

  const localeCookie = cookieStore.get('elahe_locale')?.value ?? null;
  const acceptLang = headerStore.get('accept-language') ?? null;
  const cspNonce = headerStore.get('x-csp-nonce') ?? undefined;
  const locale = resolveLocale(localeCookie, acceptLang) as Locale;
  const direction = getDirection(locale);

  return (
    <html lang={locale} dir={direction} suppressHydrationWarning>
      {/* Inline script to prevent FOUC (flash of unstyled content) for dark mode */}
      <head>
        <script nonce={cspNonce}
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var t = document.cookie.match(/elahe_theme=([^;]+)/);
                  var theme = t ? t[1] : 'system';
                  var resolved = theme === 'system'
                    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
                    : theme;
                  document.documentElement.classList.add(resolved);
                  document.documentElement.style.colorScheme = resolved;
                } catch(e) {}
              })();
            `,
          }}
        />
      </head>
      <body suppressHydrationWarning className="antialiased font-sans bg-[var(--bg-primary)] text-[var(--text-primary)]">
        <ClientProviders initialLocale={locale}>
          {children}
          <PwaPromptClient />
        </ClientProviders>
      </body>
    </html>
  );
}
