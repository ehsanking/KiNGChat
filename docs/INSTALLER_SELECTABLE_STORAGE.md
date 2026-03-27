# Selectable Storage Installer

This wrapper adds a storage-backend choice in front of the main Elahe Messenger installer for cases where the repository is not indexed and the original `install.sh` still assumes a `minio` Compose service exists.

## Why this exists

The current `docker-compose.yml` removes the built-in `minio` service and documents local filesystem storage as the default, but the original installer still contains hard-coded `db minio` launch steps. That mismatch causes `no such service: minio` during installation.

## What this wrapper does

`install.selectable-storage.sh` downloads the current `install.sh`, patches it in a temporary directory, and runs the patched copy.

It adds three modes:

1. **Auto detect** — use MinIO only if `docker compose config --services` includes `minio`
2. **Local storage** — force filesystem storage and never start MinIO
3. **Force MinIO** — require a `minio` service in Compose and fail fast if it does not exist

## Usage

```bash
curl -fsSL https://raw.githubusercontent.com/ehsanking/Elahe Messenger/feat/selectable-storage-installer-wrapper/install.selectable-storage.sh | bash
```

After launch, pick the storage mode you want.

## Recommended mode

For the current main branch, **Local storage** or **Auto detect** is recommended because `docker-compose.yml` does not define a `minio` service.
