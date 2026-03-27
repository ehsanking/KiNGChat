import { NextResponse } from 'next/server';
import { registerUser } from '@/app/actions/auth';
import { assertSameOrigin } from '@/lib/request-security';
import { verifySignedPreKey } from '@/lib/e2ee-signing';

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await request.json();
    const username = typeof body?.username === 'string' ? body.username : '';
    const password = typeof body?.password === 'string' ? body.password : '';
    const confirmPassword = typeof body?.confirmPassword === 'string' ? body.confirmPassword : '';
    const agreementPublicKey = typeof body?.agreementPublicKey === 'string' ? body.agreementPublicKey.trim() : '';
    const signingPublicKey = typeof body?.signingPublicKey === 'string' ? body.signingPublicKey.trim() : '';
    const signedPreKey = typeof body?.signedPreKey === 'string' ? body.signedPreKey.trim() : '';
    const signedPreKeySig = typeof body?.signedPreKeySig === 'string' ? body.signedPreKeySig.trim() : '';
    const captchaId = typeof body?.captchaId === 'string' ? body.captchaId : '';
    const captchaAnswer = typeof body?.captchaAnswer === 'string' ? body.captchaAnswer : '';

    if (!agreementPublicKey || !signingPublicKey || !signedPreKey || !signedPreKeySig) {
      return NextResponse.json({ error: 'Missing v2 registration bundle.' }, { status: 400 });
    }

    const validSignature = await verifySignedPreKey(signedPreKey, signedPreKeySig, signingPublicKey);
    if (!validSignature) {
      return NextResponse.json({ error: 'Invalid signed pre-key signature.' }, { status: 400 });
    }

    const result = await registerUser({
      username,
      password,
      confirmPassword,
      identityKeyPublic: agreementPublicKey,
      signedPreKey,
      signedPreKeySig,
      signingPublicKey,
      captchaId,
      captchaAnswer,
    });

    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      userId: result.userId,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to register v2 E2EE user.' },
      { status: 500 },
    );
  }
}
