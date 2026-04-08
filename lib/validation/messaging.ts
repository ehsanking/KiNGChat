import { z } from 'zod';

export const sendMessageSchema = z.object({
  recipientId: z.string().trim().min(1).optional().nullable(),
  groupId: z.string().trim().min(1).optional().nullable(),
  type: z.number().int().min(0).max(5),
  ciphertext: z.string().trim().min(1).max(50000),
  nonce: z.string().trim().min(1).max(256),
  tempId: z.string().trim().min(1).max(128).optional(),
  idempotencyKey: z.string().trim().min(1).max(128).optional(),
  keyGeneration: z.number().int().min(0).optional(),
  messageIndex: z.number().int().min(0).optional(),
  ttlSeconds: z.number().int().min(1).max(60 * 60 * 24 * 30).optional().nullable(),
  replyToId: z.string().trim().min(1).optional().nullable(),
  fileUrl: z.string().trim().max(3000).optional().nullable(),
  fileName: z.string().trim().max(255).optional().nullable(),
  fileSize: z.number().int().min(0).optional().nullable(),
  wrappedFileKey: z.string().trim().max(2000).optional().nullable(),
  wrappedFileKeyNonce: z.string().trim().max(2000).optional().nullable(),
  fileNonce: z.string().trim().max(255).optional().nullable(),
  audioDuration: z.number().int().min(1).max(36000).optional().nullable(),
  waveformData: z.string().trim().max(20000).optional().nullable(),
});

export const editMessageSchema = z.object({
  messageId: z.string().trim().min(1),
  ciphertext: z.string().trim().min(1).max(50000),
  nonce: z.string().trim().min(1).max(256),
});

export const reactionSchema = z.object({
  messageId: z.string().trim().min(1),
  emoji: z.string().trim().min(1).max(32),
});

export const typingSchema = z.object({
  recipientId: z.string().trim().min(1).optional(),
  groupId: z.string().trim().min(1).optional(),
  isTyping: z.boolean(),
});

export const joinRoomSchema = z.object({
  groupId: z.string().trim().min(1),
});
