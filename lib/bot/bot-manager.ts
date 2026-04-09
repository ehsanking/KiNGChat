import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import type { BotPermission, BotRegistrationInput } from './bot-types';

const parsePermissions = (raw: string | null | undefined): BotPermission[] => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((p): p is BotPermission => typeof p === 'string') : [];
  } catch {
    return [];
  }
};

export async function registerBot(ownerId: string, input: BotRegistrationInput) {
  const apiToken = crypto.randomBytes(32).toString('hex');
  const bot = await prisma.bot.create({
    data: {
      ownerId,
      name: input.name,
      username: input.username,
      avatarUrl: input.avatarUrl || null,
      webhookUrl: input.webhookUrl,
      apiToken,
      permissions: JSON.stringify(input.permissions || []),
      isActive: true,
    },
  });
  return { ...bot, permissions: parsePermissions(bot.permissions) };
}

export async function listBots() {
  const bots = await prisma.bot.findMany({
    where: { isActive: true },
    orderBy: { createdAt: 'desc' },
  });
  return bots.map((bot) => ({ ...bot, permissions: parsePermissions(bot.permissions) }));
}

export async function getBotByToken(botId: string, apiToken: string) {
  if (!apiToken) return null;
  return prisma.bot.findFirst({ where: { id: botId, apiToken, isActive: true } });
}

export async function routeBotCommand(input: { commandText: string; conversationId: string; senderId: string }) {
  if (!input.commandText.trim().startsWith('/')) return null;
  const [command, ...args] = input.commandText.trim().slice(1).split(/\s+/);
  if (!command) return null;

  const bot = await prisma.bot.findFirst({
    where: {
      isActive: true,
      OR: [
        { username: command },
        { name: command },
      ],
    },
  });
  if (!bot) return null;

  return {
    bot,
    command,
    args,
    conversationId: input.conversationId,
    senderId: input.senderId,
  };
}
