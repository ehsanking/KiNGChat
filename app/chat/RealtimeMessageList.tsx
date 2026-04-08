'use client';

import { ShieldAlert } from 'lucide-react';

type RealtimeMessage = {
  id: string;
  text: string;
  sender?: 'me' | 'them' | 'system';
  type?: 'text' | 'key_change';
};

type RealtimeMessageListProps = {
  messages: RealtimeMessage[];
};

/**
 * RealtimeMessageList renders the scrollable list of messages in a chat.  It
 * should handle incoming Socket.IO events and maintain the scroll position.
 * Extracting this component from the chat page allows the complex state and
 * side effects around message rendering to be isolated and tested.
 */
export default function RealtimeMessageList({ messages }: RealtimeMessageListProps) {
  return (
    <div className="flex-1 overflow-y-auto space-y-3 p-3 md:p-4">
      {messages.map((message) => {
        if (message.type === 'key_change' || message.sender === 'system') {
          return (
            <div
              key={message.id}
              className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/15 px-3 py-2 text-sm text-amber-100"
            >
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" aria-hidden="true" />
              <p>{message.text || 'Security keys for this contact have changed. Verify their identity.'}</p>
            </div>
          );
        }

        return (
          <div key={message.id} className="rounded-2xl bg-zinc-800 px-3 py-2 text-sm text-zinc-100">
            {message.text}
          </div>
        );
      })}
    </div>
  );
}
