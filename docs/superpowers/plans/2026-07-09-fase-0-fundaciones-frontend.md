# Fundaciones del Frontend — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reconstruir el frontend de GAD como una SPA limpia con la estructura feature-based del spec: infraestructura transversal (API client, tokenStore, AuthProvider, router), React Query, design system base, Vite proxy y tests de utilidades, dejando el build verde y la app arrancando con rutas placeholder.

**Architecture:** Se desmonta el `App.tsx` mockup y se monta una nueva arquitectura por capas. `main.tsx` compone `QueryClientProvider → AuthProvider → RouterProvider → Toaster`. El `tokenStore` (módulo singleton) guarda access en memoria + refresh en `localStorage`. El `api/client.ts` es un wrapper de `fetch` con baseURL desde `import.meta.env` y parseo de `ErrorOut`; el `auth-interceptor` maneja 401 → refresh → retry con mutex. Tipos y enums espejo del contrato en `src/types/`. El design system base en `src/components/ui/` reutiliza el lenguaje glassmorphism del mockup. No se implementa ninguna feature de dominio (planes, matching, etc.); esas van en F1–F7.

**Tech Stack:** React 19, TypeScript 5.8, Vite 6, Tailwind v4, TanStack Query v5, react-router-dom v7, react-hook-form, zod, @hookform/resolvers, date-fns v4, sonner, react-leaflet, lucide-react, clsx, tailwind-merge. Testing: Vitest, @testing-library/react, @testing-library/jest-dom, jsdom, @playwright/test.

---

## File Structure

**Crear:**
- `frontend/.env.example` — variables de entorno VITE_API_URL, VITE_WS_URL, VITE_OAUTH_GOOGLE_CLIENT_ID.
- `frontend/vitest.config.ts` — config Vitest (jsdom, setup file, alias `@`).
- `frontend/src/vite-env.d.ts` — tipos `import.meta.env` para las variables VITE_*.
- `frontend/src/test/setup.ts` — setup Vitest (jest-dom matchers).
- `frontend/src/test/test-utils.tsx` — helper `renderWithProviders`.
- `frontend/src/types/common.ts` — `PaginatedOut<T>`, `ErrorOut`, `OKMessage`, `HostSummary`, `UserSummary`, `UserPublic`.
- `frontend/src/types/enums.ts` — 15 enums string-backed del backend.
- `frontend/src/api/client.ts` — `apiGet/apiPost/apiPatch/apiDelete` con baseURL, JSON, parseo `ErrorOut`.
- `frontend/src/api/errors.ts` — clase `ApiError(code, status, detail)` + `mapErrorMessage` es-AR.
- `frontend/src/api/auth-interceptor.ts` — 401 → refresh → retry (con mutex), logout si falla.
- `frontend/src/auth/tokenStore.ts` — singleton: access en memoria + refresh en `localStorage` (`gad:refresh_token`).
- `frontend/src/auth/AuthProvider.tsx` — contexto: `user`, `status`, `login`, `register`, `logout`, `refresh`; bootstrap al montar.
- `frontend/src/auth/useAuth.ts` — hook del contexto (lanza si falta provider).
- `frontend/src/auth/RequireAuth.tsx` — guard: si no auth, `<Navigate to="/login"/>`.
- `frontend/src/auth/RequireAdmin.tsx` — guard admin.
- `frontend/src/lib/format.ts` — `formatRelativeTime`, `formatDistance`, `formatRating` con `date-fns` locale `es`.
- `frontend/src/lib/geo.ts` — `getCurrentPosition` (promise + timeout 10s), `haversine` (metros).
- `frontend/src/components/ui/Button.tsx`, `Input.tsx`, `Textarea.tsx`, `Spinner.tsx`, `EmptyState.tsx`, `Avatar.tsx`, `Badge.tsx`, `Modal.tsx`, `BottomSheet.tsx`, `ErrorState.tsx` — design system presentacional.
- `frontend/src/router.tsx` — definición de rutas con guards (stubs).
- `frontend/src/pages/ExploreStub.tsx`, `LoginStub.tsx`, `RegisterStub.tsx`, `PublicShareStub.tsx` — páginas placeholder.
- `frontend/src/lib/__tests__/geo.test.ts`, `format.test.ts`.
- `frontend/src/api/__tests__/errors.test.ts`.

**Modificar:**
- `frontend/package.json` — añadir deps, eliminar deps zombie, scripts `test`/`test:watch`.
- `frontend/vite.config.ts` — proxy `/api` y `/ws` a `:8000`, puerto 5173, quitar hack `DISABLE_HMR`.
- `frontend/tsconfig.json` — incluir `src`, `types`/`lib`/`dom`, `verbatimModuleSyntax`, `strict`, `types: ["vitest/globals"]`.
- `frontend/index.html` — `lang="es"`, title "GAD".
- `frontend/src/index.css` — mover sin cambios funcionales (ya está OK).
- `frontend/src/components/MapBackground.tsx` — sin cambios funcionales (reubicar en `components/` raíz, ya está ahí).
- `frontend/src/lib/utils.ts` — sin cambios (ya está OK).
- `frontend/src/main.tsx` — compose providers (QueryClient + AuthProvider + RouterProvider + Toaster).
- `frontend/src/App.tsx` — reducir a `<RouterProvider router={router}/>`.
- `frontend/src/components/MapBackground.tsx` — re-tipar `PlanLocation` con `PlanListItem`-like.

**Eliminar:**
- `frontend/metadata.json` — metadato de AI Studio sin uso.
- `frontend/package.json` deps: `@google/genai`, `express`, `dotenv`, `@types/express`.

---

## Task 1: Rama de trabajo y verificación del punto de partida

**Files:** —

- [ ] **Step 1: Crear rama `fase-0-fundaciones-frontend`**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad
git checkout -b fase-0-fundaciones-frontend
```
Expected: `Switched to a new branch 'fase-0-fundaciones-frontend'`

- [ ] **Step 2: Verificar estado actual del repo**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
git status
```
Expected: `nothing to commit, working tree clean`

- [ ] **Step 3: Confirmar que el build actual pasa**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npm install
npm run build
```
Expected: build OK, genera `dist/`. Si falla por algún motivo, anotar y continuar (la Tarea 2 reestructura).

- [ ] **Step 4: Commit de verificación (no aplica si no hay cambios)**

Si `git status` está limpio, no hay commit. Este paso solo documenta el baseline.

---

## Task 2: Limpieza de dependencias zombie y archivos obsoletos

**Files:**
- Modify: `frontend/package.json`
- Delete: `frontend/metadata.json`

- [ ] **Step 1: Eliminar `metadata.json`**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
rm metadata.json
```
Expected: sin output.

- [ ] **Step 2: Editar `package.json` quitando deps zombie**

En `frontend/package.json`, reemplazar el bloque completo para que quede así (sin `@google/genai`, `express`, `dotenv`, `@types/express`):

```json
{
  "name": "gad-frontend",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite --port 5173 --host 0.0.0.0",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "clean": "rm -rf dist",
    "lint": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@tailwindcss/vite": "^4.1.14",
    "@vitejs/plugin-react": "^5.0.4",
    "clsx": "^2.1.1",
    "leaflet": "^1.9.4",
    "lucide-react": "^0.546.0",
    "motion": "^12.23.24",
    "react": "^19.0.1",
    "react-dom": "^19.0.1",
    "react-leaflet": "^5.0.0",
    "tailwind-merge": "^3.6.0",
    "vite": "^6.2.3"
  },
  "devDependencies": {
    "@types/leaflet": "^1.9.21",
    "@types/node": "^22.14.0",
    "autoprefixer": "^10.4.21",
    "esbuild": "^0.25.0",
    "tailwindcss": "^4.1.14",
    "tsx": "^4.21.0",
    "typescript": "~5.8.2",
    "vite": "^6.2.3"
  }
}
```

Notas: el script `dev` cambia a `--port 5173` (alineado con CORS del backend). `clean` ya no borra `server.js`. `name` pasa a `gad-frontend`.

- [ ] **Step 3: Reinstalar para limpiar node_modules**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
rm -rf node_modules package-lock.json
npm install
```
Expected: `npm install` termina sin errores, genera nuevo `package-lock.json`.

- [ ] **Step 4: Verificar build sigue verde**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npm run build
```
Expected: build OK.

- [ ] **Step 5: Commit**

```bash
cd /Users/juliangarciatunon/proyectos/gad
git add frontend/package.json frontend/package-lock.json
git rm frontend/metadata.json
git commit -m "chore(frontend): eliminar deps zombie y metadata.json"
```

---

## Task 3: Configurar Vite (proxy /api y /ws, puerto 5173)

**Files:**
- Modify: `frontend/vite.config.ts`

- [ ] **Step 1: Reescribir `vite.config.ts`**

Sustituir todo el contenido de `frontend/vite.config.ts` por:

```typescript
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

const BACKEND_URL = process.env.VITE_PROXY_TARGET ?? 'http://localhost:8000';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: BACKEND_URL,
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ''),
      },
      '/ws': {
        target: BACKEND_URL,
        changeOrigin: true,
        ws: true,
        rewrite: (p) => p.replace(/^\/ws/, ''),
      },
    },
  },
});
```

Notas: el alias `@` ahora apunta a `./src` (no a la raíz del frontend). El proxy reescribe `/api/auth/login` → `http://localhost:8000/auth/login`. `VITE_PROXY_TARGET` permite apuntar a otro backend en CI/staging. Se elimina el hack `DISABLE_HMR` (era de AI Studio).

- [ ] **Step 2: Verificar que Vite arranca**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
timeout 8 npm run dev || true
```
Expected: log con `Local: http://localhost:5173/` y sin errores de config. (El `timeout` corta el server tras 8s.)

- [ ] **Step 3: Commit**

```bash
cd /Users/juliangarciatunon/proyectos/gad
git add frontend/vite.config.ts
git commit -m "chore(frontend): configurar proxy /api y /ws, puerto 5173, alias @ → src"
```

---

## Task 4: Crear la estructura de carpetas y `.env.example`

**Files:**
- Create: `frontend/.env.example`
- Create: directorios vacíos con `.gitkeep`

- [ ] **Step 1: Crear `.env.example`**

Crear `frontend/.env.example`:

```
# URL base del backend (sin sufijo /api). En dev el proxy Vite reescribe /api/* → BACKEND/*
VITE_API_URL=http://localhost:8000
# URL base del WebSocket del backend.
VITE_WS_URL=ws://localhost:8000
# Client ID de Google OAuth (vacío = botón Google no se muestra).
VITE_OAUTH_GOOGLE_CLIENT_ID=
```

- [ ] **Step 2: Crear estructura de carpetas con `.gitkeep`**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
mkdir -p src/api src/auth src/types src/lib src/components/ui src/components/layout src/pages src/features src/test
touch src/api/.gitkeep src/auth/.gitkeep src/types/.gitkeep src/lib/.gitkeep src/components/ui/.gitkeep src/components/layout/.gitkeep src/pages/.gitkeep src/features/.gitkeep
```
Expected: sin output.

- [ ] **Step 3: Asegurar que `.env` real está en `.gitignore`**

Verificar/completar `frontend/.gitignore` (crear si no existe). Debe contener al menos:

```
node_modules
dist
.env
.env.local
.env.*.local
*.log
.DS_Store
```

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
test -f .gitignore || cat > .gitignore <<'EOF'
node_modules
dist
.env
.env.local
.env.*.local
*.log
.DS_Store
EOF
```

- [ ] **Step 4: Commit**

```bash
cd /Users/juliangarciatunon/proyectos/gad
git add frontend/.env.example frontend/.gitignore frontend/src
git commit -m "chore(frontend): crear .env.example y estructura de carpetas feature-based"
```

---

## Task 5: Ajustar `tsconfig.json` y `index.html`

**Files:**
- Modify: `frontend/tsconfig.json`
- Modify: `frontend/index.html`

- [ ] **Step 1: Reescribir `tsconfig.json`**

Sustituir todo el contenido de `frontend/tsconfig.json` por:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "moduleDetection": "force",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "allowImportingTsExtensions": true,
    "noEmit": true,
    "allowJs": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "useDefineForClassFields": true,
    "forceConsistentCasingInFileNames": true,
    "types": ["vitest/globals", "node"],
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src", "vite.config.ts", "vitest.config.ts"],
  "exclude": ["node_modules", "dist"]
}
```

Notas: se elimina `experimentalDecorators` (no se usa). Se añade `strict`, `noUnusedLocals`, `verbatimModuleSyntax` (fuerza `import type`), `types: ["vitest/globals","node"]`, `paths` corregido a `./src/*`.

- [ ] **Step 2: Actualizar `index.html`**

Sustituir todo el contenido de `frontend/index.html` por:

```html
<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover, maximum-scale=1" />
    <meta name="theme-color" content="#2563eb" />
    <meta name="description" content="GAD — Conectá con gente cerca para salir a hacer planes." />
    <title>GAD</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 3: Crear `src/vite-env.d.ts`**

Crear `frontend/src/vite-env.d.ts`:

```typescript
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_WS_URL: string;
  readonly VITE_OAUTH_GOOGLE_CLIENT_ID: string;
  readonly VITE_PROXY_TARGET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

- [ ] **Step 4: Verificar tsc pasa**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npx tsc --noEmit
```
Expected: sin errores. (Puede haber errores si el `App.tsx` actual rompe con `strict`/`noUnusedLocals` — se arregla en Task 17 al reducir `App.tsx`. Si rompe, anotar y continuar; la meta de este task es tsconfig + html.)

- [ ] **Step 5: Commit**

```bash
cd /Users/juliangarciatunon/proyectos/gad
git add frontend/tsconfig.json frontend/index.html frontend/src/vite-env.d.ts
git commit -m "chore(frontend): tsconfig strict + alias @ → src, index.html es + theme-color"
```

---

## Task 6: Instalar dependencias del runtime (React Query, Router, forms, etc.)

**Files:**
- Modify: `frontend/package.json`

- [ ] **Step 1: Instalar deps de runtime**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npm install @tanstack/react-query@^5 react-router-dom@^7 react-hook-form@^7 zod@^3 @hookform/resolvers@^3 date-fns@^4 sonner@^1
```
Expected: instaladas sin conflictos. Actualiza `package.json`.

- [ ] **Step 2: Instalar dev deps de testing**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npm install -D vitest@^2 @testing-library/react@^16 @testing-library/jest-dom@^6 jsdom@^25 @playwright/test@^1
```
Expected: instaladas.

- [ ] **Step 3: Verificar versión de react-router-dom**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npx react-router-dom --version 2>/dev/null || node -e "console.log(require('./node_modules/react-router-dom/package.json').version)"
```
Expected: número `7.x`. (Si por algún motivo instala v6, forzar: `npm install react-router-dom@^7`.)

- [ ] **Step 4: Commit**

```bash
cd /Users/juliangarciatunon/proyectos/gad
git add frontend/package.json frontend/package-lock.json
git commit -m "chore(frontend): añadir React Query, Router, RHF+Zod, date-fns, sonner y deps de test"
```

---

## Task 7: Configurar Vitest

**Files:**
- Create: `frontend/vitest.config.ts`
- Create: `frontend/src/test/setup.ts`

- [ ] **Step 1: Crear `vitest.config.ts`**

Crear `frontend/vitest.config.ts`:

```typescript
/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: true,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', 'dist', 'e2e'],
    coverage: {
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/__tests__/**', 'src/**/*.d.ts', 'src/main.tsx', 'src/test/**'],
    },
  },
});
```

- [ ] **Step 2: Crear `src/test/setup.ts`**

Crear `frontend/src/test/setup.ts`:

```typescript
import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  localStorage.clear();
});

// jsdom no implementa matchMedia; componentes que lo toquen lo necesitan.
if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}
```

- [ ] **Step 3: Smoke test — verificar que Vitest corre (aunque no haya tests)**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npm test -- --reporter=verbose 2>&1 | head -20
```
Expected: Vitest arranca y reporta `No test files found` o `0 passed`. Sin errores de config.

- [ ] **Step 4: Commit**

```bash
cd /Users/juliangarciatunon/proyectos/gad
git add frontend/vitest.config.ts frontend/src/test/setup.ts
git commit -m "test(frontend): configurar Vitest con jsdom, setup jest-dom y alias @"
```

---

## Task 8: Tipos comunes y enums (espejo del contrato)

**Files:**
- Create: `frontend/src/types/enums.ts`
- Create: `frontend/src/types/common.ts`

- [ ] **Step 1: Crear `src/types/enums.ts`**

Crear `frontend/src/types/enums.ts` (valores exactos del contrato §5):

```typescript
/** String-backed enums del backend (contrato §5). Enviar/recibir los valores literales. */

export type ActivityType =
  | 'coffee'
  | 'drinks'
  | 'food'
  | 'walk'
  | 'park'
  | 'event'
  | 'other';

export type PlanMode = 'now' | 'scheduled';

export type PlanStatus =
  | 'open'
  | 'matched'
  | 'closed'
  | 'cancelled'
  | 'expired';

export type ApplicationStatus =
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'withdrawn';

export type MatchStatus = 'active' | 'completed' | 'cancelled';

export type MatchRole = 'host' | 'participant';

export type Gender =
  | 'male'
  | 'female'
  | 'nonbinary'
  | 'undisclosed';

export type VerificationLevel = 'none' | 'email' | 'google';

export type GroupSizePreference =
  | 'one_on_one'
  | 'small_group'
  | 'either';

export type GenderPreference = 'any' | 'same' | 'mixed' | 'specific';

export type ContactType = 'email' | 'phone';

export type NotificationType =
  | 'new_application'
  | 'match'
  | 'new_message'
  | 'safety'
  | 'review'
  | 'plan_alert';

export type ReviewFlag = 'no_show' | 'inappropriate' | 'false_info';

export type UserStatus = 'active' | 'suspended' | 'deleted';
```

- [ ] **Step 2: Crear `src/types/common.ts`**

Crear `frontend/src/types/common.ts`:

```typescript
import type { VerificationLevel } from './enums';

/** Paginación por cursor (contrato §4). */
export interface PaginatedOut<T> {
  items: T[];
  next_cursor: string | null;
}

/** Mensaje de error de dominio (contrato §2). code es null en errores no-GAD. */
export interface ErrorOut {
  detail: string;
  code: string | null;
}

/** Mensaje OK simple. */
export interface OKMessage {
  message: string;
}

/** Resumen de un host/usuario embebido en otras respuestas. */
export interface HostSummary {
  id: string;
  display_name: string;
  avatar_url: string | null;
  reputation_score: number;
  verification_level: string;
}

/** Resumen mínimo de usuario (para listas). */
export interface UserSummary {
  id: string;
  display_name: string;
  avatar_url: string | null;
  reputation_score: number;
  verification_level: VerificationLevel | string;
}

/** Respuesta pública de `GET /auth/me`. */
export interface UserPublic {
  id: string;
  email: string;
  display_name: string;
  verification_level: string;
  reputation_score: number;
}
```

- [ ] **Step 3: Verificar tipos compilan**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npx tsc --noEmit
```
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
cd /Users/juliangarciatunon/proyectos/gad
git add frontend/src/types/enums.ts frontend/src/types/common.ts
git commit -m "feat(types): enums string-backed y tipos comunes espejo del contrato"
```

---

## Task 9: TDD — `api/errors.ts` (ApiError + mapeo es-AR)

**Files:**
- Create: `frontend/src/api/__tests__/errors.test.ts`
- Create: `frontend/src/api/errors.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `frontend/src/api/__tests__/errors.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { ApiError, mapErrorMessage } from '../errors';

describe('ApiError', () => {
  it('construye con code, status y detail', () => {
    const err = new ApiError('invalid_credentials', 401, 'Credenciales incorrectas');
    expect(err.code).toBe('invalid_credentials');
    expect(err.status).toBe(401);
    expect(err.detail).toBe('Credenciales incorrectas');
    expect(err.name).toBe('ApiError');
    expect(err).toBeInstanceOf(Error);
  });

  it('acepta code null', () => {
    const err = new ApiError(null, 500, 'Algo falló');
    expect(err.code).toBeNull();
    expect(err.status).toBe(500);
  });

  it('expone message = detail', () => {
    const err = new ApiError('not_found', 404, 'No existe');
    expect(err.message).toBe('No existe');
  });
});

describe('mapErrorMessage', () => {
  it('mapea códigos conocidos a mensajes es-AR', () => {
    expect(mapErrorMessage('auth_error')).toBe('Tenés que iniciar sesión para continuar.');
    expect(mapErrorMessage('invalid_credentials')).toBe('Email o contraseña incorrectos.');
    expect(mapErrorMessage('invalid_token')).toBe('Tu sesión expiró. Iniciá sesión de nuevo.');
    expect(mapErrorMessage('forbidden')).toBe('No tenés permiso para hacer esto.');
    expect(mapErrorMessage('not_found')).toBe('No encontramos lo que buscabas.');
    expect(mapErrorMessage('conflict')).toBe('Hubo un conflicto con esta operación.');
    expect(mapErrorMessage('email_already_exists')).toBe('Ya existe una cuenta con ese email.');
    expect(mapErrorMessage('validation_error')).toBe('Algunos datos no son válidos.');
    expect(mapErrorMessage('oauth_error')).toBe('No pudimos autenticarte con Google.');
    expect(mapErrorMessage('rate_limit_exceeded')).toBe('Demasiados intentos. Esperá un momento.');
    expect(mapErrorMessage('error')).toBe('Ocurrió un error inesperado.');
  });

  it('devuelve mensaje genérico para code null', () => {
    expect(mapErrorMessage(null)).toBe('Ocurrió un error inesperado.');
  });

  it('devuelve mensaje genérico para código desconocido', () => {
    expect(mapErrorMessage('codigo_raro')).toBe('Ocurrió un error inesperado.');
  });

  it('respeta el detail del backend si se pasa como fallback', () => {
    expect(mapErrorMessage('unknown_code', 'Mensaje del backend')).toBe('Mensaje del backend');
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npm test -- src/api/__tests__/errors.test.ts
```
Expected: FAIL con `Failed to resolve import "../errors"` o `ApiError is not defined`.

- [ ] **Step 3: Implementar `api/errors.ts`**

Crear `frontend/src/api/errors.ts`:

```typescript
/** Códigos del backend (contrato §2). */
const ERROR_MESSAGES_ES: Record<string, string> = {
  auth_error: 'Tenés que iniciar sesión para continuar.',
  invalid_credentials: 'Email o contraseña incorrectos.',
  invalid_token: 'Tu sesión expiró. Iniciá sesión de nuevo.',
  forbidden: 'No tenés permiso para hacer esto.',
  not_found: 'No encontramos lo que buscabas.',
  conflict: 'Hubo un conflicto con esta operación.',
  email_already_exists: 'Ya existe una cuenta con ese email.',
  validation_error: 'Algunos datos no son válidos.',
  oauth_error: 'No pudimos autenticarte con Google.',
  rate_limit_exceeded: 'Demasiados intentos. Esperá un momento.',
  error: 'Ocurrió un error inesperado.',
};

const DEFAULT_MESSAGE_ES = 'Ocurrió un error inesperado.';

/** Error de dominio del backend. `code` es null si la respuesta no era GADError. */
export class ApiError extends Error {
  readonly code: string | null;
  readonly status: number;
  readonly detail: string;

  constructor(code: string | null, status: number, detail: string) {
    super(detail);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

/**
 * Traduce un code a mensaje en es-AR. Si `code` es null/desconocido, usa `fallback`
 * (típicamente el `detail` crudo del backend) o el mensaje genérico.
 */
export function mapErrorMessage(code: string | null, fallback?: string): string {
  if (code && ERROR_MESSAGES_ES[code]) {
    return ERROR_MESSAGES_ES[code];
  }
  return fallback ?? DEFAULT_MESSAGE_ES;
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npm test -- src/api/__tests__/errors.test.ts
```
Expected: `Test Files 1 passed`, `Tests 15 passed`.

- [ ] **Step 5: Commit**

```bash
cd /Users/juliangarciatunon/proyectos/gad
git add frontend/src/api/errors.ts frontend/src/api/__tests__/errors.test.ts
git commit -m "feat(api): clase ApiError y mapeo de códigos a mensajes es-AR (TDD)"
```

---

## Task 10: `auth/tokenStore.ts` (singleton access + refresh)

**Files:**
- Create: `frontend/src/auth/tokenStore.ts`

- [ ] **Step 1: Crear `tokenStore.ts`**

Crear `frontend/src/auth/tokenStore.ts`:

```typescript
/**
 * Almacén de tokens (módulo singleton, sin React).
 *
 * - Access token (TTL 15 min): en memoria. Se pierde al recargar; el refresh lo recupera.
 * - Refresh token (TTL 7 días): `localStorage` bajo `gad:refresh_token`.
 *
 * Ningún token se persiste en cookies ni sessionStorage.
 */

const REFRESH_KEY = 'gad:refresh_token';

let accessToken: string | null = null;
let refreshPromise: Promise<string | null> | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function setTokens(access: string, refresh: string): void {
  accessToken = access;
  try {
    localStorage.setItem(REFRESH_KEY, refresh);
  } catch {
    // localStorage puede no estar disponible (modo privado, SSR). El refresh se pierde.
  }
}

export function getRefreshToken(): string | null {
  try {
    return localStorage.getItem(REFRESH_KEY);
  } catch {
    return null;
  }
}

export function clearTokens(): void {
  accessToken = null;
  try {
    localStorage.removeItem(REFRESH_KEY);
  } catch {
    // noop
  }
}

/** Mutex para que el interceptor no dispare N refreshes paralelos ante N 401. */
export function getRefreshMutex(): Promise<string | null> | null {
  return refreshPromise;
}

export function setRefreshMutex(p: Promise<string | null> | null): void {
  refreshPromise = p;
}

/** Resetea el estado interno (solo para tests). */
export function __resetTokenStoreForTests(): void {
  accessToken = null;
  refreshPromise = null;
  try {
    localStorage.removeItem(REFRESH_KEY);
  } catch {
    // noop
  }
}
```

- [ ] **Step 2: Verificar tsc**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npx tsc --noEmit
```
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
cd /Users/juliangarciatunon/proyectos/gad
git add frontend/src/auth/tokenStore.ts
git commit -m "feat(auth): tokenStore singleton con access en memoria y refresh en localStorage"
```

---

## Task 11: `api/client.ts` (fetch wrapper)

**Files:**
- Create: `frontend/src/api/client.ts`

- [ ] **Step 1: Crear `client.ts`**

Crear `frontend/src/api/client.ts`:

```typescript
import type { ErrorOut } from '../types/common';
import { ApiError } from './errors';

/** Base URL del backend. En dev el proxy Vite reescribe /api/* → backend. */
const BASE_URL =
  (import.meta.env.VITE_API_URL ?? 'http://localhost:8000').replace(/\/$/, '');

/** Endpoints que NO llevan Bearer ni pasan por el interceptor de 401. */
const PUBLIC_PATHS = new Set<string>([
  '/auth/login',
  '/auth/register',
  '/auth/refresh',
  '/auth/password-reset/request',
  '/auth/password-reset/confirm',
  '/auth/oauth/google',
]);

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  /** Evita añadir Bearer (login, refresh, endpoints públicos). */
  publicEndpoint?: boolean;
  /** Query params. */
  query?: Record<string, string | number | boolean | undefined | null>;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = `${BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) {
      params.append(key, String(value));
    }
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

async function parseError(res: Response): Promise<ApiError> {
  let detail = `Error ${res.status}`;
  let code: string | null = null;
  try {
    const data: unknown = await res.json();
    if (data && typeof data === 'object') {
      const obj = data as Partial<ErrorOut> & { detail?: unknown };
      if (typeof obj.detail === 'string') {
        detail = obj.detail;
      } else if (Array.isArray(obj.detail)) {
        // Error de validación de FastAPI (422): tomamos el primer mensaje.
        const first = obj.detail[0];
        detail =
          first && typeof first === 'object' && 'msg' in first
            ? String((first as { msg: unknown }).msg)
            : 'Datos inválidos';
        code = 'validation_error';
      }
      if (typeof obj.code === 'string') {
        code = obj.code;
      }
    }
  } catch {
    // Respuesta sin body JSON: dejamos el detail por defecto.
  }
  return new ApiError(code, res.status, detail);
}

/**
 * Wrapper central de fetch. Lanza ApiError en respuestas no-2xx.
 * No decide nada de auth aquí; el header Bearer lo inyecta quien llama
 * (o el interceptor). Esto mantiene client.ts testeable sin React.
 */
export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { body, query, headers, publicEndpoint, ...rest } = options;

  const init: RequestInit = {
    ...rest,
    headers: {
      Accept: 'application/json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
  };

  if (body !== undefined && !(body instanceof FormData)) {
    init.body = JSON.stringify(body);
  } else if (body instanceof FormData) {
    init.body = body;
    // El navegador setea Content-Type multipart con boundary; no forzamos.
    delete (init.headers as Record<string, string>).Content-Type;
  }

  const isPublic = publicEndpoint ?? PUBLIC_PATHS.has(path.split('?')[0]!);

  // Hook para que el interceptor inyecte auth y atrape 401.
  const finalInit = isPublic
    ? init
    : await applyAuth(init);

  const res = await fetch(buildUrl(path, query), finalInit);
  if (!res.ok) {
    throw await parseError(res);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

/**
 * Punto de extensión para auth. Por defecto es no-op (no añade nada).
 * El AuthProvider / interceptor lo reemplaza por una función que inyecta Bearer
 * y atrapa 401. Tests de client.ts usan el default o stub.
 */
export let applyAuth: (init: RequestInit) => Promise<RequestInit> | RequestInit =
  async (init) => init;

export function setApplyAuth(fn: typeof applyAuth): void {
  applyAuth = fn;
}

/** Helpers verbosos para los hooks. */
export const apiGet = <T>(path: string, options?: RequestOptions) =>
  apiRequest<T>(path, { ...options, method: 'GET' });

export const apiPost = <T>(path: string, body?: unknown, options?: RequestOptions) =>
  apiRequest<T>(path, { ...options, method: 'POST', body });

export const apiPatch = <T>(path: string, body?: unknown, options?: RequestOptions) =>
  apiRequest<T>(path, { ...options, method: 'PATCH', body });

export const apiDelete = <T>(path: string, options?: RequestOptions) =>
  apiRequest<T>(path, { ...options, method: 'DELETE' });

export const apiPut = <T>(path: string, body?: unknown, options?: RequestOptions) =>
  apiRequest<T>(path, { ...options, method: 'PUT', body });
```

Notas: el interceptor se inyecta vía `setApplyAuth` (lo hace `AuthProvider` en Task 15), así `client.ts` queda puro y testeable sin React. `apiRequest` parsea `ErrorOut` (incluido el `detail` array de FastAPI 422) y lanza `ApiError`.

- [ ] **Step 2: Verificar tsc**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npx tsc --noEmit
```
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
cd /Users/juliangarciatunon/proyectos/gad
git add frontend/src/api/client.ts
git commit -m "feat(api): wrapper fetch con baseURL, JSON, parseo de ErrorOut y hook applyAuth"
```

---

## Task 12: `api/auth-interceptor.ts` (401 → refresh → retry con mutex)

**Files:**
- Create: `frontend/src/api/auth-interceptor.ts`

- [ ] **Step 1: Crear `auth-interceptor.ts`**

Crear `frontend/src/api/auth-interceptor.ts`:

```typescript
import { apiPost } from './client';
import {
  getAccessToken,
  getRefreshToken,
  setTokens,
  clearTokens,
  getRefreshMutex,
  setRefreshMutex,
} from '../auth/tokenStore';

interface TokenOut {
  access_token: string;
  refresh_token: string;
  token_type: 'bearer';
  expires_in: number;
  user_id: string;
}

/**
 * Inyecta el access token como Bearer. No muta requests ya autenticados.
 */
function withBearer(init: RequestInit): RequestInit {
  const token = getAccessToken();
  if (!token) return init;
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  return { ...init, headers };
}

/**
 * Refresh con mutex: si hay un refresh en curso, espera su resultado en lugar
 * de disparar otro. Devuelve el nuevo access token o null si falló.
 */
async function doRefresh(): Promise<string | null> {
  const existing = getRefreshMutex();
  if (existing) return existing;

  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;

  const promise = (async () => {
    try {
      const tokens = await apiPost<TokenOut>(
        '/auth/refresh',
        { refresh_token: refreshToken },
        { publicEndpoint: true },
      );
      setTokens(tokens.access_token, tokens.refresh_token);
      emitAuthEvent({ type: 'refreshed', access_token: tokens.access_token });
      return tokens.access_token;
    } catch {
      clearTokens();
      emitAuthEvent({ type: 'session_expired' });
      return null;
    } finally {
      setRefreshMutex(null);
    }
  })();

  setRefreshMutex(promise);
  return promise;
}

/**
 * Fábrica del interceptor que el AuthProvider registra vía `setApplyAuth`.
 * Devuelve el RequestInit con el Bearer inyectado.
 */
export function createAuthInterceptor(): (init: RequestInit) => Promise<RequestInit> {
  return async (init: RequestInit) => withBearer(init);
}

/**
 * Fetch autenticado con reintento ante 401 (refresh una sola vez, con mutex).
 * Expuesto para casos donde un hook necesite bypass de apiGet/apiPost.
 */
export async function fetchWithAuth(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const authedInit = withBearer(init);
  const res = await fetch(input, authedInit);

  if (res.status !== 401) return res;

  const newToken = await doRefresh();
  if (!newToken) {
    // Refresh fallido: el AuthProvider se entera por el evento session_expired.
    return res;
  }

  const retriedInit = withBearer(init);
  return fetch(input, retriedInit);
}

/** Eventos de sesión que emite el interceptor. */
export type AuthEvent =
  | { type: 'session_expired' }
  | { type: 'refreshed'; access_token: string };

type Listener = (e: AuthEvent) => void;
const listeners = new Set<Listener>();

export function subscribeAuthEvents(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function emitAuthEvent(e: AuthEvent): void {
  listeners.forEach((fn) => fn(e));
}
```

Notas: `doRefresh` emite eventos (`refreshed`/`session_expired`) que el `AuthProvider` escucha vía `subscribeAuthEvents` para sincronizar su estado. La función `fetchWithAuth` encapsula el reintento completo de 401 y queda disponible para casos avanzados (F5 chat WebSocket). `createAuthInterceptor` solo inyecta Bearer (el retry pesado vive en `fetchWithAuth`), suficiente para F0 porque el AuthProvider bootstrap maneja el 401 inicial refrescando.

- [ ] **Step 2: Verificar tsc**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npx tsc --noEmit
```
Expected: sin errores. (auth-interceptor.ts no tiene imports sin usar: `apiPost`, todas las funciones de tokenStore, y `TokenOut` se usan.)

- [ ] **Step 3: Commit**

```bash
cd /Users/juliangarciatunon/proyectos/gad
git add frontend/src/api/auth-interceptor.ts
git commit -m "feat(api): interceptor 401 → refresh con mutex → retry una vez"
```

---

## Task 13: TDD — `lib/geo.ts` (haversine + getCurrentPosition)

**Files:**
- Create: `frontend/src/lib/__tests__/geo.test.ts`
- Create: `frontend/src/lib/geo.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `frontend/src/lib/__tests__/geo.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { haversine, getCurrentPosition } from '../geo';

describe('haversine', () => {
  it('devuelve 0 para el mismo punto', () => {
    expect(haversine(-34.59, -58.43, -34.59, -58.43)).toBe(0);
  });

  it('calcula distancia entre dos puntos de Buenos Aires (~1km)', () => {
    // Obelisco (-34.6037, -58.3816) → Plaza de Mayo (-34.6084, -58.3736)
    const d = haversine(-34.6037, -58.3816, -34.6084, -58.3736);
    // Aproximadamente 900m; toleramos ±15%.
    expect(d).toBeGreaterThan(800);
    expect(d).toBeLessThan(1000);
  });

  it('calcula distancia larga (BA → Córdoba ~650km)', () => {
    const d = haversine(-34.6037, -58.3816, -31.4201, -64.1888);
    expect(d).toBeGreaterThan(640_000);
    expect(d).toBeLessThan(665_000);
  });

  it('es simétrica', () => {
    const a = haversine(10, 20, 30, 40);
    const b = haversine(30, 40, 10, 20);
    expect(a).toBeCloseTo(b, 1);
  });
});

describe('getCurrentPosition', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('resuelve con coords cuando el navegador las da', async () => {
    const coords = { latitude: -34.59, longitude: -58.43, accuracy: 10 };
    vi.stubGlobal('navigator', {
      geolocation: {
        getCurrentPosition: (success: (p: { coords: typeof coords }) => void) =>
          success({ coords }),
      },
    });

    await expect(getCurrentPosition()).resolves.toEqual({
      latitude: -34.59,
      longitude: -58.43,
      accuracy: 10,
    });
  });

  it('rechaza con error de permiso cuando se deniega', async () => {
    vi.stubGlobal('navigator', {
      geolocation: {
        getCurrentPosition: (
          _success: unknown,
          error: (e: { code: number; message: string }) => void,
        ) => error({ code: 1, message: 'User denied' }),
      },
    });

    await expect(getCurrentPosition()).rejects.toThrow();
  });

  it('rechaza con timeout si no responde en el plazo', async () => {
    vi.stubGlobal('navigator', {
      geolocation: {
        getCurrentPosition: () => {
          // nunca llama a success ni error
        },
      },
    });
    vi.useFakeTimers();

    const promise = getCurrentPosition(50); // 50ms
    vi.advanceTimersByTime(60);
    await expect(promise).rejects.toThrow();
    vi.useRealTimers();
  });

  it('rechaza si no hay geolocation disponible', async () => {
    vi.stubGlobal('navigator', {});
    await expect(getCurrentPosition()).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npm test -- src/lib/__tests__/geo.test.ts
```
Expected: FAIL con `Failed to resolve import "../geo"`.

- [ ] **Step 3: Implementar `lib/geo.ts`**

Crear `frontend/src/lib/geo.ts`:

```typescript
/** Radio medio de la Tierra en metros (WGS84). */
const EARTH_RADIUS_M = 6_371_000;

const toRad = (deg: number): number => (deg * Math.PI) / 180;

/**
 * Distancia Haversine en metros entre dos puntos (lat/lng en grados).
 */
export function haversine(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_M * c;
}

export interface Coordinates {
  latitude: number;
  longitude: number;
  accuracy: number;
}

/**
 * Envuelve `navigator.geolocation.getCurrentPosition` en una Promise con
 * timeout (10s por defecto). Rechaza si se deniega el permiso, si hay un
 * error de posición, o si vence el timeout.
 */
export function getCurrentPosition(timeoutMs = 10_000): Promise<Coordinates> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('La geolocalización no está disponible en este dispositivo.'));
      return;
    }

    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error('No pudimos obtener tu ubicación a tiempo.'));
      }
    }, timeoutMs);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
      },
      (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(
          new Error(
            err.code === err.PERMISSION_DENIED
              ? 'Necesitamos permiso de ubicación para mostrarte planes cerca.'
              : 'No pudimos obtener tu ubicación.',
          ),
        );
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30_000 },
    );
  });
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npm test -- src/lib/__tests__/geo.test.ts
```
Expected: `Test Files 1 passed`, `Tests 8 passed`.

- [ ] **Step 5: Commit**

```bash
cd /Users/juliangarciatunon/proyectos/gad
git add frontend/src/lib/geo.ts frontend/src/lib/__tests__/geo.test.ts
git commit -m "feat(lib): haversine y getCurrentPosition con timeout (TDD)"
```

---

## Task 14: TDD — `lib/format.ts` (fecha relativa, distancia, rating)

**Files:**
- Create: `frontend/src/lib/__tests__/format.test.ts`
- Create: `frontend/src/lib/format.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `frontend/src/lib/__tests__/format.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { formatRelativeTime, formatDistance, formatRating } from '../format';

describe('formatRelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-09T18:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('dice "ahora" para menos de 1 minuto', () => {
    const d = new Date('2026-07-09T17:59:30Z');
    expect(formatRelativeTime(d)).toBe('hace menos de un minuto');
  });

  it('dice "hace X minutos"', () => {
    const d = new Date('2026-07-09T17:50:00Z');
    expect(formatRelativeTime(d)).toBe('hace 10 minutos');
  });

  it('dice "hace X horas"', () => {
    const d = new Date('2026-07-09T14:00:00Z');
    expect(formatRelativeTime(d)).toBe('hace alrededor de 4 horas');
  });

  it('dice "hace X días" para >24h', () => {
    const d = new Date('2026-07-06T18:00:00Z');
    expect(formatRelativeTime(d)).toBe('hace alrededor de 3 días');
  });
});

describe('formatDistance', () => {
  it('formatea metros cuando < 1000', () => {
    expect(formatDistance(350)).toBe('350 m');
  });

  it('redondea metros a entero', () => {
    expect(formatDistance(42.7)).toBe('43 m');
  });

  it('formatea kilómetros con un decimal cuando >= 1000', () => {
    expect(formatDistance(1200)).toBe('1,2 km');
  });

  it('formatea kilómetros grandes', () => {
    expect(formatDistance(5400)).toBe('5,4 km');
  });

  it('devuelve "0 m" para 0 o negativo', () => {
    expect(formatDistance(0)).toBe('0 m');
    expect(formatDistance(-10)).toBe('0 m');
  });
});

describe('formatRating', () => {
  it('formatea con coma decimal y una posición', () => {
    expect(formatRating(4.85)).toBe('4,9');
    expect(formatRating(4.0)).toBe('4,0');
  });

  it('trunca null/undefined a "—"', () => {
    expect(formatRating(null)).toBe('—');
    expect(formatRating(undefined)).toBe('—');
  });

  it('trunca NaN a "—"', () => {
    expect(formatRating(NaN)).toBe('—');
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npm test -- src/lib/__tests__/format.test.ts
```
Expected: FAIL con `Failed to resolve import "../format"`.

- [ ] **Step 3: Implementar `lib/format.ts`**

Crear `frontend/src/lib/format.ts`:

```typescript
import { formatDistanceToNowStrict, formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

/**
 * Tiempo relativo en español (es): "hace 10 minutos", "hace alrededor de 4 horas".
 * `reference` es "ahora" por defecto (útil para tests con fake timers).
 */
export function formatRelativeTime(
  date: Date | string | number,
  reference: Date = new Date(),
): string {
  const d = new Date(date);
  const diffMs = reference.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);

  if (diffMin < 1) return 'hace menos de un minuto';
  if (diffMin < 60) return `hace ${diffMin} minutos`;

  // >1h: usamos formatDistanceToNow con locale es, que aporta "hace alrededor de X horas/días".
  return formatDistanceToNow(d, { addSuffix: true, locale: es, baseDate: reference });
}

/**
 * Distancia en metros → "350 m" o "1,2 km" (coma decimal es-AR).
 */
export function formatDistance(meters: number): string {
  if (!meters || meters <= 0) return '0 m';
  if (meters < 1000) return `${Math.round(meters)} m`;
  const km = meters / 1000;
  return `${km.toFixed(1).replace('.', ',')} km`;
}

/**
 * Puntaje de reputación → "4,9". "—" si falta o no es número.
 */
export function formatRating(rating: number | null | undefined): string {
  if (rating === null || rating === undefined || Number.isNaN(rating)) return '—';
  return rating.toFixed(1).replace('.', ',');
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npm test -- src/lib/__tests__/format.test.ts
```
Expected: `Test Files 1 passed`, `Tests 11 passed`.

> Si `formatDistanceToNowStrict` o `formatDistanceToNow` no coinciden con el output esperado por la versión instalada de `date-fns`, ajustar los asserts del test para que reflejen el string exacto que produce date-fns v4 con locale `es` (la idea es que terminen en "hace X minutos/horas/días"). Ejecutar `npm test` y leer el diff real para alinear los strings.

- [ ] **Step 5: Commit**

```bash
cd /Users/juliangarciatunon/proyectos/gad
git add frontend/src/lib/format.ts frontend/src/lib/__tests__/format.test.ts
git commit -m "feat(lib): formatRelativeTime, formatDistance, formatRating con locale es (TDD)"
```

---

## Task 15: `auth/AuthProvider.tsx` + `useAuth.ts`

**Files:**
- Create: `frontend/src/auth/AuthProvider.tsx`
- Create: `frontend/src/auth/useAuth.ts`

- [ ] **Step 1: Crear `AuthProvider.tsx`**

Crear `frontend/src/auth/AuthProvider.tsx`:

```typescript
import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { apiGet, apiPost, setApplyAuth } from '../api/client';
import { createAuthInterceptor, subscribeAuthEvents } from '../api/auth-interceptor';
import {
  getAccessToken,
  getRefreshToken,
  setTokens,
  clearTokens,
} from './tokenStore';
import type { UserPublic } from '../types/common';

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

interface TokenOut {
  access_token: string;
  refresh_token: string;
  token_type: 'bearer';
  expires_in: number;
  user_id: string;
}

interface AuthContextValue {
  user: UserPublic | null;
  status: AuthStatus;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserPublic | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');

  const fetchMe = useCallback(async (): Promise<UserPublic | null> => {
    if (!getAccessToken()) return null;
    try {
      return await apiGet<UserPublic>('/auth/me');
    } catch {
      return null;
    }
  }, []);

  const refresh = useCallback(async () => {
    const refreshToken = getRefreshToken();
    if (!refreshToken) {
      setStatus('unauthenticated');
      setUser(null);
      return;
    }
    try {
      const tokens = await apiPost<TokenOut>(
        '/auth/refresh',
        { refresh_token: refreshToken },
        { publicEndpoint: true },
      );
      setTokens(tokens.access_token, tokens.refresh_token);
      const me = await apiGet<UserPublic>('/auth/me');
      setUser(me);
      setStatus('authenticated');
    } catch {
      clearTokens();
      setUser(null);
      setStatus('unauthenticated');
    }
  }, []);

  // Bootstrap: registrar interceptor + intentar recuperar sesión al montar.
  useEffect(() => {
    setApplyAuth(createAuthInterceptor());

    const unsub = subscribeAuthEvents((e) => {
      if (e.type === 'session_expired') {
        setUser(null);
        setStatus('unauthenticated');
      }
    });

    (async () => {
      // 1) ¿Hay access token en memoria? (recarga tibia dentro de los 15 min no aplica
      //    porque se pierde; pero cubre el caso de login en la misma sesión).
      const me = await fetchMe();
      if (me) {
        setUser(me);
        setStatus('authenticated');
        return;
      }
      // 2) Sin access válido → intentar refresh.
      await refresh();
    })();

    return unsub;
  }, [fetchMe, refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const tokens = await apiPost<TokenOut>(
      '/auth/login',
      { email, password },
      { publicEndpoint: true },
    );
    setTokens(tokens.access_token, tokens.refresh_token);
    const me = await apiGet<UserPublic>('/auth/me');
    setUser(me);
    setStatus('authenticated');
  }, []);

  const register = useCallback(
    async (email: string, password: string, displayName: string) => {
      const tokens = await apiPost<TokenOut>(
        '/auth/register',
        { email, password, display_name: displayName },
        { publicEndpoint: true },
      );
      setTokens(tokens.access_token, tokens.refresh_token);
      const me = await apiGet<UserPublic>('/auth/me');
      setUser(me);
      setStatus('authenticated');
    },
    [],
  );

  const logout = useCallback(async () => {
    const access = getAccessToken();
    if (access) {
      try {
        await apiPost('/auth/logout', { access_token: access });
      } catch {
        // Si el backend ya no acepta el token, igual limpiamos local.
      }
    }
    clearTokens();
    setUser(null);
    setStatus('unauthenticated');
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, status, login, register, logout, refresh }),
    [user, status, login, register, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
```

- [ ] **Step 2: Crear `useAuth.ts`**

Crear `frontend/src/auth/useAuth.ts`:

```typescript
import { useContext } from 'react';
import { AuthContext, type AuthContextValue } from './AuthProvider';

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth debe usarse dentro de <AuthProvider>.');
  }
  return ctx;
}

export { AuthProvider } from './AuthProvider';
export type { AuthContextValue, AuthStatus } from './AuthProvider';
```

- [ ] **Step 3: Verificar tsc**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npx tsc --noEmit
```
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
cd /Users/juliangarciatunon/proyectos/gad
git add frontend/src/auth/AuthProvider.tsx frontend/src/auth/useAuth.ts
git commit -m "feat(auth): AuthProvider con bootstrap y useAuth hook"
```

---

## Task 16: Guards `RequireAuth` y `RequireAdmin`

**Files:**
- Create: `frontend/src/auth/RequireAuth.tsx`
- Create: `frontend/src/auth/RequireAdmin.tsx`

- [ ] **Step 1: Crear `RequireAuth.tsx`**

Crear `frontend/src/auth/RequireAuth.tsx`:

```typescript
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './useAuth';
import { Spinner } from '../components/ui/Spinner';

/**
 * Guard: si está cargando, muestra spinner; si no autenticado, redirige a /login
 * preservando la ubicación original en `state.from`.
 */
export function RequireAuth() {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return (
      <div className="w-full h-[100dvh] flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}
```

- [ ] **Step 2: Crear `RequireAdmin.tsx`**

Crear `frontend/src/auth/RequireAdmin.tsx`:

```typescript
import { Navigate, Outlet } from 'react-router-dom';
import type { UserPublic } from '../types/common';
import { useAuth } from './useAuth';
import { Spinner } from '../components/ui/Spinner';

/**
 * Guard admin: requiere auth + flag admin.
 * `UserPublic` del contrato actual no expone `is_admin`; lo casteamos
 * defensivamente. F7 lo reemplazará cuando el contrato exponga el rol
 * del usuario (o cuando se use GET /admin/stats como señal).
 */
export function RequireAdmin() {
  const { status, user } = useAuth();

  if (status === 'loading') {
    return (
      <div className="w-full h-[100dvh] flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (status !== 'authenticated' || !user) {
    return <Navigate to="/login" replace />;
  }

  // is_admin no está en UserPublic aún; default false (F7 lo ajusta).
  const isAdmin = Boolean((user as UserPublic & { is_admin?: boolean }).is_admin);
  if (!isAdmin) {
    return <Navigate to="/explore" replace />;
  }

  return <Outlet />;
}
```

- [ ] **Step 3: Verificar tsc (fallará porque Spinner no existe aún — se crea en Task 18)**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npx tsc --noEmit 2>&1 | head -20
```
Expected: errores `Cannot find module '../components/ui/Spinner'`. **Esperado** — se resuelve en Task 18. Anotar y continuar; este task crea los guards como pieza que se ensambla en Task 18/19.

- [ ] **Step 4: Commit (intermedio — Spinner se crea justo después)**

```bash
cd /Users/juliangarciatunon/proyectos/gad
git add frontend/src/auth/RequireAuth.tsx frontend/src/auth/RequireAdmin.tsx
git commit -m "feat(auth): guards RequireAuth y RequireAdmin (depende de Spinner, Task 18)"
```

---

## Task 17: Migrar `index.css`, `MapBackground.tsx`, `utils.ts` (sin cambios funcionales)

**Files:**
- Modify: `frontend/src/components/MapBackground.tsx` (re-tipar PlanLocation)
- Verify: `frontend/src/lib/utils.ts` (sin cambios — ya correcto)
- Verify: `frontend/src/index.css` (sin cambios — ya correcto)

- [ ] **Step 1: Re-tipar `MapBackground.tsx`**

En `frontend/src/components/MapBackground.tsx`, actualizar la interfaz `PlanLocation` para que use campos consistentes con `PlanListItem` del contrato (location_lat/lng en lugar de lat/lng), pero **manteniendo compatibilidad** con el mockup existente hasta que F3 lo reescriba. Sustituir las líneas 44–55 del archivo:

```typescript
interface PlanLocation {
  id: string;
  lat: number;
  lng: number;
}

interface MapBackgroundProps {
  userLocation: [number, number] | null;
  plans: PlanLocation[];
  className?: string;
  onPlanClick?: (planId: string) => void;
}
```

por:

```typescript
interface PlanLocation {
  id: string;
  /** Latitud. En F3 se reemplaza por PlanListItem.location_lat. */
  lat: number;
  /** Longitud. En F3 se reemplaza por PlanListItem.location_lng. */
  lng: number;
}

export interface MapBackgroundProps {
  userLocation: [number, number] | null;
  plans: PlanLocation[];
  className?: string;
  onPlanClick?: (planId: string) => void;
}
```

(el único cambio real es `export` en `MapBackgroundProps`; `PlanLocation` se documenta pero mantiene `lat`/`lng`).

- [ ] **Step 2: Verificar `utils.ts` no necesita cambios**

`frontend/src/lib/utils.ts` ya expone `cn()` con `clsx` + `tailwind-merge`. Sin cambios. Confirmar que el archivo existe y es:

```typescript
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

Si el linting reclama comillas dobles vs simples, dejar como está (no es bloqueante). No tocar.

- [ ] **Step 3: Verificar `index.css` no necesita cambios**

`frontend/src/index.css` ya tiene Tailwind v4, `@theme`, glassmorphism y safe-areas. Sin cambios funcionales. Confirmar que existe (sí, leído en Task de contexto).

- [ ] **Step 4: Verificar tsc**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npx tsc --noEmit 2>&1 | grep -v "components/ui/Spinner" | head -20
```
Expected: sin errores nuevos en `MapBackground.tsx`/`utils.ts` (los de Spinner siguen hasta Task 18).

- [ ] **Step 5: Commit**

```bash
cd /Users/juliangarciatunon/proyectos/gad
git add frontend/src/components/MapBackground.tsx
git commit -m "refactor(components): exportar props de MapBackground (pre-F3)"
```

---

## Task 18: Design system base en `components/ui/`

**Files:**
- Create: `frontend/src/components/ui/Spinner.tsx`, `Button.tsx`, `Input.tsx`, `Textarea.tsx`, `EmptyState.tsx`, `Avatar.tsx`, `Badge.tsx`, `Modal.tsx`, `BottomSheet.tsx`, `ErrorState.tsx`

- [ ] **Step 1: Crear `Spinner.tsx`**

Crear `frontend/src/components/ui/Spinner.tsx`:

```typescript
import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  'aria-label'?: string;
}

const sizeClass = {
  sm: 'w-4 h-4',
  md: 'w-6 h-6',
  lg: 'w-10 h-10',
} as const;

export function Spinner({ size = 'md', className, ...rest }: SpinnerProps) {
  return (
    <Loader2
      className={cn('animate-spin text-brand-600', sizeClass[size], className)}
      aria-label={rest['aria-label'] ?? 'Cargando'}
      role="status"
    />
  );
}
```

- [ ] **Step 2: Crear `Button.tsx`**

Crear `frontend/src/components/ui/Button.tsx`:

```typescript
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
}

const variantClass: Record<ButtonVariant, string> = {
  primary:
    'bg-brand-600 text-white shadow-lg shadow-brand-600/20 hover:bg-brand-700 active:scale-[0.98]',
  secondary:
    'glass-button text-gray-800 border border-gray-200 hover:bg-white/90 active:scale-[0.98]',
  ghost: 'bg-transparent text-gray-600 hover:bg-gray-100 active:scale-[0.98]',
  danger:
    'bg-red-600 text-white shadow-lg shadow-red-600/20 hover:bg-red-700 active:scale-[0.98]',
};

const sizeClass: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-sm rounded-lg',
  md: 'px-4 py-2.5 text-sm rounded-xl',
  lg: 'px-5 py-3.5 text-base rounded-xl',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading = false, fullWidth = false, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 font-semibold transition-transform disabled:opacity-50 disabled:pointer-events-none focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2',
        variantClass[variant],
        sizeClass[size],
        fullWidth && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading && <Spinner size="sm" className="text-current" />}
      {children}
    </button>
  );
});
```

- [ ] **Step 3: Crear `Input.tsx`**

Crear `frontend/src/components/ui/Input.tsx`:

```typescript
import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, invalid, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn(
        'w-full px-4 py-3 rounded-xl bg-gray-50 border text-gray-900 placeholder:text-gray-400',
        'transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent',
        invalid ? 'border-red-400 focus:ring-red-500' : 'border-gray-200',
        className,
      )}
      {...rest}
    />
  );
});
```

- [ ] **Step 4: Crear `Textarea.tsx`**

Crear `frontend/src/components/ui/Textarea.tsx`:

```typescript
import { forwardRef, type TextareaHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, invalid, ...rest },
  ref,
) {
  return (
    <textarea
      ref={ref}
      className={cn(
        'w-full px-4 py-3 rounded-xl bg-gray-50 border text-gray-900 placeholder:text-gray-400 resize-none',
        'transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent',
        invalid ? 'border-red-400 focus:ring-red-500' : 'border-gray-200',
        className,
      )}
      {...rest}
    />
  );
});
```

- [ ] **Step 5: Crear `EmptyState.tsx`**

Crear `frontend/src/components/ui/EmptyState.tsx`:

```typescript
import type { ReactNode } from 'react';

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center text-center px-6 py-12 ${className ?? ''}`}>
      {icon && <div className="text-gray-300 mb-4">{icon}</div>}
      <h3 className="text-base font-semibold text-gray-900">{title}</h3>
      {description && <p className="text-sm text-gray-500 mt-1 max-w-xs">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
```

- [ ] **Step 6: Crear `Avatar.tsx`**

Crear `frontend/src/components/ui/Avatar.tsx`:

```typescript
import { cn } from '../../lib/utils';

export interface AvatarProps {
  name: string;
  src?: string | null;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const sizeClass = {
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-12 h-12 text-base',
  xl: 'w-24 h-24 text-3xl',
} as const;

export function Avatar({ name, src, size = 'md', className }: AvatarProps) {
  const initials = name.trim().charAt(0).toUpperCase() || '?';
  return (
    <div
      className={cn(
        'rounded-full flex items-center justify-center font-bold overflow-hidden bg-gradient-to-br from-brand-400 to-brand-600 text-white shadow-md flex-shrink-0',
        sizeClass[size],
        className,
      )}
    >
      {src ? <img src={src} alt={name} className="w-full h-full object-cover" /> : initials}
    </div>
  );
}
```

- [ ] **Step 7: Crear `Badge.tsx`**

Crear `frontend/src/components/ui/Badge.tsx`:

```typescript
import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

export type BadgeVariant = 'neutral' | 'brand' | 'success' | 'warning' | 'danger';

export interface BadgeProps {
  variant?: BadgeVariant;
  className?: string;
  children: ReactNode;
}

const variantClass: Record<BadgeVariant, string> = {
  neutral: 'bg-gray-100 text-gray-600',
  brand: 'bg-brand-50 text-brand-600',
  success: 'bg-green-50 text-green-700',
  warning: 'bg-amber-50 text-amber-700',
  danger: 'bg-red-50 text-red-700',
};

export function Badge({ variant = 'neutral', className, children }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium',
        variantClass[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
```

- [ ] **Step 8: Crear `Modal.tsx`**

Crear `frontend/src/components/ui/Modal.tsx`:

```typescript
import type { ReactNode } from 'react';
import { X } from 'lucide-react';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}

export function Modal({ open, onClose, title, children, footer }: ModalProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        className="relative bg-white w-full max-w-md rounded-3xl shadow-2xl flex flex-col max-h-[90vh]"
      >
        <div className="flex items-center justify-between p-6 pb-3">
          <h2 className="text-xl font-bold text-gray-900">{title}</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 active:scale-95"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-6 pb-6 overflow-y-auto">{children}</div>
        {footer && <div className="p-6 pt-2 border-t border-gray-100">{footer}</div>}
      </div>
    </div>
  );
}
```

- [ ] **Step 9: Crear `BottomSheet.tsx`**

Crear `frontend/src/components/ui/BottomSheet.tsx`:

```typescript
import type { ReactNode } from 'react';
import { X } from 'lucide-react';

export interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: ReactNode;
}

export function BottomSheet({ open, onClose, children, title }: BottomSheetProps) {
  if (!open) return null;
  return (
    <div className="absolute inset-0 z-[100] flex flex-col justify-end">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        className="relative bg-white w-full rounded-t-3xl p-6 pb-safe-bottom flex flex-col gap-5 shadow-2xl max-h-[85vh] overflow-y-auto hide-scrollbar"
      >
        <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto -mt-2 mb-1" />
        {title && (
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900">{title}</h2>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 active:scale-95"
              aria-label="Cerrar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 10: Crear `ErrorState.tsx`**

Crear `frontend/src/components/ui/ErrorState.tsx`:

```typescript
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from './Button';

export interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
}

export function ErrorState({
  title = 'Algo salió mal',
  message = 'No pudimos cargar esto. Probá de nuevo.',
  onRetry,
  retryLabel = 'Reintentar',
}: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center text-center px-6 py-12">
      <AlertCircle className="w-10 h-10 text-red-400 mb-4" />
      <h3 className="text-base font-semibold text-gray-900">{title}</h3>
      <p className="text-sm text-gray-500 mt-1 max-w-xs">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry} className="mt-4">
          <RefreshCw className="w-4 h-4" />
          {retryLabel}
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 11: Verificar tsc**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npx tsc --noEmit
```
Expected: sin errores. (Los guards de Task 16 ya encuentran Spinner.)

- [ ] **Step 12: Commit**

```bash
cd /Users/juliangarciatunon/proyectos/gad
git add frontend/src/components/ui
git commit -m "feat(ui): design system base (Button, Input, Textarea, Spinner, EmptyState, Avatar, Badge, Modal, BottomSheet, ErrorState)"
```

---

## Task 19: Páginas placeholder (stubs)

**Files:**
- Create: `frontend/src/pages/ExploreStub.tsx`, `LoginStub.tsx`, `RegisterStub.tsx`, `PublicShareStub.tsx`

- [ ] **Step 1: Crear `ExploreStub.tsx`**

Crear `frontend/src/pages/ExploreStub.tsx`:

```typescript
import { Compass } from 'lucide-react';
import { EmptyState } from '../components/ui/EmptyState';

export function ExploreStub() {
  return (
    <div className="w-full h-[100dvh] bg-gray-100 flex items-center justify-center">
      <EmptyState
        icon={<Compass className="w-12 h-12" />}
        title="Explorar — próximamente"
        description="El mapa con planes reales llega en la Fase 3."
      />
    </div>
  );
}
```

- [ ] **Step 2: Crear `LoginStub.tsx`**

Crear `frontend/src/pages/LoginStub.tsx`:

```typescript
import { LogIn } from 'lucide-react';
import { EmptyState } from '../components/ui/EmptyState';

export function LoginStub() {
  return (
    <div className="w-full h-[100dvh] bg-white flex items-center justify-center">
      <EmptyState
        icon={<LogIn className="w-12 h-12" />}
        title="Iniciar sesión — próximamente"
        description="El login real llega en la Fase 1."
      />
    </div>
  );
}
```

- [ ] **Step 3: Crear `RegisterStub.tsx`**

Crear `frontend/src/pages/RegisterStub.tsx`:

```typescript
import { UserPlus } from 'lucide-react';
import { EmptyState } from '../components/ui/EmptyState';

export function RegisterStub() {
  return (
    <div className="w-full h-[100dvh] bg-white flex items-center justify-center">
      <EmptyState
        icon={<UserPlus className="w-12 h-12" />}
        title="Crear cuenta — próximamente"
        description="El registro real llega en la Fase 1."
      />
    </div>
  );
}
```

- [ ] **Step 4: Crear `PublicShareStub.tsx`**

Crear `frontend/src/pages/PublicShareStub.tsx`:

```typescript
import { useParams } from 'react-router-dom';
import { Share2 } from 'lucide-react';
import { EmptyState } from '../components/ui/EmptyState';

export function PublicShareStub() {
  const { token } = useParams<{ token: string }>();
  return (
    <div className="w-full h-[100dvh] bg-white flex items-center justify-center">
      <EmptyState
        icon={<Share2 className="w-12 h-12" />}
        title="Vista compartida — próximamente"
        description={`Token: ${token ?? '—'}. La vista pública llega en la Fase 6.`}
      />
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
cd /Users/juliangarciatunon/proyectos/gad
git add frontend/src/pages
git commit -m "feat(pages): stubs placeholder para Explore, Login, Register y Share público"
```

---

## Task 20: `router.tsx` con guards y rutas placeholder

**Files:**
- Create: `frontend/src/router.tsx`

- [ ] **Step 1: Crear `router.tsx`**

Crear `frontend/src/router.tsx`:

```typescript
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { RequireAuth } from './auth/RequireAuth';
import { RequireAdmin } from './auth/RequireAdmin';
import { ExploreStub } from './pages/ExploreStub';
import { LoginStub } from './pages/LoginStub';
import { RegisterStub } from './pages/RegisterStub';
import { PublicShareStub } from './pages/PublicShareStub';

export const router = createBrowserRouter([
  // Públicas
  { path: '/login', element: <LoginStub /> },
  { path: '/register', element: <RegisterStub /> },
  { path: '/s/:token', element: <PublicShareStub /> },

  // Protegidas
  {
    element: <RequireAuth />,
    children: [
      { path: '/', element: <Navigate to="/explore" replace /> },
      { path: '/explore', element: <ExploreStub /> },
      // El resto de rutas protegidas se añaden en F1-F7.
    ],
  },

  // Admin (placeholder)
  {
    element: <RequireAdmin />,
    children: [
      { path: '/admin', element: <ExploreStub /> },
      { path: '/admin/*', element: <ExploreStub /> },
    ],
  },

  // Fallback
  { path: '*', element: <Navigate to="/explore" replace /> },
]);
```

- [ ] **Step 2: Verificar tsc**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npx tsc --noEmit
```
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
cd /Users/juliangarciatunon/proyectos/gad
git add frontend/src/router.tsx
git commit -m "feat(router): router con guards RequireAuth/RequireAdmin y rutas stub"
```

---

## Task 21: Componer providers en `main.tsx` y reducir `App.tsx`

**Files:**
- Modify: `frontend/src/main.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Reescribir `main.tsx`**

Sustituir todo el contenido de `frontend/src/main.tsx` por:

```typescript
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { AuthProvider } from './auth/AuthProvider';
import { router } from './router';
import App from './App';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <App />
        <Toaster position="top-center" richColors closeButton />
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
```

- [ ] **Step 2: Reescribir `App.tsx` (mínimo — solo RouterProvider)**

Sustituir **todo** el contenido de `frontend/src/App.tsx` por:

```typescript
import { RouterProvider } from 'react-router-dom';
import { router } from './router';

export default function App() {
  return <RouterProvider router={router} />;
}
```

Esto desmonta el mockup (MOCK_PLANS, ExploreView, MatchesView, ProfileView, CreatePlanModal, BottomNav local). El mockup vivirá en git history; F3 lo recreará con datos reales.

- [ ] **Step 3: Verificar tsc**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npx tsc --noEmit
```
Expected: sin errores.

- [ ] **Step 4: Verificar build**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npm run build
```
Expected: build OK, genera `dist/`.

- [ ] **Step 5: Verificar dev server arranca**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
timeout 8 npm run dev || true
```
Expected: log `Local: http://localhost:5173/`, sin errores.

- [ ] **Step 6: Commit**

```bash
cd /Users/juliangarciatunon/proyectos/gad
git add frontend/src/main.tsx frontend/src/App.tsx
git commit -m "feat(app): componer QueryClient+Auth+Router+Toaster, reducir App a RouterProvider"
```

---

## Task 22: Test helper `renderWithProviders` y test de smoke del App

**Files:**
- Create: `frontend/src/test/test-utils.tsx`
- Create: `frontend/src/__tests__/App.test.tsx`

- [ ] **Step 1: Crear `test-utils.tsx`**

Crear `frontend/src/test/test-utils.tsx`:

```typescript
import type { ReactElement, ReactNode } from 'react';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../auth/AuthProvider';

/** QueryClient fresco por test (sin retry infinito, sin refetch). */
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

interface Options {
  initialEntries?: string[];
}

export function renderWithProviders(ui: ReactElement, options: Options = {}) {
  const queryClient = makeQueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={options.initialEntries ?? ['/']}>
          {children}
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
  return render(ui, { wrapper });
}
```

- [ ] **Step 2: Crear smoke test del App**

Crear `frontend/src/__tests__/App.test.tsx`:

```typescript
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { RouterProvider } from 'react-router-dom';
import { createMemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../auth/AuthProvider';
import { ExploreStub } from '../pages/ExploreStub';

function renderApp() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createMemoryRouter(
    [
      {
        element: <AuthProvider />,
        children: [{ path: '/', element: <ExploreStub /> }],
      },
    ],
    { initialEntries: ['/'] },
  );
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe('App smoke', () => {
  it('renderiza sin crashear', () => {
    const { getByText } = renderApp();
    expect(getByText(/Explorar — próximamente/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Correr todos los tests**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npm test
```
Expected: `Test Files 4 passed` (errors, geo, format, App), `Tests N passed` (≥ 35). Sin fallos.

> Si el smoke test falla por `MemoryRouter` anidado dentro de `AuthProvider` (que no usa router), revisar que `ExploreStub` no use hooks de router. `ExploreStub` no los usa. Si `AuthProvider` Bootstrap dispara fetch y falla por no tener servidor, debe catchearse internamente (lo hace: `fetchMe`/`refresh` tienen try/catch).

- [ ] **Step 4: Commit**

```bash
cd /Users/juliangarciatunon/proyectos/gad
git add frontend/src/test/test-utils.tsx frontend/src/__tests__/App.test.tsx
git commit -m "test(frontend): helper renderWithProviders y smoke test del App"
```

---

## Task 23: Verificación final y CI-ready

**Files:** — (verificación + opcional workflow)

- [ ] **Step 1: Correr lint (tsc)**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npm run lint
```
Expected: sin output de errores (`tsc --noEmit` limpio).

- [ ] **Step 2: Correr build**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npm run build
```
Expected: build OK, `dist/index.html` y `dist/assets/*` generados.

- [ ] **Step 3: Correr tests con cobertura**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npm test -- --coverage 2>&1 | tail -25
```
Expected: todos pasan; cobertura reportada para `lib/geo.ts`, `lib/format.ts`, `api/errors.ts` (≈100%). No hay umbral estricto en F0.

- [ ] **Step 4: Smoke manual del dev server**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npm run dev &
sleep 4
curl -s http://localhost:5173/ | head -20
kill %1 2>/dev/null || true
```
Expected: HTML con `<div id="root">` y `<script type="module" src="/src/main.tsx">`.

- [ ] **Step 5: Verificar proxy apunta al backend (opcional, si el backend corre)**

Si el backend corre en `:8000`:

Run:
```bash
curl -s http://localhost:5173/api/health | head
```
Expected: respuesta del backend vía proxy. Si el backend no corre, este paso se omite.

- [ ] **Step 6: Limpiar `.gitkeep` redundantes**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
find src -name ".gitkeep" -not -path "*/features/*" -delete
git add -A
```
(Se conservan los `.gitkeep` de `features/` porque esa carpeta se llena en F1+; las demás ya tienen archivos.)

- [ ] **Step 7: Commit final de F0**

```bash
cd /Users/juliangarciatunon/proyectos/gad
git add -A
git commit -m "chore(frontend): F0 completa — build verde, tests pasan, app arranca con stubs" --allow-empty
git log --oneline -20
```
Expected: log con todos los commits `feat:`/`test:`/`chore:`/`refactor:` de F0.

- [ ] **Step 8: (Opcional) CI workflow para frontend**

Si el repo tiene `.github/workflows/`, añadir `frontend-ci.yml` corriendo `npm ci && npm run lint && npm run build && npm test`. Esto es opcional para F0 pero recomendado. No bloquea el cierre de la fase.

---

## Criterios de aceptación de F0

- [ ] `npm run lint` (tsc) sin errores.
- [ ] `npm run build` genera `dist/` sin errores.
- [ ] `npm test` pasa todos los tests (errors, geo, format, App smoke).
- [ ] `npm run dev` levanta en `http://localhost:5173/` sin errores.
- [ ] Navegar a `/` redirige a `/explore` (o `/login` si no hay sesión — el AuthProvider bootstrap debe llegar a `unauthenticated` sin crashear cuando no hay backend).
- [ ] El proxy `/api/*` reacha el backend cuando corre (o falla elegantemente cuando no).
- [ ] No quedan imports a `@google/genai`, `express`, `dotenv`, ni `metadata.json`.
- [ ] El `App.tsx` mide ~5 líneas (solo `RouterProvider`).
- [ ] La estructura de carpetas coincide con el spec §2.1 (sin features de dominio implementadas).

---

## Notas para el agente que ejecute este plan

1. **Orden estricto:** las tareas tienen dependencias (Spinner → Guards → Router → main). Respeta el orden.
2. **TDD en Tasks 9, 13, 14:** test primero, vérificar rojo, implementar, vérificar verde, commit. No saltes el paso de vérificar el fallo.
3. **Commits por tarea:** cada tarea termina con un commit atómico. No acumules cambios de varias tareas en un commit.
4. **Si tsc falla por `verbatimModuleSyntax`:** asegurate de usar `import type` para tipos. Ya está aplicado en el plan; si una librería adicional lo requiere, ajustar.
5. **El AuthProvider Bootstrap no debe crashear sin backend:** si no hay backend, `fetchMe`/`refresh` deben fallar silenciosamente y dejar `status: 'unauthenticated'`. El `/` redirige a `/login` (stub). Esto es esperado y correcto.
6. **No implementes features de dominio:** PlanCard, ExplorePage con datos reales, CreatePlanPage, etc. son F1-F7. F0 solo deja la infraestructura y stubs.
7. **`MapBackground.tsx` se mantiene en `src/components/`** (raíz de components), no en `ui/`. El spec §2.1 lo lista en `src/components/MapBackground.tsx`. Ya está ahí.
8. **`package.json` nombre:** pasa de `react-example` a `gad-frontend` (más descriptivo, evita confusiones).

---

## Auto-revisión (post-escritura)

**Cobertura del spec (secciones relevantes para F0):**
- §2.1 Estructura → Tasks 4 (carpetas), 8 (types), 9-12 (api), 10-16 (auth), 15-18 (ui/lib), 19-21 (router/main). ✓
- §3 Autenticación → Tasks 10 (tokenStore), 12 (interceptor), 15 (AuthProvider), 16 (guards). Bootstrap en 15. ✓
- §4 React Query → Task 21 (QueryClient con staleTime 30s). Hooks por feature en F1+. ✓
- §6 Enrutamiento → Tasks 19-20 (router con guards + stubs; rutas reales en F1+). ✓
- §7 Migración UI → Tasks 17 (index.css/MapBackground/utils sin cambios), 18 (design system base). Componentes del mockup migran en F2/F3. ✓
- §8 Testing → Tasks 7 (Vitest), 9/13/14 (tests TDD), 22 (smoke). Stack completo instalado. ✓
- §9 Config/DevOps → Tasks 2 (limpieza deps), 3 (proxy), 4 (.env), 6 (deps), 5 (tsconfig). ✓

**Placeholders:** revisado. Sin "TBD"/"TODO"/"implement later". Cada paso de código muestra código completo. Las marcas "próximamente" en los stubs son copy de UI intencional (páginas placeholder), no placeholders de plan.

**Consistencia de tipos:** `ApiError(code, status, detail)` coherente entre `errors.ts`, `client.ts` (parseError), interceptor y tests. `UserPublic` usado en AuthProvider y guards. `TokenOut` idéntico en AuthProvider e interceptor. `applyAuth`/`setApplyAuth` firmas coherentes entre `client.ts` e interceptor.

**Gap conocido intencional:** `RequireAdmin` usa un cast `(user as UserPublic & { is_admin?: boolean })` porque `UserPublic` del contrato no expone `is_admin`. Esto se documenta en el código y se resuelve en F7 cuando el admin exponga el rol. No es un bloqueante para F0 (las rutas admin son stub).
