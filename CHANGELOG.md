# Changelog

## 1.0.0 — 2026-04-11

First integrated production release. Elahe Messenger now ships on Next.js
15.5 + React 19.2 + Prisma 6.19 + Socket.IO 4.8 with the full product,
security, and runtime surface exercised by 238 regression tests and a
clean production `next build`.

### Runtime fixes
- Fixed a crash loop that prevented the `elahe-app` container from starting on
  a fresh install: `Error: Invariant: AsyncLocalStorage accessed in runtime
  where it is not available`. Next.js 15 expects `globalThis.AsyncLocalStorage`
  to be populated before any of its app-render modules are evaluated. When the
  Next.js CLI boots the server it installs that polyfill via
  `next/dist/server/node-environment-baseline.js`. The custom
  `server.ts` entry (which is launched through `tsx` so it can attach
  Socket.IO) bypasses that bootstrap chain, so the `work-async-storage-instance`
  module ended up constructing a `FakeAsyncLocalStorage` whose `.run()` method
  unconditionally throws the invariant error.
  Added `lib/runtime/node-environment-baseline.ts` (a direct mirror of the
  upstream Next.js baseline) and import it as the very first statement of
  `server.ts`, `server-api.ts`, and `server-worker.ts` so the polyfill runs
  before any `next` import is evaluated. Verified end-to-end via a smoke boot
  of `server.ts` that now reaches `> Ready on http://0.0.0.0:3999` with zero
  Invariant errors.
- Removed an ESM-hoisting bug in `server-api.ts` / `server-worker.ts` where
  `process.env.RUNTIME_MODE = '...'` was written *after* the hoisted
  `import './server'` statement and therefore never took effect. The runtime
  mode is now propagated from `scripts/start-server.mjs` (`env.RUNTIME_MODE`)
  before the child is spawned, which means split `api` / `worker` deployments
  actually honour their mode.

### Dependency alignment
Bumped first-party dependencies to the latest patch/minor releases that are
known-compatible with Next.js 15.5 + React 19.2. Held back deliberately on
every major version that would introduce breaking changes (`next@16`,
`prisma@7`, `typescript@6`, `zod@4`, `eslint@10`, `vitest@4`,
`@types/node@25`, `pino@10`).

- `next` 15.5.14 → 15.5.15 (patch)
- `eslint-config-next` 15.5.14 → 15.5.15 (patch, must match `next`)
- `react` 19.2.4 → 19.2.5 (patch)
- `react-dom` 19.2.4 → 19.2.5 (patch, must match `react`)
- `tailwindcss` 4.1.11 → 4.2.2 (minor, v4 line)
- `@tailwindcss/postcss` 4.1.11 → 4.2.2 (minor, must match `tailwindcss`)
- `lucide-react` 0.553.0 → ^1.8.0 (latest stable major)
- `argon2` 0.41.1 → ^0.44.0 (latest stable)
- `redis` 4.7.1 → ^5.11.0 (major upgrade)
- `@auth/core` 0.41.0 → ^0.41.1
- `@aws-sdk/client-s3` / `@aws-sdk/s3-request-presigner` ^3.1027.0 → ^3.1029.0
- `postcss` 8.5.8 → 8.5.9 (patch)
- `bullmq` ^5.73.1 → ^5.73.4 (patch)
- `@types/node` ^22.16.0 → ^22.19.17 (stays on the Node 22 LTS line)

`@prisma/client`, `prisma`, and `@prisma/instrumentation` are pinned to
`^6.19.3` and resolve against the same major/minor, which is the newest
compatible trio for this stack. `tsx@4.21.0`, `typescript@5.9.3`,
`zod@3.25.76`, and the Socket.IO 4.8.x family are already at the latest
stable on their current major lines.

### Security overrides
Added an `overrides` block in `package.json` so transitive dependencies
resolve to patched versions:

- `serialize-javascript` → `^7.0.5` (fixes 4 HIGH severity CVEs in the
  `workbox-webpack-plugin` dependency chain)
- `glob` → `^11.0.2`, `rimraf` → `^6.0.1`, `minimatch` → `^10.0.3`,
  `brace-expansion` → `^5.0.5`, `fraction.js` → `5.3.4`

`npm audit --audit-level=high` reports zero vulnerabilities at release time.

### Bug fixes and code quality
- Fixed TypeScript deprecation warning `TS5101` in `tsconfig.json` by adding
  `"ignoreDeprecations": "6.0"` to silence the `baseUrl` deprecation for
  TypeScript 7.0 compatibility.
- Fixed `withRateLimit` in `lib/rate-limit.ts`: removed unnecessary `async`
  keyword from the outer function since it performs no async work itself.
  Callers no longer need to `await` the wrapper — it now directly returns the
  handler function as expected.

### Security and runtime hardening
- Removed startup secret-generation side effects from `server.ts`; production
  startup now validates required secrets and placeholders fail fast.
- Hardened installer network behavior by removing global git SSL verification
  disable and insecure `curl -k` usage.
- Made DNS and Docker daemon mutation in `install.sh` opt-in and declared the
  installer Linux-only.
- Hardened installer upgrade/reinstall flow: explicit proxy preserve/regenerate
  prompt, deterministic reinstall directory reset, root privilege fail-fast,
  Docker daemon readiness gate, and post-launch container health verification
  before success.
- Clarified bootstrap admin semantics so env credentials are create-only by
  default; added explicit one-time reset gate (`ADMIN_BOOTSTRAP_RESET_EXISTING=true`).
- Removed seeded placeholder E2EE key material for bootstrap admin; the account
  now starts with empty keys and must register client keys after login.
- Tightened same-origin enforcement to reject missing `Origin` / `Host` on
  protected mutation routes.
- Minimized session-cookie claims to essential auth/session fields only; user
  profile metadata is now loaded server-side from the database.
- Hardened secure attachment downloads with indexed metadata lookup
  (`fileId -> object key`), header-based token support (`x-download-token`),
  and retained query-token fallback for compatibility.
- Encrypted TOTP secrets at rest with AES-256-GCM and added lazy migration
  for legacy plaintext secrets.
- Replaced insecure `Math.random()` OAuth nonce generation with
  cryptographically secure `crypto.randomUUID()` / `crypto.getRandomValues`.
- Strengthened CI with lint, typecheck, and dependency audit gates; added
  project `LICENSE` and package license metadata.
- Pinned apk package versions in Docker images and restricted GitHub Actions
  token permissions to the minimum required scopes.

### Authz consistency
- Added centralized conversation action policy (`authorizeConversationAction`)
  to enforce one policy path for socket join/send/sync/typing and secure
  attachment read/write authorization checks.
- Removed ad-hoc `joinGroup` membership query from the socket handler and
  replaced it with shared policy evaluation + consistent rejection reason
  logging.

### Messaging reliability
- Kept server-side idempotency behavior explicit in the socket send flow and
  aligned all conversation-level gates to shared policy checks to reduce
  transport drift during retries/reconnect.

### Attachments
- Hardened secure upload/download API error semantics with stable
  machine-readable codes (`UNAUTHENTICATED`, `MALFORMED_METADATA`,
  `FILE_TOO_LARGE`, `INVALID_TOKEN`, `UNAUTHORIZED_CONVERSATION`, etc.).
- Added `X-Content-Type-Options: nosniff` to secure download responses and
  aligned download authorization to the shared read policy.

### Stability and operations
- Added a shared environment loader policy (`.env` for production,
  `.env` + `.env.local` for development) and reused it in runtime/scripts.
- Split health endpoints into liveness (`/api/health/live`) and readiness
  (`/api/health/ready`), and kept `/api/health` as a readiness compatibility
  route.
- Updated Docker and Compose health checks to use the liveness endpoint.
- Replaced Unix-only npm start/dev env assignment with cross-platform launcher
  scripts and replaced `next clean` with a reliable cleanup script.
- Fixed Alpine package install failures in the Docker build and made apk
  version pinning optional in the production image.
- Upgraded GitHub Actions to the Node 24 runtime and fixed shellcheck
  findings in install and entrypoint scripts.

### Product, onboarding, moderation, and management UX
- Softened landing-page security claims to avoid overstatements (removed
  "zero metadata" and broad E2EE language in favor of implementation-accurate
  copy).
- Added an authenticated post-signup onboarding flow at `/auth/onboarding` and
  routed new signups through it before chat.
- Reduced signup friction by making recovery questions optional at registration
  (still supported for account recovery).
- Added an in-app Security Center at `/chat/security-center` with current
  crypto scope, transitional areas, device/session status, 2FA status, and a
  peer safety-number fingerprint workflow for direct messages.
- Extended the session API response with `totpEnabled` for security UX status
  rendering.
- Added an admin Reports Inbox at `/admin/reports` with filtering, detail
  panel, moderator notes, linked user summary, action history, and resolution
  controls.
- Added auditable moderation actions (warn, temporary restrict, ban/unban,
  approve/revoke approval, verify/unverify) with `AuditLog` entries and
  session version bump on access-changing actions.
- Extended the admin observability page with manager-readable KPI cards
  (registrations, login failure rate, 2FA adoption, DAU/WAU proxy, message
  failure rate, reports, moderation actions, attachment usage).
- Added regression tests covering onboarding route integration,
  security-center honesty/fingerprint UX, and the admin reports/KPI
  authorization surface.

### Architecture and observability
- Documented a reliability-critical runtime flow map in
  `docs/runtime-topology.md` covering
  send/ack/read/sync/upload/download/session/authz/bootstrap paths.
- Preserved and expanded blocked-download metrics while keeping rejection
  reasons explicit and transport-consistent.

### Release metadata
- Bumped the project description in `package.json` to match the messaging
  stack (`Next.js 15 + React 19 + Prisma 6 + Socket.IO`).
- Version `1.0.0` is pinned in `package.json` and tagged `v1.0.0` in git.

### Verified at release
- `npm ci` — 1030 packages installed, 0 vulnerabilities.
- `npm run lint` — clean, zero warnings at `--max-warnings=0`.
- `npm run typecheck` — clean.
- `npm run test` — 62 test files, 238/238 tests passing.
- `npm run build` — 49 routes generated, production bundle emitted.
- `npm audit --audit-level=high` — 0 vulnerabilities.

### Deferred items / known follow-ups
- Full deterministic message lifecycle state machine transition enforcement
  (`QUEUED -> SENT -> DELIVERED -> READ/FAILED`) remains partially distributed
  across socket/background paths and needs deeper integration tests with a
  real DB.
- Socket/API integration tests are still mostly source-regression style;
  transport-level runtime tests should be expanded in follow-up releases.
- Major version upgrades (`next@16`, `prisma@7`, `typescript@6`, `zod@4`,
  `eslint@10`, `vitest@4`, `@types/node@25`, `pino@10`) are intentionally
  deferred until the upstream ecosystems stabilise; this release tracks the
  latest LTS-friendly minor/patch stream instead.
