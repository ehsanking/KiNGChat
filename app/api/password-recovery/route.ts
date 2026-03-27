import { NextResponse } from 'next/server';
import { getRecoveryQuestion, recoverPassword } from '@/app/actions/auth';
import { assertSameOrigin } from '@/lib/request-security';

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);

    const body = await request.json();
    const action = typeof body?.action === 'string' ? body.action : '';

    if (action === 'question') {
      const result = await getRecoveryQuestion({
        username: typeof body?.username === 'string' ? body.username : '',
      });

      if (result.error) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }

      return NextResponse.json({
        success: true,
        recoveryQuestion: 'recoveryQuestion' in result ? result.recoveryQuestion : '',
      });
    }

    if (action === 'reset') {
      const result = await recoverPassword({
        username: typeof body?.username === 'string' ? body.username : '',
        recoveryAnswer: typeof body?.recoveryAnswer === 'string' ? body.recoveryAnswer : '',
        newPassword: typeof body?.newPassword === 'string' ? body.newPassword : '',
        confirmPassword: typeof body?.confirmPassword === 'string' ? body.confirmPassword : '',
      });

      if (result.error) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action.' }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Password recovery failed.' },
      { status: 500 },
    );
  }
}
