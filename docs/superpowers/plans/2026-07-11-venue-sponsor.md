# Venue Sponsor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que locales comerciales (bares, restós, cafés) aparezcan en el mapa de disponibilidad como venues sponsoreados con una oferta visible, gestionados íntegramente por admin.

**Architecture:** Modelo de datos aditivo: nuevas tablas `venues` + `venue_offers` (no toca `User`/`Plan`/`Availability`). Nuevo módulo backend `venues/` con endpoint geoespacial público (auth required) + endpoints admin bajo `/admin/venues*` (siguiendo los patrones de `plans/` y `admin/`). Frontend: feature-slice `venues/` + marcadores en `MapBackground` + capa en `ExplorePage` + panel admin.

**Tech Stack:** FastAPI + SQLAlchemy 2.0 (async) + GeoAlchemy2/PostGIS + Alembic + Pydantic v2 + pytest/testcontainers (backend); React + Vite + TypeScript + react-leaflet + @tanstack/react-query + Vitest (frontend).

**Spec:** `docs/superpowers/specs/2026-07-11-venue-sponsor-design.md`

---

## File Structure

### Backend — nuevos
- `backend/src/gad/models/venue.py` — modelos ORM `Venue` + `VenueOffer`.
- `backend/src/gad/venues/__init__.py` — re-export del router.
- `backend/src/gad/venues/router.py` — `GET /venues` geoespacial.
- `backend/src/gad/venues/service.py` — `list_nearby_venues`, helpers.
- `backend/src/gad/venues/schemas.py` — schemas públicos (`VenueListOut`, `VenueListItem`, `VenueOfferOut`).
- `backend/src/gad/venues/admin_service.py` — CRUD admin + transiciones de status.
- `backend/src/gad/alembic/versions/0004_venues.py` — migración.
- `backend/tests/test_venues_router.py` — tests del endpoint público.
- `backend/tests/test_venues_service.py` — tests de service.
- `backend/tests/test_admin_venues_router.py` — tests admin.

### Backend — modificados
- `backend/src/gad/models/enums.py` — agregar `VenueStatus`, `OfferRedemption`.
- `backend/src/gad/models/__init__.py` — registrar `Venue`, `VenueOffer`.
- `backend/src/gad/alembic_utils.py` — agregar GiST index de `venues.location`.
- `backend/src/gad/main.py` — registrar `venues_router`.
- `backend/src/gad/admin/router.py` — endpoints `/admin/venues*`.
- `backend/src/gad/admin/schemas.py` — schemas admin de venues.

### Frontend — nuevos
- `frontend/src/types/enums.ts` — *modificado*: agregar `VenueStatus`, `OfferRedemption`.
- `frontend/src/features/venues/types.ts` — tipos TS espejo del backend.
- `frontend/src/features/venues/api.ts` — `fetchVenues`.
- `frontend/src/features/venues/hooks.ts` — `useVenues`.
- `frontend/src/features/venues/components/VenueMarker.tsx` — popup Leaflet.
- `frontend/src/features/venues/__tests__/hooks.test.ts` — test del hook.

### Frontend — modificados
- `frontend/src/components/MapBackground.tsx` — `venueIcon` + props `venues`/`onVenueClick`.
- `frontend/src/features/plans/pages/ExplorePage.tsx` — capa de venues.
- `frontend/src/features/admin/types.ts` — tipos admin de venues.
- `frontend/src/features/admin/hooks.ts` — hooks admin de venues.

---

## Task 1: Enums VenueStatus y OfferRedemption

**Files:**
- Modify: `backend/src/gad/models/enums.py` (agregar al final)

- [ ] **Step 1: Agregar los enums al final de `enums.py`**

Agregar al final de `backend/src/gad/models/enums.py`:

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

- [ ] **Step 2: Verificar que importa sin errores**

Run: `cd backend && python -c "from gad.models.enums import VenueStatus, OfferRedemption; print(VenueStatus.pending, OfferRedemption.code)"`
Expected: `VenueStatus.pending OfferRedemption.code`

- [ ] **Step 3: Commit**

```bash
git add backend/src/gad/models/enums.py
git commit -m "feat(venues): add VenueStatus and OfferRedemption enums"
```

---

## Task 2: Modelos Venue y VenueOffer

**Files:**
- Create: `backend/src/gad/models/venue.py`
- Modify: `backend/src/gad/models/__init__.py`

- [ ] **Step 1: Crear `backend/src/gad/models/venue.py`**

```python
# backend/src/gad/models/venue.py
from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from geoalchemy2 import Geography
from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from gad.models.base import Base, TimestampMixin
from gad.models.enums import ActivityType, OfferRedemption, VenueStatus

if TYPE_CHECKING:
    pass


class Venue(Base, TimestampMixin):
    __tablename__ = "venues"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    category: Mapped[ActivityType] = mapped_column(
        Enum(ActivityType, name="activitytype"), nullable=False
    )
    address: Mapped[str] = mapped_column(String(300), nullable=False)
    # Dirección comercial pública: NO usa snap_to_grid (no es posición de usuario).
    location: Mapped[object] = mapped_column(
        Geography("POINT", srid=4326), nullable=False
    )
    status: Mapped[VenueStatus] = mapped_column(
        Enum(VenueStatus, name="venuestatus"),
        nullable=False,
        default=VenueStatus.pending,
        index=True,
    )

    # Datos de contacto administrativos (no son login; revisión manual por admin).
    owner_name: Mapped[str] = mapped_column(String(200), nullable=False)
    owner_email: Mapped[str] = mapped_column(String(255), nullable=False)
    owner_phone: Mapped[str | None] = mapped_column(String(50), nullable=True)

    offers: Mapped[list["VenueOffer"]] = relationship(
        "VenueOffer",
        back_populates="venue",
        cascade="all, delete-orphan",
        lazy="selectin",
    )


class VenueOffer(Base, TimestampMixin):
    __tablename__ = "venue_offers"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    venue_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("venues.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    redemption_method: Mapped[OfferRedemption] = mapped_column(
        Enum(OfferRedemption, name="offerredemption"), nullable=False
    )
    # Vigencia obligatoria: valid_until NOT NULL exige renovación (decisión #4).
    valid_from: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    valid_until: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )

    venue: Mapped["Venue"] = relationship("Venue", back_populates="offers")
```

- [ ] **Step 2: Registrar los modelos en `models/__init__.py`**

En `backend/src/gad/models/__init__.py`, agregar import y `__all__`.

Después de la línea `from gad.models.user import User, UserPreferences` agregar:

```python
from gad.models.venue import Venue, VenueOffer
```

En el import de enums, agregar `OfferRedemption, VenueStatus` al bloque existente (quedan dentro del `from gad.models.enums import (...)`):

```python
from gad.models.enums import (
    ActivityType,
    ApplicationStatus,
    ContactType,
    Gender,
    GenderPreference,
    GroupSizePreference,
    MatchRole,
    MatchStatus,
    NotificationType,
    OfferRedemption,
    PlanMode,
    PlanStatus,
    ReviewFlag,
    SafetyEventType,
    VerificationLevel,
    VenueStatus,
)
```

Agregar al `__all__` (mantener el orden alfabético existente):

```python
    "OfferRedemption",
    "VenueStatus",
    ...
    "Venue",
    "VenueOffer",
```

Es decir, `"OfferRedemption"` y `"VenueStatus"` van junto a los demás enums, y `"Venue"`, `"VenueOffer"` van al final de la lista (alfabético: van después de `"UserPreferences"`).

- [ ] **Step 3: Verificar que los modelos se registran en metadata**

Run: `cd backend && python -c "import gad.models; from gad.models import Base; print('venues' in Base.metadata.tables, 'venue_offers' in Base.metadata.tables)"`
Expected: `True True`

- [ ] **Step 4: Commit**

```bash
git add backend/src/gad/models/venue.py backend/src/gad/models/__init__.py
git commit -m "feat(venues): add Venue and VenueOffer models"
```

---

## Task 3: Schemas públicos de venues

**Files:**
- Create: `backend/src/gad/venues/schemas.py`

- [ ] **Step 1: Crear `backend/src/gad/venues/schemas.py`**

```python
# backend/src/gad/venues/schemas.py
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel

from gad.models.enums import ActivityType, OfferRedemption


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
    distance_m: int | None = None
    offers: list[VenueOfferOut] = []


class VenueListOut(BaseModel):
    items: list[VenueListItem]
    count: int
```

- [ ] **Step 2: Verificar import**

Run: `cd backend && python -c "from gad.venues.schemas import VenueListOut, VenueListItem, VenueOfferOut; print('ok')"`
Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add backend/src/gad/venues/schemas.py
git commit -m "feat(venues): add public schemas (VenueListOut, VenueListItem, VenueOfferOut)"
```

---

## Task 4: Schemas admin de venues

**Files:**
- Modify: `backend/src/gad/admin/schemas.py` (agregar al final)

- [ ] **Step 1: Agregar schemas admin al final de `admin/schemas.py`**

Agregar al final de `backend/src/gad/admin/schemas.py`. Primero actualizar el import de enums al principio del archivo.

Reemplazar la línea:
```python
from gad.models.enums import ReviewFlag, UserStatus
```
por:
```python
from gad.models.enums import ActivityType, OfferRedemption, ReviewFlag, UserStatus, VenueStatus
```

Agregar al final del archivo:

```python
class VenueCreateIn(BaseModel):
    name: str
    category: ActivityType
    address: str
    lat: float
    lng: float
    owner_name: str
    owner_email: str
    owner_phone: str | None = None


class VenueUpdateIn(BaseModel):
    name: str | None = None
    category: ActivityType | None = None
    address: str | None = None
    lat: float | None = None
    lng: float | None = None
    owner_name: str | None = None
    owner_email: str | None = None
    owner_phone: str | None = None


class VenueOfferCreateIn(BaseModel):
    title: str
    description: str
    redemption_method: OfferRedemption
    valid_from: datetime
    valid_until: datetime


class VenueOfferUpdateIn(BaseModel):
    title: str | None = None
    description: str | None = None
    redemption_method: OfferRedemption | None = None
    valid_from: datetime | None = None
    valid_until: datetime | None = None
    active: bool | None = None


class VenueAdminOut(BaseModel):
    id: UUID
    name: str
    category: ActivityType
    address: str
    lat: float
    lng: float
    status: VenueStatus
    owner_name: str
    owner_email: str
    owner_phone: str | None = None
    created_at: datetime
    offers: list["VenueOfferAdminOut"] = []


class VenueOfferAdminOut(BaseModel):
    id: UUID
    title: str
    description: str
    redemption_method: OfferRedemption
    valid_from: datetime
    valid_until: datetime
    active: bool
```

Nota: `VenueAdminOut` referencia `VenueOfferAdminOut` con forward ref (string) — como está definido abajo en el mismo archivo, Pydantic lo resuelve. Para que `model_rebuild` no sea necesario entre sí, definí `VenueOfferAdminOut` **antes** de `VenueAdminOut` en el archivo (reordená los bloques para que la offer-class quede arriba). Queda:

```python
class VenueOfferAdminOut(BaseModel):
    id: UUID
    title: str
    description: str
    redemption_method: OfferRedemption
    valid_from: datetime
    valid_until: datetime
    active: bool


class VenueAdminOut(BaseModel):
    id: UUID
    name: str
    category: ActivityType
    address: str
    lat: float
    lng: float
    status: VenueStatus
    owner_name: str
    owner_email: str
    owner_phone: str | None = None
    created_at: datetime
    offers: list[VenueOfferAdminOut] = []
```

- [ ] **Step 2: Verificar import**

Run: `cd backend && python -c "from gad.admin.schemas import VenueCreateIn, VenueAdminOut, VenueOfferCreateIn; print('ok')"`
Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add backend/src/gad/admin/schemas.py
git commit -m "feat(venues): add admin schemas (VenueCreateIn, VenueAdminOut, offer schemas)"
```

---

## Task 5: Service público `list_nearby_venues` (TDD)

**Files:**
- Create: `backend/src/gad/venues/service.py`
- Create: `backend/tests/test_venues_service.py`

- [ ] **Step 1: Escribir el test que falla**

Crear `backend/tests/test_venues_service.py`:

```python
# backend/tests/test_venues_service.py
from datetime import UTC, datetime, timedelta

import pytest
from geoalchemy2.elements import WKTElement

from gad.models.enums import ActivityType, OfferRedemption, VenueStatus
from gad.models.venue import Venue, VenueOffer
from gad.venues.service import list_nearby_venues


async def _seed_venue(session, *, name, lat, lng, status=VenueStatus.active):
    venue = Venue(
        name=name,
        category=ActivityType.drinks,
        address=f"{name} addr",
        location=WKTElement(f"POINT({lng} {lat})", srid=4326),
        status=status,
        owner_name="Owner",
        owner_email=f"{name}@example.com",
    )
    session.add(venue)
    await session.commit()
    await session.refresh(venue)
    return venue


@pytest.mark.asyncio
async def test_list_nearby_returns_only_active(db_session):
    from gad.models.user import User

    viewer = User(
        email="v@example.com",
        display_name="V",
        password_hash="x",
    )
    db_session.add(viewer)
    await db_session.commit()
    await db_session.refresh(viewer)

    await _seed_venue(db_session, name="Active", lat=-34.59, lng=-58.43)
    await _seed_venue(
        db_session, name="Pending", lat=-34.59, lng=-58.43, status=VenueStatus.pending
    )
    await _seed_venue(
        db_session, name="Revoked", lat=-34.59, lng=-58.43, status=VenueStatus.revoked
    )

    result = await list_nearby_venues(
        db_session, lat=-34.59, lng=-58.43, radius_m=5000
    )
    names = [v.name for v in result]
    assert "Active" in names
    assert "Pending" not in names
    assert "Revoked" not in names


@pytest.mark.asyncio
async def test_list_nearby_filters_by_radius(db_session):
    from gad.models.user import User

    viewer = User(email="v2@example.com", display_name="V", password_hash="x")
    db_session.add(viewer)
    await db_session.commit()

    await _seed_venue(db_session, name="Near", lat=-34.59, lng=-58.43)
    await _seed_venue(db_session, name="Far", lat=-34.70, lng=-58.50)

    result = await list_nearby_venues(
        db_session, lat=-34.59, lng=-58.43, radius_m=2000
    )
    names = [v.name for v in result]
    assert "Near" in names
    assert "Far" not in names


@pytest.mark.asyncio
async def test_list_nearby_orders_by_distance(db_session):
    from gad.models.user import User

    viewer = User(email="v3@example.com", display_name="V", password_hash="x")
    db_session.add(viewer)
    await db_session.commit()

    await _seed_venue(db_session, name="Far", lat=-34.62, lng=-58.43)
    await _seed_venue(db_session, name="Near", lat=-34.595, lng=-58.43)

    result = await list_nearby_venues(
        db_session, lat=-34.59, lng=-58.43, radius_m=20000
    )
    names = [v.name for v in result]
    # El más cerca primero
    assert names.index("Near") < names.index("Far")


@pytest.mark.asyncio
async def test_list_nearby_filters_by_category(db_session):
    from gad.models.user import User

    viewer = User(email="v4@example.com", display_name="V", password_hash="x")
    db_session.add(viewer)
    await db_session.commit()

    await _seed_venue(db_session, name="Bar", lat=-34.59, lng=-58.43)
    cafe = Venue(
        name="Cafe",
        category=ActivityType.coffee,
        address="addr",
        location=WKTElement("POINT(-58.43 -34.59)", srid=4326),
        status=VenueStatus.active,
        owner_name="O",
        owner_email="c@example.com",
    )
    db_session.add(cafe)
    await db_session.commit()

    result = await list_nearby_venues(
        db_session, lat=-34.59, lng=-58.43, radius_m=5000, category=ActivityType.drinks
    )
    names = [v.name for v in result]
    assert "Bar" in names
    assert "Cafe" not in names


@pytest.mark.asyncio
async def test_list_nearby_returns_venues_with_attached_coords(db_session):
    """Las coords vienen batch-extractadas de la query (ST_Y/ST_X), como en plans."""
    from gad.models.user import User

    viewer = User(email="v5@example.com", display_name="V", password_hash="x")
    db_session.add(viewer)
    await db_session.commit()

    await _seed_venue(db_session, name="X", lat=-34.59, lng=-58.43)
    result = await list_nearby_venues(
        db_session, lat=-34.59, lng=-58.43, radius_m=5000
    )
    assert len(result) == 1
    venue = result[0]
    assert hasattr(venue, "_lat")
    assert hasattr(venue, "_lng")
    assert abs(venue._lat - (-34.59)) < 0.001
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_venues_service.py -v`
Expected: FAIL (ImportError — `gad.venues.service` no existe)

- [ ] **Step 3: Implementar `backend/src/gad/venues/service.py`**

```python
# backend/src/gad/venues/service.py
from geoalchemy2 import Geometry
from geoalchemy2.elements import WKTElement
from sqlalchemy import cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from gad.models.enums import ActivityType, VenueStatus
from gad.models.venue import Venue


def _to_geography(lat: float, lng: float) -> WKTElement:
    return WKTElement(f"POINT({lng} {lat})", srid=4326)


async def list_nearby_venues(
    session: AsyncSession,
    *,
    lat: float,
    lng: float,
    radius_m: int,
    category: ActivityType | None = None,
    limit: int = 50,
) -> list[Venue]:
    """Devuelve venues activos dentro de radius_m, ordenados por distancia.

    Extrae ST_Y/ST_X en la misma query (batch) para evitar una segunda query
    por venue al serializar — mismo patrón que plans/list_nearby_plans.
    """
    viewer_point = _to_geography(lat, lng)
    loc_col = cast(Venue.location, Geometry)
    stmt = (
        select(
            Venue,
            func.ST_Y(loc_col).label("lat"),
            func.ST_X(loc_col).label("lng"),
        )
        .where(
            Venue.status == VenueStatus.active,
            Venue.location.ST_DWithin(viewer_point, radius_m),
        )
        .order_by(Venue.location.ST_Distance(viewer_point))
        .limit(limit)
    )
    if category is not None:
        stmt = stmt.where(Venue.category == category)

    result = await session.execute(stmt)
    venues = []
    for venue, vlat, vlng in result.all():
        venue._lat = vlat
        venue._lng = vlng
        venues.append(venue)
    return venues
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_venues_service.py -v`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/gad/venues/service.py backend/tests/test_venues_service.py
git commit -m "feat(venues): add list_nearby_venues service with PostGIS query"
```

---

## Task 6: Router público `GET /venues` (TDD)

**Files:**
- Create: `backend/src/gad/venues/router.py`
- Create: `backend/src/gad/venues/__init__.py`
- Create: `backend/tests/test_venues_router.py`

- [ ] **Step 1: Escribir los tests que fallan**

Crear `backend/tests/test_venues_router.py`:

```python
# backend/tests/test_venues_router.py
from datetime import UTC, datetime, timedelta

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from geoalchemy2.elements import WKTElement

from gad.auth.router import router as auth_router
from gad.db import get_session
from gad.models.enums import ActivityType, OfferRedemption, VenueStatus
from gad.models.venue import Venue, VenueOffer
from gad.venues.router import router as venues_router


@pytest.fixture
def app(db_engine):
    from fastapi import FastAPI

    app = FastAPI()
    app.include_router(auth_router)
    app.include_router(venues_router)

    test_session_maker = async_sessionmaker(
        db_engine, class_=AsyncSession, expire_on_commit=False
    )

    async def _get_test_session():
        async with test_session_maker() as session:
            yield session

    app.dependency_overrides[get_session] = _get_test_session
    app.state.test_session_maker = test_session_maker
    return app


@pytest.fixture
async def client(app):
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


async def _register(client, email="user@example.com"):
    resp = await client.post(
        "/auth/register",
        json={"email": email, "password": "12345678", "display_name": "User"},
    )
    return resp.json()["access_token"]


async def _seed_venue(session, *, name, lat, lng, status=VenueStatus.active):
    venue = Venue(
        name=name,
        category=ActivityType.drinks,
        address=f"{name} addr",
        location=WKTElement(f"POINT({lng} {lat})", srid=4326),
        status=status,
        owner_name="Owner",
        owner_email=f"{name}@example.com",
    )
    session.add(venue)
    await session.commit()
    await session.refresh(venue)
    return venue


@pytest.mark.asyncio
async def test_list_nearby_requires_auth(client):
    async with client as c:
        resp = await c.get("/venues?lat=-34.59&lng=-58.43&radius=5000")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_list_nearby_returns_only_active(app, client):
    test_sm: async_sessionmaker = app.state.test_session_maker
    async with test_sm() as session:
        await _seed_venue(session, name="Active", lat=-34.59, lng=-58.43)
        await _seed_venue(
            session, name="Pending", lat=-34.59, lng=-58.43, status=VenueStatus.pending
        )

    async with client as c:
        token = await _register(c)
        resp = await c.get(
            "/venues?lat=-34.59&lng=-58.43&radius=5000",
            headers={"Authorization": f"Bearer {token}"},
        )
    assert resp.status_code == 200
    body = resp.json()
    names = [v["name"] for v in body["items"]]
    assert "Active" in names
    assert "Pending" not in names


@pytest.mark.asyncio
async def test_list_nearby_includes_only_valid_offers(app, client):
    test_sm: async_sessionmaker = app.state.test_session_maker
    now = datetime.now(UTC)
    async with test_sm() as session:
        venue = await _seed_venue(session, name="V", lat=-34.59, lng=-58.43)
        # Offer vigente
        session.add(
            VenueOffer(
                venue_id=venue.id,
                title="2x1",
                description="2x1 en cervezas",
                redemption_method=OfferRedemption.mention,
                valid_from=now - timedelta(days=1),
                valid_until=now + timedelta(days=1),
                active=True,
            )
        )
        # Offer expirada
        session.add(
            VenueOffer(
                venue_id=venue.id,
                title="Vieja",
                description="Promo pasada",
                redemption_method=OfferRedemption.code,
                valid_from=now - timedelta(days=10),
                valid_until=now - timedelta(days=5),
                active=True,
            )
        )
        await session.commit()

    async with client as c:
        token = await _register(c)
        resp = await c.get(
            "/venues?lat=-34.59&lng=-58.43&radius=5000",
            headers={"Authorization": f"Bearer {token}"},
        )
    body = resp.json()
    venue_item = body["items"][0]
    offer_titles = [o["title"] for o in venue_item["offers"]]
    assert "2x1" in offer_titles
    assert "Vieja" not in offer_titles


@pytest.mark.asyncio
async def test_list_nearby_respects_limit(app, client):
    test_sm: async_sessionmaker = app.state.test_session_maker
    async with test_sm() as session:
        for i in range(5):
            await _seed_venue(
                session, name=f"V{i}", lat=-34.59 + i * 0.001, lng=-58.43
            )

    async with client as c:
        token = await _register(c)
        resp = await c.get(
            "/venues?lat=-34.59&lng=-58.43&radius=5000&limit=2",
            headers={"Authorization": f"Bearer {token}"},
        )
    body = resp.json()
    assert len(body["items"]) == 2
    assert body["count"] == 2


@pytest.mark.asyncio
async def test_list_nearby_filters_by_category(app, client):
    test_sm: async_sessionmaker = app.state.test_session_maker
    async with test_sm() as session:
        await _seed_venue(session, name="Bar", lat=-34.59, lng=-58.43)
        session.add(
            Venue(
                name="Cafe",
                category=ActivityType.coffee,
                address="addr",
                location=WKTElement("POINT(-58.43 -34.59)", srid=4326),
                status=VenueStatus.active,
                owner_name="O",
                owner_email="c@example.com",
            )
        )
        await session.commit()

    async with client as c:
        token = await _register(c)
        resp = await c.get(
            "/venues?lat=-34.59&lng=-58.43&radius=5000&category=drinks",
            headers={"Authorization": f"Bearer {token}"},
        )
    body = resp.json()
    names = [v["name"] for v in body["items"]]
    assert "Bar" in names
    assert "Cafe" not in names
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_venues_router.py -v`
Expected: FAIL (ImportError — `gad.venues.router` no existe)

- [ ] **Step 3: Crear `backend/src/gad/venues/__init__.py`**

```python
# backend/src/gad/venues/__init__.py
from gad.venues.router import router

__all__ = ["router"]
```

- [ ] **Step 4: Implementar `backend/src/gad/venues/router.py`**

```python
# backend/src/gad/venues/router.py
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from gad.auth.dependencies import get_current_user
from gad.db import get_session
from gad.middleware.rate_limit import limiter
from gad.models.enums import ActivityType
from gad.models.user import User
from gad.venues.schemas import VenueListItem, VenueListOut, VenueOfferOut
from gad.venues.service import list_nearby_venues

router = APIRouter(prefix="/venues", tags=["venues"])


def _offer_to_out(offer) -> VenueOfferOut | None:
    """Convierte una VenueOffer a VenueOfferOut si está vigente, si no None."""
    now = datetime.now(UTC)
    if not offer.active:
        return None
    if offer.valid_from > now or offer.valid_until < now:
        return None
    return VenueOfferOut(
        id=offer.id,
        title=offer.title,
        description=offer.description,
        redemption_method=offer.redemption_method,
        valid_from=offer.valid_from,
        valid_until=offer.valid_until,
    )


def _venue_to_item(venue) -> VenueListItem:
    offers = [
        _offer_to_out(o) for o in venue.offers if _offer_to_out(o) is not None
    ]
    return VenueListItem(
        id=venue.id,
        name=venue.name,
        category=venue.category,
        address=venue.address,
        lat=getattr(venue, "_lat", 0.0),
        lng=getattr(venue, "_lng", 0.0),
        offers=offers,
    )


@router.get("", response_model=VenueListOut)
@limiter.limit("60/minute")
async def list_venues_endpoint(
    request: Request,
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
    lat: float = Query(ge=-90, le=90),
    lng: float = Query(ge=-180, le=180),
    radius: int = Query(default=2000, ge=100, le=20000),
    category: str | None = None,
    limit: int = Query(default=50, ge=1, le=100),
) -> VenueListOut:
    category_enum = ActivityType(category) if category else None
    venues = await list_nearby_venues(
        session,
        lat=lat,
        lng=lng,
        radius_m=radius,
        category=category_enum,
        limit=limit,
    )
    items = [_venue_to_item(v) for v in venues]
    return VenueListOut(items=items, count=len(items))
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_venues_router.py -v`
Expected: PASS (5 tests)

- [ ] **Step 6: Commit**

```bash
git add backend/src/gad/venues/router.py backend/src/gad/venues/__init__.py backend/tests/test_venues_router.py
git commit -m "feat(venues): add GET /venues geospatial endpoint (auth required)"
```

---

## Task 7: Registrar venues_router en main.py

**Files:**
- Modify: `backend/src/gad/main.py`

- [ ] **Step 1: Agregar import e include_router**

En `backend/src/gad/main.py`, después de la línea `from gad.users.router import router as users_router` agregar:

```python
from gad.venues.router import router as venues_router
```

Y después de `app.include_router(plans_router)` agregar:

```python
    app.include_router(venues_router)
```

- [ ] **Step 2: Verificar que la app arranca**

Run: `cd backend && python -c "from gad.main import create_app; app = create_app(); print('ok')"`
Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add backend/src/gad/main.py
git commit -m "feat(venues): register venues_router in app"
```

---

## Task 8: Migración 0004_venues + índice GiST

**Files:**
- Create: `backend/alembic/versions/0004_venues.py`
- Modify: `backend/src/gad/alembic_utils.py`

- [ ] **Step 1: Agregar el índice GiST en `alembic_utils.py`**

En `backend/src/gad/alembic_utils.py`, dentro de `create_spatial_indexes()`, agregar al final (antes del cierre de la función):

```python
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_venues_location "
        "ON venues USING GIST (location);"
    )
```

- [ ] **Step 2: Crear la migración `0004_venues.py`**

Crear `backend/alembic/versions/0004_venues.py`:

```python
"""add venues and venue_offers tables

Crea las tablas `venues` y `venue_offers` para el feature Venue Sponsor
(issue #8). Modelo de datos aditivo: no modifica tablas existentes.

Revision ID: 0004
Revises: 0003
Create Date: 2026-07-11
"""
from collections.abc import Sequence

import gad.models  # noqa: F401  - registra modelos en Base.metadata
from alembic import op
from gad.alembic_utils import create_spatial_indexes
from gad.models import Base

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | None = None


def upgrade() -> None:
    # 0001 crea el schema con create_all sobre los modelos actuales, que ya
    # incluyen estas tablas (los modelos se registran en Base.metadata al
    # importar gad.models). Guardamos idempotencia para DBs nuevas.
    bind = op.get_bind()
    Base.metadata.create_all(bind=bind, tables=[Venue.__table__, VenueOffer.__table__], checkfirst=True)

    # Índice espacial GiST para queries ST_DWithin sobre venues.location.
    create_spatial_indexes()


def downgrade() -> None:
    op.drop_table("venue_offers")
    op.drop_table("venues")
```

**Nota importante:** `Venue` y `VenueOffer` no están importados en el scope de la migración. Agregar el import arriba. Como `gad.models` ya se importa para registrar, podemos importar desde ahí. Reemplazar la línea de la función `upgrade` para que use los modelos importados. Reescribí el header de imports así:

```python
import gad.models  # noqa: F401  - registra modelos en Base.metadata
from alembic import op
from gad.alembic_utils import create_spatial_indexes
from gad.models import Base
from gad.models.venue import Venue, VenueOffer
```

- [ ] **Step 3: Verificar que la migración corre (contra testcontainers)**

Run: `cd backend && python -m pytest tests/test_venues_service.py::test_list_nearby_returns_only_active -v`
Expected: PASS (usa `Base.metadata.create_all` en el fixture `db_engine`, que ahora incluye `venues` y `venue_offers`)

- [ ] **Step 4: Commit**

```bash
git add backend/alembic/versions/0004_venues.py backend/src/gad/alembic_utils.py
git commit -m "feat(venues): add migration 0004 (venues + venue_offers + GiST index)"
```

---

## Task 9: Admin service — CRUD y transiciones de venues

**Files:**
- Create: `backend/src/gad/venues/admin_service.py`

- [ ] **Step 1: Implementar `backend/src/gad/venues/admin_service.py`**

```python
# backend/src/gad/venues/admin_service.py
from datetime import datetime
from uuid import UUID

from geoalchemy2.elements import WKTElement
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gad.exceptions import ConflictError, NotFoundError
from gad.models.enums import VenueStatus
from gad.models.venue import Venue, VenueOffer


def _to_geography(lat: float, lng: float) -> WKTElement:
    return WKTElement(f"POINT({lng} {lat})", srid=4326)


async def _get_venue(session: AsyncSession, venue_id: UUID) -> Venue:
    result = await session.execute(select(Venue).where(Venue.id == venue_id))
    venue = result.scalar_one_or_none()
    if venue is None:
        raise NotFoundError("Venue no encontrado")
    return venue


async def _get_venue_location_coords(session: AsyncSession, venue: Venue) -> tuple[float, float]:
    """Devuelve (lat, lng) del venue extrayéndolas de la geography."""
    from geoalchemy2 import Geometry
    from sqlalchemy import cast, func

    loc_col = cast(Venue.location, Geometry)
    stmt = select(
        func.ST_Y(loc_col).label("lat"),
        func.ST_X(loc_col).label("lng"),
    ).where(Venue.id == venue.id)
    result = await session.execute(stmt)
    return result.one()


async def create_venue(session: AsyncSession, data) -> Venue:
    venue = Venue(
        name=data.name,
        category=data.category,
        address=data.address,
        location=_to_geography(data.lat, data.lng),
        status=VenueStatus.pending,
        owner_name=data.owner_name,
        owner_email=data.owner_email,
        owner_phone=data.owner_phone,
    )
    session.add(venue)
    await session.commit()
    await session.refresh(venue)
    return venue


async def list_venues_admin(
    session: AsyncSession,
    *,
    status: str | None = None,
    limit: int = 50,
) -> list[Venue]:
    stmt = select(Venue).order_by(Venue.created_at.desc()).limit(limit)
    if status is not None:
        stmt = stmt.where(Venue.status == VenueStatus(status))
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def get_venue_admin(session: AsyncSession, venue_id: UUID) -> Venue:
    return await _get_venue(session, venue_id)


async def update_venue(session: AsyncSession, venue: Venue, data) -> Venue:
    dump = data.model_dump(exclude_unset=True)
    for field in ("name", "category", "address", "owner_name", "owner_email", "owner_phone"):
        if field in dump and dump[field] is not None:
            setattr(venue, field, dump[field])
    # Location se actualiza sólo si ambos coords vienen.
    if dump.get("lat") is not None and dump.get("lng") is not None:
        venue.location = _to_geography(dump["lat"], dump["lng"])
    await session.commit()
    await session.refresh(venue)
    return venue


async def approve_venue(session: AsyncSession, venue: Venue) -> Venue:
    if venue.status != VenueStatus.pending:
        raise ConflictError("Solo se pueden aprobar venues en estado pending")
    venue.status = VenueStatus.active
    await session.commit()
    await session.refresh(venue)
    return venue


async def pause_venue(session: AsyncSession, venue: Venue) -> Venue:
    if venue.status != VenueStatus.active:
        raise ConflictError("Solo se pueden pausar venues en estado active")
    venue.status = VenueStatus.paused
    await session.commit()
    await session.refresh(venue)
    return venue


async def revoke_venue(session: AsyncSession, venue: Venue) -> Venue:
    # Revocar es terminal: desde cualquier estado.
    venue.status = VenueStatus.revoked
    await session.commit()
    await session.refresh(venue)
    return venue


async def create_offer(session: AsyncSession, venue_id: UUID, data) -> VenueOffer:
    venue = await _get_venue(session, venue_id)
    if data.valid_from >= data.valid_until:
        raise ConflictError("valid_from debe ser anterior a valid_until")
    offer = VenueOffer(
        venue_id=venue.id,
        title=data.title,
        description=data.description,
        redemption_method=data.redemption_method,
        valid_from=data.valid_from,
        valid_until=data.valid_until,
    )
    session.add(offer)
    await session.commit()
    await session.refresh(offer)
    return offer


async def _get_offer(
    session: AsyncSession, venue_id: UUID, offer_id: UUID
) -> VenueOffer:
    result = await session.execute(
        select(VenueOffer).where(
            VenueOffer.id == offer_id, VenueOffer.venue_id == venue_id
        )
    )
    offer = result.scalar_one_or_none()
    if offer is None:
        raise NotFoundError("Oferta no encontrada")
    return offer


async def update_offer(
    session: AsyncSession, venue_id: UUID, offer_id: UUID, data
) -> VenueOffer:
    offer = await _get_offer(session, venue_id, offer_id)
    dump = data.model_dump(exclude_unset=True)
    for field in (
        "title",
        "description",
        "redemption_method",
        "valid_from",
        "valid_until",
        "active",
    ):
        if field in dump:
            setattr(offer, field, dump[field])
    # Re-validar fechas si alguna cambió.
    if offer.valid_from >= offer.valid_until:
        raise ConflictError("valid_from debe ser anterior a valid_until")
    await session.commit()
    await session.refresh(offer)
    return offer


async def delete_offer(
    session: AsyncSession, venue_id: UUID, offer_id: UUID
) -> None:
    offer = await _get_offer(session, venue_id, offer_id)
    await session.delete(offer)
    await session.commit()
```

- [ ] **Step 2: Verificar import**

Run: `cd backend && python -c "from gad.venues.admin_service import create_venue, approve_venue, create_offer; print('ok')"`
Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add backend/src/gad/venues/admin_service.py
git commit -m "feat(venues): add admin service (CRUD + status transitions + offers)"
```

---

## Task 10: Admin router — endpoints `/admin/venues*` (TDD)

**Files:**
- Modify: `backend/src/gad/admin/router.py`
- Create: `backend/tests/test_admin_venues_router.py`

- [ ] **Step 1: Escribir los tests que fallan**

Crear `backend/tests/test_admin_venues_router.py`:

```python
# backend/tests/test_admin_venues_router.py
import pytest
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from gad.admin.router import router as admin_router
from gad.auth.router import router as auth_router
from gad.auth.service import register
from gad.exceptions import GADError
from gad.schemas.auth import RegisterIn


@pytest.fixture
def app(db_engine):
    app = FastAPI()

    @app.exception_handler(GADError)
    async def h(request: Request, exc: GADError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code, content={"detail": exc.detail, "code": exc.code}
        )

    test_sm = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)

    async def _session():
        async with test_sm() as s:
            yield s

    from gad.db import get_session

    app.dependency_overrides[get_session] = _session
    app.include_router(auth_router)
    app.include_router(admin_router)
    return app


@pytest.fixture
async def client(app):
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


async def _make_admin(db_session, user_id):
    from sqlalchemy import update

    from gad.models.user import User

    await db_session.execute(update(User).where(User.id == user_id).values(is_admin=True))
    await db_session.commit()


async def _admin(client, db_session, email="admin@example.com"):
    tokens = await register(
        db_session,
        RegisterIn(email=email, password="12345678", display_name="A"),
    )
    await _make_admin(db_session, tokens.user_id)
    return {"Authorization": f"Bearer {tokens.access_token}"}, tokens.user_id


VENUE_BODY = {
    "name": "Bar X",
    "category": "drinks",
    "address": "Calle Falsa 123",
    "lat": -34.59,
    "lng": -58.43,
    "owner_name": "Dueno",
    "owner_email": "dueno@example.com",
    "owner_phone": "+5411",
}


@pytest.mark.asyncio
async def test_non_admin_forbidden(client, db_session):
    tokens = await register(
        db_session,
        RegisterIn(email="u@example.com", password="12345678", display_name="U"),
    )
    headers = {"Authorization": f"Bearer {tokens.access_token}"}
    async with client as c:
        resp = await c.post("/admin/venues", json=VENUE_BODY, headers=headers)
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_create_venue_starts_pending(client, db_session):
    headers, _ = await _admin(client, db_session)
    async with client as c:
        resp = await c.post("/admin/venues", json=VENUE_BODY, headers=headers)
    assert resp.status_code == 200
    assert resp.json()["status"] == "pending"


@pytest.mark.asyncio
async def test_approve_only_from_pending(client, db_session):
    headers, _ = await _admin(client, db_session)
    async with client as c:
        vid = (await c.post("/admin/venues", json=VENUE_BODY, headers=headers)).json()["id"]
        # Aprobar OK (pending -> active)
        resp = await c.post(f"/admin/venues/{vid}/approve", headers=headers)
        assert resp.status_code == 200
        assert resp.json()["status"] == "active"
        # Aprobar de nuevo -> 409
        resp2 = await c.post(f"/admin/venues/{vid}/approve", headers=headers)
    assert resp2.status_code == 409


@pytest.mark.asyncio
async def test_pause_only_from_active(client, db_session):
    headers, _ = await _admin(client, db_session)
    async with client as c:
        vid = (await c.post("/admin/venues", json=VENUE_BODY, headers=headers)).json()["id"]
        await c.post(f"/admin/venues/{vid}/approve", headers=headers)
        resp = await c.post(f"/admin/venues/{vid}/pause", headers=headers)
        assert resp.status_code == 200
        assert resp.json()["status"] == "paused"
        # Pause de nuevo -> 409
        resp2 = await c.post(f"/admin/venues/{vid}/pause", headers=headers)
    assert resp2.status_code == 409


@pytest.mark.asyncio
async def test_revoke_from_any_state(client, db_session):
    headers, _ = await _admin(client, db_session)
    async with client as c:
        vid = (await c.post("/admin/venues", json=VENUE_BODY, headers=headers)).json()["id"]
        # Revocar desde pending
        resp = await c.post(f"/admin/venues/{vid}/revoke", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["status"] == "revoked"


@pytest.mark.asyncio
async def test_create_offer_validates_dates(client, db_session):
    from datetime import UTC, datetime, timedelta

    headers, _ = await _admin(client, db_session)
    now = datetime.now(UTC)
    async with client as c:
        vid = (await c.post("/admin/venues", json=VENUE_BODY, headers=headers)).json()["id"]
        # valid_from >= valid_until
        resp = await c.post(
            f"/admin/venues/{vid}/offers",
            json={
                "title": "X",
                "description": "D",
                "redemption_method": "mention",
                "valid_from": now.isoformat(),
                "valid_until": now.isoformat(),
            },
            headers=headers,
        )
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_create_and_list_offer(client, db_session):
    from datetime import UTC, datetime, timedelta

    headers, _ = await _admin(client, db_session)
    now = datetime.now(UTC)
    async with client as c:
        vid = (await c.post("/admin/venues", json=VENUE_BODY, headers=headers)).json()["id"]
        resp = await c.post(
            f"/admin/venues/{vid}/offers",
            json={
                "title": "2x1",
                "description": "2x1 cervezas",
                "redemption_method": "mention",
                "valid_from": (now - timedelta(days=1)).isoformat(),
                "valid_until": (now + timedelta(days=30)).isoformat(),
            },
            headers=headers,
        )
        assert resp.status_code == 200
        # El venue ahora tiene la offer
        detail = await c.get(f"/admin/venues/{vid}", headers=headers)
    assert len(detail.json()["offers"]) == 1
    assert detail.json()["offers"][0]["title"] == "2x1"


@pytest.mark.asyncio
async def test_revoke_hides_from_public_list(client, db_session):
    from geoalchemy2.elements import WKTElement

    from gad.models.enums import ActivityType, VenueStatus
    from gad.models.venue import Venue

    # Seed directo en estado revoked
    venue = Venue(
        name="RevokedVenue",
        category=ActivityType.drinks,
        address="addr",
        location=WKTElement("POINT(-58.43 -34.59)", srid=4326),
        status=VenueStatus.revoked,
        owner_name="O",
        owner_email="r@example.com",
    )
    db_session.add(venue)
    await db_session.commit()

    # Registrar un user para consultar el endpoint público
    tokens = await register(
        db_session,
        RegisterIn(email="viewer@example.com", password="12345678", display_name="V"),
    )
    headers = {"Authorization": f"Bearer {tokens.access_token}"}
    async with client as c:
        resp = await c.get(
            "/venues?lat=-34.59&lng=-58.43&radius=5000", headers=headers
        )
    body = resp.json()
    names = [v["name"] for v in body["items"]]
    assert "RevokedVenue" not in names
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_admin_venues_router.py -v`
Expected: FAIL (los endpoints `/admin/venues` no existen aún → 404)

- [ ] **Step 3: Agregar los endpoints admin a `admin/router.py`**

En `backend/src/gad/admin/router.py`, primero actualizar el import de schemas. Reemplazar:

```python
from gad.admin.schemas import AdminStatsOut, AdminUserOut, FlaggedReviewOut, ReportStatusUpdate
```

por:

```python
from gad.admin.schemas import (
    AdminStatsOut,
    AdminUserOut,
    FlaggedReviewOut,
    ReportStatusUpdate,
    VenueAdminOut,
    VenueCreateIn,
    VenueOfferAdminOut,
    VenueOfferCreateIn,
    VenueOfferUpdateIn,
    VenueUpdateIn,
)
```

Agregar import de admin_service de venues (al final del bloque de imports, después de `from gad.db import get_session`):

```python
from gad.venues.admin_service import (
    approve_venue,
    create_offer,
    create_venue,
    delete_offer,
    get_venue_admin,
    list_venues_admin,
    pause_venue,
    revoke_venue,
    update_offer,
    update_venue,
)
```

Agregar al final de `admin/router.py` (después del último endpoint):

```python
# ---------- Venues (sponsored) ----------


def _venue_coords(venue) -> tuple[float, float]:
    """Extrae lat/lng de la geography del venue (query puntual)."""
    # En endpoints admin no hacemos batch-extract; query simple.
    return venue._admin_lat, venue._admin_lng


def _offer_to_admin_out(offer) -> VenueOfferAdminOut:
    return VenueOfferAdminOut(
        id=offer.id,
        title=offer.title,
        description=offer.description,
        redemption_method=offer.redemption_method,
        valid_from=offer.valid_from,
        valid_until=offer.valid_until,
        active=offer.active,
    )


async def _venue_to_admin_out(session: AsyncSession, venue: Venue) -> VenueAdminOut:
    from geoalchemy2 import Geometry
    from sqlalchemy import cast, func

    from gad.models.venue import Venue as VenueModel

    loc_col = cast(VenueModel.location, Geometry)
    stmt = select(
        func.ST_Y(loc_col).label("lat"),
        func.ST_X(loc_col).label("lng"),
    ).where(VenueModel.id == venue.id)
    result = await session.execute(stmt)
    lat, lng = result.one()
    return VenueAdminOut(
        id=venue.id,
        name=venue.name,
        category=venue.category,
        address=venue.address,
        lat=lat,
        lng=lng,
        status=venue.status,
        owner_name=venue.owner_name,
        owner_email=venue.owner_email,
        owner_phone=venue.owner_phone,
        created_at=venue.created_at,
        offers=[_offer_to_admin_out(o) for o in venue.offers],
    )


@router.post("/venues", response_model=VenueAdminOut, status_code=200)
async def create_venue_endpoint(
    data: VenueCreateIn,
    admin: Annotated[User, Depends(require_admin)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> VenueAdminOut:
    venue = await create_venue(session, data)
    return await _venue_to_admin_out(session, venue)


@router.get("/venues", response_model=list[VenueAdminOut])
async def list_venues_endpoint(
    admin: Annotated[User, Depends(require_admin)],
    session: Annotated[AsyncSession, Depends(get_session)],
    status: str | None = None,
    limit: int = Query(default=50, ge=1, le=100),
) -> list[VenueAdminOut]:
    venues = await list_venues_admin(session, status=status, limit=limit)
    return [await _venue_to_admin_out(session, v) for v in venues]


@router.get("/venues/{venue_id}", response_model=VenueAdminOut)
async def get_venue_endpoint(
    venue_id: UUID,
    admin: Annotated[User, Depends(require_admin)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> VenueAdminOut:
    venue = await get_venue_admin(session, venue_id)
    return await _venue_to_admin_out(session, venue)


@router.patch("/venues/{venue_id}", response_model=VenueAdminOut)
async def update_venue_endpoint(
    venue_id: UUID,
    data: VenueUpdateIn,
    admin: Annotated[User, Depends(require_admin)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> VenueAdminOut:
    venue = await get_venue_admin(session, venue_id)
    venue = await update_venue(session, venue, data)
    return await _venue_to_admin_out(session, venue)


@router.post("/venues/{venue_id}/approve", response_model=VenueAdminOut)
async def approve_venue_endpoint(
    venue_id: UUID,
    admin: Annotated[User, Depends(require_admin)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> VenueAdminOut:
    venue = await get_venue_admin(session, venue_id)
    venue = await approve_venue(session, venue)
    return await _venue_to_admin_out(session, venue)


@router.post("/venues/{venue_id}/pause", response_model=VenueAdminOut)
async def pause_venue_endpoint(
    venue_id: UUID,
    admin: Annotated[User, Depends(require_admin)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> VenueAdminOut:
    venue = await get_venue_admin(session, venue_id)
    venue = await pause_venue(session, venue)
    return await _venue_to_admin_out(session, venue)


@router.post("/venues/{venue_id}/revoke", response_model=VenueAdminOut)
async def revoke_venue_endpoint(
    venue_id: UUID,
    admin: Annotated[User, Depends(require_admin)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> VenueAdminOut:
    venue = await get_venue_admin(session, venue_id)
    venue = await revoke_venue(session, venue)
    return await _venue_to_admin_out(session, venue)


@router.post("/venues/{venue_id}/offers", response_model=VenueOfferAdminOut)
async def create_offer_endpoint(
    venue_id: UUID,
    data: VenueOfferCreateIn,
    admin: Annotated[User, Depends(require_admin)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> VenueOfferAdminOut:
    offer = await create_offer(session, venue_id, data)
    return _offer_to_admin_out(offer)


@router.patch("/venues/{venue_id}/offers/{offer_id}", response_model=VenueOfferAdminOut)
async def update_offer_endpoint(
    venue_id: UUID,
    offer_id: UUID,
    data: VenueOfferUpdateIn,
    admin: Annotated[User, Depends(require_admin)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> VenueOfferAdminOut:
    offer = await update_offer(session, venue_id, offer_id, data)
    return _offer_to_admin_out(offer)


@router.delete("/venues/{venue_id}/offers/{offer_id}")
async def delete_offer_endpoint(
    venue_id: UUID,
    offer_id: UUID,
    admin: Annotated[User, Depends(require_admin)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict[str, str]:
    await delete_offer(session, venue_id, offer_id)
    return {"message": "Oferta eliminada"}
```

**Nota:** el `_venue_coords` helper definido arriba no se usa (lo dejé por error). Borrá esa función `_venue_coords` antes de commitear — los coords se extraen dentro de `_venue_to_admin_out`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_admin_venues_router.py -v`
Expected: PASS (8 tests)

- [ ] **Step 5: Ejecutar toda la suite backend para confirmar que nada se rompió**

Run: `cd backend && python -m pytest tests/ -x -q`
Expected: PASS (sin errores)

- [ ] **Step 6: Commit**

```bash
git add backend/src/gad/admin/router.py backend/tests/test_admin_venues_router.py
git commit -m "feat(venues): add admin endpoints /admin/venues (CRUD + transitions + offers)"
```

---

## Task 11: Enums TS en el frontend

**Files:**
- Modify: `frontend/src/types/enums.ts` (agregar al final)

- [ ] **Step 1: Agregar los enums TS**

Agregar al final de `frontend/src/types/enums.ts`:

```typescript
export type VenueStatus = 'pending' | 'active' | 'paused' | 'revoked';

export type OfferRedemption = 'code' | 'qr' | 'mention';
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/types/enums.ts
git commit -m "feat(venues): add VenueStatus and OfferRedemption TS types"
```

---

## Task 12: Feature-slice venues (types + api + hook, TDD)

**Files:**
- Create: `frontend/src/features/venues/types.ts`
- Create: `frontend/src/features/venues/api.ts`
- Create: `frontend/src/features/venues/hooks.ts`
- Create: `frontend/src/features/venues/__tests__/hooks.test.ts`

- [ ] **Step 1: Crear `frontend/src/features/venues/types.ts`**

```typescript
// frontend/src/features/venues/types.ts
import type {
  ActivityType,
  OfferRedemption,
  VenueStatus,
} from '../../types/enums';

export type { ActivityType, OfferRedemption, VenueStatus } from '../../types/enums';

/** Offer vigente devuelto en GET /venues (solo incluye las no expiradas). */
export interface VenueOfferOut {
  id: string;
  title: string;
  description: string;
  redemption_method: OfferRedemption;
  valid_from: string;
  valid_until: string;
}

/** Item de GET /venues. */
export interface VenueListItem {
  id: string;
  name: string;
  category: ActivityType;
  address: string;
  lat: number;
  lng: number;
  distance_m: number | null;
  offers: VenueOfferOut[];
}

/** Respuesta de GET /venues. */
export interface VenueListOut {
  items: VenueListItem[];
  count: number;
}

/** Query params de GET /venues. lat/lng obligatorios. */
export interface VenuesQuery {
  lat: number;
  lng: number;
  radius?: number;
  category?: ActivityType;
  limit?: number;
}
```

- [ ] **Step 2: Crear `frontend/src/features/venues/api.ts`**

```typescript
// frontend/src/features/venues/api.ts
import { apiGet } from '../../api/client';
import type { VenueListOut, VenuesQuery } from './types';

/** Query params numéricos como espera el wrapper api/client ({ query }). */
function toQuery(q: VenuesQuery): Record<string, number | string> {
  const params: Record<string, number | string> = { lat: q.lat, lng: q.lng };
  if (q.radius !== undefined) params.radius = q.radius;
  if (q.category) params.category = q.category;
  if (q.limit !== undefined) params.limit = q.limit;
  return params;
}

/** GET /venues — venues sponsoreados cercanos (auth required). */
export function fetchVenues(q: VenuesQuery): Promise<VenueListOut> {
  return apiGet<VenueListOut>('/venues', { query: toQuery(q) });
}
```

- [ ] **Step 3: Escribir el test del hook que falla**

Crear `frontend/src/features/venues/__tests__/hooks.test.ts`:

```typescript
// frontend/src/features/venues/__tests__/hooks.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useVenues } from '../hooks';
import type { VenueListOut } from '../types';

vi.mock('../../api/client', () => ({
  apiGet: vi.fn(),
}));

import { apiGet } from '../../api/client';

const mockedApiGet = vi.mocked(apiGet);

const sampleResponse: VenueListOut = {
  items: [
    {
      id: 'v1',
      name: 'Bar X',
      category: 'drinks',
      address: 'Calle 1',
      lat: -34.59,
      lng: -58.43,
      distance_m: 100,
      offers: [
        {
          id: 'o1',
          title: '2x1',
          description: '2x1 cervezas',
          redemption_method: 'mention',
          valid_from: '2026-07-01T00:00:00Z',
          valid_until: '2026-07-31T00:00:00Z',
        },
      ],
    },
  ],
  count: 1,
};

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  // eslint-disable-next-line react-refresh/only-export-components
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return Wrapper;
}

describe('useVenues', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches venues when query is provided', async () => {
    mockedApiGet.mockResolvedValueOnce(sampleResponse);
    const { result } = renderHook(
      () => useVenues({ lat: -34.59, lng: -58.43, radius: 5000 }),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.items).toHaveLength(1);
    expect(result.current.data?.items[0].name).toBe('Bar X');
    expect(mockedApiGet).toHaveBeenCalledWith(
      '/venues',
      { query: { lat: -34.59, lng: -58.43, radius: 5000 } },
    );
  });

  it('does not fetch when query is null', async () => {
    const { result } = renderHook(() => useVenues(null), {
      wrapper: makeWrapper(),
    });
    expect(mockedApiGet).not.toHaveBeenCalled();
    expect(result.current.isEnabled).toBe(false);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/features/venues/__tests__/hooks.test.ts`
Expected: FAIL (ImportError — `useVenues` no existe)

- [ ] **Step 5: Crear `frontend/src/features/venues/hooks.ts`**

```typescript
// frontend/src/features/venues/hooks.ts
import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { fetchVenues } from './api';
import type { VenueListOut, VenuesQuery } from './types';

/**
 * GET /venues — venues sponsoreados cercanos. Auth required.
 *
 * `query` es `null` mientras no haya ubicación → la query queda
 * deshabilitada y no dispara requests sin lat/lng (que darían 422).
 * Mismo patrón que usePlans.
 */
export function useVenues(
  query: VenuesQuery | null,
  options?: Omit<UseQueryOptions<VenueListOut>, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: query
      ? [
          'venues',
          {
            lat: query.lat,
            lng: query.lng,
            radius: query.radius,
            category: query.category,
          },
        ]
      : ['venues', 'disabled'],
    queryFn: () => fetchVenues(query!),
    enabled: query !== null,
    staleTime: 30_000,
    ...options,
  });
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/features/venues/__tests__/hooks.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 7: Commit**

```bash
git add frontend/src/features/venues/types.ts frontend/src/features/venues/api.ts frontend/src/features/venues/hooks.ts frontend/src/features/venues/__tests__/hooks.test.ts
git commit -m "feat(venues): add frontend feature-slice (types, api, useVenues hook)"
```

---

## Task 13: VenueMarker + venueIcon en MapBackground

**Files:**
- Create: `frontend/src/features/venues/components/VenueMarker.tsx`
- Modify: `frontend/src/components/MapBackground.tsx`

- [ ] **Step 1: Crear `frontend/src/features/venues/components/VenueMarker.tsx`**

```tsx
// frontend/src/features/venues/components/VenueMarker.tsx
import { Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import type { VenueListItem } from '../types';
import type { OfferRedemption } from '../../../types/enums';

/** Ícono distintivo para venues sponsoreados (ámbar/dorado). */
export const venueIcon = new L.DivIcon({
  className: 'bg-transparent',
  html: `
    <div class="relative flex items-center justify-center w-10 h-10">
      <div class="relative z-10 w-8 h-8 bg-amber-400 border-2 border-white rounded-full shadow-md flex items-center justify-center">
        <span class="text-[10px] font-bold text-amber-900">\$</span>
      </div>
    </div>
  `,
  iconSize: [40, 40],
  iconAnchor: [20, 20],
});

const REDEMPTION_LABELS: Record<OfferRedemption, string> = {
  mention: 'Mencioná la app',
  code: 'Mostrá este código',
  qr: 'Escaneá el QR',
};

export function VenueMarker({ venue }: { venue: VenueListItem }) {
  const offer = venue.offers[0];
  return (
    <Marker position={[venue.lat, venue.lng]} icon={venueIcon}>
      <Popup>
        <div className="flex flex-col gap-1 max-w-[200px]">
          <div className="flex items-center gap-1">
            <span className="font-semibold text-gray-900">{venue.name}</span>
            <span className="text-[10px] uppercase tracking-wide text-amber-600 font-bold">
              Sponsor
            </span>
          </div>
          {offer && (
            <>
              <p className="text-sm font-medium text-gray-800">{offer.title}</p>
              <p className="text-xs text-gray-600">{offer.description}</p>
              <p className="text-xs text-gray-500">
                Canje: <span className="font-medium">{REDEMPTION_LABELS[offer.redemption_method]}</span>
              </p>
            </>
          )}
          <p className="text-[10px] text-gray-400 italic mt-1">
            Oferta gestionada directamente con el local. GAD no se responsabiliza por su disponibilidad.
          </p>
        </div>
      </Popup>
    </Marker>
  );
}
```

- [ ] **Step 2: Agregar `venues` prop a `MapBackground`**

En `frontend/src/components/MapBackground.tsx`:

Reemplazar el `interface MapBackgroundProps` (líneas 84-95) por:

```typescript
export interface VenueMarkerLocation {
  id: string;
  lat: number;
  lng: number;
  /** Datos del venue para el popup. Si se omite, el marker no tiene popup. */
  venue?: {
    name: string;
    offers: Array<{
      title: string;
      description: string;
      redemption_method: 'code' | 'qr' | 'mention';
    }>;
  };
}

export interface MapBackgroundProps {
  userLocation: [number, number] | null;
  plans: PlanLocation[];
  venues?: VenueMarkerLocation[];
  className?: string;
  onPlanClick?: (planId: string) => void;
  onVenueClick?: (venueId: string) => void;
  /** Si está definido, el mapa captura clicks para elegir un punto. */
  onMapClick?: (lat: number, lng: number) => void;
  /** Si está definido, dibuja un círculo de radio de búsqueda. */
  circle?: { center: [number, number]; radiusM: number } | null;
  /** Pin del punto de referencia elegido (se dibuja junto al círculo). */
  pickerMarker?: [number, number] | null;
}
```

Actualizar la firma de la función para recibir `venues` y `onVenueClick`:

Reemplazar el bloque:
```typescript
export function MapBackground({
  userLocation,
  plans,
  className,
  onPlanClick,
  onMapClick,
  circle,
  pickerMarker,
}: MapBackgroundProps) {
```
por:
```typescript
export function MapBackground({
  userLocation,
  plans,
  venues = [],
  className,
  onPlanClick,
  onVenueClick,
  onMapClick,
  circle,
  pickerMarker,
}: MapBackgroundProps) {
```

Agregar el render de venues después del `.map((plan) => ...)` de planes (antes de `{onMapClick && ...}`):

```tsx
        {venues.map((v) => (
          <Marker
            key={`venue-${v.id}`}
            position={[v.lat, v.lng]}
            icon={venueIcon}
            eventHandlers={{
              click: () => onVenueClick?.(v.id),
            }}
          >
            {v.venue && (
              <Popup>
                <div className="flex flex-col gap-1 max-w-[200px]">
                  <div className="flex items-center gap-1">
                    <span className="font-semibold text-gray-900">{v.venue.name}</span>
                    <span className="text-[10px] uppercase tracking-wide text-amber-600 font-bold">
                      Sponsor
                    </span>
                  </div>
                  {v.venue.offers[0] && (
                    <>
                      <p className="text-sm font-medium text-gray-800">
                        {v.venue.offers[0].title}
                      </p>
                      <p className="text-xs text-gray-600">{v.venue.offers[0].description}</p>
                    </>
                  )}
                  <p className="text-[10px] text-gray-400 italic mt-1">
                    Oferta gestionada directamente con el local. GAD no se responsabiliza por su disponibilidad.
                  </p>
                </div>
              </Popup>
            )}
          </Marker>
        ))}
```

Agregar los imports necesarios al principio del archivo. Después de `import { cn } from '../lib/utils';` agregar:

```typescript
import { Popup } from 'react-leaflet';
import { venueIcon } from '../features/venues/components/VenueMarker';
```

- [ ] **Step 3: Verificar que compila**

Run: `cd frontend && npx tsc --noEmit`
Expected: sin errores

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/venues/components/VenueMarker.tsx frontend/src/components/MapBackground.tsx
git commit -m "feat(venues): add VenueMarker component and venue layer in MapBackground"
```

---

## Task 14: Integrar venues en ExplorePage

**Files:**
- Modify: `frontend/src/features/plans/pages/ExplorePage.tsx`

- [ ] **Step 1: Agregar el hook de venues y construir los markers**

En `frontend/src/features/plans/pages/ExplorePage.tsx`:

Después del import `import { usePlans } from '../hooks';` agregar:

```typescript
import { useVenues } from '../../venues/hooks';
```

Después del bloque `const { data: plans, ... } = usePlans(plansQuery);` (alrededor de la línea 50), agregar:

```typescript
  const venuesQuery = gps.location
    ? { lat: gps.location[0], lng: gps.location[1], radius: 5000 }
    : null;
  const { data: venuesData } = useVenues(venuesQuery);

  const venueMarkers = useMemo(
    () =>
      (venuesData?.items ?? []).map((v) => ({
        id: v.id,
        lat: v.lat,
        lng: v.lng,
        venue: {
          name: v.name,
          offers: v.offers.map((o) => ({
            title: o.title,
            description: o.description,
            redemption_method: o.redemption_method,
          })),
        },
      })),
    [venuesData],
  );
```

- [ ] **Step 2: Pasar `venues` al `MapBackground`**

En el JSX, actualizar el `<MapBackground ... />` para incluir `venues={venueMarkers}`. Reemplazar:

```tsx
      <MapBackground
        userLocation={gps.location}
        plans={planMarkers}
        onPlanClick={(id) => navigate(`/plans/${id}`)}
        key={`map-${recenterToken}`}
      />
```

por:

```tsx
      <MapBackground
        userLocation={gps.location}
        plans={planMarkers}
        venues={venueMarkers}
        onPlanClick={(id) => navigate(`/plans/${id}`)}
        key={`map-${recenterToken}`}
      />
```

- [ ] **Step 3: Verificar que compila**

Run: `cd frontend && npx tsc --noEmit`
Expected: sin errores

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/plans/pages/ExplorePage.tsx
git commit -m "feat(venues): integrate venue markers into ExplorePage map"
```

---

## Task 15: Admin frontend — types y hooks de venues

**Files:**
- Modify: `frontend/src/features/admin/types.ts`
- Modify: `frontend/src/features/admin/hooks.ts`

- [ ] **Step 1: Agregar tipos admin de venues**

En `frontend/src/features/admin/types.ts`, agregar al final del archivo:

```typescript
/** Tipos para gestión admin de venues (GET/POST/PATCH /admin/venues*). */
export interface VenueOfferAdminOut {
  id: string;
  title: string;
  description: string;
  redemption_method: string;
  valid_from: string;
  valid_until: string;
  active: boolean;
}

export interface VenueAdminOut {
  id: string;
  name: string;
  category: string;
  address: string;
  lat: number;
  lng: number;
  status: string;
  owner_name: string;
  owner_email: string;
  owner_phone: string | null;
  created_at: string;
  offers: VenueOfferAdminOut[];
}

export interface VenueCreateInput {
  name: string;
  category: string;
  address: string;
  lat: number;
  lng: number;
  owner_name: string;
  owner_email: string;
  owner_phone?: string | null;
}

export interface VenueOfferCreateInput {
  title: string;
  description: string;
  redemption_method: string;
  valid_from: string;
  valid_until: string;
}
```

- [ ] **Step 2: Agregar hooks admin de venues**

En `frontend/src/features/admin/hooks.ts`:

Después del bloque `export const adminKeys = {...}` agregar `venues` al objeto:

```typescript
export const adminKeys = {
  all: ['admin'] as const,
  stats: () => ['admin', 'stats'] as const,
  reports: (status?: string) => ['admin', 'reports', { status }] as const,
  users: (status?: string) => ['admin', 'users', { status }] as const,
  reviews: () => ['admin', 'reviews'] as const,
  venues: (status?: string) => ['admin', 'venues', { status }] as const,
};
```

Agregar al final del archivo:

```typescript
// ---------- Venues (sponsor management) ----------

export function useAdminVenues(status?: string) {
  return useQuery({
    queryKey: adminKeys.venues(status),
    queryFn: () =>
      apiGet<VenueAdminOut[]>('/admin/venues', {
        query: { status, limit: 100 },
      }),
    staleTime: 30_000,
  });
}

export function useCreateVenue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: VenueCreateInput) => apiPost<VenueAdminOut>('/admin/venues', input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'venues'] });
      toast.success('Venue creado.');
    },
    onError: () => toast.error('No se pudo crear el venue.'),
  });
}

export function useApproveVenue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (venueId: string) => apiPost<VenueAdminOut>(`/admin/venues/${venueId}/approve`),
    onSettled: () => qc.invalidateQueries({ queryKey: ['admin', 'venues'] }),
    onSuccess: () => toast.success('Venue aprobado.'),
    onError: () => toast.error('No se pudo aprobar el venue.'),
  });
}

export function usePauseVenue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (venueId: string) => apiPost<VenueAdminOut>(`/admin/venues/${venueId}/pause`),
    onSettled: () => qc.invalidateQueries({ queryKey: ['admin', 'venues'] }),
    onSuccess: () => toast.success('Venue pausado.'),
    onError: () => toast.error('No se pudo pausar el venue.'),
  });
}

export function useRevokeVenue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (venueId: string) => apiPost<VenueAdminOut>(`/admin/venues/${venueId}/revoke`),
    onSettled: () => qc.invalidateQueries({ queryKey: ['admin', 'venues'] }),
    onSuccess: () => toast.success('Venue revocado.'),
    onError: () => toast.error('No se pudo revocar el venue.'),
  });
}

export function useCreateVenueOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ venueId, input }: { venueId: string; input: VenueOfferCreateInput }) =>
      apiPost<VenueAdminOut>(`/admin/venues/${venueId}/offers`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'venues'] });
      toast.success('Oferta creada.');
    },
    onError: () => toast.error('No se pudo crear la oferta.'),
  });
}
```

Actualizar el import de tipos al principio del archivo para incluir los nuevos:

```typescript
import type {
  AdminStatsOut,
  AdminUserOut,
  ReportOut,
  ReportStatusUpdate,
  AdminReviewOut,
  VenueAdminOut,
  VenueCreateInput,
  VenueOfferCreateInput,
} from './types';
```

- [ ] **Step 3: Verificar que compila**

Run: `cd frontend && npx tsc --noEmit`
Expected: sin errores

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/admin/types.ts frontend/src/features/admin/hooks.ts
git commit -m "feat(venues): add admin frontend hooks and types for venue management"
```

---

## Task 16: Verificación final — suite completa

- [ ] **Step 1: Ejecutar toda la suite backend**

Run: `cd backend && python -m pytest tests/ -q`
Expected: PASS (todos los tests, incluidos los nuevos de venues y admin_venues)

- [ ] **Step 2: Ejecutar toda la suite frontend**

Run: `cd frontend && npx vitest run`
Expected: PASS (todos los tests, incluido el nuevo de `useVenues`)

- [ ] **Step 3: Verificar linting/types backend**

Run: `cd backend && python -m pyproject_utils 2>/dev/null || ruff check src/ tests/ 2>/dev/null || echo "no linter configured"`
Expected: sin errores (o "no linter configured")

- [ ] **Step 4: Verificar build frontend**

Run: `cd frontend && npx tsc --noEmit`
Expected: sin errores

- [ ] **Step 5: Commit final si hubo fixes**

```bash
git add -A
git commit -m "chore(venues): final verification — all tests green" 2>/dev/null || echo "nothing to commit"
```
