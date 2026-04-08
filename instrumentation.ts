let otelSdk: { start: () => void | Promise<void> } | null = null;

export async function register() {
  // Only run admin initialization on the server (not during build or on edge)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    if (!otelSdk) {
      const [{ NodeSDK }, { HttpInstrumentation }, { OTLPTraceExporter }, { PrismaInstrumentation }] = await Promise.all([
        import('@opentelemetry/sdk-node'),
        import('@opentelemetry/instrumentation-http'),
        import('@opentelemetry/exporter-trace-otlp-http'),
        import('@prisma/instrumentation'),
      ]);
      const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
      otelSdk = new NodeSDK({
        traceExporter: endpoint ? new OTLPTraceExporter({ url: endpoint }) : undefined,
        instrumentations: [
          new HttpInstrumentation(),
          new PrismaInstrumentation(),
        ],
      });
      await otelSdk.start();
    }

    const { initializeAdmin } = await import('./lib/auth-utils');
    await initializeAdmin();
  }
}
