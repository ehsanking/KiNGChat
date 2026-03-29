# Crypto Status (Current Implementation)

_Last updated: 2026-03-29_

This document describes what Elahe Messenger currently implements, without roadmap marketing language.

## Implemented today

- Browser-side encryption for **direct messages** using Web Crypto primitives (`ECDH P-256`, `HKDF-SHA256`, `AES-256-GCM`).
- Client-side encrypted attachment envelope support and secure upload/download authorization routes.
- Device/public bundle APIs and transitional runtime session/bootstrap helpers for evolving E2EE flows.
- Server-side persistence of ciphertext + nonce fields for messages and encrypted draft payload fields.

## Key types currently used

- Agreement key pair (`ECDH`, `P-256`) for shared secret derivation.
- Signed pre-key material (stored/retrieved as public bundle fields).
- Optional one-time pre-key records in the runtime service.
- Symmetric conversation/file keys derived client-side and used for `AES-GCM` encryption.

## What the server can see

- User/account identifiers and membership relationships.
- Message envelope metadata (sender/recipient/group linkage, timestamps, delivery/edit/delete events).
- Ciphertext blobs, nonces, and attachment storage metadata.
- Security and operations telemetry (audit logs, auth/session checks, rate-limit signals, admin actions).

## What the server should not see (by design)

- Direct-message plaintext bodies when clients are functioning correctly.
- Private agreement keys generated and retained in the client runtime.
- Decrypted attachment contents for secure attachment flows.

## Current limitations

- Group/channel end-to-end encryption is not fully shipped.
- Full protocol-equivalent guarantees for X3DH/Double Ratchet across all paths should not be claimed yet.
- Crypto verification UX (key fingerprints/safety-number style validation) is limited.
- Multi-device behavior exists but remains transitional and should be treated as evolving.

## Previously implied but not yet complete

The following capabilities were previously implied in docs/UI language and are now classified as roadmap/transitional until implementation and review are complete:

- Fully shipped advanced ratcheting guarantees across all message paths.
- Completed X3DH/Double Ratchet parity claims.
- Zero-metadata operation claims.

