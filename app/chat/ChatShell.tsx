"use client";

import ChatDashboard from './ChatDashboardClient';

/**
 * ChatShell is a thin wrapper around the default chat dashboard page component.
 *
 * Keeping this wrapper avoids cross-importing named exports from Next.js page
 * modules (which is invalid in production builds) while preserving a stable
 * composition point for future chat UI refactors.
 */
export default function ChatShell() {
  return <ChatDashboard />;
}
