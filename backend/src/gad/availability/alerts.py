# backend/src/gad/availability/alerts.py
"""Envía alertas a usuarios disponibles cuando se crea un plan compatible."""

import json
from contextlib import suppress

from gad.models.enums import NotificationType
from gad.notifications.service import bulk_create_notifications
from gad.redis_client import redis_client


async def notify_matching_users(session, plan, availabilities) -> int:
    """Crea notificaciones plan_alert para cada usuario disponible y publica vía WS."""
    if not availabilities:
        return 0

    user_ids = [av.user_id for av in availabilities]

    # Bulk create notifications in DB
    with suppress(Exception):
        await bulk_create_notifications(
            session,
            user_ids,
            NotificationType.plan_alert,
            {
                "plan_id": str(plan.id),
                "activity_type": plan.activity_type.value,
                "location_label": plan.location_label,
            },
        )

    # Bulk publish to Redis via pipeline
    with suppress(Exception):
        message = json.dumps(
            {
                "type": "plan_alert",
                "plan_id": str(plan.id),
                "activity_type": plan.activity_type.value,
            }
        )
        async with redis_client.pipeline() as pipe:
            for uid in user_ids:
                pipe.publish(f"gad:user:{uid}", message)
            await pipe.execute()

    return len(availabilities)
