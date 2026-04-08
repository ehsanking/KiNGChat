import { trace, context, SpanStatusCode } from '@opentelemetry/api';

const tracer = trace.getTracer('elahe-messenger');

export async function traceSocketOperation<T>(
  name: string,
  attributes: Record<string, string | number | boolean>,
  operation: () => Promise<T>,
): Promise<T> {
  const span = tracer.startSpan(name, { attributes });
  return context.with(trace.setSpan(context.active(), span), async () => {
    try {
      const result = await operation();
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: error instanceof Error ? error.message : 'unknown_error' });
      throw error;
    } finally {
      span.end();
    }
  });
}
