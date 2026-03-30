# Installer Verification Checklist

## 1) Install command

### One-line pipe mode
```bash
curl -fsSL https://raw.githubusercontent.com/ehsanking/ElaheMessenger/main/install.sh | ( [ "$(id -u)" -eq 0 ] && bash || sudo bash )
```

### Local-file mode
```bash
curl -fsSLo install.sh https://raw.githubusercontent.com/ehsanking/ElaheMessenger/main/install.sh
sudo bash install.sh
```

### Non-interactive reproducible mode
```bash
sudo INSTALL_NONINTERACTIVE=true INSTALL_MODE=fresh INSTALL_USE_DOMAIN=false INSTALL_REF=<tag-or-commit> bash install.sh
```

## 2) Expected container state

```bash
cd ElaheMessenger
docker compose ps
```

Expected:
- `db` => `healthy`
- `app` => `healthy`
- `caddy` => `running`

## 3) Expected health endpoints

```bash
curl -fsS http://127.0.0.1/api/health/live
curl -fsS http://127.0.0.1/api/health/ready
```

Expected:
- Both return JSON with HTTP 200 in IP-only mode.

Domain mode host-routed probe:
```bash
curl -sS --resolve <domain>:80:127.0.0.1 -o /dev/null -w '%{http_code}\n' http://<domain>/api/health/live
```

Expected:
- `200` or redirect status (`301/302/307/308`) depending on HTTP->HTTPS policy.

## 4) Expected URL behavior

- IP-only install: `APP_URL=http://<server-ip>` and local health should pass via `http://127.0.0.1/api/health/live`.
- Domain install: Caddy routes requests for configured host; installer verifies host-routed local probe and warns if external DNS/TLS propagation is still pending.

## 5) Admin bootstrap validation

```bash
cd ElaheMessenger
docker compose exec -T db sh -lc 'PGPASSWORD="$POSTGRES_PASSWORD" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "SELECT COUNT(*) FROM \"User\" WHERE role = '\''ADMIN'\'';"'
```

Expected:
- Exactly one bootstrap admin on first install.
