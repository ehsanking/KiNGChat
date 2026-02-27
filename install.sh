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

# Create directory
mkdir -p /opt/kingchat
cd /opt/kingchat

echo "📥 Downloading docker-compose.yml..."
curl -fsSL https://raw.githubusercontent.com/EHSANKiNG/kingchat/main/docker-compose.yml -o docker-compose.yml

echo "🚀 Starting KiNGChat..."
docker-compose up -d

echo "========================================"
echo "✅ KiNGChat installed successfully!"
echo "🌐 Access it at: http://localhost:3000"
echo "========================================"
