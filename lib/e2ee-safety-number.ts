export type SafetyNumber = {
  digits: string;
  grouped: string;
};

function toDecimalFromHash(bytes: Uint8Array): string {
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
  const decimal = BigInt(`0x${hex}`).toString(10);
  return decimal.padStart(60, '0').slice(0, 60);
}

export function formatSafetyNumber(digits: string): string {
  return digits.match(/.{1,5}/g)?.join(' ') ?? digits;
}

export async function generateSafetyNumber(myPublicKey: string, theirPublicKey: string): Promise<SafetyNumber> {
  const normalized = [myPublicKey.trim(), theirPublicKey.trim()].sort().join('');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalized));
  const digits = toDecimalFromHash(new Uint8Array(digest));

  return {
    digits,
    grouped: formatSafetyNumber(digits),
  };
}
