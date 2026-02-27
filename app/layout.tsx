import type {Metadata, Viewport} from 'next';
import './globals.css'; // Global styles
import PwaPrompt from '@/components/PwaPrompt';

export const viewport: Viewport = {
  themeColor: '#0f365b',
};

export const metadata: Metadata = {
  title: 'KiNGChat',
  description: 'Privacy-first, self-hosted web messenger designed for resilience.',
  manifest: '/manifest.json',
  icons: {
    icon: '/logo.png',
    apple: '/logo.png',
  },
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        {children}
        <PwaPrompt />
      </body>
    </html>
  );
}
