export type NormalizedOneTimePreKey = {
  keyId: string;
  publicKey: string;
  signature: string | null;
  expiresAt: Date | null;
};

export function normalizeOneTimePreKeys(input: unknown[]): NormalizedOneTimePreKey[] {
  return input.reduce<NormalizedOneTimePreKey[]>((acc, item) => {
    const entry = item as Record<string, unknown>;
    if (typeof entry?.keyId !== 'string' || typeof entry?.publicKey !== 'string') {
      return acc;
    }

    const keyId = entry.keyId.trim();
    const publicKey = entry.publicKey.trim();
    if (!keyId || !publicKey) {
      return acc;
    }

    const expiresAtRaw = typeof entry.expiresAt === 'string' ? entry.expiresAt.trim() : '';
    const expiresAt = expiresAtRaw ? new Date(expiresAtRaw) : null;
    if (expiresAtRaw && Number.isNaN(expiresAt?.getTime())) {
      return acc;
    }

    const signature = typeof entry.signature === 'string' ? entry.signature.trim() : null;
    if (acc.some((existing) => existing.keyId === keyId)) {
      return acc;
    }

    acc.push({
      keyId,
      publicKey,
      signature: signature || null,
      expiresAt,
    });
    return acc;
  }, []);
}