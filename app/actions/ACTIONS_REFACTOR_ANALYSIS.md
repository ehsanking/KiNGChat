# app/actions analysis (pre-refactor)

## Duplicate / overlapping functionality

- **Authentication**
  - `auth-legacy.ts` contained core implementations for register/login/recovery/2FA plus non-auth domains.
  - `auth-actions.ts`, `auth.actions.ts`, `auth.ts`, `auth.login.ts`, `auth.register.ts`, `auth-session.actions.ts` were overlapping barrels/wrappers.
- **2FA**
  - `auth.2fa.ts`, `twofa-actions.ts`, `security-2fa.actions.ts`, `security-2fa.actions.index.ts` duplicated 2FA exports.
- **Groups/communities**
  - `community-actions.ts`, `community.actions.ts`, `community.actions.index.ts`, `auth.groups.ts` overlapped.
- **Contacts**
  - `contact-actions.ts`, `contacts.actions.ts`, `auth.contacts.ts` overlapped.
- **Profile**
  - `profile-actions.ts`, `profile.actions.ts`, `profile.actions.index.ts`, `auth.profile.ts` overlapped.
- **Messaging**
  - `message-actions.ts`, `messaging.actions.ts`, `auth.messages.ts` overlapped.

## Circular imports

- Direct import-graph analysis for `app/actions/*.ts` found **no circular action-to-action import cycles**.

## Naming inconsistencies

- Mixed patterns existed:
  - hyphenated legacy names: `auth-actions.ts`, `message-actions.ts`, `profile-actions.ts`, etc.
  - dotted names: `auth.login.ts`, `security-2fa.actions.ts`
  - non-canonical bare names: `auth.ts`, `admin.ts`
  - `.index.ts` wrappers: `community.actions.index.ts`, `profile.actions.index.ts`, `security-2fa.actions.index.ts`

## Canonical naming introduced

- Domain-first pattern:
  - `auth.actions.ts`
  - `auth.2fa.actions.ts`
  - `auth.recovery.actions.ts`
  - `profile.actions.ts`
  - `contacts.actions.ts`
  - `groups.actions.ts`
  - `messaging.actions.ts`
  - plus `index.ts` barrel for public action imports.
