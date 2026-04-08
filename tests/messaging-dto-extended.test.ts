import { describe, expect, it } from 'vitest';
import { parseSendMessageDto } from '@/lib/dto/messaging';

/**
 * Tests for the messaging DTO parser.
 *
 * Covers:
 * - Valid payload parsing
 * - Invalid/missing fields
 * - XSS and injection protection (trimming)
 * - Max ciphertext length enforcement
 * - Idempotency key handling
 */

describe('parseSendMessageDto', () => {
  const validPayload = {
    recipientId: 'user-123',
    ciphertext: 'encrypted-data',
    nonce: 'nonce-value',
    type: 0,
  };

  it('parses a valid direct message payload', () => {
    const result = parseSendMessageDto(validPayload);
    expect(result).not.toBeNull();
    expect(result!.recipientId).toBe('user-123');
    expect(result!.ciphertext).toBe('encrypted-data');
    expect(result!.nonce).toBe('nonce-value');
    expect(result!.type).toBe(0);
  });

  it('parses a valid group message payload', () => {
    const result = parseSendMessageDto({
      groupId: 'group-456',
      ciphertext: 'encrypted',
      nonce: 'nonce',
    });
    expect(result).not.toBeNull();
    expect(result!.groupId).toBe('group-456');
    expect(result!.recipientId).toBeUndefined();
  });

  it('rejects null/undefined input', () => {
    expect(parseSendMessageDto(null)).toBeNull();
    expect(parseSendMessageDto(undefined)).toBeNull();
    expect(parseSendMessageDto('')).toBeNull();
  });

  it('rejects missing recipient and group', () => {
    const result = parseSendMessageDto({
      ciphertext: 'encrypted',
      nonce: 'nonce',
    });
    expect(result).toBeNull();
  });

  it('rejects missing ciphertext', () => {
    const result = parseSendMessageDto({
      recipientId: 'user-123',
      nonce: 'nonce',
    });
    expect(result).toBeNull();
  });

  it('rejects empty ciphertext', () => {
    const result = parseSendMessageDto({
      recipientId: 'user-123',
      ciphertext: '   ',
      nonce: 'nonce',
    });
    expect(result).toBeNull();
  });

  it('rejects ciphertext exceeding 64000 characters', () => {
    const result = parseSendMessageDto({
      recipientId: 'user-123',
      ciphertext: 'a'.repeat(64_001),
      nonce: 'nonce',
    });
    expect(result).toBeNull();
  });

  it('trims whitespace from string fields', () => {
    const result = parseSendMessageDto({
      recipientId: '  user-123  ',
      ciphertext: '  data  ',
      nonce: '  nonce  ',
      fileName: '  file.png  ',
    });
    expect(result).not.toBeNull();
    expect(result!.recipientId).toBe('user-123');
    expect(result!.ciphertext).toBe('data');
    expect(result!.nonce).toBe('nonce');
    expect(result!.fileName).toBe('file.png');
  });

  it('defaults type to 0 when not a number', () => {
    const result = parseSendMessageDto({
      recipientId: 'user-123',
      ciphertext: 'data',
      nonce: 'nonce',
      type: 'text',
    });
    expect(result).not.toBeNull();
    expect(result!.type).toBe(0);
  });

  it('uses tempId as idempotencyKey when idempotencyKey is absent', () => {
    const result = parseSendMessageDto({
      recipientId: 'user-123',
      ciphertext: 'data',
      nonce: 'nonce',
      tempId: 'temp-001',
    });
    expect(result).not.toBeNull();
    expect(result!.idempotencyKey).toBe('temp-001');
    expect(result!.tempId).toBe('temp-001');
  });

  it('includes file metadata when provided', () => {
    const result = parseSendMessageDto({
      recipientId: 'user-123',
      ciphertext: 'data',
      nonce: 'nonce',
      type: 1,
      fileUrl: 'https://example.com/file.png',
      fileName: 'file.png',
      fileSize: 1024,
      wrappedFileKey: 'key',
      wrappedFileKeyNonce: 'keynonce',
      fileNonce: 'filenonce',
    });
    expect(result).not.toBeNull();
    expect(result!.type).toBe(1);
    expect(result!.fileUrl).toBe('https://example.com/file.png');
    expect(result!.fileName).toBe('file.png');
    expect(result!.fileSize).toBe(1024);
    expect(result!.wrappedFileKey).toBe('key');
  });

  it('falls back to messagePayload when ciphertext is absent', () => {
    const result = parseSendMessageDto({
      recipientId: 'user-123',
      messagePayload: 'legacy-data',
      nonce: 'nonce',
    });
    expect(result).not.toBeNull();
    expect(result!.ciphertext).toBe('legacy-data');
  });
});


  it('parses ttl and voice metadata', () => {
    const result = parseSendMessageDto({
      recipientId: 'user-123',
      ciphertext: 'data',
      nonce: 'n',
      type: 3,
      ttlSeconds: 60,
      audioDuration: 3.2,
      waveformData: '[0.1,0.2]',
    });
    expect(result).not.toBeNull();
    expect(result!.ttlSeconds).toBe(60);
    expect(result!.audioDuration).toBe(3.2);
    expect(result!.waveformData).toBe('[0.1,0.2]');
  });
