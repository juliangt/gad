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
