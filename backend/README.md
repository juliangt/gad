# GAD Backend

API FastAPI para GAD. Ver [`../README.md`](../README.md) para el contexto del proyecto.

## Desarrollo

```bash
cd backend
uv sync            # instala dependencias en .venv
uv run pytest      # corre los tests
uv run uvicorn gad.main:app --reload  # levanta la API
```

Variables de entorno en `.env` (ver `.env.example`).

## Tests en Docker

Los tests usan [testcontainers](https://testcontainers.com/), que levanta
contenedores efímeros de Postgres/Redis por test. Para correrlos dentro de
Docker (sin instalar nada localmente) usá el script:

```bash
# Toda la suite (construye la imagen si hace falta)
./run-tests-docker.sh

# Un subset
./run-tests-docker.sh tests/test_auth_login.py -v

# Saltar el rebuild si la imagen ya está al día
NO_BUILD=1 ./run-tests-docker.sh
```

El script construye `Dockerfile.test` (imagen con dependencias de desarrollo y
la carpeta `tests/`) y ejecuta pytest en un contenedor con acceso al socket de
Docker, para que testcontainers pueda levantar los contenedores hermanos.

## Gestión de admin

Para otorgar permisos de admin a un usuario existente:

```bash
cd backend
uv run python -m scripts.make_admin user@example.com
```

Para revocar:

```bash
uv run python -m scripts.make_admin user@example.com --revoke
```

## Datos de prueba (seed)

El script `scripts/seed.py` puebla la BD con un dataset de prueba idempotente
(usuarios, planes, postulaciones, un match completado con reseñas,
notificaciones, contactos de confianza y availability).

```bash
cd backend
uv run python -m scripts.seed            # siembra si no existe
uv run python -m scripts.seed --reset    # trunca todo y resiembra
```

En Docker, el servicio `seed` del `docker-compose.yml` lo corre automáticamente
la primera vez. Cuentas sembradas: `admin@example.com`, `alice@example.com`,
`bob@example.com`, `carol@example.com`, `diana@example.com` (password `Test1234`).
