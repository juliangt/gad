# backend/src/gad/admin/router.py
from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from gad.admin.dependencies import require_admin
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
from gad.admin.service import (
    ban_user,
    force_cancel_plan,
    get_stats,
    list_reports_admin,
    list_users_admin,
    update_report_status_admin,
)
from gad.admin.settings_router import router as settings_router
from gad.db import get_session
from gad.models.user import User
from gad.reports.schemas import ReportOut
from gad.schemas.pagination import PaginatedOut
from gad.users.service import set_user_status
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

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/stats", response_model=AdminStatsOut)
async def stats_endpoint(
    admin: Annotated[User, Depends(require_admin)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> AdminStatsOut:
    stats = await get_stats(session)
    return AdminStatsOut(**stats)


@router.get("/reports", response_model=PaginatedOut[ReportOut])
async def list_reports_endpoint(
    admin: Annotated[User, Depends(require_admin)],
    session: Annotated[AsyncSession, Depends(get_session)],
    status: str | None = None,
    limit: int = Query(default=50, ge=1, le=100),
    before: datetime | None = Query(default=None),
) -> PaginatedOut[ReportOut]:
    reports = await list_reports_admin(
        session, status=status, limit=limit, before=before
    )
    items = [
        ReportOut(
            id=r.id, reporter_id=r.reporter_id, reported_id=r.reported_id,
            reason=r.reason, description=r.description, status=r.status,
            payload=r.payload, created_at=r.created_at,
        )
        for r in reports
    ]
    next_cursor = items[-1].created_at.isoformat() if len(items) == limit and items else None
    return PaginatedOut[ReportOut](items=items, next_cursor=next_cursor)


@router.patch("/reports/{report_id}", response_model=ReportOut)
async def update_report_endpoint(
    report_id: UUID,
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


def _user_to_admin_out(user: User) -> AdminUserOut:
    return AdminUserOut(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        status=user.status,
        is_admin=user.is_admin,
        reputation_score=user.reputation_score,
        created_at=user.created_at,
    )


@router.get("/users", response_model=PaginatedOut[AdminUserOut])
async def list_users_endpoint(
    admin: Annotated[User, Depends(require_admin)],
    session: Annotated[AsyncSession, Depends(get_session)],
    status: str | None = None,
    q: str | None = None,
    is_admin: bool | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=100),
    before: datetime | None = Query(default=None),
) -> PaginatedOut[AdminUserOut]:
    users = await list_users_admin(
        session, status=status, q=q, is_admin=is_admin, limit=limit, before=before
    )
    items = [_user_to_admin_out(u) for u in users]
    next_cursor = items[-1].created_at.isoformat() if len(items) == limit and items else None
    return PaginatedOut[AdminUserOut](items=items, next_cursor=next_cursor)


@router.post("/users/{user_id}/ban", response_model=AdminUserOut)
async def ban_user_endpoint(
    user_id: UUID,
    admin: Annotated[User, Depends(require_admin)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> AdminUserOut:
    from gad.auth.dependencies import get_token_store

    user = await ban_user(session, get_token_store(), user_id)
    return _user_to_admin_out(user)


@router.post("/users/{user_id}/suspend", response_model=AdminUserOut)
async def suspend_user_endpoint(
    user_id: UUID,
    admin: Annotated[User, Depends(require_admin)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> AdminUserOut:
    from gad.auth.dependencies import get_token_store

    user = await ban_user(session, get_token_store(), user_id)
    return _user_to_admin_out(user)


@router.post("/users/{user_id}/activate", response_model=AdminUserOut)
async def activate_user_endpoint(
    user_id: UUID,
    admin: Annotated[User, Depends(require_admin)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> AdminUserOut:
    user = await set_user_status(session, user_id, "active")
    return _user_to_admin_out(user)


@router.post("/plans/{plan_id}/cancel")
async def force_cancel_plan_endpoint(
    plan_id: UUID,
    admin: Annotated[User, Depends(require_admin)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict[str, str]:
    await force_cancel_plan(session, plan_id)
    return {"message": "Plan cancelado por moderación"}


def _review_to_flagged_out(r) -> FlaggedReviewOut:
    return FlaggedReviewOut(
        id=r.id,
        match_id=r.match_id,
        reviewer_id=r.reviewer_id,
        reviewee_id=r.reviewee_id,
        rating=r.rating,
        comment=r.comment,
        flag=r.flag,
        created_at=r.created_at,
    )


@router.get("/reviews", response_model=PaginatedOut[FlaggedReviewOut])
async def list_flagged_reviews_endpoint(
    admin: Annotated[User, Depends(require_admin)],
    session: Annotated[AsyncSession, Depends(get_session)],
    limit: int = Query(default=50, ge=1, le=100),
    before: datetime | None = Query(default=None),
) -> PaginatedOut[FlaggedReviewOut]:
    from gad.admin.service import list_flagged_reviews

    reviews = await list_flagged_reviews(session, limit=limit, before=before)
    items = [_review_to_flagged_out(r) for r in reviews]
    next_cursor = items[-1].created_at.isoformat() if len(items) == limit and items else None
    return PaginatedOut[FlaggedReviewOut](items=items, next_cursor=next_cursor)



@router.delete("/reviews/{review_id}")
async def delete_review_admin_endpoint(
    review_id: UUID,
    admin: Annotated[User, Depends(require_admin)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict[str, str]:
    from gad.admin.service import delete_review_admin

    await delete_review_admin(session, review_id)
    return {"message": "Reseña eliminada por moderación"}


# ---------- Venues (sponsored) ----------


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


async def _venue_to_admin_out(session: AsyncSession, venue) -> VenueAdminOut:
    from geoalchemy2 import Geometry
    from sqlalchemy import cast, func, select

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


# Settings sub-router: rutas bajo /admin/settings/*
router.include_router(settings_router)
