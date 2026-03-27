import type {Metadata, Viewport} from 'next';
import './globals.css'; // Global styles
import PwaPromptClient from '@/components/PwaPromptClient';

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

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <body suppressHydrationWarning className="antialiased font-sans">
        {children}
        <PwaPromptClient />
      </body>
    </html>
  );
}
