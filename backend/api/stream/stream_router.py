import asyncio
import json
import logging

from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.constants import RoleName
from app.database import get_db
from app.middleware.auth import get_current_user, user_has_role
from app.models import User
from app.services.auth import decode_access_token
from app.services.broadcast import get_public_broadcast_state
from app.services.rate_limit import build_rate_limit_key, get_websocket_client_ip, rate_limiter
from app.services.streaming import manager
from config.settings import settings


router = APIRouter(prefix="/api/stream", tags=["Стриминг"])
logger = logging.getLogger(__name__)


async def resolve_websocket_host(
    db: AsyncSession,
    host_id: int,
    token: str | None,
) -> User | None:
    if token:
        try:
            payload = decode_access_token(token)
        except JWTError:
            return None
        if str(host_id) != str(payload.get("sub")):
            return None
    elif not settings.DEBUG:
        return None

    result = await db.execute(
        select(User)
        .where(User.id == host_id)
        .where(User.is_deleted.is_(False))
        .options(selectinload(User.roles))
    )
    user = result.scalar_one_or_none()
    if user is None:
        return None
    if not user_has_role(user, RoleName.HOST.value, RoleName.ADMIN.value):
        return None
    return user


@router.websocket("/ws/listen")
async def listen_stream(websocket: WebSocket):
    await manager.connect_listener(websocket)
    try:
        while True:
            message = await asyncio.wait_for(
                websocket.receive(),
                timeout=settings.WEBSOCKET_IDLE_TIMEOUT_SECONDS,
            )
            data = message.get("bytes")
            text = message.get("text")
            if data:
                logger.warning("Listener websocket sent unexpected binary payload")
                await websocket.close(code=1003, reason="Unsupported listener payload")
                break
            if text and text != "ping":
                logger.warning("Listener websocket sent unexpected text payload")
                await websocket.close(code=1003, reason="Unsupported listener payload")
                break
    except WebSocketDisconnect:
        pass
    except asyncio.TimeoutError:
        await websocket.close(code=1001, reason="Idle timeout")
    except Exception as error:
        logger.warning("Listener websocket disconnected after unexpected error: %s", error)
    finally:
        manager.disconnect_listener(websocket)


@router.websocket("/ws/host/{host_id}")
async def host_stream(
    host_id: int,
    websocket: WebSocket,
    token: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    rate_limit_decision = await rate_limiter.evaluate_websocket(
        build_rate_limit_key("stream:host-connect", get_websocket_client_ip(websocket), host_id),
        limit=settings.RATE_LIMIT_WS_CONNECT_MAX,
        window_seconds=settings.RATE_LIMIT_WINDOW_SECONDS,
    )
    if not rate_limit_decision.allowed:
        await websocket.close(code=4408, reason="Rate limit exceeded")
        return

    user = await resolve_websocket_host(db, host_id, token)
    if user is None:
        await websocket.close(code=4003, reason="Not authorized as host")
        return

    await manager.connect_host(websocket, str(host_id))
    try:
        while True:
            message = await asyncio.wait_for(
                websocket.receive(),
                timeout=settings.WEBSOCKET_IDLE_TIMEOUT_SECONDS,
            )
            data = message.get("bytes")
            text = message.get("text")
            if data:
                if len(data) > settings.MAX_WEBSOCKET_BINARY_BYTES:
                    logger.warning("Rejected oversized live-audio binary chunk from host %s", host_id)
                    await websocket.close(code=1009, reason="Binary payload too large")
                    break
                await manager.broadcast_binary(str(host_id), data)
            elif text:
                if len(text.encode("utf-8")) > settings.MAX_WEBSOCKET_TEXT_BYTES:
                    logger.warning("Rejected oversized websocket control payload from host %s", host_id)
                    await websocket.close(code=1009, reason="Text payload too large")
                    break
                if text != "ping":
                    try:
                        payload = json.loads(text)
                    except json.JSONDecodeError:
                        logger.warning("Rejected invalid websocket control payload from host %s", host_id)
                        await websocket.close(code=1003, reason="Unsupported host payload")
                        break
                    if payload.get("type") not in {"live_audio_start", "live_audio_stop", "ping"}:
                        logger.warning("Rejected unknown websocket control event from host %s", host_id)
                        await websocket.close(code=1003, reason="Unsupported host payload")
                        break
                await manager.broadcast_text(str(host_id), text)
    except WebSocketDisconnect:
        pass
    except asyncio.TimeoutError:
        await websocket.close(code=1001, reason="Idle timeout")
    except Exception as error:
        logger.warning("Host websocket disconnected after unexpected error: host_id=%s error=%s", host_id, error)
    finally:
        manager.disconnect_host(websocket, str(host_id))


@router.get("/status")
async def get_stream_status(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    state, playlist_items_data = await get_public_broadcast_state(db)
    await db.commit()
    current_media = None
    if state and state.current_media:
        current_media = {
            "id": state.current_media.id,
            "original_name": state.current_media.original_name,
            "file_type": state.current_media.file_type,
        }

    return {
        "is_broadcasting": bool(state and state.is_broadcasting),
        "listeners_count": manager.listeners_count,
        "live_audio_active": bool(state and manager.is_live_audio_active_for(state.host_id)),
        "current_media": current_media,
        "playlist_size": len(playlist_items_data),
    }
