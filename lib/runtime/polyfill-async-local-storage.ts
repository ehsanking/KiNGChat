// Polyfill `globalThis.AsyncLocalStorage` for Next.js's app-render runtime.
//
// Why this exists:
// Next.js 15's `dist/server/app-render/async-local-storage.js` snapshots
// `globalThis.AsyncLocalStorage` at module load time. If the global is not
// set when that module is first required (which can happen via lazy
// transitive imports before `next-server.js` runs its own polyfill in
// `node-environment-baseline.js`), Next.js falls back to a `FakeAsyncLocalStorage`
// whose `run()/enterWith()/exit()` methods throw
// "Invariant: AsyncLocalStorage accessed in runtime where it is not available".
//
// Importing `import next from 'next'` only loads `dist/server/next.js`, which
// does NOT pull in `node-environment` — that polyfill only runs once
// `next-server.js` is loaded inside `app.prepare()`, by which point other
// internals may already have captured an undefined global.
//
// Setting the global ourselves before any Next.js code is loaded is the
// portable fix. This file MUST be the first side-effect import in every
// custom server entry point (server.ts and friends).
import { AsyncLocalStorage } from 'node:async_hooks';

type GlobalWithAls = typeof globalThis & { AsyncLocalStorage?: typeof AsyncLocalStorage };
const globalWithAls = globalThis as GlobalWithAls;
if (typeof globalWithAls.AsyncLocalStorage !== 'function') {
  globalWithAls.AsyncLocalStorage = AsyncLocalStorage;
}
