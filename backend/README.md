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
