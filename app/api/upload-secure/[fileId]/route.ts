import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { requireFreshAuthenticatedUser } from '@/lib/fresh-session';
import { appendAuditLog } from '@/lib/audit';
import { authorizeConversationAccess } from '@/lib/conversation-access';
import { resolveSecureAttachmentPath, verifySecureDownloadToken } from '@/lib/secure-attachments';
import { incrementMetric } from '@/lib/observability';

export async function GET(req: NextRequest, context: { params: Promise<{ fileId: string }> }) {
  const user = await requireFreshAuthenticatedUser(req);
  if (!user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? req.headers.get('x-real-ip');
  const { fileId } = await context.params;
  const resolved = await resolveSecureAttachmentPath(fileId);
  if (!resolved) {
    return NextResponse.json({ error: 'Encrypted file not found.' }, { status: 404 });
  }

  const conversationId = resolved.conversationId;
  const headerToken = req.headers.get('x-download-token')?.trim() || '';
  const queryToken = req.nextUrl.searchParams.get('token') || '';
  const token = headerToken || (process.env.ALLOW_QUERY_DOWNLOAD_TOKEN === 'true' ? queryToken : '');
  if (!fileId || !token || !verifySecureDownloadToken(token, fileId, user.id, conversationId)) {
    incrementMetric('secure_downloads_blocked', 1, { reason: 'invalid_token' });
    return NextResponse.json({ error: 'Invalid or expired download token.' }, { status: 403 });
  }

  const access = await authorizeConversationAccess(conversationId, user.id);
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
    return NextResponse.json({ error: 'Access denied for this conversation.' }, { status: 403 });
  }

  await appendAuditLog({
    action: 'SECURE_DOWNLOAD_GRANTED',
    actorUserId: user.id,
    targetId: fileId,
    conversationId,
    ip: clientIp,
    outcome: 'success',
    details: { conversationKind: access.kind },
  });
  incrementMetric('secure_downloads_granted', 1, { kind: access.kind });

  const fileBuffer = await readFile(resolved.filePath);
  return new NextResponse(fileBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/octet-stream',
      'Cache-Control': 'private, max-age=60',
      'Content-Disposition': `attachment; filename="${fileId}.bin"`,
    },
  });
}
