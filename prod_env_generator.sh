#!/bin/sh
set -eu

mkdir -p ElaheMessenger

rand_hex() { openssl rand -hex "$1"; }
rand_pass() { openssl rand -base64 36 | tr -d '\n' | tr '/+' 'AB' | cut -c1-32; }

POSTGRES_USER=elahe
POSTGRES_DB=elahe
POSTGRES_PASSWORD="$(rand_pass)"
MINIO_ACCESS_KEY=elaheminio
MINIO_SECRET_KEY="$(rand_pass)"
JWT_SECRET="$(rand_hex 32)"
SESSION_SECRET="$(rand_hex 32)"
ENCRYPTION_KEY="$(rand_hex 32)"
ADMIN_USERNAME=admin
ADMIN_PASSWORD="$(rand_pass)"
APP_URL="${APP_URL:-https://chat.example.com}"
ALLOWED_ORIGINS="${ALLOWED_ORIGINS:-$APP_URL}"

cat > ElaheMessenger/.env.production <<EOF
APP_ENV=production
NODE_ENV=production
APP_URL=${APP_URL}
ALLOWED_ORIGINS=${ALLOWED_ORIGINS}
POSTGRES_USER=${POSTGRES_USER}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
POSTGRES_DB=${POSTGRES_DB}
DATABASE_URL=postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}
MINIO_ENDPOINT=minio:9000
MINIO_ACCESS_KEY=${MINIO_ACCESS_KEY}
MINIO_SECRET_KEY=${MINIO_SECRET_KEY}
JWT_SECRET=${JWT_SECRET}
SESSION_SECRET=${SESSION_SECRET}
ENCRYPTION_KEY=${ENCRYPTION_KEY}
ADMIN_USERNAME=${ADMIN_USERNAME}
ADMIN_PASSWORD=${ADMIN_PASSWORD}
EOF

echo "Created ElaheMessenger/.env.production"
echo "Admin username: ${ADMIN_USERNAME}"
echo "Admin password: ${ADMIN_PASSWORD}"
