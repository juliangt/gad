# backend/src/gad/matching/notifications.py
"""Publicación de eventos de matching vía Redis pub/sub.

El consumo (WebSocket) llega en Fase 3. Aquí solo publicamos.
"""
import json

from gad.redis_client import redis_client


def _channel_for_user(user_id: str) -> str:
    return f"gad:user:{user_id}"


async def publish_new_application(host_id: str, plan_id: str, applicant_id: str) -> None:
    await redis_client.publish(
        _channel_for_user(host_id),
        json.dumps(
            {
                "type": "new_application",
                "plan_id": plan_id,
                "applicant_id": applicant_id,
            }
        ),
    )


async def publish_match_created(
    match_id: str, plan_id: str, participant_ids: list[str]
) -> None:
    for uid in participant_ids:
        await redis_client.publish(
            _channel_for_user(uid),
            json.dumps(
                {
                    "type": "match_created",
                    "match_id": match_id,
                    "plan_id": plan_id,
                }
            ),
        )


async def publish_application_decided(
    applicant_id: str, plan_id: str, accepted: bool
) -> None:
    await redis_client.publish(
        _channel_for_user(applicant_id),
        json.dumps(
            {
                "type": "application_decided",
                "plan_id": plan_id,
                "accepted": accepted,
            }
        ),
    )
