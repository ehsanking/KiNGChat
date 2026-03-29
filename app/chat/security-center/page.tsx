'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Shield, Smartphone, KeyRound, CheckCircle2, AlertTriangle } from 'lucide-react';

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

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function formatFingerprint(hex: string): string {
  return hex.toUpperCase().match(/.{1,4}/g)?.join(' ') ?? hex;
}

export default function SecurityCenterPage() {
  const [runtime, setRuntime] = useState<RuntimeStatus | null>(null);
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [totpEnabled, setTotpEnabled] = useState(false);
  const [peerId, setPeerId] = useState('');
  const [fingerprint, setFingerprint] = useState('');
  const [verifyError, setVerifyError] = useState('');

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
      }
    };

    load();
  }, []);

  const verifiedPeers = useMemo(() => {
    if (typeof window === 'undefined') return {} as Record<string, string>;
    try {
      return JSON.parse(localStorage.getItem('dmVerifiedPeers') ?? '{}') as Record<string, string>;
    } catch {
      return {} as Record<string, string>;
    }
  }, []);

  const handleGenerateFingerprint = async () => {
    setVerifyError('');
    setFingerprint('');
    const sanitized = peerId.trim();
    if (!sanitized) return;

    try {
      const response = await fetch(`/api/e2ee/public-keys/${encodeURIComponent(sanitized)}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok || !data?.publicKey || !data?.signingPublicKey) {
        setVerifyError('Could not fetch peer key bundle. Ask peer for valid numeric ID.');
        return;
      }

      const payload = `${data.publicKey}|${data.signingPublicKey}|${data.e2eeVersion ?? 'legacy'}`;
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload));
      const fp = formatFingerprint(toHex(digest).slice(0, 48));
      setFingerprint(fp);
    } catch {
      setVerifyError('Fingerprint generation failed.');
    }
  };

  const markVerified = () => {
    if (!peerId.trim() || !fingerprint) return;
    const next = { ...verifiedPeers, [peerId.trim()]: fingerprint };
    localStorage.setItem('dmVerifiedPeers', JSON.stringify(next));
  };

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-50 p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Security Center</h1>
            <p className="text-sm text-zinc-400">Implementation-accurate status for encryption, sessions, and verification.</p>
          </div>
          <Link href="/chat" className="text-sm text-brand-gold hover:underline">Back to chat</Link>
        </header>

        <section className="grid md:grid-cols-2 gap-4">
          <Card title="Encrypted today" icon={<Shield className="w-5 h-5 text-emerald-400" />}>
            <ul className="text-sm text-zinc-300 space-y-1">
              <li>Direct messages: {runtime?.directMessages ?? 'loading...'}</li>
              <li>Groups: {runtime?.groups ?? 'loading...'}</li>
              <li>Channels: {runtime?.channels ?? 'loading...'}</li>
            </ul>
          </Card>
          <Card title="Transitional areas" icon={<AlertTriangle className="w-5 h-5 text-amber-400" />}>
            <ul className="text-sm text-zinc-300 space-y-1">
              <li>Ratchet status: {runtime?.ratchet ?? 'loading...'}</li>
              <li>Verification UX: {runtime?.verificationUX ?? 'loading...'}</li>
              <li>Signal-grade parity is not claimed while these are transitional.</li>
            </ul>
          </Card>
        </section>

        <section className="grid md:grid-cols-2 gap-4">
          <Card title="Device/session status" icon={<Smartphone className="w-5 h-5 text-brand-gold" />}>
            <ul className="text-sm text-zinc-300 space-y-2">
              {devices.length === 0 ? <li>No registered devices found.</li> : devices.map((d) => (
                <li key={d.deviceId} className="border border-zinc-800 rounded-lg px-3 py-2">
                  <div className="font-medium">{d.label || d.deviceId}</div>
                  <div className="text-xs text-zinc-500">Last seen: {d.lastSeenAt ? new Date(d.lastSeenAt).toLocaleString() : 'Unknown'}</div>
                  <div className="text-xs text-zinc-500">{d.isPrimary ? 'Primary device' : 'Secondary device'} • {d.isRevoked ? 'Revoked' : 'Active'}</div>
                </li>
              ))}
            </ul>
          </Card>

          <Card title="Account hardening" icon={<KeyRound className="w-5 h-5 text-brand-gold" />}>
            <p className="text-sm text-zinc-300 mb-3">2FA status: {totpEnabled ? 'Enabled' : 'Not enabled yet'}</p>
            <Link href="/chat/profile" className="text-sm text-brand-gold hover:underline">Manage 2FA and profile security</Link>
          </Card>
        </section>

        <Card title="Direct-message safety number" icon={<CheckCircle2 className="w-5 h-5 text-brand-blue" />}>
          <p className="text-sm text-zinc-400 mb-3">Enter a peer numeric ID, compare this fingerprint with your peer via a trusted channel, then mark verified.</p>
          <div className="flex flex-wrap gap-2">
            <input value={peerId} onChange={(e) => setPeerId(e.target.value)} placeholder="Peer numeric ID" className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm" />
            <button onClick={handleGenerateFingerprint} className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm">Generate</button>
            <button onClick={markVerified} disabled={!fingerprint} className="px-3 py-2 rounded-lg bg-emerald-600/80 disabled:opacity-50 text-sm">Mark verified</button>
          </div>
          {verifyError ? <p className="text-red-400 text-sm mt-2">{verifyError}</p> : null}
          {fingerprint ? <p className="mt-3 font-mono text-sm text-emerald-400">{fingerprint}</p> : null}
        </Card>
      </div>
    </main>
  );
}

function Card({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <h2 className="font-semibold">{title}</h2>
      </div>
      {children}
    </section>
  );
}
