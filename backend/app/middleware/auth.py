from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.constants import RoleName
from app.database import get_db
from app.models import User
from app.services.auth import decode_access_token


security = HTTPBearer(auto_error=False)


def user_has_role(user: User, *role_names: str) -> bool:
    user_roles = {role.name for role in user.roles}
    return any(role_name in user_roles for role_name in role_names)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Требуется авторизация",
        )

    try:
        payload = decode_access_token(credentials.credentials)
    except JWTError as error:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный токен",
        ) from error

    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный токен",
        )

    result = await db.execute(
        select(User)
        .where(User.id == int(user_id))
        .where(User.is_deleted.is_(False))
        .options(selectinload(User.roles))
    )
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Пользователь не найден",
        )
    return user


def require_role(*role_names: str):
    async def role_checker(current_user: User = Depends(get_current_user)) -> User:
        if not user_has_role(current_user, *role_names):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Недостаточно прав",
            )
        return current_user

    return role_checker


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if not user_has_role(current_user, RoleName.ADMIN.value):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Требуется роль Администратор",
        )
    return current_user


def require_host(current_user: User = Depends(get_current_user)) -> User:
    if not user_has_role(current_user, RoleName.HOST.value, RoleName.ADMIN.value):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Требуется роль Ведущий или Администратор",
        )
    return current_user
