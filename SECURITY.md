# Política de Seguridad

## Reportar una vulnerabilidad

Si encontrás una vulnerabilidad de seguridad en GAD, **no abras un issue público**.

Escribí a **security@gad.example.com** (reemplazar por el canal real del
proyecto) con:

- Descripción del problema y su impacto.
- Pasos para reproducirlo (PoC, logs, capturas).
- Versión afectada.

## Compromiso de respuesta

- Acusamos recibo dentro de **72 horas**.
- Te mantenemos al tanto del avance y coordinamos la divulgación.
- Reconocemos el reporte responsable en los release notes (a menos que
  prefieras anonimato).

## Scope

Esta política cubre el código de este repositorio (backend FastAPI, frontend,
infraestructura docker/nginx). No cubre vulnerabilidades de dependencias de
terceros ya documentadas (reportalas vía `pip-audit` / GitHub advisories).

## Medidas de seguridad implementadas

- **Rate limiting** global y por endpoint (slowapi + Redis), con resolución de
  IP real del cliente vía `X-Forwarded-For`.
- **Validación de uploads** (tamaño, tipo MIME, magic bytes, protección contra
  decompression bombs con `MAX_IMAGE_PIXELS`).
- **TrustedHost, GZip y body-size cap** a nivel aplicación.
- **Hardening de nginx** (`client_max_body_size`, `limit_req`, `server_tokens off`).
- **Throttle de WebSocket** (sliding window de mensajes por conexión).
- **JWT** con revocación por `jti` en Redis.
- **Headers de seguridad** (CSP, X-Frame-Options, HSTS, etc.).

## Auditoría de dependencias

CI ejecuta `pip-audit` en cada PR (job `audit`). Para correrlo localmente:

```bash
cd backend && uv run pip-audit --strict
```
