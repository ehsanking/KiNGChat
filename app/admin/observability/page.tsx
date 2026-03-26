import { prisma } from '@/lib/prisma';
import { getMetricsSnapshot } from '@/lib/observability';
import { getBackgroundQueueSnapshot } from '@/lib/task-queue';
import { getObjectStorageMode, getObjectStorageRoot } from '@/lib/object-storage';
import { getShardingStrategy } from '@/lib/sharding';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getSessionFromCookieHeader } from '@/lib/session';

export default async function ObservabilityPage() {
  // Ensure only administrators can access observability data.  Without this guard,
  // operational metrics and audit logs could be leaked to unauthorised users.
  const cookieHeader = cookies().toString();
  const session = getSessionFromCookieHeader(cookieHeader);
  if (!session || session.role !== 'ADMIN') {
    // Redirect non‑admin users to the home page.  Using a server redirect avoids
    // rendering any sensitive content on the client.  You could also throw a
    // 404 here to obfuscate the existence of the page.
    redirect('/');
  }

  const [queue, metrics] = await Promise.all([
    getBackgroundQueueSnapshot(),
    Promise.resolve(getMetricsSnapshot()),
  ]);
  const latestAudit = await prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 10 });
  const reactionCount = await prisma.messageReaction.count().catch(() => 0);
  const draftCount = await prisma.messageDraft.count().catch(() => 0);
  const shard = getShardingStrategy();

  return (
    <main className="mx-auto max-w-5xl p-6 space-y-8">
      <section>
        <h1 className="text-2xl font-semibold">Observability Dashboard</h1>
        <p className="text-sm opacity-80">Phase B/C operational snapshot for messaging, queues, storage, and audit.</p>
      </section>
      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border p-4">
          <h2 className="font-medium">Queue</h2>
          <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(queue, null, 2)}</pre>
        </div>
        <div className="rounded-xl border p-4">
          <h2 className="font-medium">Metrics</h2>
          <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(metrics, null, 2)}</pre>
        </div>
        <div className="rounded-xl border p-4">
          <h2 className="font-medium">Storage</h2>
          <pre className="text-xs whitespace-pre-wrap">
            {JSON.stringify({ mode: getObjectStorageMode(), root: getObjectStorageRoot() }, null, 2)}
          </pre>
        </div>
        <div className="rounded-xl border p-4">
          <h2 className="font-medium">Sharding</h2>
          <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(shard, null, 2)}</pre>
        </div>
        <div className="rounded-xl border p-4">
          <h2 className="font-medium">Messaging</h2>
          <pre className="text-xs whitespace-pre-wrap">{JSON.stringify({ reactionCount, draftCount }, null, 2)}</pre>
        </div>
      </section>
      <section className="rounded-xl border p-4">
        <h2 className="font-medium mb-3">Latest audit events</h2>
        <div className="space-y-2">
          {latestAudit.map((entry) => (
            <div key={entry.id} className="border-b pb-2 text-sm">
              <div className="font-medium">{entry.action}</div>
              <div>{entry.createdAt.toISOString()}</div>
              <div className="opacity-70">{entry.details || '-'}</div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
