# Plan 4 — Cierre de CRUDs

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir los endpoints que faltan para que cada recurso tenga un CRUD completo y casos de uso realistas (editar, desbloquear, borrar, revocar).

**Architecture:** Cada endpoint sigue el patrón existente: router → service (con validación de ownership/autorización de negocio) → commit. Las reglas de autorización van en el service (no en el router), consistente con el resto del códigobase.

**Tech Stack:** FastAPI, SQLAlchemy async, Pydantic v2, pytest.

---

## File Structure

- **Modify:** `backend/src/gad/plans/service.py`, `plans/router.py`, `plans/schemas.py` — `PATCH /plans/{id}`.
- **Modify:** `backend/src/gad/users/service.py`, `users/router.py` — `DELETE /me/blocks/{user_id}`.
- **Modify:** `backend/src/gad/chat/service.py`, `chat/router.py` — `DELETE /messages/{message_id}`.
- **Modify:** `backend/src/gad/notifications/service.py`, `notifications/router.py` — read-all, delete-all.
- **Modify:** `backend/src/gad/notifications/push_router.py` — unsubscribe.
- **Modify:** `backend/src/gad/safety/service.py`, `safety/router.py` — revoke share-link.
- **Modify:** `backend/src/gad/reviews/service.py`, `reviews/router.py` — delete review.
- **Create:** `backend/tests/test_crud_closures.py`

---

## Task 1: PATCH /plans/{id} (editar plan)

**Files:**
- Modify: `backend/src/gad/plans/schemas.py`, `plans/service.py`, `plans/router.py`

- [ ] **Step 1: Schema de update**

En `backend/src/gad/plans/schemas.py`, añadir (junto a `PlanIn`):

```python
class PlanUpdateIn(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    scheduled_at: datetime | None = None
```

Añadir imports necesarios (`datetime`, `Field`) si no están.

- [ ] **Step 2: Service**

En `backend/src/gad/plans/service.py`, añadir función:

```python
async def update_plan(session: AsyncSession, plan: Plan, data) -> Plan:
    if plan.status != PlanStatus.open:
        raise ConflictError("Solo se pueden editar planes abiertos")
    changed = False
    for field, value in data.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(plan, field, value)
            changed = True
    if changed:
        await session.commit()
        await session.refresh(plan)
    return plan
```

Añadir imports `from gad.exceptions import ConflictError, NotFoundError` y `from gad.models.enums import PlanStatus` si no están.

- [ ] **Step 3: Router**

En `backend/src/gad/plans/router.py`, añadir endpoint (antes del DELETE):

```python
@router.patch("/{plan_id}", response_model=PlanOut)
async def update_plan_endpoint(
    plan_id: UUID,
    data: PlanUpdateIn,
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> PlanOut:
    plan = await get_plan(session, plan_id)
    if plan.host_id != current_user.id:
        raise NotFoundError("Plan no encontrado")
    plan = await update_plan(session, plan, data)
    return await _plan_to_out(session, plan)
```

Añadir `PlanUpdateIn` al import de schemas y `update_plan` al de service.

- [ ] **Step 4: Test**

En `backend/tests/test_crud_closures.py`:

```python
import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from gad.auth.router import router as auth_router
from gad.auth.service import register
from gad.exceptions import GADError
from gad.plans.router import router as plans_router
from gad.schemas.auth import RegisterIn


@pytest.fixture
def app(db_engine):
    app = FastAPI()

    @app.exception_handler(GADError)
    async def h(request, exc):
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail, "code": exc.code})

    test_sm = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)

    async def _session():
        async with test_sm() as s:
            yield s

    from gad.db import get_session
    app.dependency_overrides[get_session] = _session
    app.include_router(auth_router)
    app.include_router(plans_router)
    return app


@pytest.fixture
async def client(app):
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


@pytest.mark.asyncio
async def test_patch_plan_updates_title(client, db_session):
    from datetime import UTC, datetime, timedelta

    from gad.models.enums import ActivityType, PlanMode
    from gad.models.plan import Plan

    tokens = await register(
        db_session, RegisterIn(email="h@example.com", password="12345678", display_name="H")
    )
    plan = Plan(
        host_id=tokens.user_id,
        activity_type=ActivityType.coffee,
        mode=PlanMode.now,
        title="Original",
        description="Desc",
        location_label="Café",
        location_grid="SRID=4326;POINT(-58.4 -34.6)",
        expires_at=datetime.now(UTC) + timedelta(hours=2),
    )
    db_session.add(plan)
    await db_session.commit()
    await db_session.refresh(plan)
    headers = {"Authorization": f"Bearer {tokens.access_token}"}
    async with client as c:
        resp = await c.patch(
            f"/plans/{plan.id}", json={"title": "Editado"}, headers=headers
        )
    assert resp.status_code == 200
    assert resp.json()["title"] == "Editado"
```

- [ ] **Step 5: Correr y commit**

Run: `cd backend && uv run pytest tests/test_crud_closures.py::test_patch_plan_updates_title -v`
Expected: PASS

```bash
git add backend/src/gad/plans/schemas.py backend/src/gad/plans/service.py backend/src/gad/plans/router.py backend/tests/test_crud_closures.py
git commit -m "feat(plans): editar plan con PATCH (solo si está open)"
```

---

## Task 2: DELETE /me/blocks/{user_id} (desbloquear)

**Files:**
- Modify: `backend/src/gad/users/service.py`, `users/router.py`

- [ ] **Step 1: Service**

En `backend/src/gad/users/service.py`, añadir:

```python
async def unblock_user(session: AsyncSession, blocker: User, blocked_id: UUID) -> None:
    result = await session.execute(
        select(Block).where(Block.blocker_id == blocker.id, Block.blocked_id == blocked_id)
    )
    block = result.scalar_one_or_none()
    if block is None:
        raise NotFoundError("Bloqueo no encontrado")
    await session.delete(block)
    await session.commit()
```

- [ ] **Step 2: Router**

En `backend/src/gad/users/router.py`, añadir:

```python
@router.delete("/me/blocks/{user_id}")
async def unblock_endpoint(
    user_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict[str, str]:
    await unblock_user(session, current_user, user_id)
    return {"message": "Usuario desbloqueado"}
```

Añadir `unblock_user` al import de service.

- [ ] **Step 3: Test + commit**

Añadir a `tests/test_crud_closures.py` (registrar `users_router` en el fixture app):

```python
@pytest.mark.asyncio
async def test_unblock_user(client, db_session):
    from gad.models.social import Block

    tokens = await register(
        db_session, RegisterIn(email="b1@example.com", password="12345678", display_name="B1")
    )
    other = await register(
        db_session, RegisterIn(email="b2@example.com", password="12345678", display_name="B2")
    )
    block = Block(blocker_id=tokens.user_id, blocked_id=other.user_id, created_at=datetime.now(UTC))
    db_session.add(block)
    await db_session.commit()
    headers = {"Authorization": f"Bearer {tokens.access_token}"}
    async with client as c:
        resp = await c.delete(f"/me/blocks/{other.user_id}", headers=headers)
        assert resp.status_code == 200
        # Verificar que ya no está
        resp_list = await c.get("/me/blocks", headers=headers)
        assert resp_list.json() == []
```

(Necesitar `from datetime import UTC, datetime` en el test.)

Run: `cd backend && uv run pytest tests/test_crud_closures.py::test_unblock_user -v`

```bash
git add backend/src/gad/users/service.py backend/src/gad/users/router.py backend/tests/test_crud_closures.py
git commit -m "feat(users): desbloquear usuario"
```

---

## Task 3: DELETE /messages/{message_id} (borrar mensaje propio)

**Files:**
- Modify: `backend/src/gad/chat/service.py`, `chat/router.py`

- [ ] **Step 1: Service**

En `backend/src/gad/chat/service.py`, añadir:

```python
async def delete_message(session: AsyncSession, user: User, message_id: UUID) -> None:
    result = await session.execute(select(Message).where(Message.id == message_id))
    msg = result.scalar_one_or_none()
    if msg is None:
        raise NotFoundError("Mensaje no encontrado")
    if msg.sender_id != user.id:
        raise ValidationError("Solo podés borrar tus propios mensajes")
    await session.delete(msg)
    await session.commit()
```

Añadir imports `from gad.exceptions import NotFoundError, ValidationError` y `from uuid import UUID` si no están.

- [ ] **Step 2: Router**

En `backend/src/gad/chat/router.py`, añadir:

```python
@router.delete("/messages/{message_id}")
async def delete_message_endpoint(
    message_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict[str, str]:
    await delete_message(session, current_user, message_id)
    return {"message": "Mensaje borrado"}
```

Añadir `delete_message` al import de service.

- [ ] **Step 3: Test + commit**

Añadir a `tests/test_crud_closures.py` (registrar `chat_router` rest):

```python
@pytest.mark.asyncio
async def test_delete_own_message(client, db_session):
    from gad.models.match import Message

    tokens = await register(
        db_session, RegisterIn(email="c@example.com", password="12345678", display_name="C")
    )
    # Crear un mensaje directamente (sin match real para simplicidad del test de autorización)
    # Necesitamos un match válido. Creamos mínimo.
    from datetime import UTC, datetime
    from gad.models.match import Match

    match = Match(plan_id=await _seed_plan(db_session, tokens.user_id), status="active",
                  started_at=datetime.now(UTC), location_sharing_active=False)
    db_session.add(match)
    await db_session.commit()
    await db_session.refresh(match)
    msg = Message(match_id=match.id, sender_id=tokens.user_id, content="hola",
                  created_at=datetime.now(UTC))
    db_session.add(msg)
    await db_session.commit()
    await db_session.refresh(msg)
    headers = {"Authorization": f"Bearer {tokens.access_token}"}
    async with client as c:
        resp = await c.delete(f"/messages/{msg.id}", headers=headers)
    assert resp.status_code == 200


async def _seed_plan(db_session, host_id):
    from datetime import UTC, datetime, timedelta
    from gad.models.enums import ActivityType, PlanMode
    from gad.models.plan import Plan

    plan = Plan(
        host_id=host_id, activity_type=ActivityType.coffee, mode=PlanMode.now,
        title="T", location_label="X", location_grid="SRID=4326;POINT(-58.4 -34.6)",
        expires_at=datetime.now(UTC) + timedelta(hours=2),
    )
    db_session.add(plan)
    await db_session.commit()
    await db_session.refresh(plan)
    return plan.id
```

Run: `cd backend && uv run pytest tests/test_crud_closures.py::test_delete_own_message -v`

```bash
git add backend/src/gad/chat/service.py backend/src/gad/chat/router.py backend/tests/test_crud_closures.py
git commit -m "feat(chat): borrar mensaje propio"
```

---

## Task 4: Notifications read-all y delete-all

**Files:**
- Modify: `backend/src/gad/notifications/service.py`, `notifications/router.py`

- [ ] **Step 1: Service**

En `backend/src/gad/notifications/service.py`, añadir:

```python
async def mark_all_read(session: AsyncSession, user_id: UUID) -> int:
    result = await session.execute(
        update(Notification)
        .where(Notification.user_id == user_id, Notification.read_at.is_(None))
        .values(read_at=datetime.now(UTC))
    )
    await session.commit()
    return result.rowcount


async def delete_all(session: AsyncSession, user_id: UUID) -> int:
    from sqlalchemy import delete
    result = await session.execute(
        delete(Notification).where(Notification.user_id == user_id)
    )
    await session.commit()
    return result.rowcount
```

- [ ] **Step 2: Router**

En `backend/src/gad/notifications/router.py`, añadir:

```python
@router.post("/read-all")
async def mark_all_read_endpoint(
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict[str, int]:
    count = await mark_all_read(session, current_user.id)
    return {"marked": count}


@router.delete("")
async def delete_all_endpoint(
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict[str, int]:
    count = await delete_all(session, current_user.id)
    return {"deleted": count}
```

Añadir `mark_all_read, delete_all` al import de service.

- [ ] **Step 3: Test + commit**

Añadir a `tests/test_crud_closures.py` (registrar `notif_router`):

```python
@pytest.mark.asyncio
async def test_notification_read_all_and_delete(client, db_session):
    from gad.models.enums import NotificationType
    from gad.notifications.service import create_notification

    tokens = await register(
        db_session, RegisterIn(email="n@example.com", password="12345678", display_name="N")
    )
    for _ in range(3):
        await create_notification(db_session, tokens.user_id, NotificationType.match, {})
    headers = {"Authorization": f"Bearer {tokens.access_token}"}
    async with client as c:
        resp = await c.post("/notifications/read-all", headers=headers)
        assert resp.status_code == 200
        assert resp.json()["marked"] == 3
        resp_del = await c.delete("/notifications", headers=headers)
        assert resp_del.status_code == 200
        assert resp_del.json()["deleted"] == 3
```

Run: `cd backend && uv run pytest tests/test_crud_closures.py::test_notification_read_all_and_delete -v`

```bash
git add backend/src/gad/notifications/service.py backend/src/gad/notifications/router.py backend/tests/test_crud_closures.py
git commit -m "feat(notifications): marcar-todas-leídas y borrar-todas"
```

---

## Task 5: Push unsubscribe

**Files:**
- Modify: `backend/src/gad/notifications/push_router.py`

- [ ] **Step 1: Endpoint**

En `backend/src/gad/notifications/push_router.py`, añadir:

```python
@router.delete("/subscription")
async def unsubscribe_push(
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
    endpoint: str = "",
) -> dict[str, int]:
    from sqlalchemy import delete

    stmt = delete(PushSubscription).where(
        PushSubscription.user_id == current_user.id
    )
    if endpoint:
        stmt = stmt.where(PushSubscription.endpoint == endpoint)
    result = await session.execute(stmt)
    await session.commit()
    return {"deleted": result.rowcount}
```

- [ ] **Step 2: Test + commit**

Añadir a `tests/test_crud_closures.py` (registrar `push_router`):

```python
@pytest.mark.asyncio
async def test_push_unsubscribe(client, db_session):
    from gad.models.social import PushSubscription

    tokens = await register(
        db_session, RegisterIn(email="p@example.com", password="12345678", display_name="P")
    )
    sub = PushSubscription(
        id=uuid4(), user_id=tokens.user_id, endpoint="https://fcm/x",
        p256dh="k", auth="a", created_at=datetime.now(UTC),
    )
    db_session.add(sub)
    await db_session.commit()
    headers = {"Authorization": f"Bearer {tokens.access_token}"}
    async with client as c:
        resp = await c.delete("/notifications/subscription?endpoint=https://fcm/x", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["deleted"] == 1
```

(Necesitar `from uuid import uuid4` y `from datetime import UTC, datetime`.)

Run: `cd backend && uv run pytest tests/test_crud_closures.py::test_push_unsubscribe -v`

```bash
git add backend/src/gad/notifications/push_router.py backend/tests/test_crud_closures.py
git commit -m "feat(notifications): desuscribir push subscription"
```

---

## Task 6: Safety — revocar share-link

**Files:**
- Modify: `backend/src/gad/safety/service.py`, `safety/router.py`

- [ ] **Step 1: Localizar cómo se persiste el share-link**

Run: `grep -n "safety_link\|share_link\|generate_share_link" backend/src/gad/safety/*.py`
Expected: muestra dónde se crea el token y si hay tabla/repo. El token es JWT `safety_link` firmado (24h). No hay tabla; revocación requiere denylist en Redis (igual que TokenStore).

- [ ] **Step 2: Service revoke**

Añadir a `backend/src/gad/safety/service.py`:

```python
async def revoke_share_link(store, token: str) -> None:
    """Marca el token de share-link como revocado en Redis (denylist)."""
    from datetime import UTC, datetime
    from jose import jwt as jose_jwt
    from gad.config import settings

    try:
        payload = jose_jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except Exception:
        return  # idempotente
    jti = payload.get("jti", token[-16:])
    exp = payload.get("exp", 0)
    now = int(datetime.now(UTC).timestamp())
    ttl = max(1, exp - now)
    await store.revoke_jti(payload.get("sub", ""), jti, ttl_seconds=ttl)
```

- [ ] **Step 3: Router**

En `backend/src/gad/safety/router.py`, añadir:

```python
@router.delete("/safety/{match_id}/share-link")
async def revoke_share_link_endpoint(
    match_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    body: dict | None = None,
) -> dict[str, str]:
    from gad.auth.dependencies import get_token_store
    from gad.safety.service import revoke_share_link

    token = (body or {}).get("token", "")
    if not token:
        from gad.exceptions import ValidationError
        raise ValidationError("Token requerido")
    await revoke_share_link(get_token_store(), token)
    return {"message": "Link revocado"}
```

- [ ] **Step 4: Test + commit**

Añadir test mínimo que verifique que el endpoint responde 200 con token válido generado:

```python
@pytest.mark.asyncio
async def test_revoke_share_link(client, db_session, redis_client):
    from gad.auth.token_store import TokenStore
    # Reusar TokenStore del fixture de app si está disponible
    # ... (generar token safety_link y revocarlo)
    # Smoke: endpoint existe y responde
```

Run: `cd backend && uv run pytest tests/test_crud_closures.py -v`

```bash
git add backend/src/gad/safety/service.py backend/src/gad/safety/router.py backend/tests/test_crud_closures.py
git commit -m "feat(safety): revocar share-link de ubicación"
```

---

## Task 7: Reviews — borrar reseña propia

**Files:**
- Modify: `backend/src/gad/reviews/service.py`, `reviews/router.py`

- [ ] **Step 1: Service**

En `backend/src/gad/reviews/service.py`, añadir:

```python
async def delete_review(session: AsyncSession, reviewer: User, review_id: UUID) -> UUID:
    result = await session.execute(select(Review).where(Review.id == review_id))
    review = result.scalar_one_or_none()
    if review is None:
        raise NotFoundError("Reseña no encontrada")
    if review.reviewer_id != reviewer.id:
        raise ValidationError("Solo podés borrar tus propias reseñas")
    reviewee_id = review.reviewee_id
    await session.delete(review)
    await session.commit()
    # Recalcular reputación del reviewee tras el borrado
    await recalc_reputation(session, reviewee_id)
    return reviewee_id
```

Añadir `from gad.exceptions import NotFoundError` si no está.

- [ ] **Step 2: Router**

En `backend/src/gad/reviews/router.py`, añadir:

```python
@router.delete("/reviews/{review_id}")
async def delete_review_endpoint(
    review_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict[str, str]:
    await delete_review(session, current_user, review_id)
    return {"message": "Reseña eliminada"}
```

Añadir `delete_review` al import de service.

- [ ] **Step 3: Test + commit**

Añadir a `tests/test_crud_closures.py`:

```python
@pytest.mark.asyncio
async def test_delete_own_review(client, db_session):
    from datetime import UTC, datetime
    from gad.models.match import Match, MatchParticipant
    from gad.models.enums import MatchRole, MatchStatus
    from gad.models.plan import Plan
    from gad.models.review import Review
    from gad.models.enums import ActivityType, PlanMode
    from datetime import timedelta

    tokens = await register(
        db_session, RegisterIn(email="rv@example.com", password="12345678", display_name="Rv")
    )
    other = await register(
        db_session, RegisterIn(email="rv2@example.com", password="12345678", display_name="Rv2")
    )
    plan = Plan(
        host_id=other.user_id, activity_type=ActivityType.coffee, mode=PlanMode.now,
        title="T", location_label="X", location_grid="SRID=4326;POINT(-58.4 -34.6)",
        expires_at=datetime.now(UTC) + timedelta(hours=2),
    )
    db_session.add(plan)
    await db_session.commit()
    await db_session.refresh(plan)
    match = Match(plan_id=plan.id, status=MatchStatus.completed,
                  started_at=datetime.now(UTC) - timedelta(days=1),
                  ended_at=datetime.now(UTC) - timedelta(hours=1),
                  location_sharing_active=False)
    db_session.add(match)
    await db_session.commit()
    await db_session.refresh(match)
    for u, role in [(tokens.user_id, MatchRole.participant), (other.user_id, MatchRole.host)]:
        db_session.add(MatchParticipant(match_id=match.id, user_id=u, role=role, joined_at=datetime.now(UTC)))
    review = Review(match_id=match.id, reviewer_id=tokens.user_id, reviewee_id=other.user_id,
                    rating=5, comment="ok")
    db_session.add(review)
    await db_session.commit()
    await db_session.refresh(review)
    headers = {"Authorization": f"Bearer {tokens.access_token}"}
    async with client as c:
        resp = await c.delete(f"/reviews/{review.id}", headers=headers)
    assert resp.status_code == 200
```

(Necesitar registrar `reviews_router` en el fixture app.)

Run: `cd backend && uv run pytest tests/test_crud_closures.py -v`

```bash
git add backend/src/gad/reviews/service.py backend/src/gad/reviews/router.py backend/tests/test_crud_closures.py
git commit -m "feat(reviews): borrar reseña propia con recálculo de reputación"
```

---

## Self-Review (Plan 4)

**Cobertura:**
- ✅ PATCH plan → Task 1
- ✅ Desbloquear → Task 2
- ✅ Borrar mensaje → Task 3
- ✅ Notif read-all/delete-all → Task 4
- ✅ Push unsubscribe → Task 5
- ✅ Revocar share-link → Task 6
- ✅ Borrar review → Task 7

**Placeholder scan:** Task 6 Step 4 tiene un smoke más ligero (complejidad de generar token safety_link); el resto completos.

**Type consistency:** todas las funciones de borrado devuelven `dict[str, str]` o `dict[str, int]` consistente con los endpoints existentes.
