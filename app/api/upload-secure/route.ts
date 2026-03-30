import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateAdminSettings } from '@/lib/admin-settings';
import { assertSameOrigin } from '@/lib/request-security';
import { storeSecureAttachment } from '@/lib/secure-attachments';
import { requireFreshAuthenticatedUser } from '@/lib/fresh-session';

export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req);
  } catch {
    return NextResponse.json({ error: 'Origin is not allowed.', code: 'INVALID_ORIGIN' }, { status: 400 });
  }

  const user = await requireFreshAuthenticatedUser(req);
  if (!user) {
    return NextResponse.json({ error: 'Authentication required.', code: 'UNAUTHENTICATED' }, { status: 401 });
  }

  const userId = user.id;
  const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? req.headers.get('x-real-ip');

  try {
    const formData = await req.formData();
    const file = formData.get('file');
    const conversationId = typeof formData.get('conversationId') === 'string' ? String(formData.get('conversationId')).trim() : '';
    const wrappedFileKey = formData.get('wrappedFileKey');
    const wrappedFileKeyNonce = formData.get('wrappedFileKeyNonce');
    const fileNonce = formData.get('fileNonce');

    if (
      !file ||
      !(file instanceof File) ||
      !conversationId ||
      typeof wrappedFileKey !== 'string' ||
      typeof wrappedFileKeyNonce !== 'string' ||
      typeof fileNonce !== 'string'
    ) {
      return NextResponse.json({ error: 'Invalid form data.', code: 'MALFORMED_METADATA' }, { status: 400 });
    }

    const settings = await getOrCreateAdminSettings();

    if (file.size > settings.maxAttachmentSize) {
      return NextResponse.json(
        {
          error: `File too large. Max allowed: ${Math.round(settings.maxAttachmentSize / 1024 / 1024)}MB`,
          code: 'FILE_TOO_LARGE',
        },
        { status: 400 },
      );
    }

    const stored = await storeSecureAttachment({
      conversationId,
      userId,
      file,
      ip: clientIp,
      metadata: { wrappedFileKey, wrappedFileKeyNonce, fileNonce },
      allowedFileFormats: settings.allowedFileFormats,
    });

    if (!stored.ok) {
      return NextResponse.json({ error: stored.error, code: stored.code ?? 'UPLOAD_REJECTED' }, { status: stored.status });
    }

    return NextResponse.json({
      success: true,
      storagePath: stored.storagePath,
      downloadUrl: stored.downloadUrl,
      downloadToken: stored.token,
      headerDownloadUrl: stored.headerDownloadUrl,
      fileName: file.name,
      fileSize: file.size,
      metadata: { wrappedFileKey, wrappedFileKeyNonce, fileNonce },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Upload failed', code: 'UPLOAD_FAILED' }, { status: 500 });
  }
}
