# GAD — Frontend

SPA de **GAD**, la webapp para encontrar compañía puntual y espontánea para una salida casual (un café, una cerveza, comer algo, un paseo). Este frontend consume la API REST/WebSocket del backend de GAD y cubre todo el flujo: auth, exploración de planes en mapa, matching por postulación, seguridad en tiempo real, reseñas, notificaciones y panel de administración.

> Stack: **React 19 + TypeScript + Vite**, **TanStack Query**, **React Router v7**, **Tailwind CSS v4**, **react-leaflet**. Tests con **Vitest + Testing Library**.

---

## Requisitos

- **Node.js** (recomendado ≥ 20)
- El backend de GAD corriendo (por defecto en `http://localhost:8000`).

## Puesta en marcha

```bash
npm install
cp .env.example .env.local   # ajusta URLs/backend y OAuth si hace falta
npm run dev                  # http://localhost:5173
```

El proxy de Vite reescribe `/api/*` y `/ws/*` hacia el backend definido en
`VITE_API_URL` / `VITE_PROXY_TARGET`, evitando problemas de CORS en desarrollo.

### Variables de entorno (`.env.local`)

| Variable | Descripción | Default |
|---|---|---|
| `VITE_API_URL` | URL base del backend (sin sufijo `/api`). | `http://localhost:8000` |
| `VITE_WS_URL` | URL del WebSocket del backend. | `ws://localhost:8000` |
| `VITE_OAUTH_GOOGLE_CLIENT_ID` | Client ID de Google OAuth (vacío = oculta el botón). | — |
| `VITE_ENABLE_PUSH` | Activa Web Push (requiere HTTPS + VAPID). | `true` |

Las variables se centralizan y tipan en `src/lib/env.ts`.

---

## Estructura del proyecto

```
src/
├── api/            # cliente fetch (apiRequest + helpers), interceptor de auth, errores (ApiError)
├── auth/           # AuthProvider, RequireAuth, tokenStore, hooks, schemas y páginas (login, registro, etc.)
├── components/
│   ├── layout/     # Header, PageSuspense (lazy loading de rutas)
│   └── ui/         # Design system: Button, Input, Modal, Avatar, Badge, BottomSheet, Spinner, ConfirmDialog…
├── features/       # módulos de dominio, cada uno con pages/, components/, hooks.ts, schemas.ts, types.ts
│   ├── admin/      # panel admin (dashboard, reportes, usuarios, reseñas) + RequireAdminRoute
│   ├── availability/ # modo disponible (alertas de plan compatible)
│   ├── matching/   # postulaciones, matches y detalle de match
│   ├── notifications/ # centro de notificaciones + NotificationBell
│   ├── plans/      # explorar (mapa), crear plan, detalle de plan
│   ├── reports/    # reportes de contenido/usuarios
│   ├── reviews/    # reseñas post-salida y reputación
│   ├── safety/     # ubicación en vivo, contacto de confianza, SOS, enlace de seguimiento
│   └── users/      # perfil propio/público, preferencias, bloqueos, verificación
├── lib/            # env (flags), format, geo, utils (cn)
├── pages/          # stubs públicos (explora, compartir)
├── test/           # setup de Vitest + utilidades
├── types/          # tipos comunes y enums compartidos
├── App.tsx         # monta el RouterProvider
├── router.tsx      # rutas públicas, protegidas (RequireAuth) y admin (RequireAdminRoute)
└── main.tsx        # bootstrap + QueryClient
```

Patrones clave:

- **Feature-first**: cada `features/<dominio>/` agrupa sus páginas, componentes, hooks y esquemas Zod.
- **Server state con TanStack Query**: los `hooks.ts` de cada feature exponen `useQuery`/`useMutation` tipados.
- **Validación con Zod** + `react-hook-form` en todos los formularios.
- **Feature flags** centralizados en `lib/env.ts` (p. ej. Web Push).

---

## Casos de uso cubiertos

- **Identidad y acceso**: registro/login con email o Google, recuperación y cambio de contraseña, rate-limit en auth.
- **Explorar planes**: mapa interactivo con slider de radio, filtros por actividad y horario (ahora/agendado).
- **Crear y gestionar planes**: tipo de actividad, cantidad de personas, ubicación y radio de búsqueda.
- **Matching por postulación**: postularse a un plan, aceptar/rechazar, ver aplicaciones recibidas y propias.
- **Modo disponible**: activar disponibilidad y recibir alertas de planes compatibles cercanos.
- **Seguridad**: ubicación aproximada hasta match confirmado, ubicación compartida en vivo durante la salida, contacto de confianza, botón de SOS y enlace público de seguimiento (`/s/:token`).
- **Reseñas y reputación**: valoración post-salida con reputación visible en perfiles.
- **Notificaciones**: centro de notificaciones y bell en el header.
- **Administración**: dashboard, gestión de reportes, usuarios y reseñas (rutas `/admin/*` con `RequireAdminRoute`).

---

## Cómo se prueba

```bash
npm test           # suite completa (vitest run, jsdom)
npm run test:watch # modo watch
npm run lint       # typecheck con tsc --noEmit
npm run build      # typecheck + build de producción (vite build)
```

- Tests unitarios y de componente con **Vitest** + **@testing-library/react**, en `src/**/__tests__/` y `*.test.tsx` junto a cada feature.
- Entorno **jsdom** configurado en `vitest.config.ts`, con `matchMedia` polyfill y limpieza automática en `src/test/setup.ts`.
- Cobertura con `@vitest/coverage-v8` (`npm test -- --coverage`).
- **E2E**: `@playwright/test` está disponible como dependencia para pruebas end-to-end.

---

## Build y despliegue

```bash
npm run build     # genera dist/ (tsc --noEmit && vite build)
npm run preview   # sirve el build localmente
npm run clean     # elimina dist/
```
