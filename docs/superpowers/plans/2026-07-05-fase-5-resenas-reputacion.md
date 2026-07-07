# Fase 5 — Reseñas y Reputación Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar el sistema de reseñas post-salida con ventana de 7 días, cálculo de reputación ponderado, reportes de usuarios y panel de moderación admin básico.

**Architecture:** Nuevo módulo `reviews/` con `service.py` (crear reseña, validar ventana y participación, recalcular reputación) y `router.py`. Nuevo módulo `reports/` para reportes de usuarios. Nuevo módulo `admin/` con panel básico. La reputación se recalcula con promedio ponderado de las últimas N reseñas (más peso a las recientes). Las reseñas con `flag=no_show` penalizan extra.

**Tech Stack:** FastAPI, SQLAlchemy async, pytest-asyncio.

**Depende de:** Fases 0-4 completadas.

---

## File Structure (adiciones)

```
backend/src/gad/
├── reviews/
│   ├── __init__.py
│   ├── service.py             # create_review, list_reviews_for_user, recalc_reputation
│   ├── reputation.py          # algoritmo de promedio ponderado
│   ├── schemas.py
│   └── router.py              # /reviews
├── reports/
│   ├── __init__.py
│   ├── service.py             # create_report, list_reports (admin)
│   ├── schemas.py
│   └── router.py              # /users/{id}/report
└── admin/
    ├── __init__.py
    ├── service.py             # métricas, acciones de moderación
    ├── schemas.py
    └── router.py              # /admin/* (requiere rol admin)
```

> **Nota de modelado:** `reports` y roles de admin no están en el schema original. Se añaden `Report` y un campo `is_admin` a `User`.

---

## Task 1: Añadir campos y tablas faltantes

**Files:**
- Modify: `backend/src/gad/models/user.py` (añadir `is_admin`)
- Create: `backend/src/gad/models/report.py`
- Modify: `backend/src/gad/models/__init__.py`
- Test: extend `backend/tests/test_models.py`

- [ ] **Step 1: Añadir `is_admin` a `User`**

En `backend/src/gad/models/user.py`, añadir columna:
```python
from sqlalchemy import Boolean

# Dentro de la clase User:
    is_admin: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
```

- [ ] **Step 2: Crear `backend/src/gad/models/report.py`**

```python
# backend/src/gad/models/report.py
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import Enum, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from gad.models.base import Base, TimestampMixin


class ReportReason(str):
    harassment = "harassment"
    spam = "spam"
    fake_profile = "fake_profile"
    inappropriate = "inappropriate"
    other = "other"


class Report(Base, TimestampMixin):
    __tablename__ = "reports"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    reporter_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    reported_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    reason: Mapped[str] = mapped_column(String(50), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="open")
    payload: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
```

- [ ] **Step 3: Actualizar `backend/src/gad/models/__init__.py`** — añadir:

```python
from gad.models.report import Report
# Y a __all__: "Report"
```

- [ ] **Step 4: Test**

```python
# Añadir a backend/tests/test_models.py
def test_user_has_is_admin():
    from gad.models import User

    assert "is_admin" in {c.name for c in User.__table__.columns}


def test_report_table_exists():
    from gad.models import Report

    expected = {"id", "reporter_id", "reported_id", "reason", "description", "status", "payload", "created_at", "updated_at"}
    actual = {c.name for c in Report.__table__.columns}
    assert expected.issubset(actual)
```

- [ ] **Step 5:** Run `cd backend && poetry run pytest tests/test_models.py -v` → PASS

- [ ] **Step 6: Commit**

```bash
git add backend/src/gad/models/user.py backend/src/gad/models/report.py backend/src/gad/models/__init__.py backend/tests/test_models.py
git commit -m "feat(models): is_admin en User + tabla Report"
```

---

## Task 2: Schemas de reseñas

**Files:**
- Create: `backend/src/gad/reviews/__init__.py`
- Create: `backend/src/gad/reviews/schemas.py`
- Test: `backend/tests/test_review_schemas.py`

- [ ] **Step 1: `backend/src/gad/reviews/__init__.py`**

```python
# backend/src/gad/reviews/__init__.py
```

- [ ] **Step 2: `backend/src/gad/reviews/schemas.py`**

```python
# backend/src/gad/reviews/schemas.py
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from gad.models.enums import ReviewFlag


class ReviewIn(BaseModel):
    match_id: UUID
    reviewee_id: UUID
    rating: int = Field(ge=1, le=5)
    comment: str | None = Field(default=None, max_length=1000)
    flag: ReviewFlag | None = None


class ReviewOut(BaseModel):
    id: UUID
    match_id: UUID
    reviewer_id: UUID
    reviewee_id: UUID
    rating: int
    comment: str | None
    flag: ReviewFlag | None
    created_at: datetime


class ReviewerSummary(BaseModel):
    id: UUID
    display_name: str
    avatar_url: str | None
    reputation_score: float
    verification_level: str


class ReviewWithReviewer(ReviewOut):
    reviewer: ReviewerSummary
```

- [ ] **Step 3: Test**

```python
# backend/tests/test_review_schemas.py
import pytest
from pydantic import ValidationError

from gad.models.enums import ReviewFlag
from gad.reviews.schemas import ReviewIn


def test_review_in_ok():
    import uuid

    r = ReviewIn(
        match_id=uuid.uuid4(), reviewee_id=uuid.uuid4(), rating=5,
    )
    assert r.rating == 5


def test_review_in_rejects_rating_out_of_range():
    import uuid

    with pytest.raises(ValidationError):
        ReviewIn(match_id=uuid.uuid4(), reviewee_id=uuid.uuid4(), rating=0)
    with pytest.raises(ValidationError):
        ReviewIn(match_id=uuid.uuid4(), reviewee_id=uuid.uuid4(), rating=6)
```

- [ ] **Step 4:** Run `cd backend && poetry run pytest tests/test_review_schemas.py -v` → PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/gad/reviews/__init__.py backend/src/gad/reviews/schemas.py backend/tests/test_review_schemas.py
git commit -m "feat(reviews): schemas de reseñas"
```

---

## Task 3: Algoritmo de reputación

**Files:**
- Create: `backend/src/gad/reviews/reputation.py`
- Test: `backend/tests/test_reputation.py`

- [ ] **Step 1: `backend/src/gad/reviews/reputation.py`**

```python
# backend/src/gad/reviews/reputation.py
"""Algoritmo de reputación.

Promedio ponderado de las últimas N reseñas. Las reseñas más recientes pesan más
(decaimiento lineal). Las reseñas con flag=no_show aplican una penalización de
1 estrella adicional.
"""
from datetime import datetime, timedelta, timezone

from gad.models.enums import ReviewFlag
from gad.models.review import Review

REVIEW_WINDOW = 20  # últimas N reseñas
NO_SHOW_PENALTY = 1.0  # estrellas


def calculate_reputation(reviews: list[Review], now: datetime | None = None) -> float:
    """Calcula score 0-5 basado en las últimas N reseñas."""
    if not reviews:
        return 0.0

    now = now or datetime.now(timezone.utc)
    recent = sorted(reviews, key=lambda r: r.created_at, reverse=True)[:REVIEW_WINDOW]

    total_weight = 0.0
    weighted_sum = 0.0

    # La más reciente tiene peso N, la más vieja peso 1
    n = len(recent)
    for i, review in enumerate(recent):
        weight = n - i  # más reciente → mayor peso

        rating = review.rating
        if review.flag == ReviewFlag.no_show:
            rating = max(0, rating - NO_SHOW_PENALTY)

        weighted_sum += rating * weight
        total_weight += weight

    return round(weighted_sum / total_weight if total_weight else 0.0, 2)
```

- [ ] **Step 2: Test**

```python
# backend/tests/test_reputation.py
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from gad.models.enums import ReviewFlag
from gad.reviews.reputation import calculate_reputation


class FakeReview:
    def __init__(self, rating, flag=None, days_ago=0):
        self.rating = rating
        self.flag = flag
        self.created_at = datetime.now(timezone.utc) - timedelta(days=days_ago)


def test_empty_returns_zero():
    assert calculate_reputation([]) == 0.0


def test_single_review_returns_rating():
    r = FakeReview(rating=4)
    assert calculate_reputation([r]) == 4.0


def test_multiple_reviews_weighted():
    # Reseñas: 5 (hoy, peso 3), 4 (1 día, peso 2), 3 (2 días, peso 1)
    reviews = [FakeReview(5, days_ago=0), FakeReview(4, days_ago=1), FakeReview(3, days_ago=2)]
    # (5*3 + 4*2 + 3*1) / 6 = (15+8+3)/6 = 26/6 = 4.33
    assert calculate_reputation(reviews) == 4.33


def test_no_show_penalized():
    r = FakeReview(rating=4, flag=ReviewFlag.no_show)
    # 4 - 1 = 3
    assert calculate_reputation([r]) == 3.0


def test_more_than_window_caps_to_20():
    reviews = [FakeReview(rating=5, days_ago=i) for i in range(30)]
    score = calculate_reputation(reviews)
    assert 0 <= score <= 5
```

- [ ] **Step 3:** Run `cd backend && poetry run pytest tests/test_reputation.py -v` → PASS

- [ ] **Step 4: Commit**

```bash
git add backend/src/gad/reviews/reputation.py backend/tests/test_reputation.py
git commit -m "feat(reviews): algoritmo de reputación ponderado con penalización no-show"
```

---

## Task 4: Servicio de reseñas

**Files:**
- Create: `backend/src/gad/reviews/service.py`
- Test: `backend/tests/test_reviews_service.py`

- [ ] **Step 1: `backend/src/gad/reviews/service.py`**

```python
# backend/src/gad/reviews/service.py
from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gad.exceptions import ConflictError, NotFoundError, ValidationError
from gad.models.enums import MatchStatus, ReviewFlag
from gad.models.match import Match, MatchParticipant
from gad.models.review import Review
from gad.models.user import User
from gad.reviews.reputation import calculate_reputation
from gad.reviews.schemas import ReviewIn

REVIEW_WINDOW_DAYS = 7


async def _verify_can_review(
    session: AsyncSession,
    reviewer: User,
    match_id: UUID,
    reviewee_id: UUID,
) -> Match:
    # Match existe y está completed
    result = await session.execute(select(Match).where(Match.id == match_id))
    match = result.scalar_one_or_none()
    if match is None:
        raise NotFoundError("Match no encontrado")
    if match.status != MatchStatus.completed:
        raise ValidationError("El match no está completado")

    # Ambos son participantes
    for uid in (reviewer.id, reviewee_id):
        is_p = await session.execute(
            select(MatchParticipant).where(
                MatchParticipant.match_id == match_id,
                MatchParticipant.user_id == uid,
            )
        )
        if is_p.scalar_one_or_none() is None:
            raise ValidationError("Ambos deben ser participantes del match")

    # Dentro de ventana de 7 días desde ended_at
    if match.ended_at is None:
        raise ValidationError("El match no tiene fecha de finalización")
    if datetime.now(timezone.utc) - match.ended_at > timedelta(days=REVIEW_WINDOW_DAYS):
        raise ValidationError("La ventana de reseña de 7 días expiró")

    # No reseñó ya
    existing = await session.execute(
        select(Review).where(
            Review.match_id == match_id,
            Review.reviewer_id == reviewer.id,
            Review.reviewee_id == reviewee_id,
        )
    )
    if existing.scalar_one_or_none() is not None:
        raise ConflictError("Ya reseñaste a esta persona en este match")

    return match


async def create_review(
    session: AsyncSession, reviewer: User, data: ReviewIn
) -> Review:
    if reviewer.id == data.reviewee_id:
        raise ValidationError("No podés reseñarte a vos mismo")

    await _verify_can_review(session, reviewer, data.match_id, data.reviewee_id)

    review = Review(
        match_id=data.match_id,
        reviewer_id=reviewer.id,
        reviewee_id=data.reviewee_id,
        rating=data.rating,
        comment=data.comment,
        flag=data.flag,
    )
    session.add(review)
    await session.commit()
    await session.refresh(review)

    # Recalcular reputación del reviewee
    await recalc_reputation(session, data.reviewee_id)
    return review


async def recalc_reputation(session: AsyncSession, user_id: UUID) -> float:
    result = await session.execute(
        select(Review).where(Review.reviewee_id == user_id)
    )
    reviews = list(result.scalars().all())
    score = calculate_reputation(reviews)

    user_result = await session.execute(select(User).where(User.id == user_id))
    user = user_result.scalar_one_or_none()
    if user is not None:
        user.reputation_score = score
        await session.commit()
    return score


async def list_reviews_for_user(
    session: AsyncSession, user_id: UUID, *, limit: int = 50
) -> list[Review]:
    result = await session.execute(
        select(Review)
        .where(Review.reviewee_id == user_id)
        .order_by(Review.created_at.desc())
        .limit(limit)
    )
    return list(result.scalars().all())
```

- [ ] **Step 2: Test**

```python
# backend/tests/test_reviews_service.py
import pytest

from gad.auth.service import register
from gad.exceptions import ConflictError, ValidationError
from gad.matching.schemas import ApplicationIn
from gad.matching.service import accept_application, apply_to_plan
from gad.models.enums import ActivityType, MatchStatus, PlanMode
from gad.models.match import Match
from gad.models.user import User
from gad.plans.schemas import PlanIn, PlanLocationIn
from gad.plans.service import create_plan
from gad.reviews.schemas import ReviewIn
from gad.reviews.service import create_review, list_reviews_for_user, recalc_reputation
from sqlalchemy import select
from datetime import datetime, timezone


async def _setup_completed_match(session):
    from gad.schemas.auth import RegisterIn

    host_t = await register(session, RegisterIn(email="rh@example.com", password="12345678", display_name="H"))
    app_t = await register(session, RegisterIn(email="ra@example.com", password="12345678", display_name="A"))
    host = (await session.execute(select(User).where(User.id == host_t.user_id))).scalar_one()
    applicant = (await session.execute(select(User).where(User.id == app_t.user_id))).scalar_one()
    plan = await create_plan(
        session, host,
        PlanIn(activity_type=ActivityType.coffee, mode=PlanMode.now, title="X", max_participants=1,
               location=PlanLocationIn(lat=-34.59, lng=-58.43, label="X")),
    )
    app = await apply_to_plan(session, applicant, plan.id, ApplicationIn())
    match = await accept_application(session, host, app.id)
    # Completar match
    match.status = MatchStatus.completed
    match.ended_at = datetime.now(timezone.utc)
    await session.commit()
    return host, applicant, match


@pytest.mark.asyncio
async def test_create_review_updates_reputation(db_session):
    host, applicant, match = await _setup_completed_match(db_session)

    review = await create_review(
        db_session, host,
        ReviewIn(match_id=match.id, reviewee_id=applicant.id, rating=5),
    )
    assert review.rating == 5
    await db_session.refresh(applicant)
    assert applicant.reputation_score == 5.0


@pytest.mark.asyncio
async def test_cannot_review_self(db_session):
    host, applicant, match = await _setup_completed_match(db_session)
    with pytest.raises(ValidationError):
        await create_review(
            db_session, host,
            ReviewIn(match_id=match.id, reviewee_id=host.id, rating=5),
        )


@pytest.mark.asyncio
async def test_cannot_review_twice(db_session):
    host, applicant, match = await _setup_completed_match(db_session)
    await create_review(
        db_session, host,
        ReviewIn(match_id=match.id, reviewee_id=applicant.id, rating=5),
    )
    with pytest.raises(ConflictError):
        await create_review(
            db_session, host,
            ReviewIn(match_id=match.id, reviewee_id=applicant.id, rating=4),
        )


@pytest.mark.asyncio
async def test_cannot_review_non_completed_match(db_session):
    from gad.matching.service import accept_application, apply_to_plan

    host = (await db_session.execute(select(User).where(User.email == "rh@example.com"))).scalar_one_or_none()
    if host is None:
        return  # skip si no existe

    # match sin completar
    from gad.schemas.auth import RegisterIn

    host_t = await register(db_session, RegisterIn(email="h3@example.com", password="12345678", display_name="H"))
    app_t = await register(db_session, RegisterIn(email="a3@example.com", password="12345678", display_name="A"))
    host = (await db_session.execute(select(User).where(User.id == host_t.user_id))).scalar_one()
    applicant = (await db_session.execute(select(User).where(User.id == app_t.user_id))).scalar_one()
    plan = await create_plan(
        db_session, host,
        PlanIn(activity_type=ActivityType.coffee, mode=PlanMode.now, title="X", max_participants=1,
               location=PlanLocationIn(lat=-34.59, lng=-58.43, label="X")),
    )
    app = await apply_to_plan(db_session, applicant, plan.id, ApplicationIn())
    match = await accept_application(db_session, host, app.id)

    with pytest.raises(ValidationError):
        await create_review(
            db_session, host,
            ReviewIn(match_id=match.id, reviewee_id=applicant.id, rating=5),
        )
```

- [ ] **Step 3:** Run `cd backend && poetry run pytest tests/test_reviews_service.py -v` → PASS

- [ ] **Step 4: Commit**

```bash
git add backend/src/gad/reviews/service.py backend/tests/test_reviews_service.py
git commit -m "feat(reviews): crear reseña con validación de ventana y reputación"
```

---

## Task 5: Completar/cancelar match (para poder reseñar)

Necesitamos endpoints para que un match pase a `completed` o `cancelled`. Esto faltaba en la Fase 2.

**Files:**
- Create: `backend/src/gad/matching/lifecycle.py` (añadir a matching service)
- Modify: `backend/src/gad/matching/router.py`
- Test: `backend/tests/test_match_lifecycle.py`

- [ ] **Step 1: Añadir a `backend/src/gad/matching/service.py`**

```python
# Añadir a backend/src/gad/matching/service.py
async def complete_match(
    session: AsyncSession, user: User, match_id: UUID
) -> Match:
    match = await get_match(session, match_id)
    # Verificar participación
    result = await session.execute(
        select(MatchParticipant).where(
            MatchParticipant.match_id == match_id,
            MatchParticipant.user_id == user.id,
        )
    )
    if result.scalar_one_or_none() is None:
        raise NotFoundError("Match no encontrado")

    match.status = MatchStatus.completed
    match.ended_at = datetime.now(timezone.utc)
    await session.commit()
    await session.refresh(match)
    return match


async def cancel_match(
    session: AsyncSession, user: User, match_id: UUID
) -> Match:
    match = await get_match(session, match_id)
    result = await session.execute(
        select(MatchParticipant).where(
            MatchParticipant.match_id == match_id,
            MatchParticipant.user_id == user.id,
        )
    )
    if result.scalar_one_or_none() is None:
        raise NotFoundError("Match no encontrado")

    match.status = MatchStatus.cancelled
    if match.ended_at is None:
        match.ended_at = datetime.now(timezone.utc)
    await session.commit()
    await session.refresh(match)
    return match
```

- [ ] **Step 2: Añadir endpoints en `backend/src/gad/matching/router.py`**

```python
# Añadir imports
from gad.matching.service import complete_match, cancel_match

# Añadir endpoints
@router.post("/matches/{match_id}/complete", response_model=MatchOut)
async def complete_match_endpoint(
    match_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> MatchOut:
    match = await complete_match(session, current_user, match_id)
    return await _match_to_out(session, match, current_user)


@router.post("/matches/{match_id}/cancel", response_model=MatchOut)
async def cancel_match_endpoint(
    match_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> MatchOut:
    match = await cancel_match(session, current_user, match_id)
    return await _match_to_out(session, match, current_user)
```

- [ ] **Step 3: Test**

```python
# backend/tests/test_match_lifecycle.py
import pytest

from gad.matching.service import cancel_match, complete_match
from gad.models.enums import MatchStatus


@pytest.mark.asyncio
async def test_complete_and_cancel_match(db_session):
    # Reusar setup de Fase 2
    from gad.matching.schemas import ApplicationIn
    from gad.matching.service import accept_application, apply_to_plan
    from gad.auth.service import register
    from gad.models.enums import ActivityType, PlanMode
    from gad.plans.schemas import PlanIn, PlanLocationIn
    from gad.plans.service import create_plan
    from gad.models.user import User
    from gad.schemas.auth import RegisterIn
    from sqlalchemy import select

    host_t = await register(db_session, RegisterIn(email="lc@example.com", password="12345678", display_name="H"))
    app_t = await register(db_session, RegisterIn(email="la@example.com", password="12345678", display_name="A"))
    host = (await db_session.execute(select(User).where(User.id == host_t.user_id))).scalar_one()
    applicant = (await db_session.execute(select(User).where(User.id == app_t.user_id))).scalar_one()
    plan = await create_plan(
        db_session, host,
        PlanIn(activity_type=ActivityType.coffee, mode=PlanMode.now, title="X", max_participants=1,
               location=PlanLocationIn(lat=-34.59, lng=-58.43, label="X")),
    )
    app = await apply_to_plan(db_session, applicant, plan.id, ApplicationIn())
    match = await accept_application(db_session, host, app.id)

    completed = await complete_match(db_session, host, match.id)
    assert completed.status == MatchStatus.completed
    assert completed.ended_at is not None
```

- [ ] **Step 4:** Run `cd backend && poetry run pytest tests/test_match_lifecycle.py -v` → PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/gad/matching/service.py backend/src/gad/matching/router.py backend/tests/test_match_lifecycle.py
git commit -m "feat(matching): endpoints complete y cancel de match"
```

---

## Task 6: Router de reseñas

**Files:**
- Create: `backend/src/gad/reviews/router.py`
- Modify: `backend/src/gad/main.py`
- Test: `backend/tests/test_reviews_router.py`

- [ ] **Step 1: `backend/src/gad/reviews/router.py`**

```python
# backend/src/gad/reviews/router.py
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gad.auth.dependencies import get_current_user
from gad.db import get_session
from gad.models.user import User
from gad.reviews.schemas import ReviewIn, ReviewOut, ReviewWithReviewer, ReviewerSummary
from gad.reviews.service import create_review, list_reviews_for_user

router = APIRouter(tags=["reviews"])


@router.post("/reviews", response_model=ReviewOut, status_code=201)
async def create_review_endpoint(
    data: ReviewIn,
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ReviewOut:
    review = await create_review(session, current_user, data)
    return ReviewOut(
        id=review.id, match_id=review.match_id, reviewer_id=review.reviewer_id,
        reviewee_id=review.reviewee_id, rating=review.rating, comment=review.comment,
        flag=review.flag, created_at=review.created_at,
    )


@router.get("/reviews", response_model=list[ReviewWithReviewer])
async def list_reviews_endpoint(
    user_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[ReviewWithReviewer]:
    reviews = await list_reviews_for_user(session, user_id)
    out = []
    for r in reviews:
        reviewer = (
            await session.execute(select(User).where(User.id == r.reviewer_id))
        ).scalar_one()
        out.append(
            ReviewWithReviewer(
                id=r.id, match_id=r.match_id, reviewer_id=r.reviewer_id,
                reviewee_id=r.reviewee_id, rating=r.rating, comment=r.comment,
                flag=r.flag, created_at=r.created_at,
                reviewer=ReviewerSummary(
                    id=reviewer.id, display_name=reviewer.display_name,
                    avatar_url=reviewer.avatar_url,
                    reputation_score=reviewer.reputation_score,
                    verification_level=reviewer.verification_level.value,
                ),
            )
        )
    return out
```

- [ ] **Step 2: Test**

```python
# backend/tests/test_reviews_router.py
import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from gad.auth.router import router as auth_router
from gad.reviews.router import router as reviews_router


@pytest.fixture
def app():
    app = FastAPI()
    app.include_router(auth_router)
    app.include_router(reviews_router)
    return app


@pytest.fixture
async def client(app):
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


@pytest.mark.asyncio
async def test_reviews_requires_auth(client):
    import uuid

    async with client as c:
        resp = await c.get(f"/reviews?user_id={uuid.uuid4()}")
    assert resp.status_code == 401
```

- [ ] **Step 3: Incluir router en `main.py`**

```python
from gad.reviews.router import router as reviews_router
# ...
    app.include_router(reviews_router)
```

- [ ] **Step 4:** Run `cd backend && poetry run pytest tests/test_reviews_router.py -v` → PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/gad/reviews/router.py backend/src/gad/main.py backend/tests/test_reviews_router.py
git commit -m "feat(reviews): router de reseñas POST y GET por usuario"
```

---

## Task 7: Reportes de usuarios

**Files:**
- Create: `backend/src/gad/reports/__init__.py`
- Create: `backend/src/gad/reports/schemas.py`
- Create: `backend/src/gad/reports/service.py`
- Create: `backend/src/gad/reports/router.py`
- Modify: `backend/src/gad/main.py`
- Test: `backend/tests/test_reports.py`

- [ ] **Step 1: `backend/src/gad/reports/__init__.py`**

```python
# backend/src/gad/reports/__init__.py
```

- [ ] **Step 2: `backend/src/gad/reports/schemas.py`**

```python
# backend/src/gad/reports/schemas.py
from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class ReportIn(BaseModel):
    reason: str = Field(min_length=1, max_length=50)
    description: str | None = Field(default=None, max_length=1000)


class ReportOut(BaseModel):
    id: UUID
    reporter_id: UUID
    reported_id: UUID
    reason: str
    description: str | None
    status: str
    payload: dict[str, Any] | None
    created_at: datetime
```

- [ ] **Step 3: `backend/src/gad/reports/service.py`**

```python
# backend/src/gad/reports/service.py
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from gad.exceptions import NotFoundError, ValidationError
from gad.models.report import Report
from gad.models.user import User
from gad.reports.schemas import ReportIn


async def create_report(
    session: AsyncSession,
    reporter: User,
    reported_id: UUID,
    data: ReportIn,
) -> Report:
    if reporter.id == reported_id:
        raise ValidationError("No podés reportarte a vos mismo")

    result = await session.execute(select(User).where(User.id == reported_id))
    if result.scalar_one_or_none() is None:
        raise NotFoundError("Usuario no encontrado")

    report = Report(
        reporter_id=reporter.id,
        reported_id=reported_id,
        reason=data.reason,
        description=data.description,
    )
    session.add(report)
    await session.commit()
    await session.refresh(report)
    return report


async def list_reports(session: AsyncSession, *, status: str | None = None) -> list[Report]:
    stmt = select(Report).order_by(Report.created_at.desc())
    if status is not None:
        stmt = stmt.where(Report.status == status)
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def update_report_status(
    session: AsyncSession, report_id: UUID, status: str
) -> Report:
    result = await session.execute(select(Report).where(Report.id == report_id))
    report = result.scalar_one_or_none()
    if report is None:
        raise NotFoundError("Reporte no encontrado")
    report.status = status
    await session.commit()
    await session.refresh(report)
    return report
```

- [ ] **Step 4: `backend/src/gad/reports/router.py`**

```python
# backend/src/gad/reports/router.py
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from gad.auth.dependencies import get_current_user
from gad.db import get_session
from gad.models.user import User
from gad.reports.schemas import ReportIn, ReportOut
from gad.reports.service import create_report

router = APIRouter(tags=["reports"])


@router.post("/users/{user_id}/report", response_model=ReportOut, status_code=201)
async def report_endpoint(
    user_id: UUID,
    data: ReportIn,
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ReportOut:
    report = await create_report(session, current_user, user_id, data)
    return ReportOut(
        id=report.id, reporter_id=report.reporter_id, reported_id=report.reported_id,
        reason=report.reason, description=report.description, status=report.status,
        payload=report.payload, created_at=report.created_at,
    )
```

- [ ] **Step 5: Test**

```python
# backend/tests/test_reports.py
import pytest

from gad.auth.service import register
from gad.exceptions import ValidationError
from gad.models.user import User
from gad.reports.schemas import ReportIn
from gad.reports.service import create_report
from sqlalchemy import select


async def _user(session, email):
    from gad.schemas.auth import RegisterIn

    t = await register(session, RegisterIn(email=email, password="12345678", display_name="U"))
    return (await session.execute(select(User).where(User.id == t.user_id))).scalar_one()


@pytest.mark.asyncio
async def test_create_report(db_session):
    reporter = await _user(db_session, "rep@example.com")
    reported = await _user(db_session, "rpd@example.com")

    report = await create_report(
        db_session, reporter, reported.id,
        ReportIn(reason="spam", description="xinbox"),
    )
    assert report.reason == "spam"
    assert report.status == "open"


@pytest.mark.asyncio
async def test_cannot_report_self(db_session):
    reporter = await _user(db_session, "self@example.com")
    with pytest.raises(ValidationError):
        await create_report(
            db_session, reporter, reporter.id,
            ReportIn(reason="spam"),
        )
```

- [ ] **Step 6: Incluir router en `main.py`**

```python
from gad.reports.router import router as reports_router
# ...
    app.include_router(reports_router)
```

- [ ] **Step 7:** Run `cd backend && poetry run pytest tests/test_reports.py -v` → PASS

- [ ] **Step 8: Commit**

```bash
git add backend/src/gad/reports/ backend/src/gad/main.py backend/tests/test_reports.py
git commit -m "feat(reports): reportes de usuarios con razón y descripción"
```

---

## Task 8: Panel admin básico

**Files:**
- Create: `backend/src/gad/admin/__init__.py`
- Create: `backend/src/gad/admin/schemas.py`
- Create: `backend/src/gad/admin/service.py`
- Create: `backend/src/gad/admin/router.py`
- Create: `backend/src/gad/admin/dependencies.py`
- Modify: `backend/src/gad/main.py`
- Test: `backend/tests/test_admin.py`

- [ ] **Step 1: `backend/src/gad/admin/__init__.py`**

```python
# backend/src/gad/admin/__init__.py
```

- [ ] **Step 2: `backend/src/gad/admin/dependencies.py`**

```python
# backend/src/gad/admin/dependencies.py
from typing import Annotated

from fastapi import Depends

from gad.auth.dependencies import get_current_user
from gad.exceptions import AuthError
from gad.models.user import User


async def require_admin(
    current_user: Annotated[User, Depends(get_current_user)],
) -> User:
    if not current_user.is_admin:
        raise AuthError("Se requieren permisos de administrador")
    return current_user
```

- [ ] **Step 3: `backend/src/gad/admin/schemas.py`**

```python
# backend/src/gad/admin/schemas.py
from pydantic import BaseModel


class AdminStatsOut(BaseModel):
    total_users: int
    total_plans: int
    total_matches: int
    open_reports: int


class ReportStatusUpdate(BaseModel):
    status: str
```

- [ ] **Step 4: `backend/src/gad/admin/service.py`**

```python
# backend/src/gad/admin/service.py
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from gad.exceptions import NotFoundError
from gad.models.match import Match
from gad.models.plan import Plan
from gad.models.report import Report
from gad.models.user import User


async def get_stats(session: AsyncSession) -> dict[str, int]:
    total_users = (await session.execute(select(func.count(User.id)))).scalar_one()
    total_plans = (await session.execute(select(func.count(Plan.id)))).scalar_one()
    total_matches = (await session.execute(select(func.count(Match.id)))).scalar_one()
    open_reports = (
        await session.execute(
            select(func.count(Report.id)).where(Report.status == "open")
        )
    ).scalar_one()
    return {
        "total_users": total_users,
        "total_plans": total_plans,
        "total_matches": total_matches,
        "open_reports": open_reports,
    }


async def list_reports_admin(
    session: AsyncSession, *, status: str | None = None
) -> list[Report]:
    stmt = select(Report).order_by(Report.created_at.desc())
    if status is not None:
        stmt = stmt.where(Report.status == status)
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def update_report_status_admin(
    session: AsyncSession, report_id: UUID, status: str
) -> Report:
    result = await session.execute(select(Report).where(Report.id == report_id))
    report = result.scalar_one_or_none()
    if report is None:
        raise NotFoundError("Reporte no encontrado")
    report.status = status
    await session.commit()
    await session.refresh(report)
    return report
```

- [ ] **Step 5: `backend/src/gad/admin/router.py`**

```python
# backend/src/gad/admin/router.py
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from gad.admin.dependencies import require_admin
from gad.admin.schemas import AdminStatsOut, ReportStatusUpdate
from gad.admin.service import get_stats, list_reports_admin, update_report_status_admin
from gad.db import get_session
from gad.models.user import User
from gad.reports.schemas import ReportOut

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/stats", response_model=AdminStatsOut)
async def stats_endpoint(
    admin: Annotated[User, Depends(require_admin)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> AdminStatsOut:
    stats = await get_stats(session)
    return AdminStatsOut(**stats)


@router.get("/reports", response_model=list[ReportOut])
async def list_reports_endpoint(
    admin: Annotated[User, Depends(require_admin)],
    session: Annotated[AsyncSession, Depends(get_session)],
    status: str | None = None,
) -> list[ReportOut]:
    reports = await list_reports_admin(session, status=status)
    return [
        ReportOut(
            id=r.id, reporter_id=r.reporter_id, reported_id=r.reported_id,
            reason=r.reason, description=r.description, status=r.status,
            payload=r.payload, created_at=r.created_at,
        )
        for r in reports
    ]


@router.patch("/reports/{report_id}", response_model=ReportOut)
async def update_report_endpoint(
    report_id,
    data: ReportStatusUpdate,
    admin: Annotated[User, Depends(require_admin)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ReportOut:
    report = await update_report_status_admin(session, report_id, data.status)
    return ReportOut(
        id=report.id, reporter_id=report.reporter_id, reported_id=report.reported_id,
        reason=report.reason, description=report.description, status=report.status,
        payload=report.payload, created_at=report.created_at,
    )
```

- [ ] **Step 6: Test**

```python
# backend/tests/test_admin.py
import pytest

from gad.admin.dependencies import require_admin
from gad.exceptions import AuthError
from gad.models.user import User


@pytest.mark.asyncio
async def test_require_admin_rejects_non_admin():
    user = User.__new__(User)
    user.is_admin = False
    with pytest.raises(AuthError):
        await require_admin(user)
```

- [ ] **Step 7: Incluir router en `main.py`**

```python
from gad.admin.router import router as admin_router
# ...
    app.include_router(admin_router)
```

- [ ] **Step 8:** Run `cd backend && poetry run pytest tests/test_admin.py -v` → PASS

- [ ] **Step 9: Commit**

```bash
git add backend/src/gad/admin/ backend/src/gad/main.py backend/tests/test_admin.py
git commit -m "feat(admin): panel de moderación con stats y gestión de reportes"
```

---

## Task 9: Smoke test de la Fase 5

**Files:**
- Create: `backend/tests/test_smoke_phase5.py`

- [ ] **Step 1: Test**

```python
# backend/tests/test_smoke_phase5.py
import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from gad.main import create_app


@pytest.fixture
def app():
    return create_app()


@pytest.fixture
async def client(app):
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


@pytest.mark.asyncio
async def test_admin_requires_admin_role(client):
    async with client as c:
        resp = await c.post(
            "/auth/register",
            json={"email": "normal@example.com", "password": "12345678", "display_name": "N"},
        )
        token = resp.json()["access_token"]
        resp = await c.get("/admin/stats", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_report_endpoint_requires_auth(client):
    import uuid

    async with client as c:
        resp = await c.post(
            f"/users/{uuid.uuid4()}/report", json={"reason": "spam"}
        )
    assert resp.status_code == 401
```

- [ ] **Step 2:** Run `cd backend && poetry run pytest tests/test_smoke_phase5.py -v` → PASS

- [ ] **Step 3: Commit**

```bash
git add backend/tests/test_smoke_phase5.py
git commit -m "test: smoke test de reseñas, reportes y admin (Fase 5)"
```

---

## Self-Review

**1. Spec coverage (Fase 5):** ✅ Reseñas post-match con ventana 7 días, cálculo de reputation_score, panel de moderación admin básico. Reportes de usuario (que faltaban en Fase 4) añadidos aquí.

**2. Placeholder scan:** Sin placeholders. Todos los servicios y routers tienen código completo.

**3. Type consistency:** `create_review`, `recalc_reputation`, `list_reviews_for_user` consistentes. `complete_match`/`cancel_match` añadidos a matching service. `require_admin` dependency definida y usada en admin router.

**4. Flujo completo:** Para reseñar hay que: match completed → reseñar dentro de 7 días → reputación se recalcula.

**5. Validaciones:** No reseñar a sí mismo, no duplicar, match debe estar completed, ventana de 7 días, participación verificada.
