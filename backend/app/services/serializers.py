from datetime import datetime

from app.schemas import (
    BroadcastStatusResponse,
    MediaResponse,
    MessageResponse,
    PlaylistItemResponse,
    PlaylistResponse,
    RoleResponse,
    UserResponse,
    VoiceMessageResponse,
)
from app.services.media import build_storage_url


def serialize_role(role) -> RoleResponse:
    return RoleResponse(id=role.id, name=role.name)


def serialize_user(user) -> UserResponse:
    return UserResponse(
        id=user.id,
        login=user.login,
        fio=user.fio,
        roles=[serialize_role(role) for role in user.roles],
        created_at=user.created_at,
        updated_at=user.updated_at,
        is_deleted=user.is_deleted,
    )


def serialize_media(media) -> MediaResponse:
    return MediaResponse(
        id=media.id,
        original_name=media.original_name,
        file_type=media.file_type,
        file_size=media.file_size,
        duration=media.duration,
        created_at=media.created_at,
        file_path=media.file_path,
        storage_url=build_storage_url(media.file_path),
    )


def serialize_message(message) -> MessageResponse:
    return MessageResponse(
        id=message.id,
        user_id=message.user_id,
        user_login=message.user.login if getattr(message, "user", None) else None,
        user_fio=message.user.fio if getattr(message, "user", None) else None,
        host_id=message.host_id,
        text=message.text,
        status=message.status,
        created_at=message.created_at,
        updated_at=message.updated_at,
    )


def serialize_voice_message(voice_message) -> VoiceMessageResponse:
    return VoiceMessageResponse(
        id=voice_message.id,
        user_id=voice_message.user_id,
        user_login=voice_message.user.login if getattr(voice_message, "user", None) else None,
        user_fio=voice_message.user.fio if getattr(voice_message, "user", None) else None,
        host_id=voice_message.host_id,
        file_path=voice_message.file_path,
        storage_url=build_storage_url(voice_message.file_path),
        duration=voice_message.duration,
        created_at=voice_message.created_at,
    )


def serialize_playlist_item(*, item_id: int, media, order: int, added_at) -> PlaylistItemResponse:
    return PlaylistItemResponse(
        id=item_id,
        media_id=media.id,
        original_name=media.original_name,
        file_type=media.file_type,
        file_size=media.file_size,
        duration=media.duration,
        order=order,
        file_path=media.file_path,
        storage_url=build_storage_url(media.file_path),
        added_at=added_at,
    )


def serialize_playlist(playlist, playlist_items_data: list[dict]) -> PlaylistResponse:
    items = [
        serialize_playlist_item(
            item_id=item["id"],
            media=item["media"],
            order=item["order"],
            added_at=item["added_at"],
        )
        for item in playlist_items_data
    ]
    return PlaylistResponse(
        id=playlist.id,
        name=playlist.name,
        is_looping=playlist.is_looping,
        is_shuffle=playlist.is_shuffle,
        is_active=playlist.is_active,
        items=items,
        created_at=playlist.created_at,
        updated_at=playlist.updated_at,
        total_duration=sum(media_item.duration for media_item in items),
    )


def serialize_broadcast_status(state, playlist_items_data: list[dict]) -> BroadcastStatusResponse:
    items = [
        serialize_playlist_item(
            item_id=item["id"],
            media=item["media"],
            order=item["order"],
            added_at=item["added_at"],
        )
        for item in playlist_items_data
    ]
    current_media = serialize_media(state.current_media) if state and state.current_media else None
    playlist = state.playlist if state else None
    server_time = datetime.utcnow() if state else None
    position_seconds = 0.0

    if state and state.is_broadcasting and state.started_at and current_media:
        reference_time = state.paused_at if state.is_paused and state.paused_at else server_time
        position_seconds = max((reference_time - state.started_at).total_seconds(), 0.0)
        if current_media.duration > 0:
            position_seconds = min(position_seconds, current_media.duration)

    return BroadcastStatusResponse(
        is_broadcasting=bool(state and state.is_broadcasting),
        is_paused=bool(state and state.is_paused),
        current_media=current_media,
        is_video=bool(current_media and current_media.file_type == "video"),
        playlist=items,
        is_looping=bool(playlist and playlist.is_looping),
        is_shuffle=bool(playlist and playlist.is_shuffle),
        playlist_id=state.playlist_id if state else None,
        host_id=state.host_id if state else None,
        volume=state.volume if state else 1.0,
        mode=state.source_type if state else "playlist",
        started_at=state.started_at if state else None,
        position_seconds=position_seconds,
        server_time=server_time,
        server_timestamp_ms=server_time.timestamp() * 1000 if server_time else 0.0,
    )
