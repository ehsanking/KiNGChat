import { useCallback, useRef } from 'react';
import type { Socket } from 'socket.io-client';
import type { DeliveryState } from '@/lib/types';
import type { PendingQueueItem } from '@/app/chat/chat-state';

type QueueOptions<TPatch extends object> = {
  storageKey: string;
  socket: Socket | null;
  updateLocalMessageStatus: (tempId: string, status: DeliveryState, patch?: Partial<TPatch>) => void;
};

export function usePendingQueue<TPatch extends object>({ storageKey, socket, updateLocalMessageStatus }: QueueOptions<TPatch>) {
  const queueRef = useRef<PendingQueueItem[]>([]);

  const persistQueue = useCallback((queue: PendingQueueItem[]) => {
    queueRef.current = queue;
    if (!storageKey) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(queue));
    } catch {
      // Ignore storage failures.
    }
  }, [storageKey]);

  const loadQueue = useCallback((key: string) => {
    try {
      const rawQueue = localStorage.getItem(key);
      queueRef.current = rawQueue ? JSON.parse(rawQueue) : [];
    } catch {
      queueRef.current = [];
    }
  }, []);

  const emitQueuedMessage = useCallback((queued: PendingQueueItem, activeSocket?: Socket | null) => {
    const targetSocket = activeSocket || socket;
    if (!targetSocket) return false;

    targetSocket.emit('sendMessage', {
      recipientId: queued.recipientId,
      groupId: queued.groupId,
      ciphertext: queued.ciphertext,
      nonce: queued.nonce,
      messagePayload: queued.ciphertext,
      type: queued.type,
      tempId: queued.tempId,
      fileUrl: queued.fileUrl,
      fileName: queued.fileName,
      fileSize: queued.fileSize,
      keyGeneration: queued.keyGeneration,
      messageIndex: queued.messageIndex,
      replyToId: queued.replyToId,
      forwardedFrom: queued.forwardedFrom,
    });
    updateLocalMessageStatus(queued.tempId, 'SENT');
    return true;
  }, [socket, updateLocalMessageStatus]);

  const flushQueue = useCallback((activeSocket?: Socket | null) => {
    if (!navigator.onLine || !(activeSocket || socket)) return;
    const remaining: PendingQueueItem[] = [];
    for (const item of queueRef.current) {
      const sent = emitQueuedMessage(item, activeSocket);
      if (!sent) remaining.push(item);
    }
    persistQueue(remaining);
  }, [emitQueuedMessage, persistQueue, socket]);

  return {
    queueRef,
    persistQueue,
    loadQueue,
    emitQueuedMessage,
    flushQueue,
  };
}
