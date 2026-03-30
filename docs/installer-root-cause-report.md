# Installer Root-Cause Report (March 30, 2026)

## What failed

1. **Piped/non-interactive installs could hang indefinitely** during fresh install.
2. **Domain-mode post-install health probe could fail even when services were healthy**.
3. **Non-interactive runs with existing deployments could block on prompts or continue ambiguously**.

## Why it failed

### 1) Non-interactive admin bootstrap prompt loop
- Fresh install always prompts for admin password mode.
- Default mode selected `provide password`.
- In piped/non-interactive execution there is no usable TTY for secret input.
- Password prompt returned empty values repeatedly, causing a never-ending loop.

### 2) Domain-mode health check used an IP URL that bypassed domain routing assumptions
- Installer validated reverse proxy health using `http://127.0.0.1/api/health/live`.
- In domain-mode Caddy config, host-based routing/redirect behavior may not treat `127.0.0.1` as the configured site host.
- Result: false negative install failures despite app/db being healthy.

### 3) Prompt-driven decisions were not deterministic without TTY
- Existing-install mode selection and proxy behavior relied on interactive prompts.
- In non-interactive contexts this could lead to unintended defaults or blocked flows without explicit operator intent.

## What was changed

1. Added explicit **non-interactive mode detection** (`INSTALL_NONINTERACTIVE=true` or no TTY) and deterministic behavior.
2. Added **non-interactive install controls**:
   - `INSTALL_MODE=fresh|upgrade|reinstall`
   - `INSTALL_USE_DOMAIN=true|false`
   - `INSTALL_DOMAIN_NAME`
   - `INSTALL_SSL_EMAIL`
3. Implemented **safe non-interactive admin bootstrap**:
   - Uses `ADMIN_USERNAME` / `ADMIN_PASSWORD` if provided and valid.
   - Otherwise auto-generates strong credentials and enforces first-login password change.
   - Fails fast with actionable errors when invalid env values are supplied.
4. Made **port conflict handling deterministic**:
   - non-interactive runs now fail explicitly instead of continuing with uncertain behavior.
5. Fixed **domain-mode reverse proxy verification**:
   - probes Caddy using host-resolved request (`--resolve <domain>:80:127.0.0.1`) and accepts expected redirect/success status codes.
6. Added regression assertions in installer tests to ensure these protections remain in place.

## Why the fix is correct

- Eliminates TTY-dependent logic from required bootstrap path in non-interactive mode.
- Makes installer decisions explicit, reproducible, and scriptable for automation.
- Preserves current security posture (strong secret requirements, no secret printing, strict validation).
- Keeps idempotent behavior for upgrades/reinstalls by preserving existing env/config unless explicit regeneration is selected.
- Avoids false negatives in domain deployments by validating routing with the configured host semantics.
