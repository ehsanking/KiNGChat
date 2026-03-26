# KiNGChat v3.3 release notes

This package focuses on four user-facing priorities:

1. Simpler onboarding and registration
   - registration copy rewritten in plain language
   - confirm-password field removed from the UI
   - public settings fetched first so captcha is only shown when enabled
   - default first-run settings now keep captcha disabled unless the admin enables it

2. Clear in-conversation security status
   - direct chats now show whether verified E2EE is active
   - group/file access messaging is shown in the conversation header

3. More reliable sending, offline queueing, and drafts
   - outgoing messages get local delivery states
   - offline messages are queued locally and flushed on reconnect
   - per-conversation drafts are auto-saved through `/api/drafts` and local storage fallback
   - retry action added for failed messages

4. Stronger secure file UX
   - chat UI now uses `/api/upload-secure` instead of the retired public upload route
   - conversation-bound secure download URLs are used in message attachments

## Validation notes
- Source package updated to version 3.3.0
- A full dependency install/build was not possible in the container because `node_modules` are absent in the provided release archive, so no full Next.js production build could be executed here.
