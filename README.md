# GAD

> No tomes algo solo. GAD te conecta con gente cercana dispuesta a sumarse a una salida corta — ahora mismo o agendada.

## ¿Qué es?

GAD es una webapp para encontrar **compañía puntual para una salida casual** (un café, una cerveza, comer algo, un paseo). No es una app de citas — el objetivo es simple: no ir a tomar algo solo, sin la presión social de un encuentro romántico ni el compromiso de una amistad de largo plazo.

Publicás un **Plan** ("café en Palermo, ahora, 1 persona") y gente cercana dentro del radio que elijas puede verlo en el mapa, postularse y, si aceptás, salir. Si no hay nadie disponible cuando querés salir, activás el **modo disponible** y recibís una alerta cuando aparezca un Plan compatible cerca.

## ¿Por qué es diferente?

| App | Foco | Diferencia con GAD |
|---|---|---|
| Tinder / Bumble | Citas | Match basado en atracción, foco romance |
| Bumble BFF / Meetup | Amistad o eventos largos | No es espontáneo, no es salida puntual |
| happn | Citas por cruce | Match-based, sin intención explícita |
| **GAD** | **Compañía puntual + espontánea + geolocalizada** | **Espacio no cubierto** |

El nicho es el cruce entre *compañía espontánea de corta duración*, *ubicación en tiempo real* y *seguridad*: salir con un desconocido a tomar algo, con confianza.

## Funcionalidades principales

- **Registro y perfil** con Google o email.
- **Mapa interactivo** con gente y planes cercanos, slider de radio.
- **Crear Plan**: tipo de actividad, ahora o agendado, cuánta gente, dónde, radio de búsqueda.
- **Postularse y aceptar**: conexión por postulación (no swipe).
- **Modo disponible**: recibí alertas cuando aparezca un plan compatible cerca.
- **Chat** en tiempo real una vez confirmado el match.
- **Seguridad**:
  - Ubicación aproximada (~150m) hasta que hay match confirmado.
  - Ubicación compartida en vivo durante la salida.
  - Contacto de confianza que recibe tu ubicación si lo activás.
  - Botón de SOS en el chat del match.
  - Bloqueo de usuarios.
- **Sistema de reseñas** post-salida con reputación visible.

## Casos de uso

### Identidad y acceso
- **Registro** — darse de alta con email + password y obtener tokens.
- **Login** — entrar con credenciales (comparación timing-safe anti-timing-attack).
- **Login con Google** — registrarse/entrar vía OAuth.
- **Renovar token** — refrescar el access token con el refresh token.
- **Logout** — cerrar sesión y revocar el token activo.
- **Cambiar contraseña** — actualiza la clave e invalida otras sesiones.
- **Recuperar contraseña** — flujo request/confirm por email con token.
- **Ver mi perfil** — consultar datos propios y preferencias.

### Perfil y preferencias
- **Editar perfil** — nombre, bio, género, fecha de nacimiento.
- **Subir avatar** — procesado y optimizado en el servidor.
- **Configurar preferencias** — radio, actividades, tamaño de grupo, rango etario, género, notificaciones.
- **Ver perfil público** — consultar el perfil de otro usuario.
- **Darse de baja** — eliminar cuenta (soft delete + revocación de tokens).

### Planes
- **Crear plan** — publicar una salida (actividad, ahora/agendado, ubicación, radio, cupo).
- **Buscar planes** — ver planes cercanos en el mapa con filtros.
- **Ver detalle de plan** — información completa de una salida.
- **Editar plan** — modificar un plan propio abierto.
- **Cancelar plan** — dar de baja un plan propio.

### Matching
- **Postularse a un plan** — pedir sumarse a una salida.
- **Ver postulaciones recibidas** — (host) listar quién se postuló.
- **Aceptar/Rechazar postulación** — generar match o declinar.
- **Retirar postulación** — cancelar la propia antes de que se decida.
- **Ver mis matches** — listar y consultar salidas confirmadas.
- **Ver ubicación exacta** — revelar la ubicación real solo tras ser participante.
- **Completar/Cancelar match** — cerrar o dar por terminada la salida.

### Modo disponible
- **Activar modo disponible** — recibir alertas de planes compatibles cercanos.
- **Consultar estado** — ver si el modo está activo.
- **Desactivar modo disponible** — dejar de recibir alertas.

### Chat
- **Conectar al chat** — unirse por WebSocket al match.
- **Enviar mensajes** — chatear en tiempo real (Redis pub/sub).
- **Ver historial** — consultar mensajes pasados (paginado).
- **Marcar como leído** — marcar mensajes como vistos.
- **Borrar mensaje** — eliminar un mensaje propio.

### Seguridad
- **Gestionar contactos de confianza** — agregar/eliminar contactos.
- **Compartir ubicación en vivo** — enviar pings de ubicación durante la salida.
- **Ver ubicación del peer** — consultar ubicación (aproximada pre-match, exacta post-match).
- **Generar link de ubicación** — crear enlace público y revocable.
- **Disparar SOS** — alertar a contactos de confianza y registrar evento.
- **Bloquear/Desbloquear usuarios** — impedir contacto con alguien.

### Reputación y moderación
- **Dejar reseña** — puntuar post-salida (1-5) + comentario + flag opcional.
- **Ver reseñas de un usuario** — consultar historial y reputación.
- **Borrar reseña propia** — eliminar y recalcular reputación.
- **Reportar usuario** — reportar comportamiento inadecuado.
- **Panel de admin** — estadísticas, gestionar reportes, banear/suspender/reactivar usuarios, cancelar planes, eliminar reseñas.

### Notificaciones
- **Recibir notificaciones in-app** — postulaciones, matches, mensajes, seguridad, alertas.
- **Gestionar notificaciones** — listar, marcar leídas, borrar.
- **Suscripción push** — registrarse/desuscribirse de Web Push notifications.

## Stack técnico

- **Backend:** Python 3.12 + FastAPI (API monolítica, REST + WebSocket), Uvicorn.
- **ORM / migraciones:** SQLAlchemy 2.0 (async) + GeoAlchemy2, Alembic.
- **Base de datos:** PostgreSQL + PostGIS (queries geográficas).
- **Cache/realtime:** Redis (pub/sub de chat, tokens revocados, rate limiting).
- **Auth:** JWT (access + refresh) + OAuth Google; hashing Argon2.
- **Rate limiting:** slowapi (backed por Redis).
- **Notificaciones push:** Web Push API (pywebpush + VAPID).
- **Jobs:** APScheduler (expiración periódica de planes y disponibilidad).
- **Observabilidad:** structlog (logging) + Prometheus (métricas).
- **Frontend (planificado):** React + Vite + TypeScript + Tailwind, Leaflet + OpenStreetMap.

## Estado del proyecto

El **backend está implementado**: autenticación completa, planes geolocalizados, matching por postulación, chat en tiempo real (WebSocket), modo disponible con alertas, seguridad (ubicación en vivo, contactos de confianza, SOS), reseñas y reputación, reportes, notificaciones in-app y push, panel de admin, rate limiting, headers de seguridad y observabilidad.

El **frontend aún no está implementado**. El spec de diseño y los planes de implementación (fases 0–6 + hardening) están en [`docs/superpowers/`](docs/superpowers/).

## Estructura

```
gad/
├── docs/
│   └── superpowers/          # spec de diseño + planes por fase
├── docker-compose.yml        # db (postgis) + redis + api
├── .env.example              # variables de entorno de ejemplo
└── backend/
    ├── src/gad/
    │   ├── main.py           # factory de la app FastAPI + lifespan
    │   ├── auth/             # registro, login, OAuth, JWT, reset password
    │   ├── users/            # perfil, preferencias, avatar, bloqueos
    │   ├── plans/            # crear/listar/editar/cancelar planes
    │   ├── matching/         # postulaciones, matches, completar/cancelar
    │   ├── chat/             # mensajes REST + WebSocket
    │   ├── availability/     # modo disponible + alertas geográficas
    │   ├── safety/           # contactos, ubicación en vivo, share-link, SOS
    │   ├── reviews/          # reseñas + reputación
    │   ├── reports/          # reportes de usuarios
    │   ├── notifications/    # notificaciones in-app + Web Push
    │   ├── admin/            # panel de moderación
    │   └── models/           # modelos SQLAlchemy + GeoAlchemy2
    ├── alembic/              # migraciones
    ├── scripts/make_admin.py # CLI para otorgar/revocar rol admin
    └── tests/                # suite con testcontainers (Postgres/Redis reales)
```

## Desarrollo

```bash
cd backend
uv sync                              # instala dependencias
uv run pytest                        # corre los tests
uv run uvicorn gad.main:app --reload # levanta la API en :8000
```

Variables de entorno en `.env` (ver `.env.example`). El `entrypoint.sh` espera a la DB, corre las migraciones (`alembic upgrade head`) y arranca la API.

### Levantar todo con Docker

```bash
docker compose up --build
```

Levanta `db` (Postgres+PostGIS), `redis` y `api` (FastAPI en `:8000`).

### Tests en Docker

Los tests usan [testcontainers](https://testcontainers.com/) con Postgres/Redis reales. Para correrlos dentro de Docker (sin instalar nada local):

```bash
./run-tests-docker.sh                       # suite completa
./run-tests-docker.sh tests/test_auth.py -v # un subset
NO_BUILD=1 ./run-tests-docker.sh            # saltar rebuild
```

### Gestión de admin

```bash
cd backend
uv run python -m scripts.make_admin user@example.com            # otorgar
uv run python -m scripts.make_admin user@example.com --revoke   # revocar
```

Más detalle en [`backend/README.md`](backend/README.md).
