import crypto from 'crypto';

/**
 * Observability module with improved metric storage.
 *
 * Improvements over original:
 * - Histogram support for latency tracking.
 * - Prometheus-compatible text export format via getPrometheusMetrics().
 * - Metric label cardinality protection (max labels per metric).
 * - Timestamp tracking for metric freshness.
 */

type MetricLabels = Record<string, string | number | boolean | null | undefined>;

const MAX_LABEL_CARDINALITY = 100;

const metrics = new Map<string, number>();
const gauges = new Map<string, number>();
const histograms = new Map<string, number[]>();
const startedAt = Date.now();
let lastUpdatedAt = Date.now();

const normalizeLabels = (labels?: MetricLabels) => {
  if (!labels) return '';
  const entries = Object.entries(labels)
    .filter(([, value]) => value !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));
  if (entries.length === 0) return '';
  return entries.map(([key, value]) => `${key}=${String(value)}`).join(',');
};

const metricKey = (name: string, labels?: MetricLabels) => {
  const suffix = normalizeLabels(labels);
  return suffix ? `${name}{${suffix}}` : name;
};

const enforceCardinality = (store: Map<string, unknown>, name: string) => {
  // Protect against label explosion
  const prefix = name.split('{')[0];
  let count = 0;
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) count++;
  }
  if (count > MAX_LABEL_CARDINALITY) {
    // Remove oldest entries for this metric
    for (const key of store.keys()) {
      if (key.startsWith(prefix)) {
        store.delete(key);
        break;
      }
    }
  }
};

export const incrementMetric = (
  name: string,
  value = 1,
  labels?: MetricLabels,
) => {
  const key = metricKey(name, labels);
  enforceCardinality(metrics, key);
  metrics.set(key, (metrics.get(key) ?? 0) + value);
  lastUpdatedAt = Date.now();
};

export const setGauge = (
  name: string,
  value: number,
  labels?: MetricLabels,
) => {
  const key = metricKey(name, labels);
  enforceCardinality(gauges, key);
  gauges.set(key, value);
  lastUpdatedAt = Date.now();
};

/**
 * Record a histogram observation (e.g., request latency in ms).
 */
export const observeHistogram = (
  name: string,
  value: number,
  labels?: MetricLabels,
) => {
  const key = metricKey(name, labels);
  enforceCardinality(histograms, key);
  const observations = histograms.get(key) ?? [];
  observations.push(value);
  // Keep only last 1000 observations to bound memory
  if (observations.length > 1000) {
    observations.splice(0, observations.length - 1000);
  }
  histograms.set(key, observations);
  lastUpdatedAt = Date.now();
};

export const getMetricsSnapshot = () => ({
  startedAt,
  lastUpdatedAt,
  uptimeMs: Date.now() - startedAt,
  counters: Array.from(metrics.entries()).map(([name, value]) => ({ name, value })),
  gauges: Array.from(gauges.entries()).map(([name, value]) => ({ name, value })),
  histograms: Array.from(histograms.entries()).map(([name, observations]) => ({
    name,
    count: observations.length,
    sum: observations.reduce((a, b) => a + b, 0),
    avg: observations.length > 0 ? observations.reduce((a, b) => a + b, 0) / observations.length : 0,
    p50: percentile(observations, 0.5),
    p95: percentile(observations, 0.95),
    p99: percentile(observations, 0.99),
  })),
});

/**
 * Export metrics in Prometheus text exposition format.
 * This can be scraped by Prometheus, Grafana Agent, or any compatible system.
 */
export const getPrometheusMetrics = (): string => {
  const lines: string[] = [];

  lines.push(`# HELP process_uptime_seconds Process uptime in seconds`);
  lines.push(`# TYPE process_uptime_seconds gauge`);
  lines.push(`process_uptime_seconds ${((Date.now() - startedAt) / 1000).toFixed(1)}`);

  const toPromMetricName = (name: string, fallbackPrefix: 'counter' | 'gauge' | 'histogram') => {
    const normalized = name.replace(/[^a-zA-Z0-9_]/g, '_');
    if (normalized.startsWith('elahe_')) return normalized;
    if (fallbackPrefix === 'counter') return `elahe_${normalized}`;
    return `elahe_${fallbackPrefix}_${normalized}`;
  };

  for (const [key, value] of metrics) {
    const promKey = toPromMetricName(key, 'counter').replace(/\{.*\}/, '');
    lines.push(`# TYPE ${promKey} counter`);
    lines.push(`${promKey} ${value}`);
  }

  for (const [key, value] of gauges) {
    const promKey = toPromMetricName(key, 'gauge').replace(/\{.*\}/, '');
    lines.push(`# TYPE ${promKey} gauge`);
    lines.push(`${promKey} ${value}`);
  }

  for (const [key, observations] of histograms) {
    const promKey = toPromMetricName(key, 'histogram').replace(/\{.*\}/, '');
    const sum = observations.reduce((a, b) => a + b, 0);
    lines.push(`# TYPE ${promKey} histogram`);
    lines.push(`${promKey}_count ${observations.length}`);
    lines.push(`${promKey}_sum ${sum}`);
  }

  return lines.join('\n') + '\n';
};

const percentile = (sorted: number[], p: number): number => {
  if (sorted.length === 0) return 0;
  const copy = [...sorted].sort((a, b) => a - b);
  const index = Math.ceil(copy.length * p) - 1;
  return copy[Math.max(0, index)];
};

export const createRequestId = () => crypto.randomUUID();

export const getRequestIdFromHeaders = (headersLike: Headers | { get(name: string): string | null }) =>
  headersLike.get('x-request-id') || headersLike.get('x-correlation-id') || createRequestId();

/**
 * Timer utility for measuring operation duration and recording it as a histogram.
 */
export const createTimer = (metricName: string, labels?: MetricLabels) => {
  const start = performance.now();
  return {
    end: () => {
      const duration = performance.now() - start;
      observeHistogram(metricName, duration, labels);
      return duration;
    },
  };
};
