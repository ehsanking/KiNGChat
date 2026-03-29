import type { ReactNode } from 'react';

export default function MarketingShell({ children }: { children: ReactNode }) {
  return <main data-shell="marketing">{children}</main>;
}
