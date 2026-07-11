# Load testing (issue #37)

Escenarios con locust para validar mitigaciones de abuso/DoS.

## Requisitos

```bash
cd backend
uv sync --extra dev
```

## Ejecución

Levantá el stack: `make up-d` (desde la raíz).

Generá un token JWT de access válido para el usuario de test (p.ej. vía
`POST /auth/register` + `POST /auth/login`) y exportalo:

```bash
export GAD_TEST_TOKEN="<access-token>"
```

Luego:

```bash
cd backend
uv run locust -f tests/load/locustfile.py --host http://localhost:8000
```

Abrí http://localhost:8089. Configurá:

- Number of users: 100
- Spawn rate: 10/s

## Criterios de éxito

- **Disponibilidad:** 0 errores 5xx por agotamiento de recursos.
- **Rate limiting:** respuestas 429 bajo picos (no 500).
- **Latencia p95 < 500ms** en `GET /plans` con pool DB de 30 conexiones.
