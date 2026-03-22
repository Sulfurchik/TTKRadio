from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.constants import BroadcastMode, MediaType, MessageStatus
from app.database import get_db
from app.middleware.auth import require_host
from app.models import MediaLibrary, Message, Playlist, User, VoiceMessage
from app.schemas import (
    BroadcastMediaSelectRequest,
    BroadcastStatusResponse,
    BroadcastVolumeRequest,
    MediaResponse,
    MediaUpdateRequest,
    MessageResponse,
    MessageStatusUpdateRequest,
    OperationResponse,
    PlaylistAddItemRequest,
    PlaylistCreateRequest,
    PlaylistReorderRequest,
    PlaylistResponse,
    VoiceMessageResponse,
)
from app.services.broadcast import (
    activate_playlist_for_host,
    advance_playlist,
    cleanup_media_references,
    cleanup_playlist_references,
    finish_current_media,
    get_or_create_broadcast_state,
    get_playlist_items,
    insert_playlist_item,
    pause_current_media,
    progress_broadcast_if_needed,
    remove_playlist_item,
    reorder_playlist_items,
    resume_current_media,
    rewind_playlist,
    set_current_media,
    stop_other_broadcasts,
    start_playlist_broadcast,
    stop_broadcast,
    sync_broadcast_state,
)
from app.services.media import (
    delete_storage_file,
    get_media_duration,
    get_file_extension,
    save_upload_file,
)
from app.services.serializers import (
    serialize_broadcast_status,
    serialize_media,
    serialize_message,
    serialize_playlist,
    serialize_voice_message,
)
from app.services.streaming import manager
from config.settings import settings


router = APIRouter(prefix="/api/host", tags=["Ведущий"])


def apply_live_audio_fields(serialized_status: BroadcastStatusResponse) -> BroadcastStatusResponse:
    live_audio_active = bool(
        serialized_status.is_broadcasting
        and serialized_status.host_id
        and manager.is_live_audio_active_for(serialized_status.host_id)
    )
    serialized_status.live_audio_active = live_audio_active
    serialized_status.websocket_url = "/api/stream/ws/listen" if serialized_status.is_broadcasting else None
    return serialized_status


async def get_host_playlist(db: AsyncSession, host_id: int, playlist_id: int) -> Playlist:
    result = await db.execute(
        select(Playlist)
        .where(Playlist.id == playlist_id)
        .where(Playlist.user_id == host_id)
    )
    playlist = result.scalar_one_or_none()
    if playlist is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Плейлист не найден")
    return playlist


async def build_playlist_response(db: AsyncSession, playlist: Playlist) -> PlaylistResponse:
    playlist_items_data = await get_playlist_items(db, playlist.id)
    return serialize_playlist(playlist, playlist_items_data)


async def get_host_media(db: AsyncSession, host_id: int, media_id: int) -> MediaLibrary:
    result = await db.execute(
        select(MediaLibrary)
        .where(MediaLibrary.id == media_id)
        .where(MediaLibrary.user_id == host_id)
    )
    media = result.scalar_one_or_none()
    if media is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Файл не найден")
    return media


@router.get("/media", response_model=list[MediaResponse])
async def get_media_library(
    current_user: User = Depends(require_host),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(MediaLibrary)
        .where(MediaLibrary.user_id == current_user.id)
        .order_by(MediaLibrary.created_at.desc(), MediaLibrary.id.desc())
    )
    return [serialize_media(media) for media in result.scalars().all()]


@router.post("/media/upload", response_model=MediaResponse)
async def upload_media(
    file: UploadFile = File(...),
    current_user: User = Depends(require_host),
    db: AsyncSession = Depends(get_db),
):
    extension = get_file_extension(file.filename)
    if extension in settings.ALLOWED_AUDIO_FORMATS:
        folder_name = "audio"
        file_type = MediaType.AUDIO.value
        max_size = settings.MAX_AUDIO_SIZE_MB * 1024 * 1024
    elif extension in settings.ALLOWED_VIDEO_FORMATS:
        folder_name = "video"
        file_type = MediaType.VIDEO.value
        max_size = settings.MAX_VIDEO_SIZE_MB * 1024 * 1024
    else:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Неподдерживаемый формат")

    relative_path, file_size, _ = await save_upload_file(
        file,
        folder_name=folder_name,
        allowed_extensions=set(settings.ALLOWED_AUDIO_FORMATS + settings.ALLOWED_VIDEO_FORMATS),
        max_size_bytes=max_size,
    )

    media = MediaLibrary(
        user_id=current_user.id,
        file_path=relative_path,
        original_name=file.filename,
        file_type=file_type,
        file_size=file_size,
        duration=get_media_duration(relative_path) if file_type == MediaType.AUDIO.value else 0.0,
    )
    db.add(media)
    await db.commit()

    result = await db.execute(select(MediaLibrary).where(MediaLibrary.id == media.id))
    return serialize_media(result.scalar_one())


@router.delete("/media/{media_id}", response_model=OperationResponse)
async def delete_media(
    media_id: int,
    current_user: User = Depends(require_host),
    db: AsyncSession = Depends(get_db),
):
    media = await get_host_media(db, current_user.id, media_id)
    delete_storage_file(media.file_path)
    await cleanup_media_references(db, current_user.id, media.id)
    await db.delete(media)
    await db.commit()
    return OperationResponse(message="Файл удален")


@router.put("/media/{media_id}", response_model=MediaResponse)
async def update_media(
    media_id: int,
    request: MediaUpdateRequest,
    current_user: User = Depends(require_host),
    db: AsyncSession = Depends(get_db),
):
    media = await get_host_media(db, current_user.id, media_id)
    media.original_name = request.original_name
    media.updated_at = datetime.utcnow()
    await db.commit()

    result = await db.execute(select(MediaLibrary).where(MediaLibrary.id == media.id))
    return serialize_media(result.scalar_one())


@router.get("/playlists", response_model=list[PlaylistResponse])
async def get_playlists(
    current_user: User = Depends(require_host),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Playlist)
        .where(Playlist.user_id == current_user.id)
        .order_by(Playlist.created_at.desc(), Playlist.id.desc())
    )
    playlists = result.scalars().all()
    return [await build_playlist_response(db, playlist) for playlist in playlists]


@router.post("/playlists", response_model=PlaylistResponse, status_code=status.HTTP_201_CREATED)
async def create_playlist(
    request: PlaylistCreateRequest,
    current_user: User = Depends(require_host),
    db: AsyncSession = Depends(get_db),
):
    playlist = Playlist(user_id=current_user.id, name=request.name)
    db.add(playlist)
    await db.commit()
    return await build_playlist_response(db, playlist)


@router.delete("/playlists/{playlist_id}", response_model=OperationResponse)
async def delete_playlist(
    playlist_id: int,
    current_user: User = Depends(require_host),
    db: AsyncSession = Depends(get_db),
):
    playlist = await get_host_playlist(db, current_user.id, playlist_id)
    await cleanup_playlist_references(db, current_user.id, playlist.id)
    await db.delete(playlist)
    await db.commit()
    return OperationResponse(message="Плейлист удален")


@router.post("/playlists/{playlist_id}/items", response_model=PlaylistResponse)
async def add_item_to_playlist(
    playlist_id: int,
    request: PlaylistAddItemRequest,
    current_user: User = Depends(require_host),
    db: AsyncSession = Depends(get_db),
):
    playlist = await get_host_playlist(db, current_user.id, playlist_id)
    await get_host_media(db, current_user.id, request.media_id)
    await insert_playlist_item(db, playlist.id, request.media_id, request.order)
    playlist.updated_at = datetime.utcnow()

    state = await get_or_create_broadcast_state(db, current_user.id)
    if state.playlist_id == playlist.id:
        await sync_broadcast_state(db, state)

    await db.commit()
    return await build_playlist_response(db, playlist)


@router.delete("/playlists/{playlist_id}/items/{item_id}", response_model=PlaylistResponse)
async def delete_item_from_playlist(
    playlist_id: int,
    item_id: int,
    current_user: User = Depends(require_host),
    db: AsyncSession = Depends(get_db),
):
    playlist = await get_host_playlist(db, current_user.id, playlist_id)
    was_deleted = await remove_playlist_item(db, playlist.id, item_id)
    if not was_deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Элемент плейлиста не найден")
    playlist.updated_at = datetime.utcnow()

    state = await get_or_create_broadcast_state(db, current_user.id)
    if state.playlist_id == playlist.id:
        await sync_broadcast_state(db, state)

    await db.commit()
    return await build_playlist_response(db, playlist)


@router.put("/playlists/{playlist_id}/items/reorder", response_model=PlaylistResponse)
async def reorder_items(
    playlist_id: int,
    request: PlaylistReorderRequest,
    current_user: User = Depends(require_host),
    db: AsyncSession = Depends(get_db),
):
    playlist = await get_host_playlist(db, current_user.id, playlist_id)
    await reorder_playlist_items(db, playlist.id, request.item_ids)
    playlist.updated_at = datetime.utcnow()

    state = await get_or_create_broadcast_state(db, current_user.id)
    if state.playlist_id == playlist.id:
        await sync_broadcast_state(db, state)

    await db.commit()
    return await build_playlist_response(db, playlist)


@router.put("/playlists/{playlist_id}/toggle-loop")
async def toggle_playlist_loop(
    playlist_id: int,
    current_user: User = Depends(require_host),
    db: AsyncSession = Depends(get_db),
):
    playlist = await get_host_playlist(db, current_user.id, playlist_id)
    playlist.is_looping = not playlist.is_looping
    playlist.updated_at = datetime.utcnow()
    await db.commit()
    return {"is_looping": playlist.is_looping}


@router.put("/playlists/{playlist_id}/toggle-shuffle")
async def toggle_playlist_shuffle(
    playlist_id: int,
    current_user: User = Depends(require_host),
    db: AsyncSession = Depends(get_db),
):
    playlist = await get_host_playlist(db, current_user.id, playlist_id)
    playlist.is_shuffle = not playlist.is_shuffle
    playlist.updated_at = datetime.utcnow()
    await db.commit()
    return {"is_shuffle": playlist.is_shuffle}


@router.post("/playlists/{playlist_id}/activate")
async def activate_playlist(
    playlist_id: int,
    current_user: User = Depends(require_host),
    db: AsyncSession = Depends(get_db),
):
    playlist = await activate_playlist_for_host(db, current_user.id, playlist_id)

    state = await get_or_create_broadcast_state(db, current_user.id)
    if state.playlist_id == playlist.id:
        await sync_broadcast_state(db, state)

    await db.commit()
    return {"message": "Плейлист активирован", "playlist_id": playlist.id}


@router.get("/broadcast/status", response_model=BroadcastStatusResponse)
async def get_broadcast_status(
    current_user: User = Depends(require_host),
    db: AsyncSession = Depends(get_db),
):
    state = await get_or_create_broadcast_state(db, current_user.id)
    playlist_items_data = await progress_broadcast_if_needed(db, state)
    await db.commit()
    return apply_live_audio_fields(serialize_broadcast_status(state, playlist_items_data))


@router.post("/broadcast/start", response_model=OperationResponse)
async def start_broadcast(
    playlist_id: Optional[int] = Form(None),
    current_user: User = Depends(require_host),
    db: AsyncSession = Depends(get_db),
):
    manager.deactivate_live_audio()
    await start_playlist_broadcast(db, current_user.id, playlist_id)
    await db.commit()
    return OperationResponse(message="Вещание запущено")


@router.post("/broadcast/stop", response_model=OperationResponse)
async def stop_current_broadcast(
    current_user: User = Depends(require_host),
    db: AsyncSession = Depends(get_db),
):
    manager.deactivate_live_audio(str(current_user.id))
    await stop_broadcast(db, current_user.id)
    await db.commit()
    return OperationResponse(message="Вещание остановлено")


@router.post("/broadcast/next", response_model=BroadcastStatusResponse)
async def next_broadcast_track(
    current_user: User = Depends(require_host),
    db: AsyncSession = Depends(get_db),
):
    state, playlist_items_data = await advance_playlist(db, current_user.id)
    await db.commit()
    return apply_live_audio_fields(serialize_broadcast_status(state, playlist_items_data))


@router.post("/broadcast/previous", response_model=BroadcastStatusResponse)
async def previous_broadcast_track(
    current_user: User = Depends(require_host),
    db: AsyncSession = Depends(get_db),
):
    state, playlist_items_data = await rewind_playlist(db, current_user.id)
    await db.commit()
    return apply_live_audio_fields(serialize_broadcast_status(state, playlist_items_data))


@router.put("/broadcast/volume", response_model=BroadcastStatusResponse)
async def update_broadcast_volume(
    request: BroadcastVolumeRequest,
    current_user: User = Depends(require_host),
    db: AsyncSession = Depends(get_db),
):
    state = await get_or_create_broadcast_state(db, current_user.id)
    state.volume = request.volume
    state.updated_at = datetime.utcnow()
    playlist_items_data = await sync_broadcast_state(db, state)
    await db.commit()
    return apply_live_audio_fields(serialize_broadcast_status(state, playlist_items_data))


@router.put("/broadcast/current-media", response_model=BroadcastStatusResponse)
async def update_current_media(
    request: BroadcastMediaSelectRequest,
    current_user: User = Depends(require_host),
    db: AsyncSession = Depends(get_db),
):
    state, playlist_items_data = await set_current_media(db, current_user.id, request.media_id)
    await db.commit()
    return apply_live_audio_fields(serialize_broadcast_status(state, playlist_items_data))


@router.post("/broadcast/pause", response_model=BroadcastStatusResponse)
async def pause_broadcast_media(
    current_user: User = Depends(require_host),
    db: AsyncSession = Depends(get_db),
):
    state, playlist_items_data = await pause_current_media(db, current_user.id)
    await db.commit()
    return apply_live_audio_fields(serialize_broadcast_status(state, playlist_items_data))


@router.post("/broadcast/resume", response_model=BroadcastStatusResponse)
async def resume_broadcast_media(
    current_user: User = Depends(require_host),
    db: AsyncSession = Depends(get_db),
):
    state, playlist_items_data = await resume_current_media(db, current_user.id)
    await db.commit()
    return apply_live_audio_fields(serialize_broadcast_status(state, playlist_items_data))


@router.post("/broadcast/finish", response_model=BroadcastStatusResponse)
async def finish_broadcast_media(
    current_user: User = Depends(require_host),
    db: AsyncSession = Depends(get_db),
):
    state, playlist_items_data = await finish_current_media(db, current_user.id)
    await db.commit()
    return apply_live_audio_fields(serialize_broadcast_status(state, playlist_items_data))


@router.post("/broadcast/live-audio/start", response_model=BroadcastStatusResponse)
async def start_live_audio_broadcast(
    current_user: User = Depends(require_host),
    db: AsyncSession = Depends(get_db),
):
    state = await get_or_create_broadcast_state(db, current_user.id)
    playlist_items_data = await progress_broadcast_if_needed(db, state)
    if not state.is_broadcasting:
        await stop_other_broadcasts(db, current_user.id)
        state.source_type = BroadcastMode.LIVE_AUDIO.value
        state.is_broadcasting = True
        state.is_paused = False
        state.started_at = datetime.utcnow()
        state.paused_at = None
        playlist_items_data = await sync_broadcast_state(db, state)

    manager.activate_live_audio(str(current_user.id))
    state.source_type = BroadcastMode.LIVE_AUDIO.value
    state.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(state, attribute_names=["playlist", "current_media"])
    return apply_live_audio_fields(serialize_broadcast_status(state, playlist_items_data))


@router.post("/broadcast/live-audio/stop", response_model=BroadcastStatusResponse)
async def stop_live_audio_broadcast(
    current_user: User = Depends(require_host),
    db: AsyncSession = Depends(get_db),
):
    state = await get_or_create_broadcast_state(db, current_user.id)
    playlist_items_data = await progress_broadcast_if_needed(db, state)
    manager.deactivate_live_audio(str(current_user.id))
    if state.current_media_id:
        state.source_type = BroadcastMode.PLAYLIST.value
    else:
        state.source_type = BroadcastMode.LIVE_AUDIO.value
        state.is_broadcasting = False
        state.is_paused = False
        state.started_at = None
        state.paused_at = None
    state.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(state, attribute_names=["playlist", "current_media"])
    return apply_live_audio_fields(serialize_broadcast_status(state, playlist_items_data))


@router.get("/messages", response_model=list[MessageResponse])
async def get_messages(
    status_value: Optional[str] = Query(default=None, alias="status"),
    legacy_status_value: Optional[str] = Query(default=None, alias="status_filter"),
    current_user: User = Depends(require_host),
    db: AsyncSession = Depends(get_db),
):
    effective_status = status_value or legacy_status_value

    query = (
        select(Message)
        .where((Message.host_id == current_user.id) | (Message.host_id.is_(None)))
        .options(selectinload(Message.user))
        .order_by(Message.created_at.asc(), Message.id.asc())
    )

    if effective_status:
        query = query.where(Message.status == effective_status)
    else:
        query = query.where(Message.status != MessageStatus.COMPLETED.value)

    result = await db.execute(query)
    return [serialize_message(message) for message in result.scalars().all()]


@router.put("/messages/{message_id}/status", response_model=MessageResponse)
async def update_message_status(
    message_id: int,
    request: MessageStatusUpdateRequest,
    current_user: User = Depends(require_host),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Message)
        .where(Message.id == message_id)
        .options(selectinload(Message.user))
    )
    message = result.scalar_one_or_none()
    if message is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Сообщение не найдено")

    if message.host_id not in (None, current_user.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Сообщение уже обрабатывается другим ведущим")

    message.status = request.status
    message.updated_at = datetime.utcnow()
    if request.status in (MessageStatus.IN_PROGRESS.value, MessageStatus.COMPLETED.value):
        message.host_id = current_user.id

    await db.commit()
    refreshed_message = await db.execute(
        select(Message)
        .where(Message.id == message_id)
        .options(selectinload(Message.user))
    )
    return serialize_message(refreshed_message.scalar_one())


@router.get("/messages/archive", response_model=list[MessageResponse])
async def get_archived_messages(
    current_user: User = Depends(require_host),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Message)
        .where(Message.status == MessageStatus.COMPLETED.value)
        .where((Message.host_id == current_user.id) | (Message.host_id.is_(None)))
        .options(selectinload(Message.user))
        .order_by(Message.updated_at.desc(), Message.id.desc())
        .limit(100)
    )
    return [serialize_message(message) for message in result.scalars().all()]


@router.get("/voice-messages", response_model=list[VoiceMessageResponse])
async def get_voice_messages(
    current_user: User = Depends(require_host),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(VoiceMessage)
        .where((VoiceMessage.host_id == current_user.id) | (VoiceMessage.host_id.is_(None)))
        .where(VoiceMessage.status != MessageStatus.COMPLETED.value)
        .options(selectinload(VoiceMessage.user))
        .order_by(VoiceMessage.created_at.desc(), VoiceMessage.id.desc())
        .limit(100)
    )
    return [serialize_voice_message(message) for message in result.scalars().all()]


@router.get("/voice-messages/archive", response_model=list[VoiceMessageResponse])
async def get_archived_voice_messages(
    current_user: User = Depends(require_host),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(VoiceMessage)
        .where((VoiceMessage.host_id == current_user.id) | (VoiceMessage.host_id.is_(None)))
        .where(VoiceMessage.status == MessageStatus.COMPLETED.value)
        .options(selectinload(VoiceMessage.user))
        .order_by(VoiceMessage.updated_at.desc(), VoiceMessage.id.desc())
        .limit(100)
    )
    return [serialize_voice_message(message) for message in result.scalars().all()]


@router.put("/voice-messages/{voice_message_id}/status", response_model=VoiceMessageResponse)
async def update_voice_message_status(
    voice_message_id: int,
    request: MessageStatusUpdateRequest,
    current_user: User = Depends(require_host),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(VoiceMessage)
        .where(VoiceMessage.id == voice_message_id)
        .options(selectinload(VoiceMessage.user))
    )
    voice_message = result.scalar_one_or_none()
    if voice_message is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Голосовое сообщение не найдено")

    if voice_message.host_id not in (None, current_user.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Голосовое сообщение уже обрабатывается другим ведущим")

    voice_message.status = request.status
    voice_message.updated_at = datetime.utcnow()
    if request.status in (MessageStatus.IN_PROGRESS.value, MessageStatus.COMPLETED.value):
        voice_message.host_id = current_user.id

    await db.commit()
    refreshed = await db.execute(
        select(VoiceMessage)
        .where(VoiceMessage.id == voice_message_id)
        .options(selectinload(VoiceMessage.user))
    )
    return serialize_voice_message(refreshed.scalar_one())


@router.post("/record", response_model=MediaResponse)
async def record_audio(
    file: UploadFile = File(...),
    current_user: User = Depends(require_host),
    db: AsyncSession = Depends(get_db),
):
    relative_path, file_size, _ = await save_upload_file(
        file,
        folder_name="audio",
        allowed_extensions=set(settings.ALLOWED_AUDIO_FORMATS),
        max_size_bytes=settings.MAX_AUDIO_SIZE_MB * 1024 * 1024,
    )

    media = MediaLibrary(
        user_id=current_user.id,
        file_path=relative_path,
        original_name=file.filename or "Запись с микрофона",
        file_type=MediaType.AUDIO.value,
        file_size=file_size,
        duration=get_media_duration(relative_path),
    )
    db.add(media)
    await db.commit()

    result = await db.execute(select(MediaLibrary).where(MediaLibrary.id == media.id))
    return serialize_media(result.scalar_one())
