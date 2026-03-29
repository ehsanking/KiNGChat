export const CHAT_NEXT_PATH = '/chat';

export const sanitizeNextPath = (value: string | null | undefined) => {
  if (!value) return CHAT_NEXT_PATH;
  if (!value.startsWith('/') || value.startsWith('//')) return CHAT_NEXT_PATH;
  return value;
};
