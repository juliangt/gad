from datetime import datetime
from uuid import uuid4

from gad.admin.plans_schemas import (
    AdminPlanListItem,
    AdminPlanOut,
)


def test_admin_plan_list_item_serializes():
    item = AdminPlanListItem(
        id=uuid4(),
        title="Café",
        activity_type="coffee",
        status="open",
        mode="now",
        host_id=uuid4(),
        host_name="Ana",
        current_participants=1,
        max_participants=3,
        created_at=datetime.utcnow(),
        expires_at=datetime.utcnow(),
        hidden_by_host=False,
    )
    assert item.activity_type == "coffee"
    assert item.hidden_by_host is False


def test_admin_plan_out_has_location():
    out = AdminPlanOut(
        id=uuid4(),
        title="Café",
        activity_type="coffee",
        status="open",
        mode="now",
        scheduled_at=None,
        window_minutes=120,
        max_participants=3,
        current_participants=1,
        description=None,
        location_label="Centro",
        location_lat=-34.6,
        location_lng=-58.4,
        search_radius_m=2000,
        expires_at=datetime.utcnow(),
        created_at=datetime.utcnow(),
        hidden_by_host=False,
        host_id=uuid4(),
        host_email="ana@x.com",
        host_name="Ana",
    )
    assert out.location_lat == -34.6
    assert out.host_email == "ana@x.com"
