'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
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
  const parentRef = useRef<HTMLDivElement | null>(null);
  const prevMessageCount = useRef(messages.length);
  const virtualItems = useMemo(() => messages, [messages]);
  const rowVirtualizer = useVirtualizer({
    count: virtualItems.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 68,
    overscan: 20,
  });

  useEffect(() => {
    if (!parentRef.current) return;
    if (messages.length > prevMessageCount.current) {
      rowVirtualizer.scrollToIndex(messages.length - 1, { align: 'end' });
    }
    prevMessageCount.current = messages.length;
  }, [messages.length, rowVirtualizer]);

  return (
    <div ref={parentRef} className="flex-1 overflow-y-auto p-3 md:p-4">
      <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }}>
      {rowVirtualizer.getVirtualItems().map((item) => {
        const message = virtualItems[item.index];
        if (!message) return null;
        if (message.type === 'key_change' || message.sender === 'system') {
          return (
            <div
              key={message.id}
              className="absolute left-0 top-0 flex w-full items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/15 px-3 py-2 text-sm text-amber-100"
              style={{ transform: `translateY(${item.start}px)` }}
            >
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" aria-hidden="true" />
              <p>{message.text || 'Security keys for this contact have changed. Verify their identity.'}</p>
            </div>
          );
        }

        return (
          <div
            key={message.id}
            className="absolute left-0 top-0 w-full rounded-2xl bg-zinc-800 px-3 py-2 text-sm text-zinc-100"
            style={{ transform: `translateY(${item.start}px)` }}
          >
            {message.text}
          </div>
        );
      })}
      </div>
    </div>
  );
}
