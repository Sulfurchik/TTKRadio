from pathlib import Path
from uuid import uuid4

import aiofiles
from fastapi import HTTPException, UploadFile, status
from mutagen import File as MutagenFile
from mutagen.mp3 import MP3
from mutagen.oggvorbis import OggVorbis
from mutagen.wave import WAVE

from config.settings import settings


CHUNK_SIZE = 1024 * 1024
INVALID_DISPLAY_NAME_CHARS = {'/', '\\', '\x00', '\n', '\r', '\t'}


def storage_root() -> Path:
    root = Path(settings.STORAGE_PATH)
    root.mkdir(parents=True, exist_ok=True)
    return root


def ensure_storage_structure() -> None:
    for folder_name in ("audio", "video", "voice_messages"):
        (storage_root() / folder_name).mkdir(parents=True, exist_ok=True)


def build_storage_url(relative_path: str) -> str:
    return f"/storage/{relative_path}"


def resolve_storage_path(relative_path: str) -> Path:
    return storage_root() / relative_path


def get_file_extension(filename: str | None) -> str:
    if not filename or "." not in filename:
        return ""
    return filename.rsplit(".", maxsplit=1)[-1].lower()


def sanitize_display_name(filename: str | None, *, fallback: str = "file") -> str:
    cleaned = (filename or "").strip()
    if not cleaned:
        return fallback

    cleaned = "".join(char for char in cleaned if char not in INVALID_DISPLAY_NAME_CHARS)
    cleaned = " ".join(cleaned.split())
    cleaned = cleaned.lstrip(".")

    if not cleaned:
        return fallback

    return cleaned[:255]


async def save_upload_file(
    upload_file: UploadFile,
    *,
    folder_name: str,
    allowed_extensions: set[str],
    max_size_bytes: int,
) -> tuple[str, int, str]:
    if not upload_file.filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Файл не выбран")

    extension = get_file_extension(upload_file.filename)
    if extension not in allowed_extensions:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Неподдерживаемый формат")

    target_dir = storage_root() / folder_name
    target_dir.mkdir(parents=True, exist_ok=True)
    target_path = target_dir / f"{uuid4()}.{extension}"

    current_size = 0
    try:
        async with aiofiles.open(target_path, "wb") as buffer:
            while True:
                chunk = await upload_file.read(CHUNK_SIZE)
                if not chunk:
                    break
                current_size += len(chunk)
                if current_size > max_size_bytes:
                    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Файл слишком большой")
                await buffer.write(chunk)
    except Exception:
        target_path.unlink(missing_ok=True)
        raise
    finally:
        await upload_file.close()

    return f"{folder_name}/{target_path.name}", current_size, extension


def delete_storage_file(relative_path: str) -> None:
    resolve_storage_path(relative_path).unlink(missing_ok=True)


def get_media_duration(relative_path: str) -> float:
    file_path = resolve_storage_path(relative_path)
    try:
        suffix = file_path.suffix.lower()
        if suffix == ".mp3":
            return float(MP3(file_path).info.length)
        if suffix == ".wav":
            return float(WAVE(file_path).info.length)
        if suffix == ".ogg":
            return float(OggVorbis(file_path).info.length)
        parsed_file = MutagenFile(file_path)
        if parsed_file is not None and getattr(parsed_file, "info", None) is not None:
            length = getattr(parsed_file.info, "length", None)
            if length is not None:
                return float(length)
    except Exception:
        return 0.0
    return 0.0
