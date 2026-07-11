# Venue Sponsor — Design Spec

- **Issue:** [#8 — Venue Sponsor: lugares comerciales como destinos sponsoreados en el mapa](https://github.com/juliangt/gad/issues/8)
- **Fecha:** 2026-07-11
- **Estado:** Borrador para revisión
- **Alcance:** MVP backend completo + panel admin + capa de marcadores en el mapa

## Objetivo

Permitir que locales comerciales (bares, restós, cafés, pubs) aparezcan en el mapa de disponibilidad como **venues sponsoreados**, mostrando una oferta/incentivo (descuento, promoción, cortesía) a los usuarios de GAD dentro del contexto de un plan. El venue gana tráfico; GAD gana un canal de monetización y valor agregado para los usuarios.

## Decisiones de diseño resueltas

Las 6 decisiones pendientes del issue se resolvieron así:

| # | Decisión | Resolución | Justificación |
|---|---|---|---|
| 1 | Quién crea el venue | **Solo admin interno** (`/admin/venues`, `require_admin`) | No introduce sistema de roles nuevo ni cuentas de venue owner. Apropiado para validar el producto con venues piloto. |
| 2 | Validación de identidad | **Solo revisión manual** (datos de contacto; verificación externa por el admin) | Sin lógica de verificación automatizada en la app. |
| 3 | Modelo de incentivo | **Texto libre** (`title` + `description`) | Flexible y simple; no añade enum de tipo de oferta ni validación de valor. |
| 4 | Vigencia de oferta | **Obligatoria + renovación** (`valid_until` NOT NULL) | Fuerza revisión periódica de ofertas por el admin. |
| 5 | Exposición pública | **Solo autenticados** (`get_current_user`) | Consistente con el resto de la app (planes, availability). |
| 6 | Legal / T&C | **Acuerdo fuera de la app** | Contrato comercial se gestiona externamente; la UI muestra un disclaimer. |

## Fuera de alcance (MVP)

- Reservas / reservas de mesa integradas.
- Cobros o facturación automatizada al venue.
- Sistema de códigos únicos por usuario (tracking de redención real).
- Cuentas de venue owner / self-service.
- Verificación automatizada (email, foto del local).

## Arquitectura general

Modelo de datos **aditivo**: no modifica `User`, `Plan`, `Availability`, `matching/`, ni `safety/`. Se agregan nuevas tablas `venues` + `venue_offers` y un nuevo módulo backend `venues/`.

### Nuevo módulo backend `venues/` (sigue el patrón `plans/`)

```
backend/src/gad/venues/
  __init__.py
  router.py      # GET /venues (geoespacial, auth required)
  service.py     # list_nearby_venues + helpers (WKTElement, _to_geography)
  schemas.py     # VenueOut, VenueListItem, VenueLocation, VenueOfferOut
```

Registrado en `main.py` con `app.include_router(venues_router)` junto al resto.

### Endpoints admin bajo el router `admin/` existente

Para consistencia con `/admin/plans`, `/admin/users`, los endpoints de gestión de venues viven en el router `admin/` existente (no un router admin nuevo). Todos con `Depends(require_admin)`.

### Frontend

- Nuevo feature-slice `frontend/src/features/venues/`.
- `MapBackground.tsx` extendido con un nuevo `venueIcon` y props `venues`/`onVenueClick`.
- `ExplorePage.tsx` combina marcadores de planes + venues.
- Panel admin en `features/admin/` (o extensión del existente).

### Lo que no se toca

`User`, `Plan`, `Availability`, `matching/`, `safety/`, `MapPicker.tsx`.

## Modelos de datos

### Enums nuevos (`backend/src/gad/models/enums.py`)

```python
class VenueStatus(str, enum.Enum):
    pending = "pending"
    active = "active"
    paused = "paused"
    revoked = "revoked"

class OfferRedemption(str, enum.Enum):
    code = "code"
    qr = "qr"
    mention = "mention"
```

Ambos `str, enum.Enum` (mismo estilo que `ActivityType`, `PlanStatus`, etc.), almacenados como tipos enum de Postgres.

### `Venue` (`backend/src/gad/models/venue.py`, nuevo)

```python
class Venue(Base, TimestampMixin):
    __tablename__ = "venues"

    id: UUID PK (uuid4)
    name: str(200), nullable=False
    category: ActivityType, nullable=False          # reutiliza enum existente
    address: str(300), nullable=False
    location: Geography("POINT", srid=4326), nullable=False   # dirección comercial real
    status: VenueStatus, default=pending, indexed

    # Datos de contacto administrativos (no son login; revisión manual)
    owner_name: str(200), nullable=False
    owner_email: str(255), nullable=False
    owner_phone: str(50) | None

    offers: relationship("VenueOffer", back_populates="venue",
                         cascade="all, delete-orphan", lazy="selectin")
```

**Notas:**
- `location` **NO usa `snap_to_grid`**: a diferencia de `Plan.location_grid`, la ubicación del venue es la dirección comercial pública, no una posición de usuario a proteger.
- `lazy="selectin"` en `offers` → evita N+1 en el listado geoespacial (un query adicional trae las offers de todos los venues de la página).
- Registrado en `models/__init__.py` para que Alembic autogenerate lo detecte.

### `VenueOffer` (`backend/src/gad/models/venue.py`, nuevo)

```python
class VenueOffer(Base, TimestampMixin):
    __tablename__ = "venue_offers"

    id: UUID PK (uuid4)
    venue_id: UUID FK->venues ON DELETE CASCADE, indexed
    title: str(120), nullable=False
    description: str(500), nullable=False
    redemption_method: OfferRedemption, nullable=False   # code|qr|mention
    valid_from: datetime, nullable=False                 # vigencia obligatoria
    valid_until: datetime, nullable=False, indexed        # NO nulo → exige renovación
    active: bool, default=true

    venue: relationship("Venue", back_populates="offers")
```

### Migración `backend/alembic/versions/0004_venues.py`

- `revision = "0004"`, `down_revision = "0003"`.
- Crea tablas `venues` + `venue_offers` vía `op.create_table(...)` directo (explícito e idempotente, como 0003; no `create_all`).
- Crea los tipos enum PG `venuestatus` y `offerredemption` (o los infiere `compare_type`).
- **Índice GiST sobre `venues.location`** se agrega en `backend/src/gad/alembic_utils.py::create_spatial_indexes()` (lugar canónico para índices espaciales), invocado desde 0001 en DBs frescas y desde 0004 en DBs existentes.
- `downgrade()` dropea tablas en orden inverso (`venue_offers` antes que `venues`) y los enum types si los creó.

### Validaciones de negocio (en service layers)

- `valid_from < valid_until` siempre (si no, error 422).
- En `GET /venues` solo aparecen venues con `status == active`.
- Una oferta se considera **vigente** si `active == true AND valid_from <= now() <= valid_until`. Las offers no vigentes no se incluyen en el payload público.
- Un venue sin offers vigentes sigue apareciendo (con `offers: []`).

## Endpoints y schemas

### Endpoint público — `venues/router.py`

```python
router = APIRouter(prefix="/venues", tags=["venues"])

@router.get("", response_model=VenueListOut, response_model_exclude_none=False)
async def list_nearby_venues(
    lat: float = Query(..., ge=-90, le=90),
    lng: float = Query(..., ge=-180, le=180),
    radius: int = Query(2000, ge=100, le=20000),   # metros, clamped
    category: ActivityType | None = Query(None),
    limit: int = Query(50, ge=1, le=100),
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
):
```

Sigue el patrón de `plans/service.py::list_nearby_plans`:
- `viewer_point = WKTElement(f"POINT({lng} {lat})", srid=4326)`.
- `Venue.location.ST_DWithin(viewer_point, radius)` como filtro geoespacial.
- `.order_by(Venue.location.ST_Distance(viewer_point))`.
- `.limit(limit)`.
- `selectinload(Venue.offers)` para evitar N+1.
- Filtra offers vigentes en memoria (post-query) o con un join filtrado por `now()`.

**Diferencias con planes:**
- Filtra `Venue.status == active` (no el estado de plan).
- No excluye al viewer (no aplica).
- Incluye offers vigentes en el payload.

**Rate limit:** `60/minute` (mismo que `GET /plans`).

### Schemas públicos (`venues/schemas.py`)

```python
class VenueLocation(BaseModel):
    id: UUID
    lat: float
    lng: float

class VenueOfferOut(BaseModel):
    id: UUID
    title: str
    description: str
    redemption_method: OfferRedemption
    valid_from: datetime
    valid_until: datetime

class VenueListItem(BaseModel):
    id: UUID
    name: str
    category: ActivityType
    address: str
    lat: float
    lng: float
    distance_m: int | None
    offers: list[VenueOfferOut]   # solo vigentes

class VenueListOut(BaseModel):
    items: list[VenueListItem]
    count: int
```

### Schemas admin (`admin/schemas.py` o `venues/schemas.py`)

```python
class VenueCreateIn(BaseModel):
    name: str            # <=200
    category: ActivityType
    address: str         # <=300
    lat: float
    lng: float           # se convierte a POINT en service
    owner_name: str      # <=200
    owner_email: EmailStr
    owner_phone: str | None   # <=50

class VenueUpdateIn(BaseModel):
    # todos opcionales; mismo shape menos status (status via endpoints de transición)
    name: str | None
    category: ActivityType | None
    address: str | None
    lat: float | None
    lng: float | None
    owner_name: str | None
    owner_email: EmailStr | None
    owner_phone: str | None

class VenueAdminOut(BaseModel):
    # ídem VenueListItem + campos admin
    id: UUID
    name: str
    category: ActivityType
    address: str
    lat: float
    lng: float
    status: VenueStatus
    owner_name: str
    owner_email: str
    owner_phone: str | None
    created_at: datetime
    offers: list[VenueOfferOut]

class VenueOfferCreateIn(BaseModel):
    title: str            # <=120
    description: str      # <=500
    redemption_method: OfferRedemption
    valid_from: datetime
    valid_until: datetime   # service valida valid_from < valid_until

class VenueOfferUpdateIn(BaseModel):
    # todos opcionales
    title: str | None
    description: str | None
    redemption_method: OfferRedemption | None
    valid_from: datetime | None
    valid_until: datetime | None
    active: bool | None
```

### Endpoints admin — `admin/router.py` (extiende el router existente)

Los 10 endpoints, todos con `Depends(require_admin)`. **Rate limit** `30/minute` para escrituras admin.

| Método | Path | Descripción |
|---|---|---|
| POST | `/admin/venues` | Crear venue (nace en `pending`) |
| GET | `/admin/venues` | Listar todos (con filtro de `status` opcional) |
| GET | `/admin/venues/{id}` | Detalle admin |
| PATCH | `/admin/venues/{id}` | Editar campos (no status) |
| POST | `/admin/venues/{id}/approve` | `pending` → `active` |
| POST | `/admin/venues/{id}/pause` | `active` → `paused` |
| POST | `/admin/venues/{id}/revoke` | `*` → `revoked` (terminal) |
| POST | `/admin/venues/{id}/offers` | Crear oferta para el venue |
| PATCH | `/admin/venues/{id}/offers/{offer_id}` | Editar oferta |
| DELETE | `/admin/venues/{id}/offers/{offer_id}` | Eliminar oferta |

**Transiciones de status permitidas:**
- `approve`: solo desde `pending`. Desde otro estado → `ConflictError(409)`.
- `pause`: solo desde `active`. Desde otro estado → `ConflictError(409)`.
- `revoke`: desde cualquier estado → `revoked` (terminal; no se puede deshacer).

## Frontend

### Nuevo feature-slice `frontend/src/features/venues/`

```
features/venues/
  types.ts                      # VenueLocation, VenueListItem, VenueOffer types (TS)
  api/venues.ts                 # fetchVenues({lat,lng,radius,category?}) -> GET /venues
  hooks/useVenues.ts            # react-query useQuery hook
  components/VenueMarker.tsx    # popup Leaflet con nombre + oferta + disclaimer
  components/VenuesLayer.tsx    # mapea venues -> <VenueMarker>
  __tests__/useVenues.test.ts   # test del hook (mock fetch)
```

### Cambios en `MapBackground.tsx`

- Nuevo `venueIcon`: `L.DivIcon` diferenciado de `planIcon` y `userIcon`. Color acento/distintivo (ámbar/dorado para "sponsored"), con un badge visual para distinguirlo de un plan.
- Nuevas props opcionales: `venues?: VenueLocation[]`, `onVenueClick?: (id: string) => void`.
- Renderiza los markers de venue después de los de plan (capa visualmente encima).
- `MapPicker.tsx` **no se modifica**: el picker solo expone picking de punto, no listado.

### Cambios en `ExplorePage.tsx`

- Combina marcadores de planes (`usePlans`) + venues (`useVenues`) usando la misma `lat/lng/radius` que ya usa para planes.
- El `VenueMarker` muestra un popup de Leaflet con:
  - Nombre del venue + categoría.
  - Oferta vigente (title + description).
  - `redemption_method` traducido: `"Mostrá la app"` (mention) / `"Mostrá este código"` (code) / `"Escaneá el QR"` (qr).
  - **Disclaimer**: *"Oferta gestionada directamente con el local. GAD no se responsabiliza por su disponibilidad."*

### Panel admin frontend

- `features/admin/` (extender el existente si lo hay, o crear mínimamente): página `AdminVenuesPage` con:
  - Tabla de venues (filtro por status).
  - Form de alta/edición (`VenueCreateIn`).
  - Botones approve/pause/revoke.
  - Gestión de offers por venue (alta/edición/baja, con validadores de fechas).
- Ruteo protegido por el hook de admin existente (valida `is_admin`).

## Manejo de errores (reutiliza `backend/src/gad/exceptions.py`)

| Error | HTTP | Cuándo |
|---|---|---|
| `NotFoundError` | 404 | Venue/offer inexistente. |
| `ConflictError` | 409 | Transición de status inválida. |
| `ForbiddenError` | 403 | No-admin en endpoints admin (vía `require_admin`). |
| `AuthError` | 401 | Sin token / token inválido en `GET /venues`. |
| `GADError`/`ValueError` | 422 | `valid_from >= valid_until` en offer. |

El handler global en `main.py` ya retorna `{"detail", "code"}` JSON.

## Edge cases

1. **Venue sin offers vigentes** → aparece en el mapa igual, `offers: []`.
2. **Venue `active` pero todas sus offers expiradas** → aparece sin offers (no se oculta el venue).
3. **Radio enorme (>20km)** → clamp por query param (`le=20000`).
4. **`category` no provisto** → lista todas las categorías.
5. **Lat/lng fuera de rango** → 422 por los `Query(ge=, le=)` constraints.
6. **Venue revocado con offers activas** → no aparece en listado público (status filter); las offers quedan en DB pero inaccesibles vía API pública.

## Testing

### Backend (siguiendo `tests/test_plans_router.py`)

**`tests/test_venues_router.py`** — endpoint público:
- `test_list_nearby_venues_returns_only_active` — venue `pending`/`paused`/`revoked` no aparece.
- `test_list_nearby_venues_filters_by_radius` — venue fuera del radio no se devuelve.
- `test_list_nearby_venues_filters_by_category`.
- `test_list_nearby_venues_includes_only_valid_offers` — offer con `valid_until < now()` no aparece aunque `active=true`.
- `test_list_nearby_venues_orders_by_distance`.
- `test_list_nearby_venues_requires_auth` — 401 sin token.
- `test_list_nearby_venues_respects_limit`.

**`tests/test_venues_service.py`** — capa service:
- Builders de POINT / `_to_geography`.
- Filtro de offers vigentes.

**`tests/test_admin_venues_router.py`** — endpoints admin:
- `test_non_admin_forbidden` — user no-admin → 403 en todos los endpoints.
- `test_create_venue_starts_pending`.
- `test_approve_only_from_pending` — aprobar desde `active` → 409.
- `test_pause_only_from_active`.
- `test_revoke_from_any_state`.
- `test_create_offer_validates_dates` — `valid_from >= valid_until` → 422.
- `test_revoke_hides_from_public_list`.

### Frontend
- `features/venues/__tests__/useVenues.test.ts` — hook con mock fetch.
- Tests de `MapBackground` extendidos verificando que renderiza `venueIcon` cuando recibe `venues`.

## Cobertura de criterios de aceptación del issue

1. ✅ **Admin alta/aprueba venue; visible en mapa en su radio** → `POST /admin/venues` + `/approve`; `GET /venues` con `ST_DWithin`.
2. ✅ **Usuario consulta venues cercanos por ubicación y categoría** → `GET /venues?lat=&lng=&radius=&category=`.
3. ✅ **Ofertas con método de canje claro** → `VenueOfferOut.redemption_method` + popup UI traducido.
4. ✅ **Venue pausado/revocado desaparece del mapa de inmediato** → status filter en query + test `test_revoke_hides_from_public_list`.
5. ✅ **No altera match ni medidas de seguridad** → modelo aditivo; no se toca `Plan`/`Availability`/`safety/`.

## Archivos a crear / modificar (resumen)

### Nuevos
- `backend/src/gad/models/venue.py`
- `backend/src/gad/venues/__init__.py`
- `backend/src/gad/venues/router.py`
- `backend/src/gad/venues/service.py`
- `backend/src/gad/venues/schemas.py`
- `backend/alembic/versions/0004_venues.py`
- `backend/tests/test_venues_router.py`
- `backend/tests/test_venues_service.py`
- `backend/tests/test_admin_venues_router.py`
- `frontend/src/features/venues/types.ts`
- `frontend/src/features/venues/api/venues.ts`
- `frontend/src/features/venues/hooks/useVenues.ts`
- `frontend/src/features/venues/components/VenueMarker.tsx`
- `frontend/src/features/venues/components/VenuesLayer.tsx`
- `frontend/src/features/venues/__tests__/useVenues.test.ts`

### Modificados
- `backend/src/gad/models/enums.py` — agregar `VenueStatus`, `OfferRedemption`.
- `backend/src/gad/models/__init__.py` — importar `Venue`, `VenueOffer`.
- `backend/src/gad/alembic_utils.py` — agregar GiST index para `venues.location` en `create_spatial_indexes()`.
- `backend/src/gad/main.py` — `app.include_router(venues_router)`.
- `backend/src/gad/admin/router.py` — agregar endpoints `/admin/venues*`.
- `backend/src/gad/admin/schemas.py` (o `venues/schemas.py`) — schemas admin.
- `frontend/src/components/MapBackground.tsx` — `venueIcon` + props `venues`/`onVenueClick`.
- `frontend/src/features/plans/pages/ExplorePage.tsx` — capa de venues.
- `frontend/src/features/admin/` (extender) — `AdminVenuesPage`.
