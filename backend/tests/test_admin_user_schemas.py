from datetime import date, datetime
from uuid import uuid4

from gad.admin.schemas import AdminUserDetailOut, AdminUserUpdateIn


def test_admin_user_detail_out_serializes():
    out = AdminUserDetailOut(
        id=uuid4(),
        email="x@example.com",
        display_name="X",
        status="active",
        is_admin=False,
        reputation_score=4.5,
        created_at=datetime.utcnow(),
        avatar_url=None,
        bio="hola",
        birth_date=date(1990, 1, 1),
        gender="undisclosed",
        locale="es-AR",
        timezone="America/Argentina/Buenos_Aires",
        verification_level="none",
        last_active_at=None,
        google_id=None,
        plans_count=3,
        matches_count=5,
        reports_received=1,
        avg_rating=4.0,
    )
    assert out.plans_count == 3
    assert out.avg_rating == 4.0


def test_admin_user_update_in_all_optional():
    data = AdminUserUpdateIn()
    assert data.display_name is None
    assert data.verification_level is None


def test_admin_user_update_in_partial():
    data = AdminUserUpdateIn(display_name="Nuevo", locale="en-US")
    assert data.display_name == "Nuevo"
    assert data.locale == "en-US"
