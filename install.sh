#!/bin/bash
# KiNGChat Professional Installer
# 👑 The Secure Messenger for the Private Era

set -e

# Colors for output
GOLD='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${GOLD}👑 KiNGChat Installation Started...${NC}"

# Check for Git
if ! [ -x "$(command -v git)" ]; then
  echo -e "${BLUE}Installing Git...${NC}"
  sudo apt-get update && sudo apt-get install -y git
fi

# Check for Docker
if ! [ -x "$(command -v docker)" ]; then
  echo -e "${BLUE}Docker not found. Please install Docker first or use the Iran-optimized script in README.${NC}"
  exit 1
fi

# Clone Repository
REPO_URL="https://github.com/ehsanking/KiNGChat.git"
TARGET_DIR="KiNGChat"

if [ ! -d "$TARGET_DIR" ]; then
    echo -e "${BLUE}Cloning repository into $TARGET_DIR...${NC}"
    git clone "$REPO_URL" "$TARGET_DIR"
else
    echo -e "${BLUE}Directory $TARGET_DIR already exists. Updating...${NC}"
    cd "$TARGET_DIR" && git pull && cd ..
fi

# Navigate to directory
cd "$TARGET_DIR"

# Start Services
echo -e "${GOLD}Starting KiNGChat services with Docker Compose...${NC}"
if [ -x "$(command -v docker-compose)" ]; then
    docker-compose up -d
else
    docker compose up -d
fi

echo -e "${GOLD}✅ KiNGChat is now running!${NC}"
echo -e "${BLUE}Access your dashboard at http://localhost:3000${NC}"
