import { NextResponse } from 'next/server';
import { getPrometheusMetrics } from '@/lib/observability';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Prometheus-compatible metrics endpoint.
 *
 * Returns metrics in Prometheus text exposition format, suitable for
 * scraping by Prometheus, Grafana Agent, Victoria Metrics, or any
 * compatible monitoring system.
 *
 * Access control: In production, this endpoint should be protected by
 * a reverse proxy or internal-only network rule. The METRICS_TOKEN
 * (or legacy METRICS_SECRET) env var can be set to require a Bearer token.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const format = searchParams.get('format')?.toLowerCase();

  // Optional bearer-token protection for the metrics endpoint.
  const secret = process.env.METRICS_TOKEN ?? process.env.METRICS_SECRET;
  if (secret) {
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (token !== secret) {
      return new NextResponse('Unauthorized', { status: 401 });
    }
  }

  const body = getPrometheusMetrics();
  if (format === 'json') {
    return NextResponse.json({ metrics: body }, {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
  }

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}
