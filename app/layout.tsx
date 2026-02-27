import type {Metadata} from 'next';
import './globals.css'; // Global styles

export const metadata: Metadata = {
  title: 'KiNGChat',
  description: 'Privacy-first, self-hosted web messenger designed for resilience.',
  manifest: '/manifest.json',
  themeColor: '#10b981',
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
