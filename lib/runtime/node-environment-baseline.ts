// This file must be imported BEFORE any module that touches Next.js internals
// (e.g. `next`, `@/lib/server/http-server`, etc.).
//
// Next.js 15 expects `globalThis.AsyncLocalStorage` to be populated by the
// time its server modules are evaluated. When Next.js is started through its
// own CLI (`next start`) or via the generated `.next/standalone/server.js`,
// Next.js loads `next/dist/server/node-environment-baseline.js` first, which
// installs the polyfill. Custom servers that boot Next.js via `tsx`
// (see `server.ts` → `lib/server/http-server.ts`) skip that bootstrap chain,
// so we install the same baseline here before any `next` import executes.
//
// The implementation intentionally mirrors Next.js' own
// `packages/next/src/server/node-environment-baseline.ts` so behaviour stays
// consistent with the upstream runtime.

// expose AsyncLocalStorage on global for react usage if it isn't already provided by the environment
if (typeof (globalThis as { AsyncLocalStorage?: unknown }).AsyncLocalStorage !== 'function') {
  const { AsyncLocalStorage } = require('async_hooks') as typeof import('async_hooks');
  (globalThis as { AsyncLocalStorage?: unknown }).AsyncLocalStorage = AsyncLocalStorage;
}

export {};
