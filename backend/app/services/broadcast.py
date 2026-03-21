import random
from datetime import datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import selectinload

from app.constants import BroadcastMode
from app.models import BroadcastHistory, BroadcastState, MediaLibrary, Playlist, playlist_items


async def get_playlist_items(db, playlist_id: int) -> list[dict]:
    result = await db.execute(
        select(
            playlist_items.c.id,
            playlist_items.c.order,
            playlist_items.c.added_at,
            MediaLibrary,
        )
        .join(MediaLibrary, MediaLibrary.id == playlist_items.c.media_id)
        .where(playlist_items.c.playlist_id == playlist_id)
        .order_by(playlist_items.c.order.asc(), playlist_items.c.id.asc())
    )

    return [
        {
            "id": item_id,
            "order": item_order or 0,
            "added_at": added_at,
            "media": media,
        }
        for item_id, item_order, added_at, media in result.all()
    ]


async def get_next_playlist_order(db, playlist_id: int) -> int:
    result = await db.execute(
        select(func.coalesce(func.max(playlist_items.c.order), -1))
        .where(playlist_items.c.playlist_id == playlist_id)
    )
    return int(result.scalar_one()) + 1


async def insert_playlist_item(db, playlist_id: int, media_id: int, order: int | None = None) -> None:
    if order is None:
        order = await get_next_playlist_order(db, playlist_id)
    else:
        await db.execute(
            update(playlist_items)
            .where(playlist_items.c.playlist_id == playlist_id)
            .where(playlist_items.c.order >= order)
            .values(order=playlist_items.c.order + 1)
        )

    await db.execute(
        playlist_items.insert().values(
            playlist_id=playlist_id,
            media_id=media_id,
            order=order,
            added_at=datetime.utcnow(),
        )
    )


async def compact_playlist_order(db, playlist_id: int) -> None:
    result = await db.execute(
        select(playlist_items.c.id)
        .where(playlist_items.c.playlist_id == playlist_id)
        .order_by(playlist_items.c.order.asc(), playlist_items.c.id.asc())
    )
    for new_order, (item_id,) in enumerate(result.all()):
        await db.execute(
            update(playlist_items)
            .where(playlist_items.c.id == item_id)
            .values(order=new_order)
        )


async def remove_playlist_item(db, playlist_id: int, item_id: int) -> bool:
    result = await db.execute(
        delete(playlist_items)
        .where(playlist_items.c.playlist_id == playlist_id)
        .where(playlist_items.c.id == item_id)
    )
    if result.rowcount:
        await compact_playlist_order(db, playlist_id)
        return True
    return False


async def reorder_playlist_items(db, playlist_id: int, item_ids: list[int]) -> None:
    existing = await db.execute(
        select(playlist_items.c.id)
        .where(playlist_items.c.playlist_id == playlist_id)
        .order_by(playlist_items.c.order.asc(), playlist_items.c.id.asc())
    )
    existing_ids = [item_id for (item_id,) in existing.all()]
    if sorted(existing_ids) != sorted(item_ids):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Передан неполный или некорректный набор элементов плейлиста",
        )

    for new_order, item_id in enumerate(item_ids):
        await db.execute(
            update(playlist_items)
            .where(playlist_items.c.id == item_id)
            .values(order=new_order)
        )


async def get_or_create_broadcast_state(db, host_id: int) -> BroadcastState:
    result = await db.execute(
        select(BroadcastState)
        .where(BroadcastState.host_id == host_id)
        .options(
            selectinload(BroadcastState.playlist),
            selectinload(BroadcastState.current_media),
        )
    )
    state = result.scalar_one_or_none()
    if state:
        return state

    state = BroadcastState(host_id=host_id)
    db.add(state)
    await db.flush()
    return state


async def get_playlist_for_host(db, playlist_id: int, host_id: int) -> Playlist | None:
    result = await db.execute(
        select(Playlist)
        .where(Playlist.id == playlist_id)
        .where(Playlist.user_id == host_id)
    )
    return result.scalar_one_or_none()


async def get_active_playlist_for_host(db, host_id: int) -> Playlist | None:
    result = await db.execute(
        select(Playlist)
        .where(Playlist.user_id == host_id)
        .where(Playlist.is_active.is_(True))
    )
    return result.scalar_one_or_none()


async def activate_playlist_for_host(db, host_id: int, playlist_id: int) -> Playlist:
    playlist = await get_playlist_for_host(db, playlist_id, host_id)
    if not playlist:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Плейлист не найден")

    await db.execute(
        update(Playlist)
        .where(Playlist.user_id == host_id)
        .values(is_active=False, updated_at=datetime.utcnow())
    )
    playlist.is_active = True
    playlist.updated_at = datetime.utcnow()
    await db.flush()
    return playlist


async def sync_broadcast_state(db, state: BroadcastState) -> list[dict]:
    state_changed = False

    if not state.playlist_id:
        if state.current_media_id is not None:
            state.current_media_id = None
            state_changed = True
        if state.started_at is not None:
            state.started_at = None
            state_changed = True
        if state.paused_at is not None:
            state.paused_at = None
            state_changed = True
        if state.is_paused:
            state.is_paused = False
            state_changed = True
        if state.is_broadcasting:
            state.is_broadcasting = False
            state_changed = True

        if state_changed:
            state.updated_at = datetime.utcnow()
            await db.flush()
            await db.refresh(state, attribute_names=["playlist", "current_media"])
        return []

    items = await get_playlist_items(db, state.playlist_id)
    media_ids = [item["media"].id for item in items]

    if not items:
        if state.current_media_id is not None:
            state.current_media_id = None
            state_changed = True
        if state.started_at is not None:
            state.started_at = None
            state_changed = True
        if state.paused_at is not None:
            state.paused_at = None
            state_changed = True
        if state.is_paused:
            state.is_paused = False
            state_changed = True
        if state.is_broadcasting:
            state.is_broadcasting = False
            state_changed = True
    elif state.is_broadcasting and state.current_media_id is None:
        state.current_media_id = items[0]["media"].id
        state_changed = True
    elif state.current_media_id is not None and state.current_media_id not in media_ids:
        state.current_media_id = items[0]["media"].id if state.is_broadcasting else None
        if not state.is_broadcasting:
            state.started_at = None
            state.paused_at = None
            state.is_paused = False
        state_changed = True

    if state_changed:
        state.updated_at = datetime.utcnow()
        await db.flush()
        await db.refresh(state, attribute_names=["playlist", "current_media"])

    return items


async def stop_other_broadcasts(db, current_host_id: int) -> None:
    now = datetime.utcnow()
    await db.execute(
        update(BroadcastState)
        .where(BroadcastState.host_id != current_host_id)
        .where(BroadcastState.is_broadcasting.is_(True))
        .values(
            is_broadcasting=False,
            is_paused=False,
            current_media_id=None,
            started_at=None,
            paused_at=None,
            updated_at=now,
        )
    )


def resolve_next_index(items: list[dict], current_index: int, playlist) -> int | None:
    if playlist and playlist.is_shuffle and len(items) > 1:
        choices = [index for index in range(len(items)) if index != current_index]
        return random.choice(choices)
    if current_index + 1 < len(items):
        return current_index + 1
    if playlist and playlist.is_looping:
        return 0
    return None


def resolve_previous_index(items: list[dict], current_index: int, playlist) -> int | None:
    if current_index > 0:
        return current_index - 1
    if playlist and playlist.is_looping and items:
        return len(items) - 1
    if items:
        return 0
    return None


async def create_history_entry(db, state: BroadcastState) -> None:
    if not state.current_media_id:
        return
    db.add(
        BroadcastHistory(
            host_id=state.host_id,
            media_id=state.current_media_id,
            played_at=datetime.utcnow(),
            duration=state.current_media.duration if state.current_media else 0,
        )
    )


async def progress_broadcast_if_needed(db, state: BroadcastState) -> list[dict]:
    items = await sync_broadcast_state(db, state)
    if (
        not state.is_broadcasting
        or state.is_paused
        or not state.started_at
        or not items
        or not state.current_media_id
    ):
        return items

    now = datetime.utcnow()
    remaining_elapsed = max((now - state.started_at).total_seconds(), 0.0)
    current_index = next(
        (index for index, item in enumerate(items) if item["media"].id == state.current_media_id),
        None,
    )
    if current_index is None:
        current_index = 0
        state.current_media_id = items[0]["media"].id
        state.started_at = now
        state.is_paused = False
        state.paused_at = None
        state.updated_at = now
        await db.flush()
        await db.refresh(state, attribute_names=["playlist", "current_media"])
        return items

    has_track_changed = False
    while state.is_broadcasting:
        current_media = items[current_index]["media"]
        if current_media.duration <= 0:
            break
        if remaining_elapsed < current_media.duration:
            break

        remaining_elapsed -= current_media.duration
        next_index = resolve_next_index(items, current_index, state.playlist)
        if next_index is None:
            state.is_broadcasting = False
            state.is_paused = False
            state.current_media_id = None
            state.started_at = None
            state.paused_at = None
            state.updated_at = now
            await db.flush()
            await db.refresh(state, attribute_names=["playlist", "current_media"])
            return items

        current_index = next_index
        has_track_changed = True

    if has_track_changed:
        state.current_media_id = items[current_index]["media"].id
        state.started_at = now - timedelta(seconds=remaining_elapsed)
        state.is_paused = False
        state.paused_at = None
        state.updated_at = now
        await db.flush()
        await db.refresh(state, attribute_names=["playlist", "current_media"])
        await create_history_entry(db, state)

    return items


async def start_playlist_broadcast(db, host_id: int, playlist_id: int | None = None) -> tuple[BroadcastState, list[dict]]:
    playlist = await activate_playlist_for_host(db, host_id, playlist_id) if playlist_id else await get_active_playlist_for_host(db, host_id)
    if not playlist:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Сначала создайте и активируйте плейлист",
        )

    items = await get_playlist_items(db, playlist.id)
    if not items:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Нельзя запустить пустой плейлист",
        )

    state = await get_or_create_broadcast_state(db, host_id)
    await stop_other_broadcasts(db, host_id)
    state.playlist_id = playlist.id
    state.source_type = BroadcastMode.PLAYLIST.value
    state.is_broadcasting = True
    state.is_paused = False
    state.started_at = datetime.utcnow()
    state.paused_at = None
    if state.current_media_id not in [item["media"].id for item in items]:
        state.current_media_id = items[0]["media"].id
    state.updated_at = datetime.utcnow()
    await db.flush()
    await db.refresh(state, attribute_names=["playlist", "current_media"])
    await create_history_entry(db, state)
    return state, items


async def stop_broadcast(db, host_id: int) -> BroadcastState:
    state = await get_or_create_broadcast_state(db, host_id)
    state.is_broadcasting = False
    state.is_paused = False
    state.current_media_id = None
    state.started_at = None
    state.paused_at = None
    state.updated_at = datetime.utcnow()
    await db.flush()
    await db.refresh(state, attribute_names=["playlist", "current_media"])
    return state


async def set_current_media(db, host_id: int, media_id: int) -> tuple[BroadcastState, list[dict]]:
    state = await get_or_create_broadcast_state(db, host_id)
    items = await sync_broadcast_state(db, state)
    if not items:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Активный плейлист пуст")

    media_ids = [item["media"].id for item in items]
    if media_id not in media_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Файл не входит в активный плейлист",
        )

    await stop_other_broadcasts(db, host_id)
    state.current_media_id = media_id
    state.is_broadcasting = True
    state.is_paused = False
    state.started_at = datetime.utcnow()
    state.paused_at = None
    state.updated_at = datetime.utcnow()
    await db.flush()
    await db.refresh(state, attribute_names=["playlist", "current_media"])
    await create_history_entry(db, state)
    return state, items


async def advance_playlist(db, host_id: int) -> tuple[BroadcastState, list[dict]]:
    state = await get_or_create_broadcast_state(db, host_id)
    items = await sync_broadcast_state(db, state)
    if not items:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Активный плейлист пуст")

    current_index = next(
        (index for index, item in enumerate(items) if item["media"].id == state.current_media_id),
        0,
    )

    next_index = resolve_next_index(items, current_index, state.playlist)
    if next_index is None:
        state.is_broadcasting = False
        state.is_paused = False
        state.current_media_id = None
        state.started_at = None
        state.paused_at = None
        state.updated_at = datetime.utcnow()
        await db.flush()
        await db.refresh(state, attribute_names=["playlist", "current_media"])
        return state, items

    await stop_other_broadcasts(db, host_id)
    state.current_media_id = items[next_index]["media"].id
    state.is_broadcasting = True
    state.is_paused = False
    state.started_at = datetime.utcnow()
    state.paused_at = None
    state.updated_at = datetime.utcnow()
    await db.flush()
    await db.refresh(state, attribute_names=["playlist", "current_media"])
    await create_history_entry(db, state)
    return state, items


async def rewind_playlist(db, host_id: int) -> tuple[BroadcastState, list[dict]]:
    state = await get_or_create_broadcast_state(db, host_id)
    items = await sync_broadcast_state(db, state)
    if not items:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Активный плейлист пуст")

    current_index = next(
        (index for index, item in enumerate(items) if item["media"].id == state.current_media_id),
        0,
    )

    previous_index = resolve_previous_index(items, current_index, state.playlist)
    if previous_index is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Предыдущий трек недоступен")

    await stop_other_broadcasts(db, host_id)
    state.current_media_id = items[previous_index]["media"].id
    state.is_broadcasting = True
    state.is_paused = False
    state.started_at = datetime.utcnow()
    state.paused_at = None
    state.updated_at = datetime.utcnow()
    await db.flush()
    await db.refresh(state, attribute_names=["playlist", "current_media"])
    await create_history_entry(db, state)
    return state, items


async def get_public_broadcast_state(db) -> tuple[BroadcastState | None, list[dict]]:
    result = await db.execute(
        select(BroadcastState)
        .where(BroadcastState.is_broadcasting.is_(True))
        .options(
            selectinload(BroadcastState.playlist),
            selectinload(BroadcastState.current_media),
        )
        .order_by(BroadcastState.updated_at.desc(), BroadcastState.started_at.desc(), BroadcastState.id.desc())
    )
    states = result.scalars().all()
    if not states:
        return None, []

    state = states[0]
    if len(states) > 1:
        now = datetime.utcnow()
        for stale_state in states[1:]:
            stale_state.is_broadcasting = False
            stale_state.is_paused = False
            stale_state.current_media_id = None
            stale_state.started_at = None
            stale_state.paused_at = None
            stale_state.updated_at = now
        await db.flush()

    items = await progress_broadcast_if_needed(db, state)
    return state, items


async def cleanup_media_references(db, host_id: int, media_id: int) -> None:
    await db.execute(delete(playlist_items).where(playlist_items.c.media_id == media_id))

    state = await get_or_create_broadcast_state(db, host_id)
    if state.current_media_id == media_id:
        items = await sync_broadcast_state(db, state)
        if not items:
            state.is_broadcasting = False
            state.is_paused = False
            state.started_at = None
            state.paused_at = None
            state.updated_at = datetime.utcnow()
        await db.flush()


async def cleanup_playlist_references(db, host_id: int, playlist_id: int) -> None:
    state = await get_or_create_broadcast_state(db, host_id)
    if state.playlist_id == playlist_id:
        state.playlist_id = None
        state.current_media_id = None
        state.is_broadcasting = False
        state.is_paused = False
        state.started_at = None
        state.paused_at = None
        state.updated_at = datetime.utcnow()
        await db.flush()


async def pause_current_media(db, host_id: int) -> tuple[BroadcastState, list[dict]]:
    state = await get_or_create_broadcast_state(db, host_id)
    items = await sync_broadcast_state(db, state)
    if not state.is_broadcasting or not state.current_media_id or not state.started_at:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Эфир не запущен")
    if state.is_paused:
        return state, items

    state.is_paused = True
    state.paused_at = datetime.utcnow()
    state.updated_at = state.paused_at
    await db.flush()
    await db.refresh(state, attribute_names=["playlist", "current_media"])
    return state, items


async def resume_current_media(db, host_id: int) -> tuple[BroadcastState, list[dict]]:
    state = await get_or_create_broadcast_state(db, host_id)
    items = await sync_broadcast_state(db, state)
    if not state.is_broadcasting or not state.current_media_id or not state.started_at:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Эфир не запущен")
    if not state.is_paused:
        return state, items

    now = datetime.utcnow()
    if state.paused_at:
        state.started_at = state.started_at + (now - state.paused_at)
    state.is_paused = False
    state.paused_at = None
    state.updated_at = now
    await db.flush()
    await db.refresh(state, attribute_names=["playlist", "current_media"])
    return state, items


async def finish_current_media(db, host_id: int) -> tuple[BroadcastState, list[dict]]:
    state = await get_or_create_broadcast_state(db, host_id)
    items = await sync_broadcast_state(db, state)
    if not items:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Активный плейлист пуст")

    current_index = next(
        (index for index, item in enumerate(items) if item["media"].id == state.current_media_id),
        None,
    )
    if current_index is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Текущий файл не найден в плейлисте")

    next_index = resolve_next_index(items, current_index, state.playlist)
    if next_index is None:
        state.is_broadcasting = False
        state.is_paused = False
        state.current_media_id = None
        state.started_at = None
        state.paused_at = None
        state.updated_at = datetime.utcnow()
        await db.flush()
        await db.refresh(state, attribute_names=["playlist", "current_media"])
        return state, items

    await stop_other_broadcasts(db, host_id)
    state.current_media_id = items[next_index]["media"].id
    state.is_broadcasting = True
    state.is_paused = False
    state.started_at = datetime.utcnow()
    state.paused_at = None
    state.updated_at = datetime.utcnow()
    await db.flush()
    await db.refresh(state, attribute_names=["playlist", "current_media"])
    await create_history_entry(db, state)
    return state, items
