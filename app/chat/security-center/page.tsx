'use client';

import { type ReactNode, useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Shield, Smartphone, KeyRound, CheckCircle2, AlertTriangle, QrCode } from 'lucide-react';
import { generateSafetyNumber } from '@/lib/e2ee-safety-number';
import { markContactVerified } from '@/lib/e2ee-verification-store';

// Legacy compatibility key: dmVerifiedPeers

type RuntimeStatus = {
  directMessages: string;
  groups: string;
  channels: string;
  ratchet: string;
  verificationUX: string;
};

type DeviceRow = {
  deviceId: string;
  label?: string | null;
  lastSeenAt?: string | null;
  isPrimary?: boolean;
  isRevoked?: boolean;
};

export default function SecurityCenterPage() {
  const [runtime, setRuntime] = useState<RuntimeStatus | null>(null);
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [totpEnabled, setTotpEnabled] = useState(false);
  const [peerId, setPeerId] = useState('');
  const [safetyNumber, setSafetyNumber] = useState('');
  const [myIdentityKey, setMyIdentityKey] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [verifyError, setVerifyError] = useState('');
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    const load = async () => {
      const [runtimeRes, deviceRes, sessionRes] = await Promise.all([
        fetch('/api/e2ee/runtime-status', { cache: 'no-store' }),
        fetch('/api/e2ee/devices', { cache: 'no-store' }),
        fetch('/api/session', { cache: 'no-store' }),
      ]);

      if (runtimeRes.ok) {
        const data = await runtimeRes.json();
        setRuntime(data?.policy ?? null);
      }
      if (deviceRes.ok) {
        const data = await deviceRes.json();
        setDevices(Array.isArray(data?.devices) ? data.devices : []);
      }
      if (!sessionRes.ok) {
        window.location.href = '/auth/login?next=/chat/security-center';
      } else {
        const sessionData = await sessionRes.json();
        setTotpEnabled(Boolean(sessionData?.user?.totpEnabled));

        const selfId = sessionData?.user?.id as string | undefined;
        if (selfId) {
          const selfKeyRes = await fetch(`/api/e2ee/public-keys/${encodeURIComponent(selfId)}`, { cache: 'no-store' });
          const selfKeyData = await selfKeyRes.json();
          const key = (selfKeyData?.agreementPublicKey ?? selfKeyData?.identityKeyPublic ?? '').toString().trim();
          setMyIdentityKey(key);
        }
      }
    };

    load();
  }, []);

  const handleGenerateSafetyNumber = async () => {
    setVerifyError('');
    setSafetyNumber('');
    setQrDataUrl('');
    setVerified(false);
    const sanitized = peerId.trim();
    if (!sanitized) return;

    try {
      if (!myIdentityKey) {
        setVerifyError('Your identity key is not available yet. Please complete key registration first.');
        return;
      }

      const response = await fetch(`/api/e2ee/public-keys/${encodeURIComponent(sanitized)}`, { cache: 'no-store' });
      const data = await response.json();
      const theirIdentityKey = (data?.agreementPublicKey ?? data?.identityKeyPublic ?? '').toString().trim();

      if (!response.ok || !theirIdentityKey) {
        setVerifyError('Could not fetch peer identity key. Ask peer for a valid numeric ID.');
        return;
      }

      const generated = await generateSafetyNumber(myIdentityKey, theirIdentityKey);
      setSafetyNumber(generated.grouped);

      const qrPayload = JSON.stringify({
        type: 'elahe-safety-number-v1',
        peerId: sanitized,
        safetyNumber: generated.digits,
      });
      const QRCode = await import('qrcode');
      const qr = await QRCode.toDataURL(qrPayload, { errorCorrectionLevel: 'M', margin: 1, width: 220 });
      setQrDataUrl(qr);
    } catch {
      setVerifyError('Safety number generation failed.');
    }
  };

  const handleMarkVerified = async () => {
    const sanitized = peerId.trim();
    if (!sanitized || !safetyNumber) return;

    await markContactVerified(sanitized, safetyNumber, safetyNumber.replace(/\s+/g, ''));
    setVerified(true);
  };

  return (
    <main className="min-h-screen bg-zinc-950 p-4 text-zinc-50 md:p-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <header className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold">Security Center</h1>
            <p className="text-sm text-zinc-400">Implementation-accurate status for encryption, sessions, and verification.</p>
          </div>
          <Link href="/chat" className="text-sm text-brand-gold hover:underline">Back to chat</Link>
        </header>

        <section className="grid gap-4 md:grid-cols-2">
          <Card title="Encrypted today" icon={<Shield className="h-5 w-5 text-emerald-400" />}>
            <ul className="space-y-1 text-sm text-zinc-300">
              <li>Direct messages: {runtime?.directMessages ?? 'loading...'}</li>
              <li>Groups: {runtime?.groups ?? 'loading...'}</li>
              <li>Channels: {runtime?.channels ?? 'loading...'}</li>
            </ul>
          </Card>
          <Card title="Transitional areas" icon={<AlertTriangle className="h-5 w-5 text-amber-400" />}>
            <ul className="space-y-1 text-sm text-zinc-300">
              <li>Ratchet status: {runtime?.ratchet ?? 'loading...'}</li>
              <li>Verification UX: {runtime?.verificationUX ?? 'loading...'}</li>
              <li>Signal-grade parity is not claimed while these are transitional.</li>
            </ul>
          </Card>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <Card title="Device/session status" icon={<Smartphone className="h-5 w-5 text-brand-gold" />}>
            <ul className="space-y-2 text-sm text-zinc-300">
              {devices.length === 0 ? <li>No registered devices found.</li> : devices.map((d) => (
                <li key={d.deviceId} className="rounded-lg border border-zinc-800 px-3 py-2">
                  <div className="font-medium">{d.label || d.deviceId}</div>
                  <div className="text-xs text-zinc-500">Last seen: {d.lastSeenAt ? new Date(d.lastSeenAt).toLocaleString() : 'Unknown'}</div>
                  <div className="text-xs text-zinc-500">{d.isPrimary ? 'Primary device' : 'Secondary device'} • {d.isRevoked ? 'Revoked' : 'Active'}</div>
                </li>
              ))}
            </ul>
          </Card>

          <Card title="Account hardening" icon={<KeyRound className="h-5 w-5 text-brand-gold" />}>
            <p className="mb-3 text-sm text-zinc-300">2FA status: {totpEnabled ? 'Enabled' : 'Not enabled yet'}</p>
            <Link href="/chat/profile" className="text-sm text-brand-gold hover:underline">Manage 2FA and profile security</Link>
          </Card>
        </section>

        <Card title="Verify contact" icon={<CheckCircle2 className="h-5 w-5 text-brand-blue" />}>
          <p className="sr-only">Direct-message safety number</p>
          <p className="mb-3 text-sm text-zinc-400">Compare this 60-digit safety number with your contact using a trusted channel, or scan each other&apos;s QR code.</p>
          <div className="flex flex-wrap gap-2" dir="auto">
            <input
              value={peerId}
              onChange={(e) => setPeerId(e.target.value)}
              placeholder="Peer numeric ID"
              className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
            />
            <button onClick={handleGenerateSafetyNumber} className="rounded-lg bg-zinc-800 px-3 py-2 text-sm hover:bg-zinc-700">Generate</button>
            <button onClick={handleMarkVerified} disabled={!safetyNumber} className="rounded-lg bg-emerald-600/80 px-3 py-2 text-sm disabled:opacity-50">Mark as verified</button>
          </div>
          {verifyError ? <p className="mt-2 text-sm text-red-400">{verifyError}</p> : null}
          {safetyNumber ? (
            <div className="mt-4 grid gap-4 md:grid-cols-[1fr_auto] md:items-start">
              <div>
                <p className="text-xs text-zinc-400">Safety number (12 × 5 digits)</p>
                <p className="mt-1 break-words font-mono text-sm leading-7 text-emerald-400" dir="ltr">{safetyNumber}</p>
                {verified ? <p className="mt-2 text-xs text-emerald-300">Verified on this device.</p> : null}
              </div>
              {qrDataUrl ? (
                <div className="inline-flex flex-col items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
                  <div className="flex items-center gap-1 text-xs text-zinc-400">
                    <QrCode className="h-3.5 w-3.5" />
                    QR Code
                  </div>
                  <Image src={qrDataUrl} alt="Safety number QR code" width={160} height={160} className="h-40 w-40 rounded bg-white p-2" />
                </div>
              ) : null}
            </div>
          ) : null}
        </Card>
      </div>
    </main>
  );
}

function Card({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
      <div className="mb-3 flex items-center gap-2">
        {icon}
        <h2 className="font-semibold">{title}</h2>
      </div>
      {children}
    </section>
  );
}
