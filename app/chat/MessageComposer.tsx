"use client";

import dynamic from 'next/dynamic';
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Smile } from 'lucide-react';
import type { Socket } from 'socket.io-client';
import {
  decryptGroupMessage,
  distributeSenderKey,
  encryptGroupMessage,
  receiveSenderKey,
  rotateSenderKey,
  storeReceivedSenderKey,
  type GroupMemberKeyEnvelope,
} from '@/lib/crypto/group-sender-keys';
import { encryptFile } from '@/lib/crypto';
import VoiceRecorder from '@/components/chat/VoiceRecorder';
import { ALLOWED_TTL_SECONDS } from '@/lib/disappearing-messages';

const Picker = dynamic(() => import('@emoji-mart/react'), { ssr: false });

type GroupConversationMeta = {
  id: string;
  encrypted: boolean;
};

type MessageComposerProps = {
  socket: Socket | null;
  conversation?: GroupConversationMeta | null;
  identityWrappingKey?: string;
  groupMembers?: GroupMemberKeyEnvelope[];
  onSend: (payload: { ciphertext: string; nonce: string; keyGeneration?: number; messageIndex?: number; ttlSeconds?: number | null; type?: number; fileUrl?: string | null; audioDuration?: number | null; waveformData?: string | null }) => Promise<void> | void;
  onDecryptPreview?: (payload: { senderId: string; text: string }) => void;
};

export default function MessageComposer({
  socket,
  conversation,
  identityWrappingKey,
  groupMembers = [],
  onSend,
  onDecryptPreview,
}: MessageComposerProps) {
  const [input, setInput] = useState('');
  const [ttlSeconds, setTtlSeconds] = useState<number | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    try {
      const value = JSON.parse(localStorage.getItem('elahe_recent_emojis') ?? '[]');
      if (Array.isArray(value)) setRecent(value.slice(0, 12));
    } catch {
      // ignore invalid local storage JSON
    }
  }, []);

  const processSenderKeyDistribution = useCallback(async (payload: {
    groupId?: string;
    senderUserId?: string;
    senderPublicKey?: string;
    wrappedKey?: string;
    nonce?: string;
    keyGeneration?: number;
  }) => {
    if (!conversation?.id || !identityWrappingKey || !payload?.wrappedKey || !payload?.nonce || !payload?.senderUserId || !payload?.senderPublicKey) {
      return;
    }
    if (payload.groupId !== conversation.id) return;

    const received = await receiveSenderKey(payload.wrappedKey, payload.nonce, payload.senderPublicKey, identityWrappingKey);
    storeReceivedSenderKey(conversation.id, payload.senderUserId, payload.keyGeneration ?? received.keyGeneration, received.chainKey);
  }, [conversation?.id, identityWrappingKey]);

  useEffect(() => {
    if (!socket) return;

    const onDistributed = (payload: {
      groupId?: string;
      senderUserId?: string;
      senderPublicKey?: string;
      wrappedKey?: string;
      nonce?: string;
      keyGeneration?: number;
    }) => {
      void processSenderKeyDistribution(payload);
    };

    const onRotated = (payload: { groupId?: string }) => {
      const rotatedGroupId = payload.groupId?.trim();
      if (rotatedGroupId && rotatedGroupId === conversation?.id && groupMembers.length > 0) {
        void rotateSenderKey(rotatedGroupId, groupMembers);
      }
    };

    socket.on('senderKeyDistributed', onDistributed);
    socket.on('groupKeyRotated', onRotated);

    return () => {
      socket.off('senderKeyDistributed', onDistributed);
      socket.off('groupKeyRotated', onRotated);
    };
  }, [conversation?.id, groupMembers, processSenderKeyDistribution, socket]);

  const submit = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = input.trim();
    if (!text) return;

    if (conversation?.encrypted) {
      if (groupMembers.length > 0) {
        const distribution = await distributeSenderKey(conversation.id, groupMembers);
        socket?.emit('senderKeyDistributed', { groupId: conversation.id, wrappedKeys: distribution.wrappedKeys, keyGeneration: distribution.keyGeneration });
      }

      const encrypted = await encryptGroupMessage(conversation.id, text);
      await onSend({
        ciphertext: encrypted.ciphertext,
        nonce: encrypted.nonce,
        keyGeneration: encrypted.keyGeneration,
        messageIndex: encrypted.messageIndex,
        ttlSeconds,
      });
      setInput('');
      return;
    }

    await onSend({ ciphertext: text, nonce: '', ttlSeconds });
    setInput('');
  }, [conversation?.encrypted, conversation?.id, groupMembers, input, onSend, socket, ttlSeconds]);


  const ttlOptions = useMemo(() => [null, ...ALLOWED_TTL_SECONDS], []);

  const sendVoiceMessage = useCallback(async (recording: { blob: Blob; durationSeconds: number; waveform: number[] }) => {
    const audioFile = new File([recording.blob], `voice-${Date.now()}.webm`, { type: 'audio/webm' });
    const encrypted = await encryptFile(audioFile);
    const fileUrl = URL.createObjectURL(encrypted.ciphertext);
    await onSend({
      type: 3,
      ciphertext: encrypted.key,
      nonce: encrypted.iv,
      fileUrl,
      ttlSeconds,
      audioDuration: recording.durationSeconds,
      waveformData: JSON.stringify(recording.waveform),
    });
  }, [onSend, ttlSeconds]);

  const addEmoji = useCallback((emoji: { native?: string }) => {
    const value = emoji.native ?? '';
    if (!value) return;

    setRecent((prev) => {
      const next = [value, ...prev.filter((x) => x !== value)].slice(0, 12);
      localStorage.setItem('elahe_recent_emojis', JSON.stringify(next));
      return next;
    });

    const inputEl = inputRef.current;
    if (!inputEl) {
      setInput((prev) => `${prev}${value}`);
      return;
    }

    const start = inputEl.selectionStart ?? input.length;
    const end = inputEl.selectionEnd ?? input.length;
    const nextValue = `${input.slice(0, start)}${value}${input.slice(end)}`;
    setInput(nextValue);

    requestAnimationFrame(() => {
      const nextPos = start + value.length;
      inputEl.focus();
      inputEl.setSelectionRange(nextPos, nextPos);
    });
  }, [input]);

  // Optional helper for consumer tests / previews.
  const tryDecryptPreview = useCallback(async (payload: {
    groupId: string;
    senderId: string;
    ciphertext: string;
    nonce: string;
    keyGeneration: number;
    messageIndex: number;
  }) => {
    if (!onDecryptPreview) return;
    const text = await decryptGroupMessage(
      payload.groupId,
      payload.senderId,
      payload.ciphertext,
      payload.nonce,
      payload.keyGeneration,
      payload.messageIndex,
    );
    onDecryptPreview({ senderId: payload.senderId, text });
  }, [onDecryptPreview]);

  useEffect(() => {
    if (!socket || !conversation?.encrypted) return;
    const handler = (payload: {
      groupId?: string;
      senderId?: string;
      ciphertext?: string;
      nonce?: string;
      keyGeneration?: number;
      messageIndex?: number;
    }) => {
      if (!payload.groupId || payload.groupId !== conversation.id || !payload.senderId || !payload.ciphertext || !payload.nonce) return;
      if (!Number.isInteger(payload.keyGeneration) || !Number.isInteger(payload.messageIndex)) return;
      void tryDecryptPreview({
        groupId: payload.groupId,
        senderId: payload.senderId,
        ciphertext: payload.ciphertext,
        nonce: payload.nonce,
        keyGeneration: Number(payload.keyGeneration),
        messageIndex: Number(payload.messageIndex),
      });
    };

    socket.on('receiveMessage', handler);
    return () => {
      socket.off('receiveMessage', handler);
    };
  }, [conversation?.encrypted, conversation?.id, socket, tryDecryptPreview]);

  return (
    <form onSubmit={submit} className="relative flex gap-2">
      <input
        ref={inputRef}
        type="text"
        value={input}
        onChange={(event) => setInput(event.target.value)}
        placeholder={conversation?.encrypted ? 'Write an encrypted group message…' : 'Write a message…'}
        className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm text-[var(--text-primary)]"
      />
      <select
        value={ttlSeconds ?? ''}
        onChange={(event) => setTtlSeconds(event.target.value ? Number(event.target.value) : null)}
        aria-label="Disappearing timer"
        className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] px-2 py-2 text-xs text-[var(--text-primary)]"
      >
        {ttlOptions.map((option) => (
          <option key={String(option)} value={option ?? ''}>
            {option === null ? 'Permanent' : `${option}s`}
          </option>
        ))}
      </select>
      <button type="button" aria-label="Open emoji picker" onClick={() => setEmojiOpen((prev) => !prev)} className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] px-3 text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
        <Smile className="h-4 w-4" />
      </button>
      <VoiceRecorder onRecorded={sendVoiceMessage} />
      <button type="submit" className="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-hover)]">
        Send
      </button>
      {emojiOpen && (
        <div className="absolute bottom-12 right-0 z-20 rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-2 shadow-2xl">
          {recent.length > 0 && (
            <div className="mb-2 flex gap-1 border-b border-[var(--border)] pb-2">
              {recent.map((item) => <button key={item} type="button" onClick={() => addEmoji({ native: item })} className="rounded px-1.5 py-1 hover:bg-[var(--bg-tertiary)]">{item}</button>)}
            </div>
          )}
          <Picker data={async () => (await import('@emoji-mart/data')).default} onEmojiSelect={addEmoji} skinTonePosition="search" theme="dark" />
        </div>
      )}
    </form>
  );
}
