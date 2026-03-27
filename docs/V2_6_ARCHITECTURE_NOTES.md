# Elahe Messenger v2.6 Architecture Notes

Elahe Messenger v2.6 keeps the existing Next.js + Prisma + Socket.IO stack, but aligns the deployment and diagnostics model with patterns commonly used in modern messaging systems.

## Practical technology baseline for a modern messenger

- **Realtime delivery:** WebSocket / Socket.IO for presence, typing, send acknowledgements, and room fan-out.
- **Durable storage:** PostgreSQL for users, conversations, memberships, drafts, reports, and audit trails.
- **Blob storage:** local object storage for self-hosted deployments by default, with the option to wire in external MinIO/S3 later.
- **Secure attachment pipeline:** membership-aware upload/download guards, signed download tokens, MIME checks, and optional malware scanning.
- **Push delivery:** web-push / VAPID for browsers and optional Firebase integration for mobile-adjacent clients.
- **Crypto maturity:** per-user identity keys, wrapped file keys, envelope handling, and forward-secret session material.
- **Operability:** structured audit logs, health endpoints, deployment checks, and installation diagnostics.

## v2.6 implementation focus

1. Remove the hard dependency on a built-in MinIO container during install.
2. Make diagnostics modular (`scripts/doctor.mjs` and `scripts/diagnostics/*`).
3. Keep the storage layer self-hosting friendly by defaulting to local filesystem storage.
4. Refresh the visual system with a Telegram-inspired blue accent and glassy dark surfaces.
5. Split the chat workspace into smaller, reusable UI modules for easier debugging and iteration.

## Telegram-inspired UX direction

The v2.6 UI keeps Elahe Messenger branding, but adopts a more familiar blue-accent, pane-based chat experience:

- blue primary accent instead of gold-heavy emphasis,
- cleaner glass panels,
- wallpaper-like chat backdrop,
- stronger separation between sidebar, message feed, and composer.

This keeps the product recognizable for users who are already comfortable with mainstream chat layouts while preserving the self-hosted and privacy-first positioning of Elahe Messenger.

## v2.6 modular chat workspace

The main chat experience is now decomposed into focused modules so regressions are easier to isolate:

- `app/chat/ChatShell.tsx` — orchestrates desktop/mobile shell layout and shared modals.
- `app/chat/ContactSidebar.tsx` — desktop contact and community navigation.
- `app/chat/ConversationPanel.tsx` — active conversation header + body + composer composition.
- `app/chat/RealtimeMessageList.tsx` — scrollable message feed and attachment rendering.
- `app/chat/MessageComposer.tsx` — send box and attachment picker.
- `app/chat/AdminDrawer.tsx` — administration workspace separated from the chat flow.
- `app/chat/chat-types.ts` / `app/chat/chat-ui.tsx` — shared types and presentation helpers.
