'use client';

import { Download, File as FileIcon, Loader2, Lock, Shield } from 'lucide-react';
import type { RefObject } from 'react';
import { getTextDirection } from '@/lib/utils';
import type { ChatMessage } from './chat-types';

export default function RealtimeMessageList({
  loadingMessages,
  messages,
  isOtherUserTyping,
  scrollRef,
}: {
  loadingMessages: boolean;
  messages: ChatMessage[];
  isOtherUserTyping: boolean;
  scrollRef: RefObject<HTMLDivElement | null>;
}) {
  return (
    <div ref={scrollRef} className="telegram-chat-bg flex-1 overflow-y-auto p-3 md:p-4 space-y-3">
      {loadingMessages ? (
        <div className="h-full flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
        </div>
      ) : messages.length === 0 ? (
        <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-30">
          <Shield className="w-12 h-12" />
          <p className="text-sm max-w-xs">Messages are end-to-end encrypted. Start the conversation.</p>
        </div>
      ) : (
        messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.sender === 'me' ? 'justify-end' : 'justify-start'}`}>
            <div
              dir={getTextDirection(msg.text)}
              className={`max-w-[85%] md:max-w-[70%] rounded-2xl px-3 md:px-4 py-2 shadow-sm ${
                msg.sender === 'me'
                  ? 'bg-brand-blue text-white rounded-br-none'
                  : 'bg-zinc-800/90 text-zinc-100 rounded-bl-none'
              }`}
            >
              {msg.type === 2 ? (
                <div className="flex items-center gap-3 bg-zinc-950/50 p-2 md:p-3 rounded-xl border border-white/10">
                  <div className="p-2 bg-brand-gold/10 rounded-lg">
                    <FileIcon className="w-5 h-5 md:w-6 md:h-6 text-brand-gold" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{msg.fileName}</p>
                    <p className="text-[10px] text-zinc-400">{msg.fileSize ? (msg.fileSize / 1024).toFixed(1) : 0} KB</p>
                  </div>
                  <a href={msg.fileUrl} download={msg.fileName} className="p-2 hover:bg-zinc-800 rounded-lg transition-colors text-zinc-400 hover:text-brand-gold">
                    <Download className="w-5 h-5" />
                  </a>
                </div>
              ) : (
                <p className="text-sm whitespace-pre-wrap break-words">{msg.text}</p>
              )}
              {msg.encrypted && (
                <div className="flex items-center gap-1 mt-1 opacity-60">
                  <Lock className="w-2.5 h-2.5" />
                  <span className="text-[9px]">encrypted</span>
                </div>
              )}
            </div>
          </div>
        ))
      )}

      {isOtherUserTyping && (
        <div className="flex justify-start">
          <div className="bg-zinc-800 text-zinc-400 rounded-2xl px-4 py-2 rounded-bl-none flex gap-2 items-center">
            <span className="text-xs">Typing...</span>
            <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
            <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
            <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce"></span>
          </div>
        </div>
      )}
    </div>
  );
}
