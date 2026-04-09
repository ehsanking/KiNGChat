import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getBotByToken } from '@/lib/bot/bot-manager';
import { sendBotMessage } from '@/lib/bot/bot-api';

const schema = z.object({
  recipientId: z.string().trim().min(1).optional(),
  groupId: z.string().trim().min(1).optional(),
  ciphertext: z.string().trim().min(1).max(50000),
  nonce: z.string().trim().max(256).default(''),
  type: z.number().int().min(0).max(5).default(0),
});

const extractToken = (request: NextRequest) => {
  const auth = request.headers.get('authorization') || '';
  if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  return request.headers.get('x-bot-token') || '';
};

export async function POST(request: NextRequest, context: { params: Promise<{ botId: string }> }) {
  const params = await context.params;
  const token = extractToken(request);
  const bot = await getBotByToken(params.botId, token);
  if (!bot) return NextResponse.json({ error: 'Invalid bot token.' }, { status: 401 });

  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Validation failed.', details: parsed.error.flatten() }, { status: 400 });
  if (!parsed.data.recipientId && !parsed.data.groupId) {
    return NextResponse.json({ error: 'recipientId or groupId is required.' }, { status: 400 });
  }

  const result = await sendBotMessage({
    botId: bot.id,
    ...parsed.data,
  });

  if ('error' in result) return NextResponse.json(result, { status: 403 });
  return NextResponse.json(result, { status: 201 });
}
