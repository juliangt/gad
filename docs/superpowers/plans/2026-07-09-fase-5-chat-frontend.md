# Chat Realtime Frontend — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar el dominio Chat (Fase F5) del frontend de GAD: un cliente WebSocket robusto (`ChatSocket`) sobre `WS /chat/{match_id}?token=<access>` con reconexión exponencial, cola de envío y mapeo de close codes 4401/4403; un hook de historial paginado por cursor (`useMessages`), hooks de mutación (`useMarkRead`, `useDeleteMessage`), un hook orquestador del ciclo de vida del socket (`useChatSocket`) que sincroniza el caché de React Query en tiempo real, y la UI (`ChatWindow`, `ChatPage`). Al final, dos participantes pueden chatear en vivo durante un match activo.

**Architecture:** Feature-based en `src/features/chat/`:
- `types.ts` — `MessageOut`, `WsIncoming` (union), `WsOutgoing`.
- `schemas.ts` — `messageContentSchema` (zod, 1–2000 chars, no vacío).
- `messageCache.ts` — funciones puras sobre `InfiniteData<MessageOut[]>` (insert/remove/markAllRead/chronological). Testeables sin React.
- `hooks.ts` — `useMessages` (useInfiniteQuery), `useMarkRead`, `useDeleteMessage`, `useChatSocket` (orquesta `ChatSocket` + React Query).
- `ChatWindow.tsx` — lista de mensajes + input + scroll automático + indicador de conexión.
- `pages/ChatPage.tsx` — pantalla completa `/matches/:matchId/chat`.

Capa transversal:
- `src/api/ws.ts` — clase `ChatSocket` (wrapper sobre `WebSocket` nativo). El constructor de `WebSocket` es **inyectable** (`WebSocketCtor`) para que los tests usen un `MockWebSocket`. Reconexión con backoff exponencial (1s→2s→4s→…→30s), cola de salientes con flush al reconectar, mapeo de close codes 4401 (auth) / 4403 (forbidden) que **no** reconectan, estados `idle|connecting|open|closing|closed`.

**Flujo de datos WS↔React Query:** el `ChatSocket` emite `onMessage` → `useChatSocket` inserta el mensaje directamente en el caché vía `queryClient.setQueryData(['messages', matchId], …)` usando los helpers puros de `messageCache.ts` (sin refetch). El envío propio es optimista (mensaje con `temp:<uuid>`) y se reconcilia cuando el servidor hace broadcast del mensaje real (match por `sender_id === me` + `content`). No hay heartbeat/ping porque el contrato no lo define.

**Tech Stack:** React 19, TypeScript, react-router-dom v7, TanStack Query v5 (`useInfiniteQuery`, `useMutation`, `useQueryClient`, `setQueryData`), zod, date-fns v4 (locale `es`), lucide-react, sonner, Tailwind v4 (glassmorphism), Vitest + @testing-library/react + jsdom. WebSocket nativo del navegador.

---

## Prerrequisitos (de F0–F4)

Este plan asume que las siguientes piezas ya existen y funcionan (no se reimplementan aquí):

| Pieza | Archivo | Interfaz que se consume en F5 |
|---|---|---|
| API client | `src/api/client.ts` | `apiGet<T>(path, { query?: Record<string, string\|number\|boolean\|undefined\|null> })`, `apiPost<T>(path, body?)`, `apiDelete<T>(path)` — lanzan `ApiError(code, status, detail)` y aplican el interceptor 401→refresh. **Nota:** si la implementación real usa `params` en vez de `query`, reconciliar el nombre; este plan usa `query` (firma de F0 `RequestOptions.query`). |
| ApiError | `src/api/errors.ts` | `ApiError` con `.code`, `.status`, `.detail` |
| Auth | `src/auth/useAuth.ts` | `useAuth()` → `{ user: UserPublic \| null, status }` (`user.id`) |
| Token store | `src/auth/tokenStore.ts` | `getAccessToken(): string \| null`, `clearTokens()` |
| Formato | `src/lib/format.ts` | `formatRelativeTime(iso): string` |
| Types comunes | `src/types/common.ts` | `OKMessage` |
| UI | `src/components/ui/` | `Button`, `Textarea`, `Spinner`, `EmptyState`, `ErrorState`, `Avatar` |
| QueryClient | `src/main.tsx` | `QueryClientProvider` activo |
| Router | `src/router.tsx` | `createBrowserRouter` con `RequireAuth`; `/matches/:matchId` existe (F4); `/matches/:matchId/chat` **aún no** (la añade este plan) |
| Toaster | `src/main.tsx` | `<Toaster/>` de sonner montado |
| Vitest | `vitest.config.ts`, `src/test/setup.ts` | jsdom + `@testing-library/jest-dom` globales |
| **Matching (F4)** | `src/features/matching/` | `useMatch(matchId)` → `{ data: MatchOut }`; tipo `MatchOut` con `id`, `participants[]` (`{user_id, display_name, avatar_url, role}`); `MatchDetailPage` en `/matches/:matchId` |

> **Si F4 (Matching) no está implementado**, las Tasks 1–9 (ChatSocket, tipos, hooks, ChatWindow, ChatPage) se pueden completar igual; solo la Task 10 (embeber en `MatchDetailPage`) y la obtención del nombre del par en `ChatPage` quedan condicionadas. En ese caso, `ChatPage` usa el primer `participant.display_name` que no sea el usuario actual cuando `useMatch` esté disponible, o el string genérico "Chat" como fallback. Documentar el descuido y continuar.

> **Reconciliación de tipos:** `MessageOut` aquí espeja el contrato exacto. Si F4 ya definió un `MessageOut` distinto, el de `features/chat/types.ts` es el canónico para el chat (F4 no debiera tenerlo; matching no maneja mensajes). Si hay colisión, importar desde `features/chat/types`.

**Convenciones de rutas de import:** este plan usa **exclusivamente imports relativos** (`../types`, `../../components/ui/Button`, `../../../api/ws`), igual que F0–F3. No se introduce el alias `@/`.

**Stack de test:** Vitest (globals: `describe`, `it`, `expect`, `vi`, `beforeEach`, `afterEach`), `@testing-library/react` (`renderHook`, `waitFor`, `render`, `screen`, `fireEvent`, `act`), `@testing-library/user-event`. Los hooks de React Query se testean con un `QueryClient` con `retry:false` + `QueryClientProvider` wrapper. El `ChatSocket` se testea inyectando un `MockWebSocket` como `WebSocketCtor`. Se usan fake timers (`vi.useFakeTimers`) para los tests de reconexión.

---

## File Structure

Archivos a crear/modificar en F5 (rutas absolutas desde la raíz del repo):

```
frontend/src/
├── api/
│   └── ws.ts                                        # NUEVO — clase ChatSocket (reconnect, cola, close codes)
├── features/chat/
│   ├── types.ts                                     # NUEVO — MessageOut, WsIncoming, WsOutgoing
│   ├── schemas.ts                                   # NUEVO — messageContentSchema (zod)
│   ├── messageCache.ts                              # NUEVO — helpers puros sobre InfiniteData<MessageOut[]>
│   ├── hooks.ts                                     # NUEVO — useMessages, useMarkRead, useDeleteMessage, useChatSocket
│   ├── ChatWindow.tsx                               # NUEVO — UI principal del chat
│   ├── __tests__/
│   │   ├── ws.test.ts                               # NUEVO — tests ChatSocket (reconnect, cola, close codes)
│   │   ├── messageCache.test.ts                     # NUEVO — tests helpers puros
│   │   └── hooks.test.tsx                           # NUEVO — tests de hooks (messages, markRead, delete, chatSocket)
│   └── pages/
│       └── ChatPage.tsx                             # NUEVO — /matches/:matchId/chat
├── router.tsx                                       # MODIFICAR — registrar /matches/:matchId/chat
└── features/matching/pages/MatchDetailPage.tsx      # MODIFICAR (opcional, Task 10) — añadir panel/link de chat
```

---

## Task 1: Rama de trabajo y verificación del punto de partida

**Files:** —

- [ ] **Step 1: Crear rama `fase-5-chat-frontend`**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad
git checkout -b fase-5-chat-frontend
```
Expected: `Switched a a new branch 'fase-5-chat-frontend'`

- [ ] **Step 2: Verificar que F0–F4 compilan y los tests pasan**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npm run build && npx vitest run
```
Expected: build verde, todos los tests de F0–F4 pasan. Si F4 no existe (no hay `features/matching/`), anotarlo y continuar: F5 se implementa de forma que no dependa de F4 para compilar (la dependencia es solo de UI en Task 10).

- [ ] **Step 3: Confirmar que `api/ws.ts` NO existe (F0 no lo creó)**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
test -f src/api/ws.ts && echo "YA EXISTE — revisar antes de continuar" || echo "OK: crear en Task 3"
```
Expected: `OK: crear en Task 3`. Si ya existe (p.ej. un stub de F0), revisar su contenido; este plan lo sobrescribe con la implementación completa.

---

## Task 2: Tipos y schema del dominio Chat

**Files:**
- Create: `frontend/src/features/chat/types.ts`
- Create: `frontend/src/features/chat/schemas.ts`

- [ ] **Step 1: Crear `features/chat/types.ts`**

Crear `frontend/src/features/chat/types.ts`:

```typescript
/**
 * Tipos del dominio Chat (contrato §Chat).
 *
 * `GET /matches/{id}/messages` → `MessageOut[]` (array plano, paginado por query
 * `limit`/`before`, NO envuelto en PaginatedOut).
 * `WS /chat/{match_id}?token=<access>` → mensajes en tiempo real.
 */

/** Mensaje persistido. `read_at` solo viene en el historial REST (el WS no lo envía). */
export interface MessageOut {
  id: string;
  match_id: string;
  sender_id: string;
  content: string;
  created_at: string; // ISO 8601 UTC
  read_at: string | null;
}

/**
 * Mensaje entrante del WebSocket (server → cliente). Unión discriminada por `type`.
 * - `message`: broadcast de un mensaje del match (incluye el propio eco al emisor).
 * - `error`: error de dominio (p.ej. contenido inválido). NO cierra la conexión.
 */
export type WsIncoming =
  | ({ type: 'message' } & Pick<
      MessageOut,
      'id' | 'match_id' | 'sender_id' | 'content' | 'created_at'
    >)
  | { type: 'error'; detail: string };

/** Mensaje saliente (cliente → servidor). `content` 1..2000 chars. */
export interface WsOutgoing {
  content: string;
}
```

- [ ] **Step 2: Crear `features/chat/schemas.ts`**

Crear `frontend/src/features/chat/schemas.ts`:

```typescript
import { z } from 'zod';

/**
 * Validación del contenido de un mensaje (contrato: 1..2000 chars).
 * El backend sanea; el frontend coopera validando antes de enviar y cooperando
 * con el renderizado como TEXTO (nunca HTML).
 */
export const messageContentSchema = z
  .string()
  .trim()
  .min(1, 'Escribí algo antes de enviar.')
  .max(2000, 'El mensaje no puede superar los 2000 caracteres.');

export type MessageContent = z.infer<typeof messageContentSchema>;
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
git add frontend/src/features/chat/types.ts frontend/src/features/chat/schemas.ts
git commit -m "feat(chat): tipos MessageOut/WsIncoming/WsOutgoing y schema zod de contenido"
```

---

## Task 3: TDD — `ChatSocket` (`api/ws.ts`)

Esta es la pieza más técnica. Se desarrolla con TDD: primero los tests con un `MockWebSocket`, luego la implementación. El `WebSocket` nativo se inyecta vía `WebSocketCtor` para que el socket sea determinista en tests.

**Files:**
- Create: `frontend/src/api/__tests__/ws.test.ts`
- Create: `frontend/src/api/ws.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `frontend/src/api/__tests__/ws.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ChatSocket, WS_CLOSE_CODE, type ChatSocketState } from '../ws';
import type { ChatSocketHandlers } from '../ws';

/**
 * Mock determinista de WebSocket. Registra instancias creadas y permite al test
 * simular eventos del servidor (open/message/close/error) y observar sends/closes.
 */
class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static get last(): MockWebSocket | undefined {
    return MockWebSocket.instances[MockWebSocket.instances.length - 1];
  }
  static reset(): void {
    MockWebSocket.instances = [];
  }

  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  url: string;
  readyState = 0;
  onopen: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  sent: string[] = [];
  closeCalls: Array<{ code: number; reason: string }> = [];

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }
  send(data: string): void {
    this.sent.push(data);
  }
  close(code = 1000, reason = ''): void {
    this.readyState = 3;
    this.closeCalls.push({ code, reason });
  }
  // —— helpers para simular el servidor desde el test ——
  serverOpen(): void {
    this.readyState = 1;
    this.onopen?.(new Event('open'));
  }
  serverMessage(data: unknown): void {
    const payload = typeof data === 'string' ? data : JSON.stringify(data);
    this.onmessage?.({ data: payload } as MessageEvent);
  }
  serverClose(code: number, reason = ''): void {
    this.readyState = 3;
    this.onclose?.({ code, reason, wasClean: code !== 1006 } as CloseEvent);
  }
  serverError(): void {
    this.onerror?.(new Event('error'));
  }
}

const MATCH_ID = 'match-123';
const TOKEN = 'access-token-xyz';

function makeHandlers(): ChatSocketHandlers & { calls: Record<string, unknown[]> } {
  const calls: Record<string, unknown[]> = {
    onMessage: [],
    onError: [],
    onStateChange: [],
    onAuthError: [],
    onForbidden: [],
  };
  return {
    calls,
    onMessage: (m) => calls.onMessage.push(m),
    onError: (d) => calls.onError.push(d),
    onStateChange: (s) => calls.onStateChange.push(s),
    onAuthError: () => calls.onAuthError.push(true),
    onForbidden: () => calls.onForbidden.push(true),
  };
}

function makeSocket(
  handlers: ChatSocketHandlers,
  opts: { maxReconnectAttempts?: number; baseDelay?: number; maxDelay?: number } = {},
): ChatSocket {
  return new ChatSocket(
    {
      matchId: MATCH_ID,
      getToken: () => TOKEN,
      WebSocketCtor: MockWebSocket as unknown as typeof WebSocket,
      maxReconnectAttempts: opts.maxReconnectAttempts ?? 10,
      baseDelay: opts.baseDelay ?? 1000,
      maxDelay: opts.maxDelay ?? 30000,
    },
    handlers,
  );
}

beforeEach(() => {
  MockWebSocket.reset();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('ChatSocket — conexión inicial', () => {
  it('construye la URL con token como query param', () => {
    const h = makeHandlers();
    const socket = makeSocket(h);
    socket.connect();
    expect(MockWebSocket.last?.url).toBe(
      `ws://localhost:8000/chat/${MATCH_ID}?token=${TOKEN}`,
    );
  });

  it('transiciona idle → connecting → open', () => {
    const h = makeHandlers();
    const socket = makeSocket(h);
    socket.connect();
    expect(h.calls.onStateChange).toContain('connecting');
    MockWebSocket.last!.serverOpen();
    expect(h.calls.onStateChange).toContain('open');
    expect(socket.getState()).toBe('open');
  });

  it('no crea otro socket si ya está connecting/open', () => {
    const h = makeHandlers();
    const socket = makeSocket(h);
    socket.connect();
    socket.connect(); // segunda llamada no-op
    expect(MockWebSocket.instances).toHaveLength(1);
  });

  it('si getToken() devuelve null, emite onAuthError y no crea socket', () => {
    const h = makeHandlers();
    const socket = new ChatSocket(
      {
        matchId: MATCH_ID,
        getToken: () => null,
        WebSocketCtor: MockWebSocket as unknown as typeof WebSocket,
      },
      h,
    );
    socket.connect();
    expect(MockWebSocket.instances).toHaveLength(0);
    expect(h.calls.onAuthError).toHaveLength(1);
    expect(socket.getState()).toBe('closed');
  });

  it('emite onMessage al recibir {type:"message"}', () => {
    const h = makeHandlers();
    const socket = makeSocket(h);
    socket.connect();
    MockWebSocket.last!.serverOpen();
    MockWebSocket.last!.serverMessage({
      type: 'message',
      id: 'm1',
      match_id: MATCH_ID,
      sender_id: 'u2',
      content: 'Hola',
      created_at: '2026-07-09T18:00:00Z',
    });
    expect(h.calls.onMessage).toHaveLength(1);
    expect((h.calls.onMessage[0] as { id: string }).id).toBe('m1');
  });

  it('emite onError al recibir {type:"error",detail}', () => {
    const h = makeHandlers();
    const socket = makeSocket(h);
    socket.connect();
    MockWebSocket.last!.serverOpen();
    MockWebSocket.last!.serverMessage({ type: 'error', detail: 'Mensaje inválido' });
    expect(h.calls.onError).toEqual(['Mensaje inválido']);
    expect(socket.getState()).toBe('open'); // no cierra
  });

  it('ignora payloads no-JSON o sin type conocido', () => {
    const h = makeHandlers();
    const socket = makeSocket(h);
    socket.connect();
    MockWebSocket.last!.serverOpen();
    MockWebSocket.last!.serverMessage('no-es-json{');
    MockWebSocket.last!.serverMessage({ type: 'rarito', foo: 1 });
    expect(h.calls.onMessage).toHaveLength(0);
    expect(h.calls.onError).toHaveLength(0);
  });
});

describe('ChatSocket — close codes', () => {
  it('4401 (token inválido) → onAuthError, NO reconecta', () => {
    const h = makeHandlers();
    const socket = makeSocket(h);
    socket.connect();
    MockWebSocket.last!.serverOpen();
    MockWebSocket.last!.serverClose(WS_CLOSE_CODE.AUTH_ERROR);
    expect(h.calls.onAuthError).toHaveLength(1);
    expect(socket.getState()).toBe('closed');
    vi.advanceTimersByTime(60_000);
    expect(MockWebSocket.instances).toHaveLength(1); // no reconectó
  });

  it('4403 (no participante) → onForbidden, NO reconecta', () => {
    const h = makeHandlers();
    const socket = makeSocket(h);
    socket.connect();
    MockWebSocket.last!.serverOpen();
    MockWebSocket.last!.serverClose(WS_CLOSE_CODE.FORBIDDEN);
    expect(h.calls.onForbidden).toHaveLength(1);
    expect(socket.getState()).toBe('closed');
    vi.advanceTimersByTime(60_000);
    expect(MockWebSocket.instances).toHaveLength(1);
  });

  it('1000 (cierre normal tras close() manual) → NO reconecta', () => {
    const h = makeHandlers();
    const socket = makeSocket(h);
    socket.connect();
    MockWebSocket.last!.serverOpen();
    socket.close();
    MockWebSocket.last!.serverClose(WS_CLOSE_CODE.NORMAL, 'client close');
    vi.advanceTimersByTime(60_000);
    expect(MockWebSocket.instances).toHaveLength(1);
    expect(socket.getState()).toBe('closed');
  });
});

describe('ChatSocket — reconexión con backoff exponencial', () => {
  it('reconecta tras cierre anormal (1006) con backoff 1s → 2s → 4s', () => {
    const h = makeHandlers();
    const socket = makeSocket(h, { baseDelay: 1000, maxDelay: 30_000 });
    socket.connect();
    MockWebSocket.last!.serverOpen();
    expect(MockWebSocket.instances).toHaveLength(1);

    // 1er cierre anormal → reintento tras 1000ms
    MockWebSocket.last!.serverClose(1006);
    expect(socket.getState()).toBe('connecting');
    vi.advanceTimersByTime(999);
    expect(MockWebSocket.instances).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(MockWebSocket.instances).toHaveLength(2);

    // 2do cierre → reintento tras 2000ms
    MockWebSocket.last!.serverClose(1006);
    vi.advanceTimersByTime(1999);
    expect(MockWebSocket.instances).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(MockWebSocket.instances).toHaveLength(3);

    // 3er cierre → reintento tras 4000ms
    MockWebSocket.last!.serverClose(1006);
    vi.advanceTimersByTime(3999);
    expect(MockWebSocket.instances).toHaveLength(3);
    vi.advanceTimersByTime(1);
    expect(MockWebSocket.instances).toHaveLength(4);
  });

  it('resetea el contador de intentos al reconectar con éxito', () => {
    const h = makeHandlers();
    const socket = makeSocket(h, { baseDelay: 1000 });
    socket.connect();
    MockWebSocket.last!.serverOpen();
    MockWebSocket.last!.serverClose(1006);
    vi.advanceTimersByTime(1000); // reintento 1
    MockWebSocket.last!.serverOpen(); // éxito → contador a 0
    MockWebSocket.last!.serverClose(1006);
    vi.advanceTimersByTime(1000); // debe ser 1000ms de nuevo (no 2000)
    expect(MockWebSocket.instances).toHaveLength(3);
  });

  it('deja de reconectar y pasa a closed tras maxReconnectAttempts', () => {
    const h = makeHandlers();
    const socket = makeSocket(h, { maxReconnectAttempts: 2, baseDelay: 1000 });
    socket.connect();
    MockWebSocket.last!.serverOpen();
    MockWebSocket.last!.serverClose(1006);
    vi.advanceTimersByTime(1000); // reintento 1 → nuevo socket
    MockWebSocket.last!.serverClose(1006);
    vi.advanceTimersByTime(2000); // reintento 2 → nuevo socket
    MockWebSocket.last!.serverClose(1006);
    vi.advanceTimersByTime(4000); // ya no quedan intentos
    expect(socket.getState()).toBe('closed');
    expect(MockWebSocket.instances).toHaveLength(3); // inicial + 2 reintentos
  });

  it('respeta maxDelay (no supera 30s)', () => {
    const h = makeHandlers();
    const socket = makeSocket(h, { baseDelay: 1000, maxDelay: 5000, maxReconnectAttempts: 10 });
    socket.connect();
    MockWebSocket.last!.serverOpen();
    // Encadenar varios cierres para acumular backoff: 1,2,4,5,5,5…
    const delays = [1000, 2000, 4000, 5000, 5000];
    for (const d of delays) {
      MockWebSocket.last!.serverClose(1006);
      vi.advanceTimersByTime(d - 1);
      const before = MockWebSocket.instances.length;
      vi.advanceTimersByTime(1);
      expect(MockWebSocket.instances.length).toBe(before + 1);
    }
  });
});

describe('ChatSocket — cola de envío', () => {
  it('encola mensajes mientras está connecting y hace flush al abrir', () => {
    const h = makeHandlers();
    const socket = makeSocket(h);
    socket.connect();
    expect(socket.getState()).toBe('connecting');
    expect(socket.send('hola')).toBe(true);
    expect(MockWebSocket.last!.sent).toHaveLength(0); // encolado

    MockWebSocket.last!.serverOpen();
    expect(MockWebSocket.last!.sent).toEqual([JSON.stringify({ content: 'hola' })]);
  });

  it('envía inmediatamente cuando está open', () => {
    const h = makeHandlers();
    const socket = makeSocket(h);
    socket.connect();
    MockWebSocket.last!.serverOpen();
    socket.send('directo');
    expect(MockWebSocket.last!.sent).toEqual([JSON.stringify({ content: 'directo' })]);
  });

  it('flusha la cola en orden al reconectar', () => {
    const h = makeHandlers();
    const socket = makeSocket(h, { baseDelay: 1000 });
    socket.connect();
    socket.send('a');
    socket.send('b');
    MockWebSocket.last!.serverOpen();
    expect(MockWebSocket.last!.sent).toEqual([
      JSON.stringify({ content: 'a' }),
      JSON.stringify({ content: 'b' }),
    ]);

    // Caída y reconexión: mensajes nuevos durante la caída se envían al reconectar.
    MockWebSocket.last!.serverClose(1006);
    socket.send('c');
    vi.advanceTimersByTime(1000);
    MockWebSocket.last!.serverOpen();
    expect(MockWebSocket.last!.sent).toEqual([JSON.stringify({ content: 'c' })]);
  });

  it('rechaza contenido inválido (vacío o > 2000)', () => {
    const h = makeHandlers();
    const socket = makeSocket(h);
    socket.connect();
    MockWebSocket.last!.serverOpen();
    expect(socket.send('')).toBe(false);
    expect(socket.send('x'.repeat(2001))).toBe(false);
    expect(MockWebSocket.last!.sent).toHaveLength(0);
  });
});

describe('ChatSocket — close() manual', () => {
  it('cierra el ws y descarta la cola', () => {
    const h = makeHandlers();
    const socket = makeSocket(h);
    socket.connect();
    MockWebSocket.last!.serverOpen();
    socket.send('encolado-en-open-no-aplica'); // se envía ya
    socket.close();
    expect(MockWebSocket.last!.closeCalls[0]?.code).toBe(WS_CLOSE_CODE.NORMAL);
    expect(socket.getState()).toBe('closed');
  });

  it('close() cancela un reconexión pendiente', () => {
    const h = makeHandlers();
    const socket = makeSocket(h, { baseDelay: 1000 });
    socket.connect();
    MockWebSocket.last!.serverOpen();
    MockWebSocket.last!.serverClose(1006);
    socket.close(); // cancela el timer de reconexión
    vi.advanceTimersByTime(60_000);
    expect(MockWebSocket.instances).toHaveLength(1);
  });

  it('connect() tras close() manual es no-op', () => {
    const h = makeHandlers();
    const socket = makeSocket(h);
    socket.connect();
    MockWebSocket.last!.serverOpen();
    socket.close();
    socket.connect(); // no debe reconectar
    vi.advanceTimersByTime(1000);
    expect(MockWebSocket.instances).toHaveLength(1);
  });
});

describe('ChatSocket — setHandlers', () => {
  it('permite reemplazar handlers en caliente', () => {
    const h1 = makeHandlers();
    const socket = makeSocket(h1);
    socket.connect();
    MockWebSocket.last!.serverOpen();
    const h2 = makeHandlers();
    socket.setHandlers(h2);
    MockWebSocket.last!.serverMessage({
      type: 'message',
      id: 'm-x',
      match_id: MATCH_ID,
      sender_id: 'u',
      content: 'c',
      created_at: '2026-07-09T18:00:00Z',
    });
    expect(h1.calls.onMessage).toHaveLength(0);
    expect(h2.calls.onMessage).toHaveLength(1);
  });
});

describe('ChatSocket — wsBaseUrl personalizada', () => {
  it('usa la URL base provista (sin trailing slash)', () => {
    const h = makeHandlers();
    const socket = new ChatSocket(
      {
        matchId: MATCH_ID,
        getToken: () => TOKEN,
        wsBaseUrl: 'wss://api.gad.example.com/',
        WebSocketCtor: MockWebSocket as unknown as typeof WebSocket,
      },
      h,
    );
    socket.connect();
    expect(MockWebSocket.last?.url).toBe(
      `wss://api.gad.example.com/chat/${MATCH_ID}?token=${TOKEN}`,
    );
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npm test -- src/api/__tests__/ws.test.ts
```
Expected: FAIL con `Failed to resolve import "../ws"`.

- [ ] **Step 3: Implementar `api/ws.ts`**

Crear `frontend/src/api/ws.ts`:

```typescript
import type { MessageOut } from '../features/chat/types';

/**
 * Close codes del WebSocket de chat (contrato §Chat).
 * 4401 y 4403 son custom del backend; los estándar 1000/1006 son del navegador.
 */
export const WS_CLOSE_CODE = {
  NORMAL: 1000,
  ABNORMAL: 1006,
  AUTH_ERROR: 4401, // token inválido/expirado
  FORBIDDEN: 4403, // no es participante del match
} as const;

/** Estado lógico de la conexión del ChatSocket. */
export type ChatSocketState =
  | 'idle'
  | 'connecting'
  | 'open'
  | 'closing'
  | 'closed';

/** Callbacks que el consumidor (hook) registra. Todos opcionales. */
export interface ChatSocketHandlers {
  /** Broadcast de un mensaje del match (incluye el eco al propio emisor). */
  onMessage?: (msg: MessageOut) => void;
  /** Error de dominio del WS ({type:"error",detail}). La conexión sigue abierta. */
  onError?: (detail: string) => void;
  /** Cambio de estado de conexión. */
  onStateChange?: (state: ChatSocketState) => void;
  /** Token inválido/expirado (close 4401). El socket NO se reconecta. */
  onAuthError?: () => void;
  /** El usuario no es participante del match (close 4403). El socket NO se reconecta. */
  onForbidden?: () => void;
}

export interface ChatSocketOptions {
  matchId: string;
  /** Devuelve el access token actual. Si es null al conectar, emite onAuthError sin abrir socket. */
  getToken: () => string | null;
  /** Base URL del WS (sin sufijo de path). Default: VITE_WS_URL o ws://localhost:8000. */
  wsBaseUrl?: string;
  /** Constructor de WebSocket inyectable para tests. Default: global WebSocket. */
  WebSocketCtor?: typeof WebSocket;
  /** Reintentos máximos tras desconexión anormal. Default 10. */
  maxReconnectAttempts?: number;
  /** Backoff base en ms. Default 1000. */
  baseDelay?: number;
  /** Backoff máximo en ms. Default 30000. */
  maxDelay?: number;
}

const DEFAULT_WS_BASE =
  (import.meta.env.VITE_WS_URL as string | undefined) ?? 'ws://localhost:8000';

/**
 * Wrapper sobre WebSocket nativo para el chat de GAD.
 *
 * Responsabilidades:
 *  - Conectar a `${wsBaseUrl}/chat/${matchId}?token=<access>`.
 *  - Reconexión con backoff exponencial (baseDelay · 2^attempts, tope maxDelay) tras cierres anormales.
 *  - Cola de mensajes salientes mientras no hay socket OPEN; flush automático al (re)conectar.
 *  - Mapeo de close codes: 4401 → onAuthError (no reconecta); 4403 → onForbidden (no reconecta).
 *  - Parseo de {type:"message"} y {type:"error"} del servidor.
 *
 * No implementa heartbeat/ping: el contrato no lo define.
 */
export class ChatSocket {
  private readonly matchId: string;
  private readonly getToken: () => string | null;
  private readonly wsBaseUrl: string;
  private readonly WebSocketCtor: typeof WebSocket;
  private readonly maxReconnectAttempts: number;
  private readonly baseDelay: number;
  private readonly maxDelay: number;

  private handlers: ChatSocketHandlers;
  private ws: WebSocket | null = null;
  private state: ChatSocketState = 'idle';
  private queue: string[] = [];
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private manuallyClosed = false;

  constructor(options: ChatSocketOptions, handlers: ChatSocketHandlers = {}) {
    this.matchId = options.matchId;
    this.getToken = options.getToken;
    this.wsBaseUrl = (options.wsBaseUrl ?? DEFAULT_WS_BASE).replace(/\/$/, '');
    this.WebSocketCtor = options.WebSocketCtor ?? WebSocket;
    this.maxReconnectAttempts = options.maxReconnectAttempts ?? 10;
    this.baseDelay = options.baseDelay ?? 1000;
    this.maxDelay = options.maxDelay ?? 30000;
    this.handlers = handlers;
  }

  /** Reemplaza los handlers en caliente (sin reconectar). */
  setHandlers(handlers: ChatSocketHandlers): void {
    this.handlers = handlers;
  }

  getState(): ChatSocketState {
    return this.state;
  }

  /** Construye la URL con el token como query param. */
  private buildUrl(): string {
    const token = this.getToken();
    return `${this.wsBaseUrl}/chat/${this.matchId}?token=${encodeURIComponent(
      token ?? '',
    )}`;
  }

  /** Conecta si está idle/closed. No-op si está connecting/open o si ya se cerró manualmente. */
  connect(): void {
    if (this.state === 'connecting' || this.state === 'open') return;
    if (this.manuallyClosed) return;

    const token = this.getToken();
    if (!token) {
      this.setState('closed');
      this.handlers.onAuthError?.();
      return;
    }

    this.setState('connecting');

    let ws: WebSocket;
    try {
      ws = new this.WebSocketCtor(this.buildUrl());
    } catch {
      // URL inválida u otra excepción del constructor → reagendar.
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.setState('open');
      this.flushQueue();
    };

    ws.onmessage = (event: MessageEvent) => {
      this.handleIncoming(event.data);
    };

    ws.onerror = () => {
      // El navegador no expone detalles; dejamos que onclose decida la reconexión.
      // No cambiamos de estado aquí (onclose se invoca a continuación).
    };

    ws.onclose = (event: CloseEvent) => {
      this.ws = null;
      const code = event.code;

      if (code === WS_CLOSE_CODE.AUTH_ERROR) {
        this.setState('closed');
        this.handlers.onAuthError?.();
        return; // no reconectar
      }
      if (code === WS_CLOSE_CODE.FORBIDDEN) {
        this.setState('closed');
        this.handlers.onForbidden?.();
        return; // no reconectar
      }
      // Cierre normal intencional (nuestro close()) → no reconectar.
      if (this.manuallyClosed || code === WS_CLOSE_CODE.NORMAL) {
        this.setState('closed');
        return;
      }
      // Cierre anormal (1006) u otros → reconectar con backoff.
      this.scheduleReconnect();
    };
  }

  private setState(next: ChatSocketState): void {
    if (this.state === next) return;
    this.state = next;
    this.handlers.onStateChange?.(next);
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.setState('closed');
      return;
    }
    // Mientras hay un reintento agendado, el estado lógico es "connecting" (reconectando).
    this.setState('connecting');
    const delay = Math.min(
      this.baseDelay * 2 ** this.reconnectAttempts,
      this.maxDelay,
    );
    this.reconnectAttempts += 1;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private flushQueue(): void {
    if (!this.ws || this.state !== 'open') return;
    while (this.queue.length > 0) {
      const payload = this.queue.shift()!;
      try {
        this.ws.send(payload);
      } catch {
        // El socket cerró entre el check y el send: re-encolamos al frente y salimos.
        this.queue.unshift(payload);
        return;
      }
    }
  }

  /**
   * Encola o envía un mensaje. Devuelve:
   *  - true  → enviado o encolado correctamente.
   *  - false → contenido inválido, o socket cerrado terminalmente (auth/forbidden/manual).
   */
  send(content: string): boolean {
    if (
      typeof content !== 'string' ||
      content.length === 0 ||
      content.length > 2000
    ) {
      return false;
    }
    if (this.manuallyClosed) return false;

    const payload = JSON.stringify({ content });

    if (this.state === 'open' && this.ws) {
      try {
        this.ws.send(payload);
        return true;
      } catch {
        this.queue.push(payload);
        return true;
      }
    }
    // idle / connecting / closed-reconectable → encolar hasta el próximo OPEN.
    this.queue.push(payload);
    return true;
  }

  /** Parsea y despacha un mensaje entrante del servidor. */
  private handleIncoming(raw: unknown): void {
    let data: unknown;
    if (typeof raw === 'string') {
      try {
        data = JSON.parse(raw);
      } catch {
        return; // payload no-JSON: ignorar.
      }
    } else {
      data = raw;
    }
    if (!data || typeof data !== 'object') return;
    const obj = data as Record<string, unknown>;

    if (obj.type === 'message') {
      const msg = parseMessageOut(obj);
      if (msg) this.handlers.onMessage?.(msg);
      return;
    }
    if (obj.type === 'error') {
      const detail =
        typeof obj.detail === 'string' ? obj.detail : 'Error desconocido';
      this.handlers.onError?.(detail);
      return;
    }
    // Tipo desconocido: ignorar silenciosamente (forward-compat).
  }

  /** Cierra el socket de forma intencional. No se reconecta. Descarta la cola. */
  close(): void {
    this.manuallyClosed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.queue = [];
    if (this.ws) {
      this.setState('closing');
      try {
        this.ws.close(WS_CLOSE_CODE.NORMAL, 'client close');
      } catch {
        // noop
      }
      this.ws = null;
    } else {
      this.setState('closed');
    }
  }
}

/** Valida y construye un MessageOut a partir del payload del WS. */
function parseMessageOut(obj: Record<string, unknown>): MessageOut | null {
  const id = obj.id;
  const match_id = obj.match_id;
  const sender_id = obj.sender_id;
  const content = obj.content;
  const created_at = obj.created_at;
  if (
    typeof id === 'string' &&
    typeof match_id === 'string' &&
    typeof sender_id === 'string' &&
    typeof content === 'string' &&
    typeof created_at === 'string'
  ) {
    return {
      id,
      match_id,
      sender_id,
      content,
      created_at,
      read_at: typeof obj.read_at === 'string' ? obj.read_at : null,
    };
  }
  return null;
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npm test -- src/api/__tests__/ws.test.ts
```
Expected: `Test Files 1 passed`, todos los casos (`Test Suites` con ~28 tests) en verde.

> **Si algún assert de timing de backoff falla**, revisar la aritmética de `2 ** attempts` y los `advanceTimersByTime` (off-by-one entre `delay-1` y `1`). Alinear el test a la implementación: el primer reintento usa `2 ** 0 = 1` → `baseDelay`. No cambiar la fórmula del backoff salvo que sea un bug real.

- [ ] **Step 5: Commit**

```bash
cd /Users/juliangarciatunon/proyectos/gad
git add frontend/src/api/ws.ts frontend/src/api/__tests__/ws.test.ts
git commit -m "feat(api): ChatSocket con reconexión exponencial, cola y close codes 4401/4403 (TDD)"
```

---

## Task 4: TDD — `messageCache.ts` (helpers puros sobre InfiniteData)

Funciones puras que operan sobre el caché de React Query (`InfiniteData<MessageOut[]>`). Testeables sin React. Convención del caché: cada página es un array de `MessageOut` en orden **descendente** (más nuevo primero); `pages[0]` es la página más reciente.

**Files:**
- Create: `frontend/src/features/chat/__tests__/messageCache.test.ts`
- Create: `frontend/src/features/chat/messageCache.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `frontend/src/features/chat/__tests__/messageCache.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  emptyMessagesData,
  chronological,
  insertNewMessage,
  removeMessage,
  markAllRead,
  type MessagesData,
} from '../messageCache';
import type { MessageOut } from '../types';

function msg(overrides: Partial<MessageOut> = {}): MessageOut {
  return {
    id: 'm1',
    match_id: 'match-1',
    sender_id: 'u1',
    content: 'hola',
    created_at: '2026-07-09T18:00:00Z',
    read_at: null,
    ...overrides,
  };
}

describe('chronological', () => {
  it('aplana páginas descendentes a orden ascendente cronológico', () => {
    const data: MessagesData = {
      pages: [
        [msg({ id: 'b', created_at: '2026-07-09T18:01:00Z' }), msg({ id: 'a', created_at: '2026-07-09T18:00:00Z' })],
      ],
      pageParams: [undefined],
    };
    const out = chronological(data);
    expect(out.map((m) => m.id)).toEqual(['a', 'b']); // más viejo primero
  });

  it('devuelve [] para undefined', () => {
    expect(chronological(undefined)).toEqual([]);
  });

  it('ordena correctamente con múltiples páginas', () => {
    const data: MessagesData = {
      // pages[0] = más recientes, pages[1] = más viejos; cada una descendente.
      pages: [
        [msg({ id: 'd', created_at: '2026-07-09T18:03:00Z' }), msg({ id: 'c', created_at: '2026-07-09T18:02:00Z' })],
        [msg({ id: 'b', created_at: '2026-07-09T18:01:00Z' }), msg({ id: 'a', created_at: '2026-07-09T18:00:00Z' })],
      ],
      pageParams: [undefined, '2026-07-09T18:02:00Z'],
    };
    expect(chronological(data).map((m) => m.id)).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('insertNewMessage', () => {
  it('inserta en pages[0] al frente (descendente)', () => {
    const data: MessagesData = {
      pages: [[msg({ id: 'old', created_at: '2026-07-09T18:00:00Z' })]],
      pageParams: [undefined],
    };
    const next = insertNewMessage(data, msg({ id: 'new', created_at: '2026-07-09T18:05:00Z' }));
    expect(next.pages[0]!.map((m) => m.id)).toEqual(['new', 'old']);
  });

  it('crea la estructura si data es undefined', () => {
    const next = insertNewMessage(undefined, msg({ id: 'first' }));
    expect(next.pages[0]!.map((m) => m.id)).toEqual(['first']);
  });

  it('no duplica por id', () => {
    const data: MessagesData = {
      pages: [[msg({ id: 'x' })]],
      pageParams: [undefined],
    };
    const next = insertNewMessage(data, msg({ id: 'x' }));
    expect(next.pages[0]).toHaveLength(1);
    expect(next).toBe(data); // sin cambios → misma referencia
  });
});

describe('removeMessage', () => {
  it('elimina por id de cualquier página', () => {
    const data: MessagesData = {
      pages: [
        [msg({ id: 'a' }), msg({ id: 'b' })],
        [msg({ id: 'c' }), msg({ id: 'd' })],
      ],
      pageParams: [undefined, 'x'],
    };
    const next = removeMessage(data, 'c');
    expect(next!.pages[0]).toHaveLength(2);
    expect(next!.pages[1]!.map((m) => m.id)).toEqual(['d']);
  });

  it('devuelve la misma referencia si no encuentra el id', () => {
    const data: MessagesData = { pages: [[msg({ id: 'a' })]], pageParams: [undefined] };
    expect(removeMessage(data, 'zzz')).toBe(data);
  });

  it('devuelve undefined para undefined', () => {
    expect(removeMessage(undefined, 'a')).toBeUndefined();
  });
});

describe('markAllRead', () => {
  it('setea read_at en todos los mensajes sin read_at', () => {
    const data: MessagesData = {
      pages: [[msg({ id: 'a', read_at: null }), msg({ id: 'b', read_at: '2026-07-09T18:00:00Z' })]],
      pageParams: [undefined],
    };
    const now = new Date('2026-07-09T19:00:00Z');
    const next = markAllRead(data, now);
    expect(next!.pages[0]!.find((m) => m.id === 'a')!.read_at).toBe(now.toISOString());
    expect(next!.pages[0]!.find((m) => m.id === 'b')!.read_at).toBe('2026-07-09T18:00:00Z');
  });

  it('devuelve la misma referencia si todos estaban leídos', () => {
    const data: MessagesData = {
      pages: [[msg({ id: 'a', read_at: '2026-07-09T18:00:00Z' })]],
      pageParams: [undefined],
    };
    expect(markAllRead(data)).toBe(data);
  });
});

describe('emptyMessagesData', () => {
  it('crea un InfiniteData con una página vacía', () => {
    const d = emptyMessagesData();
    expect(d.pages).toEqual([[]]);
    expect(d.pageParams).toEqual([undefined]);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npm test -- src/features/chat/__tests__/messageCache.test.ts
```
Expected: FAIL con `Failed to resolve import "../messageCache"`.

- [ ] **Step 3: Implementar `messageCache.ts`**

Crear `frontend/src/features/chat/messageCache.ts`:

```typescript
import type { InfiniteData } from '@tanstack/react-query';
import type { MessageOut } from './types';

/** Forma del caché de React Query para ['messages', matchId]. */
export type MessagesData = InfiniteData<MessageOut[], string | undefined>;

/**
 * Cada página del historial se guarda en orden DESCENDENTE (más nuevo primero),
 * y `pages[0]` es la página más reciente (la que crece con mensajes nuevos).
 * Los mensajes históricos más viejos se cargan con `fetchNextPage` (cursor `before`).
 */

/** Estructura vacía inicial. */
export function emptyMessagesData(): MessagesData {
  return { pages: [[]], pageParams: [undefined] };
}

/** Aplana a orden cronológico ASCENDENTE (más viejo primero, más nuevo al final). */
export function chronological(messages: MessagesData | undefined): MessageOut[] {
  if (!messages) return [];
  return [...messages.pages].reverse().flatMap((page) => [...page].reverse());
}

/**
 * Inserta un mensaje nuevo (más reciente que los existentes) en `pages[0]`.
 * No duplica por `id` (devuelve la misma referencia si ya existe).
 */
export function insertNewMessage(
  data: MessagesData | undefined,
  msg: MessageOut,
): MessagesData {
  const base: MessagesData = data ?? emptyMessagesData();
  const pages = [...base.pages];
  const first = pages[0] ? [...pages[0]] : [];
  if (first.some((m) => m.id === msg.id)) return base;
  first.unshift(msg); // descendente: lo más nuevo va al frente
  pages[0] = first;
  return { ...base, pages };
}

/** Elimina un mensaje por `id` en cualquier página. Devuelve la misma ref si no existe. */
export function removeMessage(
  data: MessagesData | undefined,
  id: string,
): MessagesData | undefined {
  if (!data) return data;
  let changed = false;
  const pages = data.pages.map((page) =>
    page.filter((m) => {
      if (m.id === id) {
        changed = true;
        return false;
      }
      return true;
    }),
  );
  if (!changed) return data;
  return { ...data, pages };
}

/** Marca todos los mensajes como leídos (`read_at` = now ISO). No muta si ya todos lo estaban. */
export function markAllRead(
  data: MessagesData | undefined,
  now: Date = new Date(),
): MessagesData | undefined {
  if (!data) return data;
  const iso = now.toISOString();
  let changed = false;
  const pages = data.pages.map((page) =>
    page.map((m) => {
      if (!m.read_at) {
        changed = true;
        return { ...m, read_at: iso };
      }
      return m;
    }),
  );
  if (!changed) return data;
  return { ...data, pages };
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npm test -- src/features/chat/__tests__/messageCache.test.ts
```
Expected: `Test Files 1 passed`, ~13 tests en verde.

- [ ] **Step 5: Commit**

```bash
cd /Users/juliangarciatunon/proyectos/gad
git add frontend/src/features/chat/messageCache.ts frontend/src/features/chat/__tests__/messageCache.test.ts
git commit -m "feat(chat): helpers puros messageCache para InfiniteData<MessageOut[]> (TDD)"
```

---

## Task 5: `useMessages` (historial paginado por cursor)

Endpoint `GET /matches/{id}/messages` devuelve `MessageOut[]` (array plano) con query `limit` (1–200, default 50) y `before` (datetime ISO). El cursor `before` es el `created_at` del mensaje más viejo de la página actual. Se usa `useInfiniteQuery` para cargar historial más antiguo hacia arriba.

**Files:**
- Create: `frontend/src/features/chat/hooks.ts` (se amplía en Tasks 6 y 7)
- Create: `frontend/src/features/chat/__tests__/hooks.test.tsx` (se amplía)

- [ ] **Step 1: Escribir tests de `useMessages`**

Crear `frontend/src/features/chat/__tests__/hooks.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMessages } from '../hooks';

vi.mock('../../api/client', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPatch: vi.fn(),
  apiDelete: vi.fn(),
}));

import { apiGet } from '../../api/client';
import type { MessageOut } from '../types';

const mGet = vi.mocked(apiGet);

function makeMsg(overrides: Partial<MessageOut> = {}): MessageOut {
  return {
    id: 'm1',
    match_id: 'match-1',
    sender_id: 'u1',
    content: 'hola',
    created_at: '2026-07-09T18:00:00Z',
    read_at: null,
    ...overrides,
  };
}

function newClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

function withClient(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => vi.clearAllMocks());

describe('useMessages', () => {
  it('usa la query key ["messages", matchId] y llama GET con limit 50 y sin before', async () => {
    const client = newClient();
    mGet.mockResolvedValueOnce([makeMsg({ id: 'a' })]);
    const { result } = renderHook(() => useMessages('match-1'), {
      wrapper: withClient(client),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mGet).toHaveBeenCalledWith(
      '/matches/match-1/messages',
      expect.objectContaining({ query: expect.objectContaining({ limit: 50 }) }),
    );
    expect(
      (mGet.mock.calls[0]![1] as { query: Record<string, unknown> }).query.before,
    ).toBeUndefined();
  });

  it('no habilita la query si matchId es undefined', async () => {
    const client = newClient();
    const { result } = renderHook(() => useMessages(undefined), {
      wrapper: withClient(client),
    });
    expect(mGet).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('calcula next_cursor como created_at del mensaje más viejo cuando la página está llena', async () => {
    const client = newClient();
    const full = Array.from({ length: 50 }, (_, i) =>
      makeMsg({ id: `m${i}`, created_at: `2026-07-09T17:${String(49 - i).padStart(2, '0')}:00Z` }),
    );
    mGet.mockResolvedValueOnce(full);
    const { result } = renderHook(() => useMessages('match-1'), {
      wrapper: withClient(client),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.hasNextPage).toBe(true);
    // El cursor debe ser el created_at del mensaje más viejo (m49).
    expect(result.current.fetchNextPage).toBeDefined();
  });

  it('sin más páginas cuando llegan menos de 50 mensajes', async () => {
    const client = newClient();
    mGet.mockResolvedValueOnce([makeMsg({ id: 'a' }), makeMsg({ id: 'b' })]);
    const { result } = renderHook(() => useMessages('match-1'), {
      wrapper: withClient(client),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.hasNextPage).toBe(false);
  });

  it('fetchNextPage pasa before = created_at del mensaje más viejo', async () => {
    const client = newClient();
    const oldest = '2026-07-09T17:00:00Z';
    const full = Array.from({ length: 50 }, (_, i) =>
      makeMsg({
        id: `m${i}`,
        created_at: `2026-07-09T${String(17 + Math.floor(i / 60)).padStart(2, '0')}:${String((49 - i) % 60).padStart(2, '0')}:00Z`,
      }),
    );
    // forzar oldest determinista en el último elemento tras normalizar descendente
    full[49] = makeMsg({ id: 'm49', created_at: oldest });
    mGet.mockResolvedValueOnce(full);
    mGet.mockResolvedValueOnce([makeMsg({ id: 'old1', created_at: '2026-07-09T16:00:00Z' })]);

    const { result } = renderHook(() => useMessages('match-1'), {
      wrapper: withClient(client),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    await result.current.fetchNextPage();
    await waitFor(() => expect(mGet).toHaveBeenCalledTimes(2));
    const secondCallQuery = (mGet.mock.calls[1]![1] as { query: Record<string, unknown> }).query;
    expect(secondCallQuery.before).toBe(oldest);
    expect(secondCallQuery.limit).toBe(50);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npm test -- src/features/chat/__tests__/hooks.test.tsx
```
Expected: FAIL con `Failed to resolve import "../hooks"`.

- [ ] **Step 3: Implementar `useMessages` (crear `hooks.ts`)**

Crear `frontend/src/features/chat/hooks.ts`:

```typescript
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiGet, apiPost, apiDelete } from '../../api/client';
import { clearTokens, getAccessToken } from '../../auth/tokenStore';
import { useAuth } from '../../auth/useAuth';
import { ChatSocket, type ChatSocketHandlers, type ChatSocketState } from '../../api/ws';
import { messageContentSchema } from './schemas';
import {
  insertNewMessage,
  markAllRead,
  removeMessage,
  type MessagesData,
} from './messageCache';
import type { MessageOut } from './types';

/** Tamaño de página del historial (contrato: limit 1..200, default 50). */
const MESSAGES_PAGE_SIZE = 50;

/**
 * Historial del chat. El backend devuelve MessageOut[] (array plano) con query
 * limit/before. El cursor para la página anterior (más vieja) es el created_at
 * del mensaje más viejo de la última página.
 *
 * Cada página se normaliza a orden DESCENDENTE (más nuevo primero) vía select,
 * para que los helpers de messageCache.ts funcionen sin importar el orden del backend.
 */
export function useMessages(matchId: string | undefined) {
  return useInfiniteQuery({
    queryKey: ['messages', matchId],
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      apiGet<MessageOut[]>(`/matches/${matchId}/messages`, {
        query: { limit: MESSAGES_PAGE_SIZE, before: pageParam },
      }),
    initialPageParam: undefined as string | undefined,
    enabled: !!matchId,
    getNextPageParam: (lastPage): string | undefined => {
      if (!lastPage || lastPage.length < MESSAGES_PAGE_SIZE) return undefined;
      // Página normalizada descendente: el más viejo es el último.
      return lastPage[lastPage.length - 1]!.created_at;
    },
    select: (data) => ({
      ...data,
      pages: data.pages.map((page) =>
        [...page].sort((a, b) => b.created_at.localeCompare(a.created_at)),
      ),
    }),
    staleTime: 0,
  });
}

/**
 * Marca los mensajes del match como leídos (POST /matches/{id}/read).
 * Actualiza el caché poniendo read_at a todos los mensajes locales.
 */
export function useMarkRead(matchId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiPost<{ read: number }>(`/matches/${matchId}/read`),
    onSuccess: () => {
      queryClient.setQueryData<MessagesData>(['messages', matchId], (old) =>
        markAllRead(old),
      );
    },
    // Silencioso: no toast (se llama frecuentemente).
  });
}

/**
 * Borra un mensaje propio (DELETE /messages/{id}).
 * Mutación optimista: quita del caché al instante; rollback en error.
 */
export function useDeleteMessage(matchId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (messageId: string) =>
      apiDelete<{ message: string }>(`/messages/${messageId}`),
    onMutate: async (messageId: string) => {
      await queryClient.cancelQueries({ queryKey: ['messages', matchId] });
      const prev = queryClient.getQueryData<MessagesData>(['messages', matchId]);
      queryClient.setQueryData<MessagesData>(['messages', matchId], (old) =>
        removeMessage(old, messageId),
      );
      return { prev };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) {
        queryClient.setQueryData(['messages', matchId], ctx.prev);
      }
      toast.error('No se pudo borrar el mensaje.');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages', matchId] });
    },
  });
}

/**
 * Hook orquestador del ciclo de vida del ChatSocket.
 *
 * - Crea un ChatSocket (estable por matchId) y lo conecta al montar; cierra al desmontar.
 * - onMessage: inserta el mensaje en el caché de React Query (sin refetch).
 *    Si es eco del propio mensaje (sender_id === me), reconcilia el mensaje optimista temporal.
 * - send(content): inserción optimista con temp id + socket.send; rollback si el socket rechaza.
 * - onAuthError (4401): limpia tokens y redirige a /login.
 * - onForbidden (4403): redirige a /matches con toast.
 * - Expone connectionState para el indicador de UI y la distinción conectando/reconectando.
 */
export function useChatSocket(matchId: string) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [connectionState, setConnectionState] = useState<ChatSocketState>('idle');

  const socketRef = useRef<ChatSocket | null>(null);
  const pendingSendsRef = useRef<Array<{ tempId: string; content: string }>>([]);
  const wasOpenRef = useRef(false);
  const markRead = useMarkRead(matchId);

  // Handlers vivos: se reasignan cada render para capturar user/markRead actualizados.
  const handlersRef = useRef<ChatSocketHandlers>({});
  handlersRef.current = {
    onMessage: (msg: MessageOut) => {
      queryClient.setQueryData<MessagesData>(['messages', matchId], (old) => {
        // Eco del propio mensaje: reemplazar el temp con mismo content si existe.
        if (msg.sender_id === user?.id) {
          const pending = pendingSendsRef.current.find((p) => p.content === msg.content);
          if (pending) {
            pendingSendsRef.current = pendingSendsRef.current.filter((p) => p !== pending);
            const withoutTemp = removeMessage(old, pending.tempId);
            return insertNewMessage(withoutTemp, msg);
          }
        }
        return insertNewMessage(old, msg);
      });
      // Marcar leído si el mensaje es de otro y la pestaña está enfocada.
      if (msg.sender_id !== user?.id && typeof document !== 'undefined' && document.hasFocus()) {
        markRead.mutate();
      }
    },
    onError: (detail: string) => {
      toast.error(detail);
    },
    onStateChange: (state: ChatSocketState) => {
      if (state === 'open') wasOpenRef.current = true;
      setConnectionState(state);
    },
    onAuthError: () => {
      toast.error('Tu sesión expiró. Iniciá sesión de nuevo.');
      clearTokens();
      navigate('/login', { replace: true });
    },
    onForbidden: () => {
      toast.error('No podés acceder a este chat.');
      navigate('/matches', { replace: true });
    },
  };

  // Crear + conectar el socket una sola vez por matchId.
  useEffect(() => {
    const socket = new ChatSocket(
      { matchId, getToken: () => getAccessToken() },
      handlersRef.current,
    );
    socketRef.current = socket;
    socket.connect();
    // Marcar leído al entrar al chat.
    markRead.mutate();

    return () => {
      socket.close();
      socketRef.current = null;
      wasOpenRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId]);

  // Mantener los handlers frescos sin reconectar.
  useEffect(() => {
    socketRef.current?.setHandlers(handlersRef.current);
  });

  const deleteMessage = useDeleteMessage(matchId);

  const send = useCallback(
    (content: string): boolean => {
      const trimmed = content.trim();
      const parsed = messageContentSchema.safeParse(trimmed);
      if (!parsed.success) {
        toast.error(parsed.error.issues[0]?.message ?? 'Mensaje inválido.');
        return false;
      }
      const socket = socketRef.current;
      if (!socket) return false;

      const tempId = `temp:${generateId()}`;
      pendingSendsRef.current.push({ tempId, content: trimmed });

      const optimistic: MessageOut = {
        id: tempId,
        match_id: matchId,
        sender_id: user?.id ?? 'me',
        content: trimmed,
        created_at: new Date().toISOString(),
        read_at: null,
      };
      queryClient.setQueryData<MessagesData>(['messages', matchId], (old) =>
        insertNewMessage(old, optimistic),
      );

      const ok = socket.send(trimmed);
      if (!ok) {
        // Socket cerrado terminalmente: rollback.
        pendingSendsRef.current = pendingSendsRef.current.filter((p) => p.tempId !== tempId);
        queryClient.setQueryData<MessagesData>(['messages', matchId], (old) =>
          removeMessage(old, tempId),
        );
        toast.error('No se pudo enviar el mensaje. Reintentá en un momento.');
        return false;
      }
      return true;
    },
    [matchId, queryClient, user?.id],
  );

  return {
    connectionState,
    wasOpen: wasOpenRef.current,
    send,
    deleteMessage,
    markRead,
  };
}

/** Genera un id único (crypto.randomUUID con fallback para entornos sin secure context). */
function generateId(): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID();
    }
  } catch {
    // noop
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
```

- [ ] **Step 4: Correr los tests de `useMessages`**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npm test -- src/features/chat/__tests__/hooks.test.tsx
```
Expected: los 5 tests de `useMessages` pasan. (Los de markRead/delete/chatSocket se añaden en las Tasks 6 y 7.)

- [ ] **Step 5: Commit**

```bash
cd /Users/juliangarciatunon/proyectos/gad
git add frontend/src/features/chat/hooks.ts frontend/src/features/chat/__tests__/hooks.test.tsx
git commit -m "feat(chat): useMessages (infinite query por cursor) y esqueleto de hooks"
```

---

## Task 6: Tests de `useMarkRead` y `useDeleteMessage`

**Files:**
- Modify: `frontend/src/features/chat/__tests__/hooks.test.tsx` (añadir bloques)

- [ ] **Step 1: Añadir tests al final del archivo de hooks**

Añadir a `frontend/src/features/chat/__tests__/hooks.test.tsx` (importar también `useMarkRead`, `useDeleteMessage`, `apiPost`, `apiDelete`):

```tsx
// Ampliar los imports existentes al inicio del archivo:
import { useMessages, useMarkRead, useDeleteMessage } from '../hooks';
import { apiGet, apiPost, apiDelete } from '../../api/client';

const mPost = vi.mocked(apiPost);
const mDelete = vi.mocked(apiDelete);

describe('useMarkRead', () => {
  it('POST /matches/{id}/read y marca el caché como leído', async () => {
    const client = newClient();
    // Precargar caché con un mensaje no leído.
    client.setQueryData(['messages', 'match-1'], {
      pages: [[makeMsg({ id: 'a', read_at: null })]],
      pageParams: [undefined],
    });
    mPost.mockResolvedValueOnce({ read: 1 });

    const { result } = renderHook(() => useMarkRead('match-1'), {
      wrapper: withClient(client),
    });
    result.current.mutate();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mPost).toHaveBeenCalledWith('/matches/match-1/read');

    const cached = client.getQueryData<{ pages: MessageOut[][] }>(['messages', 'match-1']);
    expect(cached?.pages[0]![0]!.read_at).not.toBeNull();
  });
});

describe('useDeleteMessage', () => {
  it('borra optimistamente y llama DELETE /messages/{id}', async () => {
    const client = newClient();
    client.setQueryData(['messages', 'match-1'], {
      pages: [[makeMsg({ id: 'a' }), makeMsg({ id: 'b' })]],
      pageParams: [undefined],
    });
    mDelete.mockResolvedValueOnce({ message: 'Mensaje borrado' });

    const { result } = renderHook(() => useDeleteMessage('match-1'), {
      wrapper: withClient(client),
    });
    result.current.mutate('a');
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mDelete).toHaveBeenCalledWith('/messages/a');

    const cached = client.getQueryData<{ pages: MessageOut[][] }>(['messages', 'match-1']);
    expect(cached?.pages[0]).toHaveLength(1);
    expect(cached?.pages[0]![0]!.id).toBe('b');
  });

  it('hace rollback si DELETE falla', async () => {
    const client = newClient();
    client.setQueryData(['messages', 'match-1'], {
      pages: [[makeMsg({ id: 'a' })]],
      pageParams: [undefined],
    });
    mDelete.mockRejectedValueOnce(new Error('fail'));

    const { result } = renderHook(() => useDeleteMessage('match-1'), {
      wrapper: withClient(client),
    });
    result.current.mutate('a');
    await waitFor(() => expect(result.current.isError).toBe(true));

    const cached = client.getQueryData<{ pages: MessageOut[][] }>(['messages', 'match-1']);
    expect(cached?.pages[0]).toHaveLength(1); // restaurado
  });
});
```

- [ ] **Step 2: Correr los tests**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npm test -- src/features/chat/__tests__/hooks.test.tsx
```
Expected: pasan los tests de `useMessages`, `useMarkRead` y `useDeleteMessage`.

- [ ] **Step 3: Commit**

```bash
cd /Users/juliangarciatunon/proyectos/gad
git add frontend/src/features/chat/__tests__/hooks.test.tsx
git commit -m "test(chat): useMarkRead y useDeleteMessage con optimistic update y rollback"
```

---

## Task 7: Tests de `useChatSocket`

Se testea mockeando el módulo `../../api/ws` para que `ChatSocket` sea un stub controlable (grab + replay de handlers + métodos simulados). También se mockea `react-router-dom` (`useNavigate`), `sonner` y `../../auth/tokenStore`.

**Files:**
- Modify: `frontend/src/features/chat/__tests__/hooks.test.tsx`

- [ ] **Step 1: Añadir el setup de mocks para `useChatSocket`**

Al inicio del archivo `frontend/src/features/chat/__tests__/hooks.test.tsx`, añadir (antes de los `vi.mock` existentes o reemplazando el bloque de imports):

```tsx
const mockSocket = {
  connect: vi.fn(),
  close: vi.fn(),
  send: vi.fn().mockReturnValue(true),
  setHandlers: vi.fn(),
  getState: vi.fn().mockReturnValue('idle' as const),
};
let lastHandlers: import('../../api/ws').ChatSocketHandlers | null = null;

vi.mock('../../api/ws', () => {
  return {
    ChatSocket: vi.fn().mockImplementation((_opts, handlers) => {
      lastHandlers = handlers;
      return mockSocket;
    }),
  };
});

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock('../../auth/tokenStore', () => ({
  getAccessToken: vi.fn(() => 'token'),
  clearTokens: vi.fn(),
}));

vi.mock('../../auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'me', display_name: 'Yo' } }),
}));
```

Y ampliar los imports para incluir `useChatSocket`, `act`, y el tipo si hace falta:

```tsx
import { act } from '@testing-library/react';
import { useChatSocket } from '../hooks';
```

- [ ] **Step 2: Añadir los tests de `useChatSocket`**

```tsx
describe('useChatSocket', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastHandlers = null;
    mockSocket.send.mockReturnValue(true);
  });

  it('crea el ChatSocket, conecta al montar y cierra al desmontar', () => {
    const client = newClient();
    const { unmount } = renderHook(() => useChatSocket('match-1'), {
      wrapper: withClient(client),
    });
    expect(mockSocket.connect).toHaveBeenCalledTimes(1);
    expect(mockSocket.setHandlers).toHaveBeenCalled();
    unmount();
    expect(mockSocket.close).toHaveBeenCalledTimes(1);
  });

  it('onMessage inserta el mensaje ajeno en el caché', () => {
    const client = newClient();
    renderHook(() => useChatSocket('match-1'), { wrapper: withClient(client) });
    expect(lastHandlers).not.toBeNull();
    act(() => {
      lastHandlers!.onMessage?.({
        id: 'incoming-1',
        match_id: 'match-1',
        sender_id: 'other',
        content: 'qué tal',
        created_at: '2026-07-09T18:00:00Z',
        read_at: null,
      });
    });
    const cached = client.getQueryData<{ pages: MessageOut[][] }>(['messages', 'match-1']);
    expect(cached?.pages[0]!.find((m) => m.id === 'incoming-1')).toBeTruthy();
  });

  it('send hace inserción optimista y llama socket.send', () => {
    const client = newClient();
    const { result } = renderHook(() => useChatSocket('match-1'), {
      wrapper: withClient(client),
    });
    act(() => {
      result.current.send('hola mundo');
    });
    expect(mockSocket.send).toHaveBeenCalledWith('hola mundo');
    const cached = client.getQueryData<{ pages: MessageOut[][] }>(['messages', 'match-1']);
    const optimistic = cached?.pages[0]!.find((m) => m.content === 'hola mundo');
    expect(optimistic).toBeTruthy();
    expect(optimistic!.id.startsWith('temp:')).toBe(true);
  });

  it('send rechaza contenido vacío (zod) y no toca el socket', () => {
    const client = newClient();
    const { result } = renderHook(() => useChatSocket('match-1'), {
      wrapper: withClient(client),
    });
    act(() => {
      result.current.send('   ');
    });
    expect(mockSocket.send).not.toHaveBeenCalled();
  });

  it('eco del propio mensaje reemplaza el temp optimista', () => {
    const client = newClient();
    const { result } = renderHook(() => useChatSocket('match-1'), {
      wrapper: withClient(client),
    });
    act(() => {
      result.current.send('eco-test');
    });
    let cached = client.getQueryData<{ pages: MessageOut[][] }>(['messages', 'match-1']);
    expect(cached?.pages[0]!.some((m) => m.id.startsWith('temp:'))).toBe(true);

    act(() => {
      lastHandlers!.onMessage?.({
        id: 'real-1',
        match_id: 'match-1',
        sender_id: 'me',
        content: 'eco-test',
        created_at: '2026-07-09T18:00:00Z',
        read_at: null,
      });
    });
    cached = client.getQueryData<{ pages: MessageOut[][] }>(['messages', 'match-1']);
    expect(cached?.pages[0]!.some((m) => m.id.startsWith('temp:'))).toBe(false);
    expect(cached?.pages[0]!.find((m) => m.id === 'real-1')).toBeTruthy();
  });

  it('onAuthError limpia tokens y navega a /login', () => {
    const { clearTokens } = await import('../../auth/tokenStore');
    const client = newClient();
    renderHook(() => useChatSocket('match-1'), { wrapper: withClient(client) });
    act(() => lastHandlers!.onAuthError?.());
    expect(clearTokens).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true });
  });

  it('onForbidden navega a /matches', () => {
    const client = newClient();
    renderHook(() => useChatSocket('match-1'), { wrapper: withClient(client) });
    act(() => lastHandlers!.onForbidden?.());
    expect(mockNavigate).toHaveBeenCalledWith('/matches', { replace: true });
  });

  it('onStateChange actualiza connectionState', () => {
    const client = newClient();
    const { result } = renderHook(() => useChatSocket('match-1'), {
      wrapper: withClient(client),
    });
    act(() => lastHandlers!.onStateChange?.('open'));
    expect(result.current.connectionState).toBe('open');
    expect(result.current.wasOpen).toBe(true);
  });
});
```

> Nota: el test `onAuthError…` usa `await import` dentro del cuerpo; convertir el `it` a `async`. Alternativamente importar `clearTokens` mockeado al inicio con `import { clearTokens } from '../../auth/tokenStore'` y espiarlo con `vi.mocked(clearTokens)`.

- [ ] **Step 3: Correr todos los tests de chat**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npm test -- src/features/chat
```
Expected: pasan los tests de `useMessages`, `useMarkRead`, `useDeleteMessage` y `useChatSocket`. Los de `messageCache` y `ws` siguen en verde.

- [ ] **Step 4: Commit**

```bash
cd /Users/juliangarciatunon/proyectos/gad
git add frontend/src/features/chat/__tests__/hooks.test.tsx
git commit -m "test(chat): useChatSocket con mock de ChatSocket (ciclo de vida, send optimista, close codes)"
```

---

## Task 8: `ChatWindow.tsx` (UI principal)

Componente presentacional + de datos. Consume `useMessages`, `useChatSocket`. Características:
- Lista de mensajes en orden cronológico (más nuevo al final).
- Scroll automático al final cuando llegan mensajes nuevos (si el usuario está cerca del final).
- "Cargar más" arriba cuando `hasNextPage`.
- Input `Textarea` con `maxLength=2000`, Enter envía / Shift+Enter nueva línea, contador de caracteres.
- Indicador de conexión (Conectado / Conectando / Reconectando / Desconectado).
- Burbujas: propias a la derecha (brand), ajenas a la izquierda.
- Timestamp relativo (`formatRelativeTime`).
- Botón borrar en mensajes propios (con confirmación ligera).
- **El contenido se renderiza como TEXTO** (React ya escapa por defecto; nunca `dangerouslySetInnerHTML`).

**Files:**
- Create: `frontend/src/features/chat/ChatWindow.tsx`

- [ ] **Step 1: Crear `ChatWindow.tsx`**

Crear `frontend/src/features/chat/ChatWindow.tsx`:

```tsx
import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { ArrowDown, Loader2, Send, Trash2, Wifi, WifiOff } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Textarea } from '../../components/ui/Textarea';
import { Spinner } from '../../components/ui/Spinner';
import { ErrorState } from '../../components/ui/ErrorState';
import { EmptyState } from '../../components/ui/EmptyState';
import { cn } from '../../lib/utils';
import { formatRelativeTime } from '../../lib/format';
import { useAuth } from '../../auth/useAuth';
import { useMessages, useChatSocket } from './hooks';
import { chronological } from './messageCache';
import type { MessageOut } from './types';

const MAX_CONTENT = 2000;
const AUTO_SCROLL_THRESHOLD_PX = 120;

export interface ChatWindowProps {
  matchId: string;
  /** Nombre del par para el avatar/empty state. Opcional. */
  peerName?: string;
  /** Compacto (sin header propio) cuando se embebe. */
  embedded?: boolean;
  className?: string;
}

export function ChatWindow({ matchId, peerName, embedded = false, className }: ChatWindowProps) {
  const { user } = useAuth();
  const myId = user?.id;
  const messagesQuery = useMessages(matchId);
  const { connectionState, wasOpen, send, deleteMessage } = useChatSocket(matchId);

  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const [atBottom, setAtBottom] = useState(true);

  const messages = useMemo<MessageOut[]>(
    () => chronological(messagesQuery.data),
    [messagesQuery.data],
  );

  // Auto-scroll al final cuando llegan mensajes nuevos y el usuario está abajo.
  useEffect(() => {
    if (atBottom) {
      bottomRef.current?.scrollIntoView({ block: 'end' });
    }
  }, [messages, atBottom]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setAtBottom(distanceFromBottom < AUTO_SCROLL_THRESHOLD_PX);
  };

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    const ok = send(draft);
    if (ok) setDraft('');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const status = connectionStatus(connectionState, wasOpen);

  if (messagesQuery.isError) {
    return (
      <ErrorState
        title="No pudimos cargar el chat"
        description="Revisá tu conexión e intentá de nuevo."
        onRetry={() => messagesQuery.refetch()}
      />
    );
  }

  return (
    <div className={cn('flex flex-col h-full min-h-0 bg-gray-50', className)}>
      {!embedded && (
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-white/80 backdrop-blur">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
            {peerName ? <span>Chat con {peerName}</span> : <span>Chat</span>}
          </div>
          <ConnectionBadge status={status} />
        </div>
      )}

      {/* Indicador de conexión compacto cuando va a reconectar */}
      {embedded && status !== 'connected' && (
        <div className="px-3 py-1 text-xs text-center text-gray-600 bg-amber-50 border-b border-amber-100">
          <ConnectionBadge status={status} inline />
        </div>
      )}

      {/* Lista de mensajes */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 overflow-y-auto px-3 py-4 space-y-2"
        role="log"
        aria-live="polite"
        aria-busy={messagesQuery.isLoading}
      >
        {messagesQuery.isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Spinner />
          </div>
        ) : messages.length === 0 ? (
          <EmptyState
            title="Sin mensajes aún"
            description={peerName ? `Escribile a ${peerName} para coordinar.` : 'Escribí el primer mensaje.'}
          />
        ) : (
          <>
            {messagesQuery.hasNextPage && (
              <div className="flex justify-center pb-2">
                <Button
                  variant="ghost"
                  size="sm"
                  loading={messagesQuery.isFetchingNextPage}
                  onClick={() => messagesQuery.fetchNextPage()}
                >
                  Cargar mensajes anteriores
                </Button>
              </div>
            )}

            {messages.map((m) => (
              <MessageBubble
                key={m.id}
                message={m}
                mine={m.sender_id === myId}
                onDelete={() => deleteMessage.mutate(m.id)}
                deleting={deleteMessage.isPending && deleteMessage.variables === m.id}
              />
            ))}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      {/* Botón saltar al final */}
      {!atBottom && messages.length > 0 && (
        <button
          type="button"
          onClick={() => bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })}
          className="absolute right-4 bottom-24 p-2 rounded-full bg-white shadow-lg border border-gray-200 text-brand-600 hover:bg-gray-50"
          aria-label="Ir al último mensaje"
        >
          <ArrowDown className="w-5 h-5" />
        </button>
      )}

      {/* Input */}
      <form
        onSubmit={submit}
        className="flex items-end gap-2 px-3 py-2 border-t border-gray-200 bg-white"
      >
        <div className="flex-1">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Escribí un mensaje…"
            maxLength={MAX_CONTENT}
            rows={1}
            className="max-h-32 min-h-[44px]"
            disabled={status === 'reconnecting' || status === 'disconnected'}
            aria-label="Mensaje"
          />
          <div className="flex justify-end mt-0.5">
            <span className={cn('text-xs', draft.length > MAX_CONTENT - 100 ? 'text-amber-600' : 'text-gray-400')}>
              {draft.length}/{MAX_CONTENT}
            </span>
          </div>
        </div>
        <Button
          type="submit"
          size="md"
          disabled={draft.trim().length === 0}
          aria-label="Enviar mensaje"
        >
          <Send className="w-4 h-4" />
          <span className="sr-only">Enviar</span>
        </Button>
      </form>
    </div>
  );
}

type ConnStatus = 'connected' | 'connecting' | 'reconnecting' | 'disconnected';

function connectionStatus(state: string, wasOpen: boolean): ConnStatus {
  if (state === 'open') return 'connected';
  if (state === 'connecting') return wasOpen ? 'reconnecting' : 'connecting';
  return 'disconnected';
}

function ConnectionBadge({ status, inline = false }: { status: ConnStatus; inline?: boolean }) {
  const map: Record<ConnStatus, { text: string; icon: typeof Wifi; cls: string }> = {
    connected: { text: 'Conectado', icon: Wifi, cls: 'text-emerald-600' },
    connecting: { text: 'Conectando…', icon: Loader2, cls: 'text-gray-500' },
    reconnecting: { text: 'Reconectando…', icon: Loader2, cls: 'text-amber-600' },
    disconnected: { text: 'Desconectado', icon: WifiOff, cls: 'text-red-500' },
  };
  const { text, icon: Icon, cls } = map[status];
  const spin = status === 'connecting' || status === 'reconnecting';
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium', cls)}>
      <Icon className={cn('w-3.5 h-3.5', spin && 'animate-spin')} />
      {!inline && <span>{text}</span>}
      {inline && <span>{text}</span>}
    </span>
  );
}

interface MessageBubbleProps {
  message: MessageOut;
  mine: boolean;
  onDelete: () => void;
  deleting: boolean;
}

function MessageBubble({ message, mine, onDelete, deleting }: MessageBubbleProps) {
  const [confirming, setConfirming] = useState(false);
  const pending = message.id.startsWith('temp:');

  return (
    <div className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'group relative max-w-[80%] rounded-2xl px-3.5 py-2 text-sm shadow-sm',
          mine
            ? 'bg-brand-600 text-white rounded-br-sm'
            : 'bg-white text-gray-900 border border-gray-200 rounded-bl-sm',
          pending && 'opacity-60',
        )}
      >
        {/* El contenido se renderiza como TEXTO (seguro contra XSS). */}
        <p className="whitespace-pre-wrap break-words">{message.content}</p>
        <div
          className={cn(
            'mt-0.5 flex items-center gap-2',
            mine ? 'justify-end text-brand-100' : 'text-gray-400',
          )}
        >
          <span className="text-[10px]">
            {pending ? 'enviando…' : formatRelativeTime(message.created_at)}
          </span>
          {mine && !pending && (
            <>
              {!confirming ? (
                <button
                  type="button"
                  onClick={() => setConfirming(true)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] inline-flex items-center gap-0.5 hover:underline"
                  aria-label="Borrar mensaje"
                >
                  <Trash2 className="w-3 h-3" /> Borrar
                </button>
              ) : (
                <span className="text-[10px] inline-flex items-center gap-1">
                  ¿Seguro?
                  <button
                    type="button"
                    onClick={onDelete}
                    disabled={deleting}
                    className="font-semibold underline"
                  >
                    {deleting ? '…' : 'Sí'}
                  </button>
                  <button type="button" onClick={() => setConfirming(false)} className="underline">
                    No
                  </button>
                </span>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
```

> **Notas de UI:**
> - `ErrorState` y `EmptyState` se asumen disponibles en `components/ui/` (F0/F3). Si `ErrorState` no expone `onRetry`, omitir esa prop (reconciliar con la firma real).
> - El botón "saltar al final" usa `absolute`; el contenedor padre del chat debe ser `relative`. En `ChatPage` se envuelve con `relative`.
> - `Textarea` auto-altura: se deja `rows={1}` + `max-h-32`; una mejora opcional fuera de scope es auto-grow real.

- [ ] **Step 2: Verificar tsc**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npx tsc --noEmit
```
Expected: sin errores. Si `ErrorState`/`EmptyState` no exponen alguna prop usada, ajustar las props al contrato real de esos componentes.

- [ ] **Step 3: Commit**

```bash
cd /Users/juliangarciatunon/proyectos/gad
git add frontend/src/features/chat/ChatWindow.tsx
git commit -m "feat(chat): ChatWindow con scroll automático, input validado, badges de conexión y borrado"
```

---

## Task 9: `ChatPage` y registro de ruta

**Files:**
- Create: `frontend/src/features/chat/pages/ChatPage.tsx`
- Modify: `frontend/src/router.tsx`

- [ ] **Step 1: Crear `ChatPage.tsx`**

Crear `frontend/src/features/chat/pages/ChatPage.tsx`:

```tsx
import { ArrowLeft } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { ChatWindow } from '../ChatWindow';
import { useAuth } from '../../../auth/useAuth';

/**
 * Pantalla completa del chat de un match.
 * Intenta mostrar el nombre del par vía el hook de matching (F4) si está disponible;
 * si no, usa un fallback genérico.
 *
 * Si F4 (matching) no está implementado, la importación de useMatch fallaría al compilar.
 * Por eso se importa dinámicamente y se resuelve de forma segura.
 */
export default function ChatPage() {
  const { matchId } = useParams<{ matchId: string }>();
  const { user } = useAuth();

  // Resolver el nombre del par si matching (F4) está disponible.
  const peerName = usePeerName(matchId, user?.id);

  if (!matchId) {
    return (
      <div className="p-4">
        <p className="text-sm text-gray-600">Match no válido.</p>
        <Link to="/matches" className="text-brand-600 underline">Volver a matches</Link>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col h-[100dvh]">
      <header className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-200 bg-white">
        <Link
          to={`/matches/${matchId}`}
          className="p-2 -ml-1 rounded-full hover:bg-gray-100 text-gray-600"
          aria-label="Volver al match"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex flex-col min-w-0">
          <span className="text-sm font-semibold text-gray-900 truncate">
            {peerName ?? 'Chat'}
          </span>
          <Link
            to={`/matches/${matchId}`}
            className="text-xs text-brand-600 hover:underline"
          >
            Ver detalle del match
          </Link>
        </div>
      </header>

      <div className="flex-1 min-h-0">
        <ChatWindow matchId={matchId} peerName={peerName} embedded />
      </div>
    </div>
  );
}

/**
 * Obtiene el nombre del par (el otro participante del match).
 * Usa el hook de matching si F4 está implementado; si no, devuelve undefined.
 */
function usePeerName(matchId: string | undefined, myId: string | undefined): string | undefined {
  // Import dinámico para no romper la compilación si matching aún no existe.
  // En la práctica, una vez F4 implementado, se puede cambiar a import estático.
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const matchingHooks = require('../../../features/matching/hooks') as {
      useMatch?: (id?: string) => { data?: { participants?: Array<{ user_id: string; display_name: string }> } };
    };
    const useMatch = matchingHooks.useMatch;
    if (!useMatch || !matchId) return undefined;
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { data } = useMatch(matchId);
    const peer = data?.participants?.find((p) => p.user_id !== myId);
    return peer?.display_name;
  } catch {
    return undefined;
  }
}
```

> **Nota sobre `require`:** en un módulo ESM de Vite, `require` no existe por defecto. La versión robusta es un import estático opcional. Si F4 **está implementado** (recomendado asumirlo antes de mergear F5), sustituir el cuerpo de `usePeerName` por:
>
> ```tsx
> import { useMatch } from '../../matching/hooks';
> // dentro del componente:
> const { data: match } = useMatch(matchId);
> const peerName = match?.participants?.find((p) => p.user_id !== user?.id)?.display_name;
> ```
>
> y eliminar `usePeerName`. El patrón con `require` es un **fallback** para el caso en que F4 aún no exista. **Decidir cuál aplicar según el estado real del repo al ejecutar.** Preferir el import estático cuando matching exista.

- [ ] **Step 2: Registrar la ruta `/matches/:matchId/chat` en `router.tsx`**

En `frontend/src/router.tsx`, localizar el bloque de rutas protegidas bajo `RequireAuth` donde está `/matches/:matchId` y añadir (como **hermana** de esa ruta, no anidada, para que sea pantalla completa):

```tsx
import ChatPage from './features/chat/pages/ChatPage';
// …
{
  path: 'matches/:matchId/chat',
  element: <ChatPage />,
},
```

La ruta `/matches/:matchId/chat` debe aparecer **antes** que `/matches/:matchId` si esta última fuera un path catch-all, o simplemente como hermana dentro del mismo array de hijos del layout protegido. Confirmar que no entra en conflicto con `/:matchId` (React Router v7 distingue segmentos estáticos de dinámicos, así que `chat` literal tiene prioridad sobre `:matchId`).

- [ ] **Step 3: Verificar build**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npm run build
```
Expected: build verde; aparece un chunk `ChatPage-*.js`.

> Si se eligió el patrón con `require` y el build falla por `require is not defined`, cambiar al import estático (F4 implementado) o eliminar temporalmente `usePeerName` y usar el fallback "Chat".

- [ ] **Step 4: Commit**

```bash
cd /Users/juliangarciatunon/proyectos/gad
git add frontend/src/features/chat/pages/ChatPage.tsx frontend/src/router.tsx
git commit -m "feat(chat): ChatPage en /matches/:matchId/chat + ruta registrada"
```

---

## Task 10: Embeber `ChatWindow` en `MatchDetailPage` (opcional, requiere F4)

Esta tarea **requiere que F4 haya creado `features/matching/pages/MatchDetailPage.tsx`** con acceso al `matchId` y al match. Si F4 no existe, **omitir este task** y dejar `ChatWindow` accesible solo vía `ChatPage`.

**Files:**
- Modify: `frontend/src/features/matching/pages/MatchDetailPage.tsx`

- [ ] **Step 1: Localizar `MatchDetailPage`**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
test -f src/features/matching/pages/MatchDetailPage.tsx && echo "OK" || echo "F4 no existe — omitir Task 10"
```
Expected: `OK`. Si no, documentar y saltar a la verificación final.

- [ ] **Step 2: Añadir un panel de chat embebido + un botón a pantalla completa**

Dentro de `MatchDetailPage.tsx`, importar y renderizar `ChatWindow` en una sección, junto a un link a la vista pantalla completa. Patrón sugerido (adaptar a la estructura real del componente):

```tsx
import { Link } from 'react-router-dom';
import { MessageSquare, Maximize2 } from 'lucide-react';
import { ChatWindow } from '../../chat/ChatWindow';
// …dentro del JSX del detalle, tras la info del match:

{match.status === 'active' && (
  <section className="mt-4">
    <div className="flex items-center justify-between mb-2">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-700">
        <MessageSquare className="w-4 h-4" /> Chat
      </h2>
      <Link
        to={`/matches/${match.id}/chat`}
        className="inline-flex items-center gap-1 text-xs text-brand-600 hover:underline"
      >
        <Maximize2 className="w-3.5 h-3.5" /> Pantalla completa
      </Link>
    </div>
    <div className="relative h-[60dvh] rounded-2xl overflow-hidden border border-gray-200">
      <ChatWindow matchId={match.id} peerName={peerName} embedded />
    </div>
  </section>
)}
```

> El panel embebido crea **su propio** `useChatSocket` (instancia del socket). Si `MatchDetailPage` y `ChatPage` pudieran estar montados a la vez (no lo están: son rutas distintas), habría dos sockets; como son mutuamente excluyentes, está bien. No instanciar `ChatWindow` dos veces en la misma página.

- [ ] **Step 3: Verificar build y tsc**

Run:
```bash
cd /Users/juliangarciatunon/proyectos/gad/frontend
npm run build
```
Expected: verde.

- [ ] **Step 4: Commit**

```bash
cd /Users/juliangarciatunon/proyectos/gad
git add frontend/src/features/matching/pages/MatchDetailPage.tsx
git commit -m "feat(matching): embeber ChatWindow en MatchDetailPage con link a pantalla completa"
```

---

## Verificación final (Definition of Done)

Antes de cerrar F5, ejecutar y confirmar:

- [ ] `cd frontend && npx tsc --noEmit` → sin errores.
- [ ] `cd frontend && npm run build` → build verde.
- [ ] `cd frontend && npx vitest run` → todos los tests pasan (incluye los de F0–F4).
- [ ] `cd frontend && npx vitest run src/api/__tests__/ws.test.ts` → ChatSocket: ~28 tests (conexión, close codes 4401/4403, backoff, cola, close manual, setHandlers, wsBaseUrl).
- [ ] `cd frontend && npx vitest run src/features/chat` → messageCache, hooks (messages/markRead/delete/chatSocket) en verde.
- [ ] Navegación manual (con backend levantado en `:8000` y dos sesiones):
  - Como participante de un match activo, abrir `/matches/:matchId/chat`: se conecta el WS (Network → WS 101), carga el historial (`GET /matches/{id}/messages`), hace `POST /matches/{id}/read`.
  - Enviar un mensaje: aparece al instante (optimista) y, al llegar el eco, el temp se reemplaza por el real.
  - Desde la otra sesión, recibir el mensaje en tiempo real (sin refetch) y que se marque leído.
  - Reiniciar el backend: el cliente muestra "Reconectando…" y, al volver el backend, recupera la conexión y flusha la cola.
  - Forzar un token inválido (borrar access): al reconectar el backend cierra con 4401 → redirige a `/login`.
  - Abrir el chat de un match donde no sos participante (token válido de otro usuario): 4403 → toast + redirect a `/matches`.
  - Borrar un mensaje propio: desaparece al instante (optimista) y `DELETE /messages/{id}` 200.
  - "Cargar mensajes anteriores" dispara `GET …?before=<cursor>&limit=50`.
  - Indicador de conexión refleja Conectado/Conectando/Reconectando/Desconectado.

## Notas de consistencia con F0–F4 / F6+

- **Query keys:** `['messages', matchId]` es jerárquica y única para el chat. F6/F7 no deben colisionar. `useChatSocket` y los helpers de `messageCache.ts` son los únicos que escriben en esa key vía `setQueryData`.
- **`fetchWithAuth` (F0):** el `ChatSocket` **no** usa `fetchWithAuth`; el WS pasa el token como query param. Si el access expira (15 min) y el backend cierra con 4401, el frontend redirige a login. No hay refresh transparente del WS: tras re-login, el usuario reabre el chat. Esto es aceptable y está alineado con el spec §5.3. (Una mejora futura: al recibir un `refreshed` de `subscribeAuthEvents`, reconectar el socket con el nuevo token; fuera de scope de F5.)
- **F4 (matching):** `ChatPage` y el embed en `MatchDetailPage` dependen de `useMatch`/`MatchOut`. Si F4 no está, esas integraciones de UI quedan diferidas pero el núcleo (socket, hooks, ChatWindow) compila y funciona.
- **`messageContentSchema` (zod):** valida 1–2000 chars, idéntico al backend. El `ChatSocket.send` hace una segunda validación defensiva (length) para no encolar basura.
- **Seguridad XSS:** el contenido se renderiza con `{message.content}` (texto). Nunca `dangerouslySetInnerHTML`. El backend sanea además.
- **`react-router-dom` v7:** `useNavigate` y `useParams` funcionan igual que en v6. La ruta `matches/:matchId/chat` debe registrarse como hermana de `matches/:matchId` (no anidada bajo ella, para ser pantalla completa).

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Reconexión tormenta en redes inestables | Backoff exponencial con tope (30s) y `maxReconnectAttempts` (10); tras eso, estado `closed` y el usuario ve "Desconectado" y puede reabrir el chat. |
| Eco del propio mensaje duplicado (temp + real) | `useChatSocket` reconcilia: cuando llega un `message` con `sender_id === me` y hay un temp pendiente con mismo `content`, reemplaza el temp por el real. Edge case de dos mensajes idénticos seguidos: reemplaza el primero (aceptable). |
| Token expira durante el chat (4401) | `onAuthError` limpia tokens y redirige a `/login`. No se reconecta en bucle. |
| `GET /messages` con orden distinto al asumido | `useMessages` normaliza cada página a descendente vía `select`, así los helpers del caché son robustos al orden real del backend. |
| Orden del historial al cargar más (cursor `before`) | `getNextPageParam` usa el `created_at` del mensaje más viejo de la última página; los tests verifican que `fetchNextPage` pasa ese cursor. |
| F4 no implementado → ChatPage/MatchDetail rompen | `ChatPage` usa un patrón de import seguro (o fallback "Chat"); Task 10 es opcional y se omite si no hay `MatchDetailPage`. El núcleo (Task 1–9) no depende de F4. |
| jsdom no implementa `WebSocket` | Los tests inyectan `MockWebSocket` vía `WebSocketCtor`; nunca se instancia el `WebSocket` global. |
| `crypto.randomUUID` en contexto no seguro | `generateId()` tiene fallback a `Date.now()+Math.random()`. |

## Resumen de commits (orden de ejecución)

1. `feat(chat): tipos MessageOut/WsIncoming/WsOutgoing y schema zod de contenido`
2. `feat(api): ChatSocket con reconexión exponencial, cola y close codes 4401/4403 (TDD)`
3. `feat(chat): helpers puros messageCache para InfiniteData<MessageOut[]> (TDD)`
4. `feat(chat): useMessages (infinite query por cursor) y esqueleto de hooks`
5. `test(chat): useMarkRead y useDeleteMessage con optimistic update y rollback`
6. `test(chat): useChatSocket con mock de ChatSocket (ciclo de vida, send optimista, close codes)`
7. `feat(chat): ChatWindow con scroll automático, input validado, badges de conexión y borrado`
8. `feat(chat): ChatPage en /matches/:matchId/chat + ruta registrada`
9. `feat(matching): embeber ChatWindow en MatchDetailPage con link a pantalla completa` *(opcional, requiere F4)*
