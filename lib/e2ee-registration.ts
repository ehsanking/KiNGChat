import {
  generateAgreementKeyPair,
  exportAgreementPublicKey,
  exportAgreementPrivateKey,
} from '@/lib/e2ee-conversation';
import {
  generateSigningKeyPair,
  exportSigningPrivateKey,
  exportSigningPublicKey,
  signSignedPreKey,
} from '@/lib/e2ee-signing';

const DB_NAME = 'elahe_e2ee_v2';
const DB_VERSION = 1;
const KEY_STORE = 'keys';

export type RegistrationBundleV2 = {
  agreementPublicKey: string;
  signingPublicKey: string;
  signedPreKey: string;
  signedPreKeySig: string;
};

export type StoredRegistrationBundleV2 = RegistrationBundleV2 & {
  agreementPrivateKeyJwk: string;
  signingPrivateKeyJwk: string;
  signedPreKeyPrivateJwk: string;
  createdAt: string;
};

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(KEY_STORE)) {
        db.createObjectStore(KEY_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function storeKey(key: string, value: unknown): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(KEY_STORE, 'readwrite');
    tx.objectStore(KEY_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getKey<T = unknown>(key: string): Promise<T | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(KEY_STORE, 'readonly');
    const request = tx.objectStore(KEY_STORE).get(key);
    request.onsuccess = () => resolve((request.result as T | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
}

export async function createRegistrationBundleV2(): Promise<StoredRegistrationBundleV2> {
  const agreementKeyPair = await generateAgreementKeyPair();
  const signingKeyPair = await generateSigningKeyPair();
  const signedPreKeyPair = await generateAgreementKeyPair();

  const agreementPublicKey = await exportAgreementPublicKey(agreementKeyPair.publicKey);
  const signingPublicKey = await exportSigningPublicKey(signingKeyPair.publicKey);
  const signedPreKey = await exportAgreementPublicKey(signedPreKeyPair.publicKey);
  const signedPreKeySig = await signSignedPreKey(signedPreKey, signingKeyPair.privateKey);

  return {
    agreementPublicKey,
    signingPublicKey,
    signedPreKey,
    signedPreKeySig,
    agreementPrivateKeyJwk: await exportAgreementPrivateKey(agreementKeyPair.privateKey),
    signingPrivateKeyJwk: await exportSigningPrivateKey(signingKeyPair.privateKey),
    signedPreKeyPrivateJwk: await exportAgreementPrivateKey(signedPreKeyPair.privateKey),
    createdAt: new Date().toISOString(),
  };
}

export async function persistRegistrationBundleV2(bundle: StoredRegistrationBundleV2) {
  await Promise.all([
    storeKey('v2:agreementPublicKey', bundle.agreementPublicKey),
    storeKey('v2:signingPublicKey', bundle.signingPublicKey),
    storeKey('v2:signedPreKey', bundle.signedPreKey),
    storeKey('v2:signedPreKeySig', bundle.signedPreKeySig),
    storeKey('v2:agreementPrivateKey', bundle.agreementPrivateKeyJwk),
    storeKey('v2:signingPrivateKey', bundle.signingPrivateKeyJwk),
    storeKey('v2:signedPreKeyPrivateKey', bundle.signedPreKeyPrivateJwk),
    storeKey('v2:bundleCreatedAt', bundle.createdAt),
  ]);
}

export async function getPersistedRegistrationBundleV2(): Promise<StoredRegistrationBundleV2 | null> {
  const [
    agreementPublicKey,
    signingPublicKey,
    signedPreKey,
    signedPreKeySig,
    agreementPrivateKeyJwk,
    signingPrivateKeyJwk,
    signedPreKeyPrivateJwk,
    createdAt,
  ] = await Promise.all([
    getKey<string>('v2:agreementPublicKey'),
    getKey<string>('v2:signingPublicKey'),
    getKey<string>('v2:signedPreKey'),
    getKey<string>('v2:signedPreKeySig'),
    getKey<string>('v2:agreementPrivateKey'),
    getKey<string>('v2:signingPrivateKey'),
    getKey<string>('v2:signedPreKeyPrivateKey'),
    getKey<string>('v2:bundleCreatedAt'),
  ]);

  if (
    !agreementPublicKey ||
    !signingPublicKey ||
    !signedPreKey ||
    !signedPreKeySig ||
    !agreementPrivateKeyJwk ||
    !signingPrivateKeyJwk ||
    !signedPreKeyPrivateJwk ||
    !createdAt
  ) {
    return null;
  }

  return {
    agreementPublicKey,
    signingPublicKey,
    signedPreKey,
    signedPreKeySig,
    agreementPrivateKeyJwk,
    signingPrivateKeyJwk,
    signedPreKeyPrivateJwk,
    createdAt,
  };
}

export function toLegacyCompatibleRegistrationFields(bundle: RegistrationBundleV2) {
  return {
    identityKeyPublic: bundle.agreementPublicKey,
    signingKeyPublic: bundle.signingPublicKey,
    signedPreKey: bundle.signedPreKey,
    signedPreKeySig: bundle.signedPreKeySig,
    e2eeVersion: 'v2',
  };
}
