from enum import StrEnum


class RoleName(StrEnum):
    USER = "Пользователь"
    HOST = "Ведущий"
    ADMIN = "Администратор"


class MessageStatus(StrEnum):
    NEW = "new"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"


class MediaType(StrEnum):
    AUDIO = "audio"
    VIDEO = "video"


class BroadcastMode(StrEnum):
    PLAYLIST = "playlist"
    LIVE_AUDIO = "live_audio"
    LIVE_VIDEO = "live_video"


DEFAULT_ROLES = tuple(role.value for role in RoleName)
MESSAGE_STATUSES = tuple(status.value for status in MessageStatus)
VOICE_MESSAGE_EXTENSIONS = ("mp3", "wav", "ogg", "webm")
