import { AsyncLocalStorage } from 'node:async_hooks';

type RequestContext = { requestId?: string };

const storage = new AsyncLocalStorage<RequestContext>();

export const withRequestContext = <T>(context: RequestContext, fn: () => T): T => storage.run(context, fn);

export const getRequestContext = (): RequestContext => storage.getStore() ?? {};

export const getCurrentRequestId = (): string | undefined => getRequestContext().requestId;
