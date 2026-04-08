import { openDB } from 'idb';

const DB_NAME = 'elahe_verification';
const STORE_NAME = 'contact_verifications';
const LEGACY_STORAGE_KEY = 'dmVerifiedPeers';

type VerificationRecord = {
  userId: string;
  safetyNumber: string;
  fingerprint: string;
  verifiedAt: string;
};

async function getDb() {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'userId' });
      }
    },
  });
}

export async function markContactVerified(userId: string, safetyNumber: string, fingerprint: string) {
  const db = await getDb();
  const record: VerificationRecord = {
    userId,
    safetyNumber,
    fingerprint,
    verifiedAt: new Date().toISOString(),
  };
  await db.put(STORE_NAME, record);

  if (typeof window !== 'undefined') {
    const next = JSON.parse(window.localStorage.getItem(LEGACY_STORAGE_KEY) ?? '{}') as Record<string, string>;
    next[userId] = safetyNumber;
    window.localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(next));
  }
}

export async function isContactVerified(userId: string): Promise<boolean> {
  const db = await getDb();
  const record = await db.get(STORE_NAME, userId);
  if (record) return true;

  if (typeof window !== 'undefined') {
    try {
      const legacy = JSON.parse(window.localStorage.getItem(LEGACY_STORAGE_KEY) ?? '{}') as Record<string, string>;
      return Boolean(legacy[userId]);
    } catch {
      return false;
    }
  }

  return false;
}
