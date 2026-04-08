import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { getBackupStatus, triggerBackupNow } from '@/lib/backup/service';
import { getRequestIdForRequest, respondWithSafeError } from '@/lib/http-errors';

export async function POST(request: Request) {
  const requestId = getRequestIdForRequest(request);
  const session = getSessionFromRequest(request);
  if (!session || session.role !== 'ADMIN') {
    return respondWithSafeError({ status: 403, message: 'Administrator access required.', code: 'REQUEST_REJECTED', requestId });
  }

  const result = await triggerBackupNow({ source: 'admin-api' });
  return NextResponse.json({ ok: true, requestId, result });
}

export async function GET(request: Request) {
  const requestId = getRequestIdForRequest(request);
  const session = getSessionFromRequest(request);
  if (!session || session.role !== 'ADMIN') {
    return respondWithSafeError({ status: 403, message: 'Administrator access required.', code: 'REQUEST_REJECTED', requestId });
  }
  return NextResponse.json({ ok: true, requestId, status: getBackupStatus() });
}
