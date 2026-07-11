# Spec: Mitigación de abuso y DoS (Issue #37)

> **Issue:** #37 — *Seguridad: mitigación de abuso y DoS (rate limiting, uploads, N+1, WebSocket)*
> **Estado:** Especificación para implementación
> **Fecha:** 2026-07-11

## 1. Objetivo

Garantizar que la aplicación no sea víctima de abuso ni denegación de servicio. Tras una auditoría del backend y de la infra de despliegue se detectaron **7 vectores concretos**. Este spec define las mitigaciones a implantar, con criterios de aceptación verificables.

## 2. Vectores detectados y mitigación por vector

### V1 (P0) — Rate limiting inutilizable tras nginx

**Problema:** `uvicorn` arranca sin `--proxy-headers` ni `--forwarded-allow-ips` (`backend/entrypoint.sh:16`), y slowapi usa `get_remote_address` (`rate_limit.py:9`) que lee `request.client.host`. Tras nginx, ese IP es el del contenedor `web`, no el cliente real → todos los límites por IP colapsan en un único bucket.

**Mitigación:**
- `entrypoint.sh`: añadir `--proxy-headers on --forwarded-allow-ips '*'` a uvicorn.
- `rate_limit.py`: reemplazar `get_remote_address` por una `key_func` que lea `X-Forwarded-For` (primer hop) con fallback a `request.client.host`. Esto hace que el rate limiting funcione correctamente independientemente de cómo llegue uvicorn (defensa en profundidad: la capa de app debe poder resolver la IP real por sí misma).
- La `key_func` debe ignorar `X-Forwarded-For` si llega de una conexión NO proxy (uso de `request.client.host` directo) para evitar spoofing en entornos donde la app se exponga directamente.

### V2 (P0) — Sin rate limit global ni en endpoints caros

**Problema:** Solo 8 rutas tienen `@limiter.limit`. No hay límite por defecto. Endpoints caros sin throttling: `GET /plans` (geo search), `POST /me/avatar`, todo `matching/`, `chat` (REST+WS), `safety/ping|sos`, `availability`, y `GET /s/{token}` (público).

**Mitigación:**
- Configurar `default_limits` en el `Limiter` (p.ej. `300/minute` por IP) y registrar `SlowAPIMiddleware` para que aplique a TODA la app automáticamente.
- Límites específicos (más estrictos) en endpoints sensibles:
  - `GET /plans` → `60/minute`
  - `POST /me/avatar` → `5/minute`
  - `safety ping/sos` → `10/minute`
  - `GET /s/{token}` (público) → `30/minute`
- Los endpoints que ya tienen límite explícito (auth, reviews, reports, POST /plans) conservan su límite; el default no los afecta porque el decorador toma precedencia.

### V3 (P1) — Subida de avatar sin límites

**Problema:** `upload_avatar` hace `await file.read()` a memoria sin tope (`users/service.py:133`), sin allowlist MIME, sin `Image.MAX_IMAGE_PIXELS` (decompression bomb), nginx sin `client_max_body_size`.

**Mitigación:**
- Cap de tamaño en la app: `MAX_AVATAR_BYTES = 5 * 1024 * 1024` (5 MB). Leer en chunks y abortar al superar el tope (evita cargar el archivo entero en memoria antes de rechazarlo).
- Allowlist de Content-Type: `image/jpeg`, `image/png`, `image/webp`.
- `Image.MAX_IMAGE_PIXELS` seteado a un valor seguro (p.ej. `40_000_000`) para que Pillow lance `DecompressionBombError` ante bombs.
- `Image.verify()` antes de procesar (valida integridad del header sin decodificar el body completo).
- Validación de magic bytes además del Content-Type declarado.
- nginx: `client_max_body_size 6m` (algo mayor al cap de app para que el rechazo llegue con JSON claro desde la app, no con un 413 crudo de nginx).
- Rate limit dedicado en el endpoint.

### V4 (P1) — Amplificación N+1 en listados

**Problema:** `_plan_to_out` lanza 1–2 queries extra por resultado (`plans/router.py:30-40`), en bucle (`router.py:104`). Con `limit=50` → ~100 round-trips. Patrón repetido en `matching/router.py` y `reviews/router.py`.

**Mitigación:**
- **plans:** añadir relationship `Plan.host` y usar `selectinload(Plan.host)` en las queries de listado. Para las coordenadas del grid, extraer `ST_X/ST_Y` en la misma query SELECT (columnas computadas) en vez de una query por plan.
- **matching:** `_app_to_out` → precargar applicants con un batch fetch de Users por ids. `_match_to_out` → ya hace una query por match para participantes; precargar planes en batch cuando el viewer es participante.
- **reviews:** precargar todos los reviewers en una sola query (`User.id IN (...)`).
- Verificación: test de N+1 que cuente queries antes/después y asserte que el conteo no crece con N.

### V5 (P1) — WebSocket sin tope de mensajes

**Problema:** `WS /chat/{match_id}` lee en bucle infinito sin cap por conexión (`chat/websocket.py:74`).

**Mitigación:**
- Sliding window por conexión: máx `5` mensajes por segundo (implementado in-memory con deque de timestamps en el handler, ya que slowapi no cubre WS).
- Cap de tamaño por mensaje vía `--ws-max-size` en uvicorn (p.ej. `65536` = 64 KiB; el contenido está limitado a 2000 chars pero el frame JSON puede ser mayor).
- Enviarse un error y `continue` si se excede el rate; cerrar la conexión si el abuso persiste tras warning.

### V6 (P2) — Endpoint público de ubicación sin throttle

**Problema:** `GET /s/{token}` (`safety/public_router.py:14`) es no autenticado, sin rate limit → enumeración/fuerza bruta de tokens.

**Mitigación:**
- `@limiter.limit("30/minute")` en el endpoint, usando la `key_func` de IP real (V1).
- El token es un JWT firmado con exp de 24h, así que la fuerza bruta ya tiene baja probabilidad de éxito; el rate limit reduce la viabilidad del ataque de enumeración.

### V7 (P2) — Sin tope de body, TrustedHost, GZip, SECURITY.md

**Problema:** No hay `max_request_size`, `TrustedHostMiddleware`, ni GZip. No existe `SECURITY.md`. El test de rate limit existente usa una app toy.

**Mitigación:**
- `TrustedHostMiddleware` con hosts configurables vía `TRUSTED_HOSTS` (default `["*"]` para dev → no rompe nada; en prod debe setearse). Documentar en README/compose.
- `GZipMiddleware(minimum_size=1000)` para reducir bandwidth (no afecta seguridad, pero está en el issue y es estándar).
- `BodySizeLimitMiddleware` (custom, ~50 líneas): rechaza requests cuyo `Content-Length` exceda un máximo configurable (`MAX_REQUEST_BODY_SIZE`, default 10 MB, excepto rutas de upload que se validan en el handler). Devuelve 413.
- `SECURITY.md` con política de divulgación responsable.
- Test de rate limit que ejerza rutas reales (no toy app): el fixture debe construir la app real (o al menos un router real decorado) y verificar 429.
- CI: añadir `pip-audit` al workflow.

## 3. Decisiones de diseño

| Decisión | Elección | Justificación |
|----------|----------|---------------|
| Rate limit default | `slowapi` `default_limits` + `SlowAPIMiddleware` | Ya integrado; un solo mecanismo |
| IP real | `key_func` propia que lee XFF + uvicorn `--proxy-headers` | Defensa en profundidad |
| WS throttle | sliding window in-memory en el handler | slowapi no soporta WS; mantener simple |
| N+1 fix | `selectinload` + columnas computadas | Patrón SQLAlchemy idiomático, reutiliza sesión |
| Body cap | middleware custom + cap por-handler en avatar | Cap global + cap específico |
| Trusted hosts | configurable, default permissive | No romper dev |
| Load test | locust | Pide el issue; archivo en `backend/tests/load/` |

## 4. Fuera de alcance (este PR)

- Migrar uvicorn a gunicorn con workers (cambio de arquitectura mayor).
- WAF / Cloudflare / Fastly delante (infra externa, no código).
- Redis auth / TLS entre contenedores (network hardening del compose, otro issue).
- Alertas Prometheus (definición de dashboards/alertas, requiere infra de monitoreo).

## 5. Criterios de aceptación (del issue)

- [ ] uvicorn arranca con `--proxy-headers --forwarded-allow-ips` y los límites se aplican por IP de cliente real (test cubriendo rutas reales).
- [ ] Rate limit global configurado; todos los endpoints (incl. `GET /plans`, `/me/avatar`, WS chat, `/s/{token}`) responden 429 bajo abuso.
- [ ] Upload de avatar rechaza >5 MB, tipos no permitidos, y decompression bombs.
- [ ] WebSocket aplica tope de mensajes/conexión; no permite flood.
- [ ] N+1 de listados mitigado (selectinload/batch) — verificar con test.
- [ ] nginx define `client_max_body_size` y `limit_req`.
- [ ] Existe `SECURITY.md` y test de rate limit que ejercita rutas reales.
- [ ] Test de carga (locust) que demuestre disponibilidad bajo los vectores.
