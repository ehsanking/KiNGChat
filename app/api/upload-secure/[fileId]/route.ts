import { NextRequest, NextResponse } from 'next/server';
import { requireFreshAuthenticatedUser } from '@/lib/fresh-session';
import { appendAuditLog } from '@/lib/audit';
import { authorizeConversationAction } from '@/lib/conversation-access';
import { resolveSecureAttachmentPath, verifySecureDownloadToken } from '@/lib/secure-attachments';
import { incrementMetric } from '@/lib/observability';
import { getPrivateObject } from '@/lib/object-storage';

export async function GET(req: NextRequest, context: { params: Promise<{ fileId: string }> }) {
  const user = await requireFreshAuthenticatedUser(req);
  if (!user) {
    return NextResponse.json({ error: 'Authentication required.', code: 'UNAUTHENTICATED' }, { status: 401 });
  }

  const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? req.headers.get('x-real-ip');
  const { fileId } = await context.params;
  const resolved = await resolveSecureAttachmentPath(fileId);
  if (!resolved) {
    return NextResponse.json({ error: 'Encrypted file not found.', code: 'FILE_NOT_FOUND' }, { status: 404 });
  }

  const conversationId = resolved.conversationId;
  const headerToken = req.headers.get('x-download-token')?.trim() || '';
  const queryToken = req.nextUrl.searchParams.get('token') || '';
  const token = headerToken || (process.env.ALLOW_QUERY_DOWNLOAD_TOKEN === 'true' ? queryToken : '');
  if (!fileId || !token || !verifySecureDownloadToken(token, fileId, user.id, conversationId)) {
    incrementMetric('secure_downloads_blocked', 1, { reason: 'invalid_token' });
    return NextResponse.json({ error: 'Invalid or expired download token.', code: 'INVALID_TOKEN' }, { status: 403 });
  }

  const access = await authorizeConversationAction(user.id, { conversationId }, 'conversation.read');
  if (!access.allowed) {
    incrementMetric('secure_downloads_blocked', 1, { reason: access.reason });
    await appendAuditLog({
      action: 'SECURE_DOWNLOAD_BLOCKED',
      actorUserId: user.id,
      targetId: fileId,
      conversationId,
      ip: clientIp,
      outcome: 'blocked',
      details: { reason: access.reason },
    });
    return NextResponse.json({ error: 'Access denied for this conversation.', code: 'UNAUTHORIZED_CONVERSATION' }, { status: 403 });
  }

  await appendAuditLog({
    action: 'SECURE_DOWNLOAD_GRANTED',
    actorUserId: user.id,
    targetId: fileId,
    conversationId,
    ip: clientIp,
    outcome: 'success',
    details: { conversationKind: access.access.kind },
  });
  incrementMetric('secure_downloads_granted', 1, { kind: access.access.kind });

  const fileBuffer = await getPrivateObject(resolved.objectKey);
  return new NextResponse(new Uint8Array(fileBuffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/octet-stream',
      'Cache-Control': 'private, max-age=60',
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': `attachment; filename="${fileId}.bin"`,
    },
  });
}
