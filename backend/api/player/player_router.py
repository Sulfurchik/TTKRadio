import mimetypes

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.constants import RoleName
from app.database import get_db
from app.middleware.auth import get_current_user, user_has_role
from app.models import Message, User, VoiceMessage
from app.schemas import (
    BroadcastStatusResponse,
    MessageCreateRequest,
    MessageResponse,
    StreamResponse,
    VoiceMessageResponse,
)
from app.services.broadcast import get_public_broadcast_state
from app.services.media import (
    AUDIO_CONTENT_TYPE_EXTENSION_MAP,
    get_media_duration,
    resolve_storage_path,
    save_upload_file,
)
from app.services.rate_limit import build_rate_limit_key, get_request_client_ip, rate_limiter
from app.services.serializers import serialize_broadcast_status, serialize_message, serialize_voice_message
from app.services.streaming import manager
from config.settings import settings


router = APIRouter(prefix="/api/player", tags=["Плеер"])


def apply_live_audio_fields(serialized_status: BroadcastStatusResponse) -> BroadcastStatusResponse:
    live_audio_active = bool(
        serialized_status.is_broadcasting
        and serialized_status.host_id
        and manager.is_live_audio_active_for(serialized_status.host_id)
    )
    serialized_status.live_audio_active = live_audio_active
    serialized_status.websocket_url = "/api/stream/ws/listen" if serialized_status.is_broadcasting else None
    return serialized_status


@router.get("/stream", response_model=StreamResponse)
async def get_stream_url(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    state, playlist_items_data = await get_public_broadcast_state(db)
    serialized_status = serialize_broadcast_status(state, playlist_items_data)
    await db.commit()
    serialized_status = apply_live_audio_fields(serialized_status)

    return StreamResponse(
        stream_url=serialized_status.current_media.storage_url if serialized_status.current_media else None,
        websocket_url=serialized_status.websocket_url,
        is_broadcasting=serialized_status.is_broadcasting,
        is_paused=serialized_status.is_paused,
        current_media=serialized_status.current_media,
        playlist=serialized_status.playlist,
        is_looping=serialized_status.is_looping,
        is_shuffle=serialized_status.is_shuffle,
        live_audio_active=serialized_status.live_audio_active,
        started_at=serialized_status.started_at,
        position_seconds=serialized_status.position_seconds,
        server_time=serialized_status.server_time,
        server_timestamp_ms=serialized_status.server_timestamp_ms,
    )


@router.get("/current-track")
async def get_current_track(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    state, playlist_items_data = await get_public_broadcast_state(db)
    serialized_status = serialize_broadcast_status(state, playlist_items_data)
    await db.commit()
    return {"track": serialized_status.current_media}


@router.post("/messages", response_model=MessageResponse)
async def send_message(
    payload: MessageCreateRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await rate_limiter.enforce(
        build_rate_limit_key("player:message", get_request_client_ip(request), current_user.id),
        limit=settings.RATE_LIMIT_MESSAGE_MAX,
        window_seconds=settings.RATE_LIMIT_WINDOW_SECONDS,
    )
    message = Message(user_id=current_user.id, text=payload.text, status="new")
    db.add(message)
    await db.commit()

    result = await db.execute(
        select(Message)
        .where(Message.id == message.id)
        .options(selectinload(Message.user))
    )
    return serialize_message(result.scalar_one())


@router.get("/messages", response_model=list[MessageResponse])
async def get_user_messages(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Message)
        .where(Message.user_id == current_user.id)
        .options(selectinload(Message.user))
        .order_by(Message.created_at.desc())
        .limit(100)
    )
    return [serialize_message(message) for message in result.scalars().all()]


@router.post("/voice", response_model=VoiceMessageResponse)
async def send_voice_message(
    request: Request,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await rate_limiter.enforce(
        build_rate_limit_key("player:voice", get_request_client_ip(request), current_user.id),
        limit=settings.RATE_LIMIT_UPLOAD_MAX,
        window_seconds=settings.RATE_LIMIT_WINDOW_SECONDS,
    )
    relative_path, _, _ = await save_upload_file(
        file,
        folder_name="voice_messages",
        allowed_extensions=set(settings.ALLOWED_AUDIO_FORMATS),
        max_size_bytes=settings.MAX_VOICE_MESSAGE_SIZE_MB * 1024 * 1024,
        content_type_map=AUDIO_CONTENT_TYPE_EXTENSION_MAP,
    )

    voice_message = VoiceMessage(
        user_id=current_user.id,
        file_path=relative_path,
        duration=get_media_duration(relative_path),
    )
    db.add(voice_message)
    await db.commit()

    result = await db.execute(
        select(VoiceMessage)
        .where(VoiceMessage.id == voice_message.id)
        .options(selectinload(VoiceMessage.user))
    )
    return serialize_voice_message(result.scalar_one())


@router.get("/voice-messages", response_model=list[VoiceMessageResponse])
async def get_user_voice_messages(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(VoiceMessage)
        .where(VoiceMessage.user_id == current_user.id)
        .options(selectinload(VoiceMessage.user))
        .order_by(VoiceMessage.created_at.desc(), VoiceMessage.id.desc())
        .limit(100)
    )
    return [serialize_voice_message(message) for message in result.scalars().all()]


@router.get("/voice-messages/{voice_message_id}/file")
async def get_voice_message_file(
    voice_message_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(VoiceMessage).where(VoiceMessage.id == voice_message_id))
    voice_message = result.scalar_one_or_none()
    if voice_message is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Голосовое сообщение не найдено")

    if voice_message.user_id != current_user.id and not user_has_role(
        current_user,
        RoleName.HOST.value,
        RoleName.ADMIN.value,
    ):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Недостаточно прав")

    file_path = resolve_storage_path(voice_message.file_path)
    if not file_path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Файл голосового сообщения не найден")

    media_type = mimetypes.guess_type(file_path.name)[0] or "application/octet-stream"
    return FileResponse(path=file_path, media_type=media_type, filename=file_path.name)


@router.get("/broadcast-status", response_model=BroadcastStatusResponse)
async def get_broadcast_status(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    state, playlist_items_data = await get_public_broadcast_state(db)
    serialized_status = serialize_broadcast_status(state, playlist_items_data)
    await db.commit()
    return apply_live_audio_fields(serialized_status)
