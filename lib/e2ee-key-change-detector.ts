const KEY_CHANGE_EVENT = 'elahe:e2ee-key-change';

export type KeyChangeEventDetail = {
  userId: string;
  storedFingerprint: string;
  currentPublicKey: string;
};

export function detectKeyChange(userId: string, storedFingerprint: string, currentPublicKey: string): boolean {
  const changed = Boolean(
    userId.trim()
      && storedFingerprint.trim()
      && currentPublicKey.trim()
      && storedFingerprint.trim() !== currentPublicKey.trim(),
  );

  if (changed && typeof window !== 'undefined') {
    const detail: KeyChangeEventDetail = {
      userId: userId.trim(),
      storedFingerprint: storedFingerprint.trim(),
      currentPublicKey: currentPublicKey.trim(),
    };
    window.dispatchEvent(new CustomEvent<KeyChangeEventDetail>(KEY_CHANGE_EVENT, { detail }));
  }

  return changed;
}

export function onKeyChange(listener: (detail: KeyChangeEventDetail) => void): () => void {
  if (typeof window === 'undefined') return () => {};

  const handler = (event: Event) => {
    const custom = event as CustomEvent<KeyChangeEventDetail>;
    if (custom.detail) {
      listener(custom.detail);
    }
  };

  window.addEventListener(KEY_CHANGE_EVENT, handler);
  return () => window.removeEventListener(KEY_CHANGE_EVENT, handler);
}
