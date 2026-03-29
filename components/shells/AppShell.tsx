import type { ReactNode } from 'react';

export default function AppShell({ children }: { children: ReactNode }) {
  return <main data-shell="app">{children}</main>;
}
