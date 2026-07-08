#!/bin/sh
set -e

echo "Esperando DB..."
# Convierte el scheme asyncpg→psycopg para asyncpg.connect() del health check.
PG_URL=$(echo "$DATABASE_URL" | sed 's|postgresql+asyncpg|postgresql|')
until python -c "import asyncio, asyncpg; asyncio.run(asyncpg.connect('$PG_URL'))" 2>/dev/null; do
  echo "DB no lista, reintentando..."
  sleep 1
done

echo "Corriendo migraciones..."
alembic upgrade head

echo "Arrancando uvicorn..."
exec uvicorn gad.main:app --host 0.0.0.0 --port 8000
