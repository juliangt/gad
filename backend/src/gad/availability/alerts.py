# backend/src/gad/availability/alerts.py
"""Envía alertas a usuarios disponibles cuando se crea un plan compatible."""
import json
from contextlib import suppress

from gad.models.enums import NotificationType
from gad.notifications.service import create_notification
from gad.redis_client import redis_client


async def notify_matching_users(
    session, plan, availabilities
) -> int:
    """Crea notificaciones plan_alert para cada usuario disponible y publica vía WS."""
    count = 0
    for av in availabilities:
        with suppress(Exception):
            await create_notification(
                session,
                av.user_id,
                NotificationType.plan_alert,
                {
                    "plan_id": str(plan.id),
                    "activity_type": plan.activity_type.value,
                    "location_label": plan.location_label,
                },
            )
        with suppress(Exception):
            await redis_client.publish(
                f"gad:user:{av.user_id}",
                json.dumps(
                    {
                        "type": "plan_alert",
                        "plan_id": str(plan.id),
                        "activity_type": plan.activity_type.value,
                    }
                ),
            )
        count += 1
    return count
