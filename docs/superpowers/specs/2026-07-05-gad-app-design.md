# GAD — Diseño de la aplicación

**Estado:** Borrador
**Fecha:** 2026-07-05
**Autor:** Equipo GAD

---

## 1. Visión y propuesta de valor

**GAD** es una aplicación para no tomar algo solo: publicás un Plan ("café en Palermo, ahora, 1 persona") y conectás con gente cercana dispuesta a sumarse. No es una app de citas, aunque puede derivar en eso; el foco es **compañía puntual para una salida corta**, espontánea o agendada, geolocalizada y con baja fricción.

### Diferenciador frente al mercado

- Tinder/Bumble = citas con fricción de "match" basado en perfil/atracción.
- Bumble BFF / Meetup = amistades de largo plazo o eventos grupales.
- **GAD = compañía puntual para una salida corta, ahora o agendada, geolocalizada.**

El nicho es el espacio entre "tengo ganas de salir pero no quiero ir solo" y "no busco pareja ni evento grupal grande". Compañía casual, espontánea, con baja fricción y baja presión social.

### Público objetivo

Adultos 22-40 en zonas urbanas, personas que viajan solas, gente nueva en una ciudad, o alguien con una hora libre.

### Alcance de salida

Cualquier actividad corta y casual: tomar algo (alcohol), café, comida, pasear, parque, evento.

### Lo que NO es

App de citas. El enfoque es **compañía**, no romance — reflejado en tono, perfiles y filtros.

---

## 2. Análisis de mercado

| App | Foco | Superposición con GAD | Diferencia clave vs GAD |
|---|---|---|---|
| Tinder / Bumble | Citas | Geolocalización | Match-based, foco romance |
| Bumble BFF | Amistad largo plazo | Compañía social | No espontáneo, no focalizado en salida puntual |
| Meetup | Eventos grupales | Actividades sociales | Grupos grandes, agendado, no 1-a-1 espontáneo |
| Patook | Amistad platónica | Baja fricción social | Sin foco geográfico de "ahora" |
| happn | Citas por cruce | Geolocalización | Match-based, no intención explícita |
| MeetMe | Chat social | Conocer gente | Sin intención de salida estructurada |

**Conclusión:** Ningún competidor cubre el cruce *compañía puntual + espontaneidad temporal + geolocalización en tiempo real + seguridad*. Ese es el espacio de GAD.

---

## 3. Arquitectura general

**Estilo:** monolito modular (un solo deployable, límites claros entre módulos). Más simple de operar que microservicios, preparado para extraer servicios después si escala.

```
┌─────────────────────────────────────────────────────────┐
│                      Cliente (Webapp)                    │
│        React + Vite + TypeScript + Leaflet               │
│   Auth · Mapa · Planes · Chat · Perfil · Reseñas         │
└──────────────┬────────────────────────────┬─────────────┘
               │ HTTPS (REST)                │ WebSocket
               ▼                              ▼
┌─────────────────────────────────────────────────────────┐
│                    API (FastAPI, Python)                 │
│  ┌──────────┬──────────┬─────────┬────────┬───────────┐ │
│  │  auth    │  planes  │ matching│  chat  │  reviews  │ │
│  │          │          │ (PostGIS│ realtime│           │ │
│  │          │          │  query) │(pub/sub)│           │ │
│  └──────────┴──────────┴─────────┴────────┴───────────┘ │
│  ┌──────────┬──────────┬──────────────────────────────┐ │
│  │ usuarios │ seguridad│     notificaciones           │ │
│  │ perfiles │(ubiq SOS)│  (push/email/in-app)         │ │
│  └──────────┴──────────┴──────────────────────────────┘ │
└──────────────┬──────────────────────────┬───────────────┘
               ▼                          ▼
┌──────────────────────┐   ┌──────────────────────────────┐
│   PostgreSQL + GIS   │   │  Redis (pub/sub + cache +    │
│  (usuarios, planes,  │   │  sesiones + colas notif.)    │
│   matches, reseñas)  │   │                              │
└──────────────────────┘   └──────────────────────────────┘
```

### Componentes

| Componente | Tecnología | Rol |
|---|---|---|
| Webapp | React 18 + Vite + TS + Leaflet | UI del cliente, SPA mobile-first |
| API | FastAPI (async) | Lógica de negocio, REST + WS en un mismo proceso |
| DB | PostgreSQL + PostGIS | Persistencia + queries espaciales |
| Redis | Redis | Pub/sub realtime, cache, colas notificaciones |
| Geocoding | Nominatim (OSM) | Dirección → coordenadas, gratis sin API key |
| Auth | JWT + OAuth Google (Authlib) | Sesiones stateless |

### Módulos de la API (paquetes Python)

- `auth/` — registro, login, OAuth, JWT, refresh tokens.
- `users/` — perfil, preferencias, foto, bloqueos.
- `plans/` — CRUD de planes, TTL/expiración, estados.
- `matching/` — query PostGIS de planes compatibles cercanos, postulaciones, aceptación.
- `chat/` — mensajes 1-a-1 y de grupo pequeño (WS), historial.
- `safety/` — ubicación compartida en salida, botón SOS, contactos de confianza.
- `reviews/` — reseñas post-salida, cálculo de reputación.
- `notifications/` — push (Web Push API), email (SMTP), in-app.

### Flujo de datos típico (publicar un Plan "ahora")

1. Cliente crea Plan → `POST /plans` con tipo/cuándo/dónde/radio/tamaño.
2. API guarda Plan con ubicación aproximada (grid) en PostGIS, estado `open`.
3. API publica evento `plan:created` en Redis (canal por zona).
4. Usuarios en "modo disponible" en esa zona reciben push/WS en tiempo real.
5. Alguien postula → `POST /plans/{id}/applications` → notifica al anfitrión.
6. Anfitrión acepta → match confirmado → se abre chat + se habilita ubicación compartida.

### Decisión: un solo proceso API con REST + WS juntos

Para corto alcance, mantener REST + WS juntos simplifica deploy y estado compartido. Si el tráfico de WS crece, se extrae después — el diseño de pub/sub por Redis lo permite sin reescribir.

---

## 4. Modelo de datos

PostgreSQL + PostGIS. Diseño normalizado, claves foráneas explícitas. `‡` marca campos espaciales.

### 4.1 `users` — cuenta y auth

| Campo | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| email | text unique | |
| password_hash | text nullable | null si solo OAuth |
| google_id | text unique nullable | |
| display_name | text | |
| avatar_url | text | |
| bio | text | |
| birth_date | date | age calculado |
| gender | enum | male/female/nonbinary/undisclosed |
| locale | text | |
| timezone | text | |
| reputation_score | float | 0-5, agregado |
| verification_level | enum | none/email/google |
| created_at, updated_at | timestamptz | |
| last_active_at | timestamptz | |

### 4.2 `user_preferences` — 1-a-1 con users

| Campo | Tipo | Notas |
|---|---|---|
| user_id | uuid PK FK users | |
| default_search_radius_m | int | ej 2000 |
| activity_types | text[] | {coffee, drinks, food, walk, park, event, other} |
| group_size_preference | enum | one_on_one/small_group/either |
| age_range_min, age_range_max | int | |
| gender_preference | enum | any/same/mixed/specific |
| notify_new_plans | bool | |
| notify_messages | bool | |
| notify_pending_alerts | bool | |

### 4.3 `plans` — el corazón del producto

| Campo | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| host_id | uuid FK users | |
| activity_type | enum | coffee/drinks/food/walk/park/event/other |
| mode | enum | now/scheduled |
| scheduled_at | timestamptz null | null si mode=now |
| window_minutes | int | duración de la ventana |
| max_participants | int | 1 = 1-a-1, >1 = grupo |
| current_participants | int | contador |
| title, description | text | |
| location_label | text | "Palermo Soho" (visible) |
| location_grid ‡ | geography Point | grid ~150m, NO exacta |
| exact_location ‡ | geography Point null | null hasta match confirmado |
| search_radius_m | int | radio del anfitrión para postulantes |
| status | enum | open/matched/closed/cancelled/expired |
| expires_at | timestamptz | TTL |
| created_at, updated_at | timestamptz | |

### 4.4 `plan_applications` — postulaciones a un plan

| Campo | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| plan_id | uuid FK plans cascade | |
| applicant_id | uuid FK users | |
| status | enum | pending/accepted/rejected/withdrawn |
| message | text null | |
| created_at, decided_at | timestamptz | |
| | unique(plan_id, applicant_id) | |

### 4.5 `matches` — salida confirmada

| Campo | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| plan_id | uuid FK plans | |
| status | enum | active/completed/cancelled |
| started_at | timestamptz | |
| ended_at | timestamptz null | null mientras activa |
| location_sharing_active | bool | control de seguridad |

### 4.6 `match_participants` — n-a-n match/users

| Campo | Tipo | Notas |
|---|---|---|
| match_id | uuid FK matches | |
| user_id | uuid FK users | |
| role | enum | host/participant |
| joined_at | timestamptz | |
| left_at | timestamptz null | |
| | PK(match_id, user_id) | |

### 4.7 `messages` — chat del match

| Campo | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| match_id | uuid FK matches | |
| sender_id | uuid FK users | |
| content | text | |
| created_at | timestamptz | |
| read_at | timestamptz null | |

### 4.8 `reviews` — reseñas post-salida

| Campo | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| match_id | uuid FK matches | |
| reviewer_id | uuid FK users | |
| reviewee_id | uuid FK users | |
| rating | int 1-5 | |
| comment | text null | |
| created_at | timestamptz | |
| | unique(match_id, reviewer_id, reviewee_id) | una reseña por par por salida |

### 4.9 `availability` — "modo disponible"

| Campo | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK users unique activo | |
| location_grid ‡ | geography Point | |
| radius_m | int | |
| activity_filter | text[] null | qué tipos le interesan |
| expires_at | timestamptz | auto-expira |
| active | bool | |
| created_at | timestamptz | |

### 4.10 `safety_sessions` — ubicación durante salida

| Campo | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| match_id | uuid FK matches | |
| user_id | uuid FK users | |
| started_at | timestamptz | |
| ended_at | timestamptz null | |
| last_ping_location ‡ | geography Point null | |
| last_ping_at | timestamptz null | |
| trusted_contacts_notified | bool | |

### 4.11 `trusted_contacts` — contactos de confianza del usuario

| Campo | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK users | |
| contact_type | enum | email/phone |
| contact_value | text | email o teléfono normalizado |
| label | text | "Mamá", "Socio", etc. |
| created_at | timestamptz | |
| | unique(user_id, contact_type, contact_value) | |

Un usuario puede tener hasta 2 contactos. Se notifican al activar ubicación compartida con contacto o al pulsar SOS.

### 4.12 `safety_events` — registros SOS y alertas

| Campo | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| match_id | uuid FK matches null | |
| user_id | uuid FK users | |
| type | enum | sos/location_shared/contact_notified |
| payload | jsonb | detalle |
| created_at | timestamptz | |

### 4.13 `blocks` — bloqueos entre usuarios

| Campo | Tipo | Notas |
|---|---|---|
| blocker_id | uuid FK users | |
| blocked_id | uuid FK users | |
| created_at | timestamptz | |
| | PK(blocker_id, blocked_id) | |

### 4.14 `notifications` — in-app

| Campo | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK users | |
| type | enum | new_application/match/new_message/safety/review/plan_alert |
| payload | jsonb | |
| read_at | timestamptz null | |
| created_at | timestamptz | |

### 4.15 Decisiones de diseño

- **Ubicación dual en `plans`**: `location_grid` (aproximada, pública en mapa) y `exact_location` (null hasta match confirmado). Privacy-by-design.
- **`matches` separa el plan del encuentro**: un plan puede recibir postulaciones sin convertirse en match aún.
- **PostGIS `geography`**: distancias en metros exactos. Query de planes cercanos: `ST_DWithin(location_grid, $point, $radius)`.
- **TTL vía `expires_at`**: un job programado (APScheduler) marca `expired` los planes/availability vencidos.
- **Índices espaciales GiST** sobre `location_grid` en `plans` y `availability` para queries O(log n).

---

## 5. Seguridad y privacidad

Tres ejes: privacidad de ubicación, seguridad durante la salida, confianza entre usuarios.

### 5.1 Privacidad de ubicación (por diseño)

Principio: **nunca se expone la ubicación exacta de un usuario hasta que hay un match confirmado y ambos consienten.**

| Estado | Qué se ve | Precisión |
|---|---|---|
| Plan publicado | `location_label` + punto en grid aproximado | ~150m |
| Modo disponible | Solo existencia en el radio, sin punto visible | Anónimo |
| Postulación enviada | El anfitrión ve perfil del postulante, no su ubicación | N/A |
| Match confirmado | Ubicación exacta del lugar del plan | Exacta |
| Salida activa | Ubicación compartida entre participantes + contacto de confianza | Tiempo real |

**Mecanismo de grid:** al crear un plan o activar disponibilidad, el servidor redondea las coordenadas a una grilla de ~150m antes de guardarlas. El cliente nunca recibe coordenadas crudas del otro usuario en estado previo al match.

### 5.2 Seguridad durante la salida

**Ubicación compartida en vivo** (`safety_sessions`):
- Al confirmarse un match, ambos participantes pueden activar "compartir mi ubicación durante esta salida".
- El cliente envía pings periódicos (~60s) con su ubicación al endpoint `POST /safety/{match_id}/ping`.
- El servidor guarda el último ping en `last_ping_location` / `last_ping_at`.
- El otro participante puede ver esa ubicación en el mapa del chat.

**Contacto de confianza**:
- Opcionalmente, el usuario marca 1-2 contactos (email/teléfono) que reciben un link con la ubicación en vivo si activa el modo seguro.

**Botón SOS**:
- En el chat del match hay un botón visible "No me siento seguro".
- Al pulsarlo: comparte ubicación actual con contactos de confianza + deja registro en `safety_events`.
- No llama a emergencias automáticamente (implicaciones legales), pero deja alertado al sistema.

### 5.3 Confianza entre usuarios

**Sistema de reseñas**:
- Tras finalizar un match (`completed`), ambos participantes pueden reseñarse mutuamente.
- Ventana de 7 días post-salida para dejar reseña; pasado eso, no se puede.
- `reputation_score` (0-5) se recalcula como **promedio ponderado** de las últimas N reseñas (más peso a las recientes).
- Reseñas visibles en el perfil. Una reseña <3 estrellas puede incluir flag opcional (categorías: "no apareció", "comportamiento inadecuado", "información falsa").
- Patrones de reseñas negativas acumuladas → revisión manual / suspensión automática por debajo de umbral (score <2.0 con 3+ reseñas).

**Moderación y bloqueos**:
- Cualquier usuario puede bloquear a otro (`blocks`): desaparecen mutuamente de búsquedas, planes y chat.
- Reporte de usuario con motivo (categoría + descripción).
- Panel de moderación básico para el admin.

### 5.4 Seguridad técnica (auth y API)

- **JWT** de corta duración (15 min) + **refresh token** (7 días, httpOnly cookie).
- OAuth Google vía Authlib.
- Rate limiting por IP y por usuario (slowapi): protege login y endpoints sensibles.
- Validación de input con Pydantic.
- CORS estricto al dominio del cliente.
- HTTPS obligatorio en producción (HSTS).
- Contraseñas con bcrypt/argon2.
- No se loggean datos sensibles (ubicación, mensajes).

### 5.5 Verificación de identidad (post-MVP)

Aunque fuera del MVP, el modelo ya la prevé (`verification_level`). Progresión natural:
1. **Email verificado** (gratis, al registrarse).
2. **Google OAuth** cuenta como verificación leve.
3. **Verificación de foto** post-MVP (selfie replicando un gesto → revisión manual o automática).

Una reseña de un usuario `verification_level=google` pesa más que una de `none`.

---

## 6. Flujos principales

### 6.1 Onboarding y registro

1. Usuario llega a la webapp → pantalla de login/registro.
2. Elige: Google OAuth o email + password.
3. OAuth: Authlib maneja el flujo; al volver, la API crea/actualiza `users` con `verification_level=google`.
4. Email/password: crea usuario con hash bcrypt, envía email de verificación (SMTP), `verification_level=none` hasta verificar.
5. Onboarding guiado (3 pasos):
   - Paso 1: display_name, birth_date, gender, foto, bio corta.
   - Paso 2: preferencias (activity_types, group_size_preference, age_range, gender_preference, radio default).
   - Paso 3: permiso de ubicación del navegador + contacto de confianza opcional.
6. Tras completar → Home con mapa.

### 6.2 Publicar un Plan (anfitrión)

1. Usuario pulsa "Crear Plan".
2. Formulario: tipo de actividad, modo (`now`/`scheduled`), si `scheduled` elige fecha/hora, `window_minutes`, `max_participants`, título/descripción, ubicación (Nominatim o "mi ubicación"), `search_radius_m`.
3. Cliente envía `POST /plans` con coordenadas.
4. API **snap a grid** (~150m) las coordenadas → guarda `location_grid`, deja `exact_location=null`.
5. Calcula `expires_at` según modo (`now` → ahora+window; `scheduled` → scheduled_at + window).
6. Estado `open`. Publica evento Redis `plan:created` en canal de zona.
7. Usuarios en "modo disponible" en el radio reciben notificación si su filtro de actividad coincide.

### 6.3 Explorar Planes (participante)

1. Home: mapa (Leaflet) centrado en ubicación del usuario, slider de radio (default 2000m).
2. Cliente pide `GET /plans?lat&lng&radius&activity&mode`.
3. API corre query PostGIS: `WHERE ST_DWithin(location_grid, $point, $radius) AND status='open' AND expires_at > now() AND host_id != $me AND host_id NOT IN (mis bloqueos)`.
4. Devuelve lista con `location_grid`, perfil resumido del anfitrión, tipo, modo, horario, plazas libres.
5. Mapa muestra marcadores en grid + panel lateral con tarjetas.
6. Usuario ajusta radio/filtros → re-query.

### 6.4 Postular y aceptar (matching)

1. Participante abre un Plan → ve detalle + botón "Postularme".
2. `POST /plans/{id}/applications` con mensaje opcional. Estado `pending`.
3. Anfitrión recibe notificación (WS + push) → ve postulante(s) con perfil y `reputation_score`.
4. Anfitrión pulsa "Aceptar":
   - `POST /applications/{id}/accept` → estado `accepted`, las demás pasan a `rejected` o quedan pendientes según plazas.
5. Al llenarse `current_participants == max_participants`:
   - Plan pasa a `matched`.
   - Se crea `matches` con `status=active`.
   - Se abre chat del match.
   - Participantes ven `exact_location` del plan.
   - Se habilita panel de seguridad.

### 6.5 Modo disponible + pendientes/alertas

1. Usuario sin querer publicar activa "Modo disponible" desde Home.
2. `POST /availability` con `location_grid`, `radius_m`, `activity_filter`, `expires_at`.
3. Cuando un Plan nuevo cae en el radio + filtro:
   - Worker compara `plan:created` contra `availability` activas vía PostGIS.
   - A los usuarios matching les llega push/in-app: "Hay un plan de café a 800m".
4. Usuario acepta la alerta → va directo al detalle del Plan → postularse.

### 6.6 Chat

- WebSocket por match: `wss://api/chat/{match_id}?token=...`.
- Mensajes persistidos en `messages`, con `read_at`.
- Eventos: `message`, `typing`, `read`, `system` (ej: "ubicación compartida activada").
- Historial cargado vía `GET /matches/{id}/messages` (paginado).
- Bloqueo de usuario → cierra el WS y marca match `cancelled`.

### 6.7 La salida (durante el match activo)

- Ambos pueden activar "Compartir mi ubicación" en el panel de seguridad del match.
- Cliente envía `POST /safety/{match_id}/ping` cada ~60s con ubicación actual.
- El mapa del chat muestra al otro participante moviéndose.
- Si un usuario marcó contacto de confianza y activa compartir: el contacto recibe un link público (`/s/{token}`) con la ubicación en vivo.
- Botón SOS → alerta a contactos + registro en `safety_events`.

### 6.8 Cierre y reseña

1. Cualquier participante puede pulsar "Finalizar salida" → match pasa a `completed` (o `cancelled` si antes de verse).
2. Ventana de reseña de 7 días:
   - Ambos reciben prompt "¿Cómo estuvo tu salida con X?".
   - `POST /reviews`: rating 1-5, comentario opcional, flag opcional.
3. Tras reseña (o vencida la ventana), `reputation_score` se recalcula.
4. Match archivado, chat pasa a solo lectura.

### 6.9 Edge cases y manejo de errores

| Caso | Comportamiento |
|---|---|
| Plan expira sin postulantes | Job marca `expired`, anfitrión recibe notificación. |
| Postulante se arrepiente | `DELETE /applications/{id}` → estado `withdrawn`. |
| Anfitrión cancela plan abierto | Plan → `cancelled`, postulantes notificados. |
| Match cancelado antes de verse | No genera reseña. |
| Usuario no aparece al match | Reseña con flag "no apareció" + penaliza score. |
| Caída de WS | Cliente reconecta con backoff; missed messages vía REST al reconectar. |
| Job de expiración cae | `expires_at` igualmente filtra en queries; job solo sincroniza estados. |
| Ubicación inválida | Validación Pydantic; coordenadas fuera de rango → 400. |
| Rate limit excedido | 429 con `Retry-After`. |

---

## 7. Interfaz (webapp React)

### 7.1 Principios de UX

- **Simple y clara**: un clic para crear plan, un clic para postularse.
- **Mapa como pantalla principal**, no listas.
- **Acciones contextuales**: botones donde se necesitan, sin menús profundos.
- **Mobile-first**: web responsive que se sienta como app móvil.
- **Estados vacíos claros**: "no hay planes cerca — creá uno o activá modo disponible".

### 7.2 Estructura de pantallas

```
┌─────────────────────────────────────┐
│  Auth                               │
│  ├─ Login (Google / email)          │
│  └─ Registro + Onboarding (3 pasos) │
├─────────────────────────────────────┤
│  App (con navbar inferior)          │
│  ├─ Mapa / Home (default)           │  ← explorar + crear + modo disponible
│  ├─ Mis Planes                      │  ← anfitrión y postulaciones
│  │   ├─ Activos / Agendados         │
│  │   └─ Historial                   │
│  ├─ Chats                           │  ← lista de matches con chat
│  │   └─ Chat del match              │
│  └─ Perfil                          │
│     ├─ Datos + preferencias         │
│     ├─ Reseñas recibidas            │
│     ├─ Seguridad (contactos, SOS)   │
│     └─ Sesión / bloqueos            │
└─────────────────────────────────────┘
```

### 7.3 Pantalla principal: Mapa

```
┌──────────────────────────────┐
│ ☰   GAD            🔔  👤    │  ← header
├──────────────────────────────┤
│ [Filtros: tipo ▾] [Modo ▾]   │
│                              │
│     ●  ●                     │
│        ●  ◉(yo)              │  ← mapa Leaflet
│     ●        ●               │     con marcadores en grid
│        ●                     │
│                              │
│  ━━━━━━━━━━━━━━ radius ━━━━ │  ← slider de radio
│                              │
│  [🟢 Modo disponible]  [＋]  │  ← toggle + crear plan
├──────────────────────────────┤
│ 📍 Mapa  📋 Planes  💬 Chat 👤│  ← navbar inferior
└──────────────────────────────┘
```

Al pulsar un marcador → bottom sheet con tarjeta resumida del plan + botón "Ver detalle" → pantalla completa con postularse.

### 7.4 Crear Plan (modal/pantalla)

Formulario corto, una pantalla:
- Tipo de actividad (chips seleccionables).
- Modo: Ahora / Agendado (si agendado → datetime picker).
- Cuántos: 1 / hasta 3 / hasta 5 (chips).
- Dónde: buscador Nominatim o "mi ubicación".
- Radio de búsqueda (slider 500m–5km).
- Título + descripción corta (opcional).
- Botón "Publicar".

### 7.5 Chat del match

```
┌──────────────────────────────┐
│ ←  Ana, 28  ★4.7  ⓘ         │
├──────────────────────────────┤
│  [panel seguridad: 📍compartir│
│   ubicación] [🆘 SOS]        │
├──────────────────────────────┤
│   hola! llego en 10 min      │
│              yo ya estoy 🍻 │
│   ── ubicación compartida ── │
│   [mini-mapa con punto live] │
├──────────────────────────────┤
│ [ input... ]           send  │
└──────────────────────────────┘
```

### 7.6 Librerías de frontend

| Propósito | Librería |
|---|---|
| Framework | React 18 + Vite + TypeScript |
| Estado servidor | TanStack Query |
| Estado cliente | Zustand (auth + WS) |
| Routing | React Router |
| Mapa | React-Leaflet + Leaflet |
| Formularios | React Hook Form + Zod |
| Estilos | Tailwind CSS |
| WS cliente | nativo + wrapper propio |
| Notificaciones push | Web Push API |
| Iconos | lucide-react |

---

## 8. Fases, testing y API

### 8.1 Fases de implementación

**Fase 0 — Fundaciones** (1-2 sem)
- Repo, Docker Compose (FastAPI + Postgres+PostGIS + Redis).
- Esquema DB + migraciones (Alembic).
- Auth (JWT + Google OAuth), middleware, manejo de errores, logging.
- Tests base + CI.

**Fase 1 — Perfil y planes** (1-2 sem)
- CRUD usuarios + preferencias, subida de avatar.
- CRUD planes con PostGIS, TTL, expiración.
- Endpoints REST + tests.

**Fase 2 — Matching y postulaciones** (1-2 sem)
- Query de planes cercanos con filtros.
- Aplicaciones + aceptación + creación de matches.
- Webapp: onboarding, mapa con Leaflet, crear plan, explorar, postularse.

**Fase 3 — Realtime y chat** (1-2 sem)
- WebSockets + Redis pub/sub.
- Chat del match con historial.
- Notificaciones in-app + Web Push.

**Fase 4 — Seguridad** (1-2 sem)
- Ubicación compartida en vivo (pings + visualización).
- Contacto de confianza + link público.
- Botón SOS + `safety_events`.
- Bloqueos + reportes.

**Fase 5 — Reseñas y reputación** (1-2 sem)
- Reseñas post-match + ventana de 7 días.
- Cálculo de `reputation_score`.
- Panel de moderación admin básico.

**Fase 6 — Pulido** (1 sem)
- Modo disponible + alertas.
- Estados vacíos, skeletons, errores.
- Optimización de queries PostGIS.
- Hardening (rate limiting, CORS, HSTS).

### 8.2 Testing

| Nivel | Qué | Herramienta |
|---|---|---|
| Unit (backend) | Servicios, validación, queries | pytest + pytest-asyncio |
| Unit (frontend) | Componentes, hooks | Vitest + Testing Library |
| Integration | API + DB real (PostGIS) | pytest + testcontainers |
| Contrato API | Schemas OpenAPI de FastAPI | schemathesis |
| E2E | Flujos críticos: registro→plan→match→chat→reseña | Playwright |
| Geo específico | Queries de distancia, grid | tests con fixtures de coordenadas |

Cobertura objetivo: **80% backend, 70% frontend**. Tests E2E cubren los flujos de la Sección 6.

### 8.3 Endpoints REST

```
Auth
  POST   /auth/register              email/password
  POST   /auth/login
  POST   /auth/oauth/google          code → tokens
  POST   /auth/refresh
  POST   /auth/logout
  POST   /auth/verify-email          token

Users
  GET    /me
  PATCH  /me                         datos + preferencias
  POST   /me/avatar                  multipart
  GET    /users/{id}                 perfil público + reviews
  POST   /users/{id}/block
  POST   /users/{id}/report

Plans
  POST   /plans                      crear
  GET    /plans                      ?lat&lng&radius&mode&activity
  GET    /plans/{id}
  PATCH  /plans/{id}                 anfitrión
  DELETE /plans/{id}                 cancelar
  POST   /plans/{id}/applications    postularse
  GET    /plans/{id}/applications    anfitrión ve postulantes
  POST   /applications/{id}/accept
  POST   /applications/{id}/reject
  DELETE /applications/{id}          withdraw

Matches
  GET    /matches                    los míos
  GET    /matches/{id}
  POST   /matches/{id}/complete
  POST   /matches/{id}/cancel
  GET    /matches/{id}/messages?cursor
  WS     /chat/{match_id}

Availability
  POST   /availability               activar modo disponible
  GET    /availability/me
  DELETE /availability/me

Safety
  GET    /me/trusted-contacts
  POST   /me/trusted-contacts        agregar contacto de confianza
  DELETE /me/trusted-contacts/{id}
  POST   /safety/{match_id}/ping     ubicación live
  GET    /safety/{match_id}/peer      ubicación del otro
  POST   /safety/{match_id}/sos
  GET    /s/{token}                  link público contacto confianza

Reviews
  POST   /reviews
  GET    /reviews?user_id=...

Notifications
  GET    /notifications
  PATCH  /notifications/{id}/read
  POST   /notifications/register     push subscription
```

---

## 9. Decisiones de producto registradas

- **Alcance de salida**: cualquier actividad corta y casual (no solo alcohol).
- **Modalidad**: híbrida — tiempo real (`now`) y agendada (`scheduled`) en un solo modelo de "Plan".
- **Tamaño de grupo**: el anfitrión define (`max_participants`: 1 = 1-a-1, hasta N = grupo pequeño).
- **Mecanismo de conexión**: postulación + aceptación, no swipe.
- **Stack**: Python (FastAPI) + PostgreSQL/PostGIS + Redis + React/Vite/TS + Leaflet/OSM.
- **Auth**: Google OAuth + email/password. JWT + refresh.
- **Seguridad MVP**: ubicación compartida en salida, contacto de confianza, botón SOS, sistema de reseñas, bloqueos.
- **Verificación de identidad**: fuera del MVP; el modelo la prevé (`verification_level`).
- **Privacidad de ubicación**: grid ~150m hasta match confirmado; exacta solo durante salida activa con consentimiento.

---

## 10. Fuera de alcance (MVP)

- App nativa móvil (React Native / Flutter). Webapp responsive first.
- Pagos / monetización.
- Verificación de identidad con foto (post-MVP).
- Algoritmos de matching sofisticados (ML, compatibilidad profunda).
- Chat enriquecido (media, voz, video).
- Panel admin completo (solo moderación básica).
- Internacionalización multi-idioma (es-AR inicial).

---

## Referencias de mercado

- [Bumble BFF](https://bumble.com/es/friends) — amistad platónica.
- [Meetup](https://www.meetup.com/) — eventos grupales.
- [Patook](https://www.patook.com/) — amistad por intereses.
- [happn](https://www.happn.com/) — citas por cruce geográfico.
- [MeetMe](https://www.meetme.com/) — chat social.
