'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { addReportModeratorNote, applyModerationAction, getAllReports, getReportActionHistory, resolveReport } from '@/app/actions/admin';

type ReportRow = {
  id: string;
  reporter: { id: string; username: string; numericId: string };
  reportedUser: { id: string; username: string; numericId: string; isBanned: boolean; isVerified: boolean; isApproved: boolean; createdAt: string };
  reason: string;
  status: 'PENDING' | 'RESOLVED' | 'DISMISSED';
  createdAt: string;
};

export default function ReportsInboxPage() {
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [selected, setSelected] = useState<ReportRow | null>(null);
  const [history, setHistory] = useState<Array<{ id: string; action: string; createdAt: string; details: string | null }>>([]);
  const [filter, setFilter] = useState<'ALL' | 'PENDING' | 'RESOLVED' | 'DISMISSED'>('PENDING');
  const [note, setNote] = useState('');

  const loadReports = useCallback(async () => {
    const result = await getAllReports();
    if ('reports' in result && result.reports) {
      setReports(result.reports as unknown as ReportRow[]);
      if (!selected && result.reports[0]) setSelected(result.reports[0] as unknown as ReportRow);
    }
  }, [selected]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  useEffect(() => {
    const loadHistory = async () => {
      if (!selected) return;
      const result = await getReportActionHistory(selected.id);
      if ('logs' in result && result.logs) setHistory(result.logs as any);
    };
    loadHistory();
  }, [selected]);

  const filtered = useMemo(() => reports.filter((r) => filter === 'ALL' ? true : r.status === filter), [reports, filter]);

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-50 p-6">
      <div className="mx-auto max-w-7xl grid grid-cols-1 lg:grid-cols-[360px,1fr] gap-6">
        <section className="border border-zinc-800 rounded-2xl bg-zinc-900 p-4">
          <h1 className="text-xl font-semibold mb-3">Reports Inbox</h1>
          <div className="flex gap-2 mb-3 text-xs">
            {(['PENDING', 'RESOLVED', 'DISMISSED', 'ALL'] as const).map((v) => (
              <button key={v} onClick={() => setFilter(v)} className={`px-2 py-1 rounded ${filter === v ? 'bg-brand-gold/20 text-brand-gold' : 'bg-zinc-800'}`}>{v}</button>
            ))}
          </div>
          <div className="space-y-2 max-h-[70vh] overflow-auto pr-1">
            {filtered.map((r) => (
              <button key={r.id} onClick={() => setSelected(r)} className={`w-full text-left border rounded-xl p-3 ${selected?.id === r.id ? 'border-brand-gold' : 'border-zinc-800'}`}>
                <p className="text-sm font-medium">{r.reportedUser.username}</p>
                <p className="text-xs text-zinc-500">Reporter: {r.reporter.username}</p>
                <p className="text-xs text-zinc-400 mt-1 line-clamp-2">{r.reason}</p>
                <p className="text-[10px] mt-1 text-zinc-500">{r.status} • {new Date(r.createdAt).toLocaleString()}</p>
              </button>
            ))}
          </div>
        </section>

        <section className="border border-zinc-800 rounded-2xl bg-zinc-900 p-5 space-y-4">
          {!selected ? <p className="text-zinc-400">Select a report.</p> : (
            <>
              <div>
                <h2 className="text-lg font-semibold">Report detail</h2>
                <p className="text-sm text-zinc-400">Reported user: @{selected.reportedUser.username} (#{selected.reportedUser.numericId})</p>
                <p className="text-sm text-zinc-400">Reporter: @{selected.reporter.username}</p>
              </div>
              <div className="rounded-xl border border-zinc-800 p-3 text-sm">{selected.reason}</div>

              <div className="flex flex-wrap gap-2 text-sm">
                <button onClick={async () => { await resolveReport(selected.id, 'RESOLVED'); await loadReports(); }} className="px-3 py-2 rounded bg-emerald-600/70">Resolve</button>
                <button onClick={async () => { await resolveReport(selected.id, 'DISMISSED'); await loadReports(); }} className="px-3 py-2 rounded bg-zinc-700">Dismiss</button>
                <button onClick={async () => { await applyModerationAction({ targetUserId: selected.reportedUser.id, action: 'WARN', note }); await loadReports(); }} className="px-3 py-2 rounded bg-amber-600/70">Warn</button>
                <button onClick={async () => { await applyModerationAction({ targetUserId: selected.reportedUser.id, action: 'RESTRICT_24H', note }); await loadReports(); }} className="px-3 py-2 rounded bg-orange-600/70">Restrict 24h</button>
                <button onClick={async () => { await applyModerationAction({ targetUserId: selected.reportedUser.id, action: selected.reportedUser.isBanned ? 'UNBAN' : 'BAN', note }); await loadReports(); }} className="px-3 py-2 rounded bg-red-700/70">{selected.reportedUser.isBanned ? 'Unban' : 'Ban'}</button>
                <button onClick={async () => { await applyModerationAction({ targetUserId: selected.reportedUser.id, action: selected.reportedUser.isApproved ? 'REVOKE_APPROVAL' : 'APPROVE', note }); await loadReports(); }} className="px-3 py-2 rounded bg-blue-700/70">{selected.reportedUser.isApproved ? 'Revoke approval' : 'Approve'}</button>
                <button onClick={async () => { await applyModerationAction({ targetUserId: selected.reportedUser.id, action: selected.reportedUser.isVerified ? 'UNVERIFY' : 'VERIFY', note }); await loadReports(); }} className="px-3 py-2 rounded bg-purple-700/70">{selected.reportedUser.isVerified ? 'Unverify' : 'Verify'}</button>
              </div>

              <div className="space-y-2">
                <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Moderator note" className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-sm" rows={3} />
                <button onClick={async () => { await addReportModeratorNote(selected.id, note); setNote(''); }} className="px-3 py-2 rounded bg-zinc-800 text-sm">Add note</button>
              </div>

              <div>
                <h3 className="font-medium mb-2">Action history</h3>
                <div className="space-y-2 max-h-56 overflow-auto pr-1">
                  {history.map((h) => (
                    <div key={h.id} className="border border-zinc-800 rounded-lg p-2 text-xs">
                      <p className="font-medium">{h.action}</p>
                      <p className="text-zinc-500">{new Date(h.createdAt).toLocaleString()}</p>
                      <p className="text-zinc-400 break-all">{h.details || '-'}</p>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
