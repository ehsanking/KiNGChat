import type {Metadata, Viewport} from 'next';
import { Vazirmatn } from 'next/font/google';
import './globals.css'; // Global styles
import PwaPrompt from '@/components/PwaPrompt';

const vazirmatn = Vazirmatn({
  subsets: ['arabic', 'latin'],
  variable: '--font-vazirmatn',
  display: 'swap',
});

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
    <html lang="en" dir="ltr" className={vazirmatn.variable} suppressHydrationWarning>
      <body suppressHydrationWarning className="antialiased font-sans">
        {children}
        <PwaPrompt />
      </body>
    </html>
  );
}
