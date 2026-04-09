import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { listUserDevices } from '@/lib/e2ee-runtime-service';
import { getRequestIdForRequest, respondWithInternalError, respondWithSafeError } from '@/lib/http-errors';

export async function GET(request: Request) {
  const requestId = getRequestIdForRequest(request);
  try {
    const session = getSessionFromRequest(request);
    if (!session) {
      return respondWithSafeError({ status: 401, message: 'Authentication required.', code: 'AUTH_REQUIRED', requestId });
    }
    const devices = await listUserDevices(session.userId);
    return NextResponse.json({
      success: true,
      devices: devices.map((device: (typeof devices)[number]) => ({
        deviceId: device.deviceId,
        label: device.label,
        isPrimary: device.isPrimary,
        lastSeenAt: device.lastSeenAt,
        lastPreKeyRotationAt: device.lastPreKeyRotationAt,
        availablePreKeys: device._count.oneTimePreKeys,
      })),
    });
  } catch (error) {
    return respondWithInternalError('E2EE device listing', error, { requestId });
  }
}
