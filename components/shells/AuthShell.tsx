import type { ReactNode } from 'react';

export default function AuthShell({ children }: { children: ReactNode }) {
  return <main data-shell="auth">{children}</main>;
}
