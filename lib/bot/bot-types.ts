export type BotPermission = 'DM' | 'GROUP' | 'CHANNEL' | 'COMMANDS';

export type BotRegistrationInput = {
  name: string;
  username: string;
  avatarUrl?: string | null;
  webhookUrl: string;
  permissions: BotPermission[];
};

export type BotCommandPayload = {
  botId: string;
  command: string;
  args: string[];
  conversationId: string;
  senderId: string;
};

export type BotWebhookRequest = {
  event: 'command' | 'message';
  payload: Record<string, unknown>;
};
