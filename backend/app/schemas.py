from datetime import datetime
import re
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.constants import BroadcastMode, MESSAGE_STATUSES


LOGIN_PATTERN = re.compile(r"^[A-Za-z]+$")
FIO_PATTERN = re.compile(r"^[А-Яа-яЁё\s-]+$")


def _validate_ascii_password(value: str) -> str:
    if not value:
        raise ValueError("Пароль обязателен")
    if any(ord(char) < 33 or ord(char) > 126 for char in value):
        raise ValueError("Пароль может содержать только латинские буквы, цифры и символы")
    return value


class BaseSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class OperationResponse(BaseSchema):
    message: str


class RoleResponse(BaseSchema):
    id: int
    name: str


class UserResponse(BaseSchema):
    id: int
    login: str
    fio: str
    roles: List[RoleResponse]
    created_at: datetime
    updated_at: datetime
    is_deleted: bool


class LoginRequest(BaseModel):
    login: str = Field(..., min_length=1, max_length=50)
    password: str = Field(..., min_length=1, max_length=100)


class LoginResponse(BaseSchema):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class RegisterRequest(BaseModel):
    login: str = Field(..., min_length=1, max_length=50)
    fio: str = Field(..., min_length=1, max_length=150)
    password: str = Field(..., min_length=4, max_length=100)
    password_confirm: str = Field(..., min_length=4, max_length=100)

    @field_validator("login")
    @classmethod
    def validate_login(cls, value: str) -> str:
        if not LOGIN_PATTERN.fullmatch(value):
            raise ValueError("Логин должен содержать только латинские буквы")
        return value

    @field_validator("fio")
    @classmethod
    def validate_fio(cls, value: str) -> str:
        if not FIO_PATTERN.fullmatch(value.strip()):
            raise ValueError("ФИО должно содержать только русские буквы")
        return value.strip()

    @field_validator("password", "password_confirm")
    @classmethod
    def validate_passwords(cls, value: str) -> str:
        return _validate_ascii_password(value)

    @model_validator(mode="after")
    def ensure_passwords_match(self):
        if self.password != self.password_confirm:
            raise ValueError("Пароли не совпадают")
        return self


class RegisterResponse(BaseSchema):
    message: str
    user: UserResponse


class UserUpdateRequest(BaseModel):
    login: Optional[str] = Field(None, min_length=1, max_length=50)
    fio: Optional[str] = Field(None, min_length=1, max_length=150)
    is_deleted: Optional[bool] = None

    @field_validator("login")
    @classmethod
    def validate_login(cls, value: Optional[str]) -> Optional[str]:
        if value and not LOGIN_PATTERN.fullmatch(value):
            raise ValueError("Логин должен содержать только латинские буквы")
        return value

    @field_validator("fio")
    @classmethod
    def validate_fio(cls, value: Optional[str]) -> Optional[str]:
        if value and not FIO_PATTERN.fullmatch(value.strip()):
            raise ValueError("ФИО должно содержать только русские буквы")
        return value.strip() if value else value


class ChangePasswordRequest(BaseModel):
    new_password: str = Field(..., min_length=4, max_length=100)
    new_password_confirm: str = Field(..., min_length=4, max_length=100)

    @field_validator("new_password", "new_password_confirm")
    @classmethod
    def validate_password(cls, value: str) -> str:
        return _validate_ascii_password(value)

    @model_validator(mode="after")
    def ensure_passwords_match(self):
        if self.new_password != self.new_password_confirm:
            raise ValueError("Пароли не совпадают")
        return self


class AssignRolesRequest(BaseModel):
    role_ids: List[int] = Field(..., min_length=1)

    @field_validator("role_ids")
    @classmethod
    def normalize_role_ids(cls, value: List[int]) -> List[int]:
        role_ids = list(dict.fromkeys(value))
        if not role_ids:
            raise ValueError("Нужно выбрать хотя бы одну роль")
        return role_ids


class MessageCreateRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=1000)

    @field_validator("text")
    @classmethod
    def validate_text(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Сообщение не может быть пустым")
        return cleaned


class MessageResponse(BaseSchema):
    id: int
    user_id: Optional[int]
    user_login: Optional[str]
    user_fio: Optional[str]
    host_id: Optional[int]
    text: str
    status: str
    created_at: datetime
    updated_at: datetime


class MessageStatusUpdateRequest(BaseModel):
    status: str

    @field_validator("status")
    @classmethod
    def validate_status(cls, value: str) -> str:
        if value not in MESSAGE_STATUSES:
            raise ValueError("Неверный статус сообщения")
        return value


class MediaResponse(BaseSchema):
    id: int
    original_name: str
    file_type: str
    file_size: int
    duration: float
    created_at: datetime
    file_path: str
    storage_url: str


class VoiceMessageResponse(BaseSchema):
    id: int
    user_id: Optional[int]
    user_login: Optional[str]
    user_fio: Optional[str]
    host_id: Optional[int]
    file_path: str
    storage_url: str
    duration: float
    created_at: datetime


class PlaylistItemResponse(BaseSchema):
    id: int
    media_id: int
    original_name: str
    file_type: str
    file_size: int
    duration: float
    order: int
    file_path: str
    storage_url: str
    added_at: datetime


class PlaylistResponse(BaseSchema):
    id: int
    name: str
    is_looping: bool
    is_shuffle: bool
    is_active: bool
    items: List[PlaylistItemResponse]
    created_at: datetime
    updated_at: datetime
    total_duration: float


class PlaylistCreateRequest(BaseModel):
    name: str = Field(default="Основной плейлист", min_length=1, max_length=100)

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Название плейлиста не может быть пустым")
        return cleaned


class PlaylistAddItemRequest(BaseModel):
    media_id: int
    order: Optional[int] = Field(default=None, ge=0)


class PlaylistReorderRequest(BaseModel):
    item_ids: List[int] = Field(..., min_length=1)


class BroadcastStartRequest(BaseModel):
    playlist_id: Optional[int] = None


class BroadcastVolumeRequest(BaseModel):
    volume: float = Field(..., ge=0, le=1)


class BroadcastMediaSelectRequest(BaseModel):
    media_id: int


class BroadcastStatusResponse(BaseSchema):
    is_broadcasting: bool
    current_media: Optional[MediaResponse]
    is_video: bool
    playlist: List[PlaylistItemResponse] = Field(default_factory=list)
    is_looping: bool = False
    is_shuffle: bool = False
    playlist_id: Optional[int] = None
    host_id: Optional[int] = None
    volume: float = 1.0
    mode: str = BroadcastMode.PLAYLIST.value
    started_at: Optional[datetime] = None
    position_seconds: float = 0.0
    server_time: Optional[datetime] = None
    server_timestamp_ms: float = 0.0


class StreamResponse(BaseSchema):
    stream_url: Optional[str]
    websocket_url: Optional[str]
    is_broadcasting: bool
    current_media: Optional[MediaResponse]
    playlist: List[PlaylistItemResponse] = Field(default_factory=list)
    is_looping: bool = False
    is_shuffle: bool = False
    started_at: Optional[datetime] = None
    position_seconds: float = 0.0
    server_time: Optional[datetime] = None
    server_timestamp_ms: float = 0.0
