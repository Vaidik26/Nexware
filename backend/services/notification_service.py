"""
Push notification service for NexWare.

Centralises all Expo push notification logic so no router duplicates it.
Use send_push_notification() inside BackgroundTasks to avoid blocking requests.
"""
import logging

import httpx

from backend.config import settings

logger = logging.getLogger(__name__)


def send_push_notification(push_token: str, title: str, body: str) -> None:
    """
    Send an Expo push notification synchronously.

    Designed to be called from FastAPI BackgroundTasks so it does not block
    the request/response cycle. All failures are logged as warnings — push
    failures must never raise exceptions that affect the main workflow.

    Args:
        push_token: The Expo push token for the recipient device.
        title: Notification title.
        body: Notification body text.
    """
    if not push_token:
        return

    payload = {"to": push_token, "title": title, "body": body}
    try:
        with httpx.Client(timeout=5.0) as client:
            response = client.post(settings.EXPO_PUSH_URL, json=payload)
            if response.status_code >= 400:
                logger.warning(
                    "Push notification returned HTTP %s for token %.20s",
                    response.status_code,
                    push_token,
                )
    except httpx.TimeoutException:
        logger.warning("Push notification timed out for token %.20s", push_token)
    except Exception as exc:
        logger.warning(
            "Push notification failed for token %.20s: %s", push_token, exc
        )
