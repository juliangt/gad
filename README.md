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

## Stack técnico

- **Backend:** Python + FastAPI (API monolítica, REST + WebSockets).
- **Base de datos:** PostgreSQL + PostGIS (queries geográficas).
- **Cache/realtime:** Redis (pub/sub, notificaciones).
- **Frontend:** React + Vite + TypeScript + Tailwind.
- **Mapa:** Leaflet + OpenStreetMap (sin API key, sin costo).
- **Auth:** JWT + OAuth Google.

## Estado del proyecto

En fase de diseño. El spec completo está en [`docs/superpowers/specs/2026-07-05-gad-app-design.md`](docs/superpowers/specs/2026-07-05-gad-app-design.md).

## Estructura

```
gad/
├── docs/
│   └── superpowers/specs/   # especificaciones de diseño
├── backend/                 # API FastAPI (a implementar)
└── frontend/                # webapp React (a implementar)
```
