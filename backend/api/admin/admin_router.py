from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.constants import RoleName
from app.database import get_db
from app.middleware.auth import require_admin
from app.models import BroadcastState, Playlist, Role, User
from app.schemas import (
    AssignRolesRequest,
    ChangePasswordRequest,
    OperationResponse,
    RoleResponse,
    UserResponse,
    UserUpdateRequest,
)
from app.services.auth import hash_password
from app.services.serializers import serialize_role, serialize_user


router = APIRouter(prefix="/api/admin", tags=["Администрирование"])


def user_query():
    return select(User).options(selectinload(User.roles))


def normalize_roles_for_assignment(selected_roles: list[Role]) -> list[Role]:
    roles_by_name = {role.name: role for role in selected_roles}

    if RoleName.ADMIN.value in roles_by_name:
        normalized_roles = [roles_by_name[RoleName.ADMIN.value]]
        if RoleName.HOST.value in roles_by_name:
            normalized_roles.append(roles_by_name[RoleName.HOST.value])
        return normalized_roles

    if RoleName.HOST.value in roles_by_name:
        return [roles_by_name[RoleName.HOST.value]]

    if RoleName.USER.value in roles_by_name:
        return [roles_by_name[RoleName.USER.value]]

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Выберите допустимую роль: Пользователь, Ведущий или Администратор",
    )


@router.get("/users", response_model=list[UserResponse])
async def get_all_users(
    login: Optional[str] = None,
    fio: Optional[str] = None,
    role_id: Optional[int] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    include_deleted: bool = Query(default=False),
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    query = user_query().order_by(User.created_at.desc(), User.id.desc())

    filters = []
    if not include_deleted:
        filters.append(User.is_deleted.is_(False))
    if login:
        filters.append(User.login.ilike(f"%{login.strip()}%"))
    if fio:
        filters.append(User.fio.ilike(f"%{fio.strip()}%"))
    if role_id:
        filters.append(User.roles.any(Role.id == role_id))
    if date_from:
        filters.append(User.created_at >= date_from)
    if date_to:
        filters.append(User.created_at <= date_to)

    if filters:
        query = query.where(and_(*filters))

    result = await db.execute(query)
    return [serialize_user(user) for user in result.scalars().all()]


@router.get("/users/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: int,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(user_query().where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Пользователь не найден")
    return serialize_user(user)


@router.put("/users/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: int,
    request: UserUpdateRequest,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(user_query().where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Пользователь не найден")

    if request.login and request.login != user.login:
        existing = await db.execute(select(User).where(User.login == request.login))
        existing_user = existing.scalar_one_or_none()
        if existing_user:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Логин уже занят")
        user.login = request.login

    if request.fio:
        user.fio = request.fio

    if request.is_deleted is not None:
        if request.is_deleted and user.id == current_user.id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Нельзя деактивировать самого себя")
        user.is_deleted = request.is_deleted
        if request.is_deleted:
            await db.execute(
                update(Playlist)
                .where(Playlist.user_id == user.id)
                .values(is_active=False, updated_at=datetime.utcnow())
            )
            await db.execute(
                update(BroadcastState)
                .where(BroadcastState.host_id == user.id)
                .values(
                    is_broadcasting=False,
                    current_media_id=None,
                    started_at=None,
                    updated_at=datetime.utcnow(),
                )
            )

    user.updated_at = datetime.utcnow()
    await db.commit()

    refreshed_user = await db.execute(user_query().where(User.id == user_id))
    return serialize_user(refreshed_user.scalar_one())


@router.delete("/users/{user_id}", response_model=OperationResponse)
async def delete_user(
    user_id: int,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    if user_id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Нельзя удалить самого себя")

    result = await db.execute(user_query().where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None or user.is_deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Пользователь не найден")

    user.is_deleted = True
    user.updated_at = datetime.utcnow()
    await db.execute(
        update(Playlist)
        .where(Playlist.user_id == user.id)
        .values(is_active=False, updated_at=datetime.utcnow())
    )
    await db.execute(
        update(BroadcastState)
        .where(BroadcastState.host_id == user.id)
        .values(
            is_broadcasting=False,
            current_media_id=None,
            started_at=None,
            updated_at=datetime.utcnow(),
        )
    )
    await db.commit()

    return OperationResponse(message="Пользователь удален")


@router.post("/users/{user_id}/password", response_model=OperationResponse)
async def change_user_password(
    user_id: int,
    request: ChangePasswordRequest,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == user_id).where(User.is_deleted.is_(False)))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Пользователь не найден")

    user.password_hash = hash_password(request.new_password)
    user.updated_at = datetime.utcnow()
    await db.commit()

    return OperationResponse(message="Пароль успешно изменен")


@router.post("/users/{user_id}/roles", response_model=UserResponse)
async def assign_roles(
    user_id: int,
    request: AssignRolesRequest,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(user_query().where(User.id == user_id).where(User.is_deleted.is_(False)))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Пользователь не найден")

    roles_result = await db.execute(select(Role).where(Role.id.in_(request.role_ids)))
    roles = roles_result.scalars().all()
    if len(roles) != len(request.role_ids):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Одна или несколько ролей не найдены",
        )

    roles = normalize_roles_for_assignment(roles)
    role_names = {role.name for role in roles}
    if user.id == current_user.id and RoleName.ADMIN.value not in role_names:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Нельзя снять роль администратора с самого себя",
        )

    user.roles = roles
    user.updated_at = datetime.utcnow()
    await db.commit()

    refreshed_user = await db.execute(user_query().where(User.id == user_id))
    return serialize_user(refreshed_user.scalar_one())


@router.get("/roles", response_model=list[RoleResponse])
async def get_all_roles(
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Role).order_by(Role.id.asc()))
    return [serialize_role(role) for role in result.scalars().all()]
