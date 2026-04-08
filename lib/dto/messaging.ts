export type SendMessageDto = {
  recipientId?: string;
  groupId?: string;
  type: number;
  ciphertext: string;
  nonce: string;
  fileUrl?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  wrappedFileKey?: string | null;
  wrappedFileKeyNonce?: string | null;
  fileNonce?: string | null;
  tempId?: string | null;
  idempotencyKey?: string | null;
  replyToId?: string | null;
  keyGeneration?: number | null;
  messageIndex?: number | null;
  ttlSeconds?: number | null;
  audioDuration?: number | null;
  waveformData?: string | null;
};

const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

export const parseSendMessageDto = (value: unknown): SendMessageDto | null => {
  if (!value || typeof value !== 'object') return null;
  const data = value as Record<string, unknown>;

  const recipientId = isNonEmptyString(data.recipientId) ? data.recipientId.trim() : undefined;
  const groupId = isNonEmptyString(data.groupId) ? data.groupId.trim() : undefined;
  const ciphertext = isNonEmptyString(data.ciphertext)
    ? data.ciphertext.trim()
    : isNonEmptyString(data.messagePayload)
      ? data.messagePayload.trim()
      : '';
  const nonce = typeof data.nonce === 'string' ? data.nonce.trim() : '';
  const type = typeof data.type === 'number' && Number.isInteger(data.type) ? data.type : 0;
  const fileName = typeof data.fileName === 'string' ? data.fileName.trim() : null;
  const fileUrl = typeof data.fileUrl === 'string' ? data.fileUrl.trim() : null;
  const fileSize = typeof data.fileSize === 'number' && Number.isFinite(data.fileSize) ? data.fileSize : null;
  const tempId = typeof data.tempId === 'string' ? data.tempId.trim() : null;
  const idempotencyKey = typeof data.idempotencyKey === 'string' ? data.idempotencyKey.trim() : tempId;
  const replyToId = typeof data.replyToId === 'string' ? data.replyToId.trim() : null;
  const wrappedFileKey = typeof data.wrappedFileKey === 'string' ? data.wrappedFileKey.trim() : null;
  const wrappedFileKeyNonce = typeof data.wrappedFileKeyNonce === 'string' ? data.wrappedFileKeyNonce.trim() : null;
  const fileNonce = typeof data.fileNonce === 'string' ? data.fileNonce.trim() : null;
  const keyGeneration = typeof data.keyGeneration === 'number' && Number.isInteger(data.keyGeneration)
    ? data.keyGeneration
    : null;
  const messageIndex = typeof data.messageIndex === 'number' && Number.isInteger(data.messageIndex)
    ? data.messageIndex
    : null;
  const ttlSeconds = typeof data.ttlSeconds === 'number' && Number.isInteger(data.ttlSeconds)
    ? data.ttlSeconds
    : null;
  const audioDuration = typeof data.audioDuration === 'number' && Number.isFinite(data.audioDuration)
    ? data.audioDuration
    : null;
  const waveformData = typeof data.waveformData === 'string' ? data.waveformData.trim() : null;

  if ((!recipientId && !groupId) || !ciphertext) return null;
  if (ciphertext.length > 64_000) return null;

  return {
    recipientId,
    groupId,
    type,
    ciphertext,
    nonce,
    fileUrl,
    fileName,
    fileSize,
    wrappedFileKey,
    wrappedFileKeyNonce,
    fileNonce,
    tempId,
    idempotencyKey,
    replyToId,
    keyGeneration,
    messageIndex,
    ttlSeconds,
    audioDuration,
    waveformData,
  };
};
