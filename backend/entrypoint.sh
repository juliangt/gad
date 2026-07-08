#!/bin/sh
set -e

echo "Esperando DB..."
until python -c "import asyncio, asyncpg; asyncio.run(asyncpg.connect('${DATABASE_URL/postgresql+asyncpg/postgresql}'))" 2>/dev/null; do
  echo "DB no lista, reintentando..."
  sleep 1
done

echo "Corriendo migraciones..."
alembic upgrade head

echo "Arrancando uvicorn..."
exec uvicorn gad.main:app --host 0.0.0.0 --port 8000
