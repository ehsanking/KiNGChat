# Runtime Topology

_Last updated: 2026-03-29_

## Current runtime model

Elahe Messenger currently runs as a single Node.js process composition root (`server.ts`) that starts:

1. Environment bootstrap + production validation.
2. Next.js request handling.
3. Socket.IO server.
4. Admin bootstrap checks.
5. Background job worker registration/start.

The startup responsibilities are now separated into focused runtime modules under `lib/runtime/*` and composed by `server.ts`.

## Runtime components

### Web/App runtime

- Next.js App Router handles HTTP routes, server actions, and API handlers.
- Session/authz validation and route-level security checks occur in app/lib layers.

### Socket runtime

- Socket.IO runs in the same process and shares auth/session + conversation access controls.
- Optional Redis adapter is enabled when `REDIS_URL` is provided.

### Worker/background jobs

- Background job registrations are initialized at startup.
- Worker execution currently shares the same process and deployment unit as web/socket runtime.

## Current deployment model

- Monolithic app container/process by default (web + socket + worker together).
- PostgreSQL is the persistence source of truth via Prisma.
- Redis remains optional for socket scaling and shared rate-limit/queue style behavior.

## Recommended future split points

When scaling/operational requirements justify it, split in this order:

1. **Worker split (first)**: run background workers in a dedicated process/container while retaining shared repo/contracts.
2. **Socket split (second)**: isolate socket gateway from web runtime when connection volume dominates.
3. **Control-plane split (optional)**: isolate admin/bootstrap workflows if strict blast-radius reduction is needed.

These split points should preserve existing authorization checks, auditability, and encrypted payload boundaries.



## Reliability-critical flow map (current)

- **Message send path**: socket `sendMessage` -> DTO parse + rate limit + fresh session -> shared `authorizeConversationAction(..., 'message.send')` -> idempotency lookup (`senderId + idempotencyKey`) -> persist -> emit -> enqueue push job.
- **Message ack path**: client `messagesDelivered` -> `markMessagesDelivered` updates only recipient-owned undelivered rows.
- **Read receipt path**: `messageRead` allows only direct-message recipient and transitions status to `READ`.
- **Reconnect/sync path**: `syncConversation` requires shared read policy before `messaging-service.syncConversation` returns bounded batch.
- **Upload path**: `/api/upload-secure` -> same-origin + fresh auth -> metadata validation -> shared `attachment.write` policy -> malware + MIME policy -> object storage + metadata index + token.
- **Download path**: `/api/upload-secure/[fileId]` -> fresh auth + token verification -> shared `conversation.read` policy -> audited download response.
- **Session validation path**: HTTP via `requireFreshAuthenticatedUser`, socket via `requireFreshSocketSession`.
- **Conversation authorization path**: centralized in `lib/conversation-access.ts` through `authorizeConversationAction`.
- **Admin bootstrap path**: `server.ts` startup -> `runAdminBootstrapOrExit` before socket handler registration.
