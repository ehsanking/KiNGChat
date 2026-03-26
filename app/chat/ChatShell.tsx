"use client";

import { ChatDashboardContent } from './page';

/**
 * ChatShell is a thin wrapper around the existing ChatDashboardContent component.
 *
 * Splitting this into its own file allows the chat page to be more modular and
 * easier to refactor in the future.  Consumers can import ChatShell instead of
 * reaching into page.tsx directly.  Over time the logic from ChatDashboardContent
 * can be moved here or into further subcomponents without affecting callers.
 */
export default function ChatShell() {
  return <ChatDashboardContent />;
}
