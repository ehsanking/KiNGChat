# Threat Model

_Last updated: 2026-03-29_

## Threat assumptions

- Attackers may obtain network visibility between client and server.
- Attackers may attempt credential stuffing, abuse, spam, or token replay.
- Operators may be honest-but-curious; platform design should minimize plaintext exposure.
- Endpoint compromise (malware on user device/browser) is out of scope for server-side controls and can bypass E2EE expectations.

## Server trust model

The server is trusted for:

- Authentication, authorization, policy enforcement, and abuse controls.
- Message/attachment routing, persistence, and delivery state.
- Audit logging and moderation workflows.

The server is **not** intended to require plaintext message content for core direct-message functionality.

## Operator trust model

Self-hosted operators can access infrastructure-level data and logs. They should be treated as having potential access to:

- Metadata: user IDs, conversation/group membership, timestamps, IP/session signals, moderation/audit trails.
- Ciphertext payloads and attachment objects.

Operators should not have access to client private keys unless endpoints are compromised or custom unsafe modifications are introduced.

## Data visibility and encryption boundaries

### Encrypted (intended)

- Direct-message content in transit/at rest as ciphertext.
- Secure attachment payload contents.

### Visible to server/operator

- Account and relationship metadata.
- Conversation membership and routing data.
- Message lifecycle metadata (send/edit/delete/delivery timestamps).
- Security operations data (rate-limit events, login telemetry, admin audit records).

## Current limitations

- Group/channel E2EE is not complete.
- Advanced ratcheting guarantees are transitional and should not be treated as fully finalized protocol guarantees.
- Verification UX for key authenticity remains limited for non-expert users.

## Future hardening opportunities

- Stronger key verification UX (safety numbers/fingerprints with clear user flows).
- Dedicated worker/runtime split to reduce blast radius.
- Additional metadata minimization controls and configurable retention policies.
- Optional hardware-backed secret management for server-side operational secrets.

