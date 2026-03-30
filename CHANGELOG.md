# Changelog

## Unreleased


### Authz consistency
- Added centralized conversation action policy (`authorizeConversationAction`) to enforce one policy path for socket join/send/sync/typing and secure attachment read/write authorization checks.
- Removed ad-hoc `joinGroup` membership query from socket handler and replaced it with shared policy evaluation + consistent rejection reason logging.

### Messaging reliability
- Kept server-side idempotency behavior explicit in socket send flow and aligned all conversation-level gates to shared policy checks to reduce transport drift during retries/reconnect.

### Attachments
- Hardened secure upload/download API error semantics with stable machine-readable codes (`UNAUTHENTICATED`, `MALFORMED_METADATA`, `FILE_TOO_LARGE`, `INVALID_TOKEN`, `UNAUTHORIZED_CONVERSATION`, etc.).
- Added `X-Content-Type-Options: nosniff` to secure download responses and aligned download authorization to shared read policy.

### Onboarding
- No onboarding route behavior changes in this patch; existing flow retained.

### Crypto honesty
- No new cryptographic guarantees introduced; docs continue to describe current transitional scope.

### Architecture
- Documented a reliability-critical runtime flow map in `docs/runtime-topology.md` covering send/ack/read/sync/upload/download/session/authz/bootstrap paths.

### Observability
- Preserved and expanded blocked-download metrics while keeping rejection reasons explicit and transport-consistent.

### Deferred items / risk
- Full deterministic message lifecycle state machine transition enforcement (`QUEUED -> SENT -> DELIVERED -> READ/FAILED`) remains partially distributed across socket/background paths and needs deeper integration tests with a real DB.
- Socket/API integration tests are still mostly source-regression style; transport-level runtime tests should be expanded in follow-up.


### Security and runtime hardening
- Removed startup secret-generation side effects from `server.ts`; production startup now validates required secrets and placeholders fail fast.
- Hardened installer network behavior by removing global git SSL verification disable and insecure `curl -k` usage.
- Made DNS and Docker daemon mutation in `install.sh` opt-in and declared installer Linux-only.
- Hardened installer upgrade/reinstall flow: explicit proxy preserve/regenerate prompt, deterministic reinstall directory reset, root privilege fail-fast, Docker daemon readiness gate, and post-launch container health verification before success.
- Clarified bootstrap admin semantics so env credentials are create-only by default; added explicit one-time reset gate (`ADMIN_BOOTSTRAP_RESET_EXISTING=true`).
- Removed seeded placeholder E2EE key material for bootstrap admin; account now starts with empty keys and must register client keys after login.
- Tightened same-origin enforcement to reject missing `Origin`/`Host` on protected mutation routes.
- Minimized session-cookie claims to essential auth/session fields only; user profile metadata is now loaded server-side from the database.
- Hardened secure attachment downloads with indexed metadata lookup (`fileId -> object key`), header-based token support (`x-download-token`), and retained query-token fallback for compatibility.
- Encrypted TOTP secrets at rest with AES-256-GCM and added lazy migration for legacy plaintext secrets.
- Strengthened CI with lint, typecheck, and dependency audit gates; added project `LICENSE` and package license metadata.

### Stability and operations
- Added shared environment loader policy (`.env` for production, `.env` + `.env.local` for development) and reused it in runtime/scripts.
- Split health endpoints into liveness (`/api/health/live`) and readiness (`/api/health/ready`), and kept `/api/health` as readiness compatibility route.
- Updated Docker and Compose health checks to use liveness endpoint.
- Replaced Unix-only npm start/dev env assignment with cross-platform launcher scripts and replaced `next clean` with a reliable cleanup script.

### Product trust, onboarding, moderation, and management UX
- Softened landing-page security claims to avoid overstatements (removed “zero metadata” and broad E2EE language in favor of implementation-accurate copy).
- Added authenticated post-signup onboarding flow at `/auth/onboarding` and routed new signups through it before chat.
- Reduced signup friction by making recovery questions optional at registration (still supported for account recovery).
- Added in-app Security Center at `/chat/security-center` with current crypto scope, transitional areas, device/session status, 2FA status, and peer safety-number fingerprint workflow for direct messages.
- Extended session API response with `totpEnabled` for security UX status rendering.
- Added admin Reports Inbox at `/admin/reports` with filtering, detail panel, moderator notes, linked user summary, action history, and resolution controls.
- Added auditable moderation actions (warn, temporary restrict, ban/unban, approve/revoke approval, verify/unverify) with `AuditLog` entries and session version bump on access-changing actions.
- Extended admin observability page with manager-readable KPI cards (registrations, login failure rate, 2FA adoption, DAU/WAU proxy, message failure rate, reports, moderation actions, attachment usage).
- Added regression tests covering onboarding route integration, security-center honesty/fingerprint UX, and admin reports/KPI authorization surface.
