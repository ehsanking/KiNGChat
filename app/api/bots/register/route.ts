import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireFreshAdminUser } from '@/lib/fresh-session';
import { registerBot } from '@/lib/bot/bot-manager';

const schema = z.object({
  name: z.string().trim().min(1).max(80),
  username: z.string().trim().min(2).max(80),
  avatarUrl: z.string().trim().url().optional().nullable(),
  webhookUrl: z.string().trim().url(),
  permissions: z.array(z.enum(['DM', 'GROUP', 'CHANNEL', 'COMMANDS'])).default([]),
});

export async function POST(request: NextRequest) {
  const admin = await requireFreshAdminUser(request);
  if (!admin) return NextResponse.json({ error: 'Administrator access required.' }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Validation failed.', details: parsed.error.flatten() }, { status: 400 });

  const bot = await registerBot(admin.id, parsed.data);
  return NextResponse.json({ success: true, bot }, { status: 201 });
}
