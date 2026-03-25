'use client';

import { Loader2, Paperclip, Send } from 'lucide-react';
import type { ChangeEvent, FormEvent, RefObject } from 'react';
import { getTextDirection } from '@/lib/utils';

export default function MessageComposer({
  input,
  sessionKey,
  isUploading,
  fileInputRef,
  onInputChange,
  onSubmit,
  onFileUpload,
}: {
  input: string;
  sessionKey: CryptoKey | null;
  isUploading: boolean;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onInputChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onFileUpload: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="telegram-composer p-2 md:p-4 border-t border-white/10">
      <form onSubmit={onSubmit} className="flex gap-2">
        <input type="file" ref={fileInputRef} onChange={onFileUpload} className="hidden" />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="p-2.5 md:p-3 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-400 hover:text-brand-gold transition-colors disabled:opacity-50"
        >
          {isUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Paperclip className="w-5 h-5" />}
        </button>
        <input
          type="text"
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          dir={getTextDirection(input)}
          placeholder={sessionKey ? 'Type an encrypted message...' : 'Type a message...'}
          className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 md:px-4 py-2.5 md:py-3 text-sm focus:outline-none focus:border-brand-gold transition-colors"
        />
        <button type="submit" className="bg-brand-gold hover:bg-brand-gold/90 text-zinc-950 p-2.5 md:p-3 rounded-xl transition-colors flex items-center justify-center shadow-sm">
          <Send className="w-5 h-5" />
        </button>
      </form>
    </div>
  );
}
