import crypto from 'crypto';
import path from 'path';
import { scanBufferForMalware } from '@/lib/antivirus';
import { appendAuditLog } from '@/lib/audit';
import { authorizeConversationAction } from '@/lib/conversation-access';
import { incrementMetric } from '@/lib/observability';
import { getPrivateObject, getPrivateObjectPath, putPrivateObject } from '@/lib/object-storage';
import { isSecureUploadAllowed } from '@/lib/file-upload-policy';
import { normalizeConversationId } from '@/lib/conversation-id';

const getSigningSecret = () => {
  const secret = process.env.DOWNLOAD_TOKEN_SECRET;
  if (!secret) {
    throw new Error('Missing DOWNLOAD_TOKEN_SECRET for secure upload signing.');
  }
  return secret;
};

export const buildSecureAttachmentKey = (conversationId: string, fileId: string) =>
  path.posix.join('attachments', normalizeConversationId(conversationId) ?? conversationId, `${fileId}.bin`);

const buildSecureAttachmentMetadataKey = (fileId: string) => path.posix.join('attachment-index', `${fileId}.json`);

export const verifyAttachmentWriteAccess = async (conversationId: string, userId: string) => {
  const normalizedConversationId = normalizeConversationId(conversationId, userId);
  if (!normalizedConversationId) return { allowed: false as const, reason: 'missing_conversation_id', kind: 'unknown' as const };

  const result = await authorizeConversationAction(userId, { conversationId: normalizedConversationId }, 'attachment.write');
  if (!result.allowed) {
    return {
      allowed: false as const,
      reason: result.reason,
      kind: result.access.kind,
    };
  }

  return result.access;
};

export const createSecureDownloadToken = (fileId: string, expiresAt: number, userId: string, conversationId: string) => {
  const payload = `${fileId}.${expiresAt}.${userId}.${conversationId}`;
  const signature = crypto.createHmac('sha256', getSigningSecret()).update(payload).digest('base64url');
  return `${fileId}.${expiresAt}.${userId}.${conversationId}.${signature}`;
};

export const verifySecureDownloadToken = (token: string, fileId: string, userId: string, conversationId: string) => {
  const [tokenFileId, expiresAtRaw, tokenUserId, tokenConversationId, signature] = token.split('.');
  if (!tokenFileId || !expiresAtRaw || !tokenUserId || !tokenConversationId || !signature) return false;
  if (tokenFileId !== fileId || tokenUserId !== userId || tokenConversationId !== conversationId) return false;
  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;
  const payload = `${tokenFileId}.${expiresAtRaw}.${tokenUserId}.${tokenConversationId}`;
  const expected = crypto.createHmac('sha256', getSigningSecret()).update(payload).digest('base64url');
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
};

const persistAttachmentMetadata = async (data: { fileId: string; conversationId: string; ownerUserId: string; objectKey: string }) => {
  const metadata = Buffer.from(JSON.stringify(data), 'utf8');
  await putPrivateObject(buildSecureAttachmentMetadataKey(data.fileId), metadata);
};

export const getAttachmentMetadata = async (fileId: string): Promise<{ fileId: string; conversationId: string; ownerUserId: string; objectKey: string } | null> => {
  try {
    const raw = await getPrivateObject(buildSecureAttachmentMetadataKey(fileId));
    const parsed = JSON.parse(raw.toString('utf8')) as { fileId?: string; conversationId?: string; ownerUserId?: string; objectKey?: string };
    if (!parsed.fileId || !parsed.conversationId || !parsed.objectKey || parsed.fileId !== fileId) return null;
    return {
      fileId: parsed.fileId,
      conversationId: parsed.conversationId,
      ownerUserId: parsed.ownerUserId ?? '',
      objectKey: parsed.objectKey,
    };
  } catch {
    return null;
  }
};

export const storeSecureAttachment = async (params: {
  conversationId: string;
  userId: string;
  file: File;
  ip?: string | null;
  metadata?: Record<string, unknown>;
  allowedFileFormats?: string;
}) => {
  const normalizedConversationId = normalizeConversationId(params.conversationId, params.userId);
  if (!normalizedConversationId) {
    return { ok: false as const, status: 400, code: 'INVALID_CONVERSATION_ID', error: 'Invalid conversation identifier.' };
  }
  const access = await verifyAttachmentWriteAccess(params.conversationId, params.userId);
  if (!access.allowed) {
    await appendAuditLog({ action: 'SECURE_UPLOAD_BLOCKED', actorUserId: params.userId, targetId: params.conversationId, conversationId: params.conversationId, ip: params.ip, outcome: 'blocked', details: { reason: access.reason } });
    return { ok: false as const, status: 403, code: 'UNAUTHORIZED_CONVERSATION', error: 'Access denied for this conversation.' };
  }

  const buffer = Buffer.from(await params.file.arrayBuffer());
  const scan = await scanBufferForMalware(buffer, params.file.type);
  if (!scan.clean) {
    incrementMetric('secure_uploads_blocked', 1, { reason: scan.reason ?? 'scan_failed' });
    await appendAuditLog({ action: 'SECURE_UPLOAD_BLOCKED', actorUserId: params.userId, targetId: params.conversationId, conversationId: params.conversationId, ip: params.ip, outcome: 'blocked', details: { fileName: params.file.name, fileSize: params.file.size, reason: scan.reason, detectedMime: scan.detectedMime } });
    return { ok: false as const, status: 400, code: 'MALWARE_SCAN_BLOCKED', error: scan.reason ?? 'Malware scan failed.' };
  }

  if (
    params.allowedFileFormats &&
    !isSecureUploadAllowed({
      fileName: params.file.name,
      declaredMime: params.file.type || 'application/octet-stream',
      detectedMime: scan.detectedMime,
      allowedFileFormats: params.allowedFileFormats,
    })
  ) {
    return { ok: false as const, status: 400, code: 'MIME_MISMATCH', error: 'File type is not allowed by server policy.' };
  }

  const fileId = crypto.randomUUID();
  const objectKey = buildSecureAttachmentKey(normalizedConversationId, fileId);
  const storage = await putPrivateObject(objectKey, buffer);
  await persistAttachmentMetadata({ fileId, conversationId: normalizedConversationId, ownerUserId: params.userId, objectKey });

  const expiresAt = Date.now() + 60 * 60 * 1000;
  const token = createSecureDownloadToken(fileId, expiresAt, params.userId, normalizedConversationId);
  incrementMetric('secure_uploads_created', 1, { kind: access.kind });
  await appendAuditLog({ action: 'SECURE_UPLOAD_CREATED', actorUserId: params.userId, targetId: fileId, conversationId: normalizedConversationId, ip: params.ip, outcome: 'success', details: { fileName: params.file.name, fileSize: params.file.size, sha256: scan.sha256, detectedMime: scan.detectedMime, conversationKind: access.kind, storageUrl: storage.storageUrl, ...params.metadata } });

  return {
    ok: true as const,
    fileId,
    token,
    access,
    storagePath: storage.storageUrl,
    downloadUrl: `/api/upload-secure/${fileId}`,
    headerDownloadUrl: `/api/upload-secure/${fileId}`,
  };
};

export const readSecureAttachment = async (conversationId: string, fileId: string) =>
  getPrivateObject(buildSecureAttachmentKey(conversationId, fileId));

export const resolveSecureAttachmentPath = async (fileId: string) => {
  const metadata = await getAttachmentMetadata(fileId);
  if (!metadata) return null;
  return { ...metadata, filePath: getPrivateObjectPath(metadata.objectKey) };
};
