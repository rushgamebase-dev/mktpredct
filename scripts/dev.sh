#!/bin/bash
set -e

echo "=== Rush Prediction Market — Dev Environment ==="

# 1. Start infrastructure
echo "[1/3] Starting PostgreSQL + Redis..."
docker compose up -d

echo "[1/3] Waiting for PostgreSQL..."
until docker compose exec postgres pg_isready -U rush -d rushpredmkt > /dev/null 2>&1; do
  sleep 1
done
echo "[1/3] PostgreSQL ready."

# 2. Run migrations
echo "[2/3] Running database migrations..."
pnpm db:migrate

# 3. Start services
echo "[3/3] Starting API + Web..."
pnpm dev
