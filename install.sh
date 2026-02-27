#!/bin/bash

echo "========================================"
echo "👑 Installing KiNGChat v1.0.0 👑"
echo "========================================"

# Check for Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Docker not found!"
    echo "Please install Docker first."
    echo "If you are in Iran and using Ubuntu, run:"
    echo "curl -fsSL https://raw.githubusercontent.com/manageitir/docker/main/install-ubuntu.sh | sh"
    exit 1
fi

# Check for Docker Compose
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose not found!"
    echo "Please install Docker Compose first."
    exit 1
fi

echo "✅ Docker is installed."

# Prompt for Domain and Email for SSL
echo ""
echo "--- SSL & Domain Configuration ---"
read -p "Enter your domain name (e.g., chat.example.com): " DOMAIN
read -p "Enter your email address (for Let's Encrypt SSL renewal notices): " EMAIL

# Create directory
mkdir -p /opt/kingchat
cd /opt/kingchat

echo "📥 Downloading docker-compose.yml..."
curl -fsSL https://raw.githubusercontent.com/EHSANKiNG/kingchat/main/docker-compose.yml -o docker-compose.yml

echo "⚙️ Generating Caddyfile for automatic SSL..."
cat <<EOF > Caddyfile
$DOMAIN {
    reverse_proxy app:3000
    tls $EMAIL
}
EOF

echo "🚀 Starting KiNGChat..."
docker-compose up -d

echo "========================================"
echo "✅ KiNGChat installed successfully!"
echo "🌐 Access it at: https://$DOMAIN"
echo "🔒 SSL will be automatically provisioned and renewed every 60 days."
echo "========================================"
