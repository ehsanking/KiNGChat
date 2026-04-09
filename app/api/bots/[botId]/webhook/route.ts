import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest, context: { params: Promise<{ botId: string }> }) {
  const params = await context.params;
  const bot = await prisma.bot.findUnique({ where: { id: params.botId } });
  if (!bot || !bot.isActive) return NextResponse.json({ error: 'Bot not found.' }, { status: 404 });

  const payload = await request.json().catch(() => ({}));
  return NextResponse.json({ success: true, accepted: true, botId: bot.id, payload });
}
