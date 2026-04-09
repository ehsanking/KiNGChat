import { prisma } from '@/lib/prisma';
import type { BotWebhookRequest } from './bot-types';

export async function postToBotWebhook(webhookUrl: string, request: BotWebhookRequest) {
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error(`Bot webhook returned ${response.status}`);
  }
  return response.json().catch(() => ({}));
}

export async function sendBotMessage(args: {
  botId: string;
  recipientId?: string;
  groupId?: string;
  ciphertext: string;
  nonce: string;
  type?: number;
}) {
  const message = await prisma.message.create({
    data: {
      senderId: args.botId,
      recipientId: args.recipientId || null,
      groupId: args.groupId || null,
      ciphertext: args.ciphertext,
      nonce: args.nonce,
      type: args.type ?? 0,
      deliveryStatus: 'SENT',
      forwardedFrom: null,
    },
  });
  return { success: true as const, message };
}
