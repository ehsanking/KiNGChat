import { getRedisClient } from './redis-client';

const onlineUsers = new Map<string, number>();
const lastSeen = new Map<string, string>();
const PRESENCE_TTL_SECONDS = 120;

const presenceKey = (userId: string) => `presence:user:${userId}`;
const lastSeenKey = (userId: string) => `presence:lastSeen:${userId}`;

async function setRedisPresence(userId: string, value: '1' | '0') {
  try {
    const redis = await getRedisClient();
    if (value === '1') {
      await redis.set(presenceKey(userId), value, { EX: PRESENCE_TTL_SECONDS });
    } else {
      await redis.del(presenceKey(userId));
      await redis.set(lastSeenKey(userId), new Date().toISOString(), { EX: 60 * 60 * 24 * 14 });
    }
  } catch {
    // Redis is optional; in-memory fallback remains active.
  }
}

export const markUserOnline = async (userId: string) => {
  const current = onlineUsers.get(userId) ?? 0;
  onlineUsers.set(userId, current + 1);
  await setRedisPresence(userId, '1');
};

export const markUserOffline = async (userId: string) => {
  const current = onlineUsers.get(userId) ?? 0;
  if (current <= 1) {
    onlineUsers.delete(userId);
    const seenAt = new Date().toISOString();
    lastSeen.set(userId, seenAt);
    await setRedisPresence(userId, '0');
    return;
  }
  onlineUsers.set(userId, current - 1);
};

export const getOnlineUsersCount = () => onlineUsers.size;

export async function isUserOnline(userId: string): Promise<boolean> {
  if (onlineUsers.has(userId)) return true;
  try {
    const redis = await getRedisClient();
    const value = await redis.get(presenceKey(userId));
    return value === '1';
  } catch {
    return false;
  }
}

export async function getOnlineUsers(userIds: string[]): Promise<string[]> {
  const checks = await Promise.all(userIds.map(async (id) => (await isUserOnline(id) ? id : null)));
  return checks.filter((item): item is string => Boolean(item));
}

export async function getLastSeenAt(userId: string): Promise<string | null> {
  const memory = lastSeen.get(userId);
  if (memory) return memory;

  try {
    const redis = await getRedisClient();
    return await redis.get(lastSeenKey(userId));
  } catch {
    return null;
  }
}
