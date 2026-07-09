#!/usr/bin/env bash
# Corre la suite de tests dentro de Docker.
#
# Construye la imagen de tests (Dockerfile.test) si hace falta y ejecuta
# pytest en un contenedor con acceso al socket de Docker, de forma que
# testcontainers pueda levantar los contenedores de Postgres/Redis hermanos.
#
# Uso:
#   ./run-tests-docker.sh                              # toda la suite
#   ./run-tests-docker.sh tests/test_health.py -v      # un archivo
#   PYTEST_ARGS="-k auth" ./run-tests-docker.sh        # expresión -k
#
# Variables de entorno:
#   PYTEST_ARGS  argumentos extra para pytest (default: sin args = toda la suite)
#   NO_BUILD=1   salta el build si la imagen ya está al día
set -euo pipefail

cd "$(dirname "$0")/.."   # raíz del repo (contexto relativo a backend/)

IMAGE="gad-backend-test:latest"

if [ "${NO_BUILD:-0}" != "1" ]; then
  echo "==> Construyendo imagen de tests ($IMAGE)..."
  docker build -f backend/Dockerfile.test -t "$IMAGE" backend
fi

echo "==> Corriendo pytest en Docker..."
# Notas sobre testcontainers dentro de un contenedor:
#   - TESTCONTAINERS_RYUK_DISABLED: evita levantar el contenedor "reaper" (ryuk),
#     que no es alcanzable desde dentro de otro contenedor.
#   - TESTCONTAINERS_HOST_OVERRIDE: los contenedores hermanos publican puertos en
#     el host de Docker; desde el contenedor de tests se alcanzan vía
#     host.docker.internal en lugar de localhost.
#   - --add-host=host.docker.internal:host-gateway: resuelve el alias en Linux
#     (CI). En Docker Desktop (Mac/Windows) ya existe por defecto.
docker run --rm \
  -v /var/run/docker.sock:/var/run/docker.sock \
  --add-host=host.docker.internal:host-gateway \
  -e DOCKER_HOST=unix:///var/run/docker.sock \
  -e TESTCONTAINERS_RYUK_DISABLED=true \
  -e TESTCONTAINERS_HOST_OVERRIDE=host.docker.internal \
  "$IMAGE" \
  pytest ${PYTEST_ARGS:-$*}
