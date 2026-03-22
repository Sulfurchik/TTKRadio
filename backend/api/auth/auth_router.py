from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.constants import RoleName
from app.database import get_db
from app.middleware.auth import get_current_user
from app.models import Role, User
from app.schemas import LoginRequest, LoginResponse, RegisterRequest, RegisterResponse, UserResponse
from app.services.auth import create_access_token, hash_password, verify_password
from app.services.rate_limit import build_rate_limit_key, get_request_client_ip, rate_limiter
from app.services.serializers import serialize_user
from config.settings import settings


router = APIRouter(prefix="/api/auth", tags=["Авторизация"])


@router.post("/login", response_model=LoginResponse)
async def login(payload: LoginRequest, request: Request, db: AsyncSession = Depends(get_db)):
    await rate_limiter.enforce(
        build_rate_limit_key("auth:login", get_request_client_ip(request), payload.login.strip().lower()),
        limit=settings.RATE_LIMIT_LOGIN_MAX,
        window_seconds=settings.RATE_LIMIT_WINDOW_SECONDS,
    )
    result = await db.execute(
        select(User)
        .where(User.login == payload.login)
        .where(User.is_deleted.is_(False))
        .options(selectinload(User.roles))
    )
    user = result.scalar_one_or_none()

    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный логин или пароль",
        )

    user.last_seen_at = datetime.utcnow()
    await db.commit()
    await db.refresh(user)

    access_token = create_access_token(data={"sub": str(user.id)})
    return LoginResponse(access_token=access_token, user=serialize_user(user))


@router.post("/register", response_model=RegisterResponse, status_code=status.HTTP_201_CREATED)
async def register(payload: RegisterRequest, request: Request, db: AsyncSession = Depends(get_db)):
    await rate_limiter.enforce(
        build_rate_limit_key("auth:register", get_request_client_ip(request), payload.login.strip().lower()),
        limit=settings.RATE_LIMIT_REGISTER_MAX,
        window_seconds=settings.RATE_LIMIT_WINDOW_SECONDS,
    )

    existing_user = await db.execute(select(User).where(User.login == payload.login))
    if existing_user.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Пользователь с таким логином уже существует",
        )

    role_result = await db.execute(select(Role).where(Role.name == RoleName.USER.value))
    user_role = role_result.scalar_one_or_none()
    if user_role is None:
        user_role = Role(name=RoleName.USER.value)
        db.add(user_role)
        await db.commit()
        await db.refresh(user_role)

    user = User(
        login=payload.login,
        fio=payload.fio,
        password_hash=hash_password(payload.password),
        roles=[user_role],
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    created_user = await db.execute(
        select(User)
        .where(User.id == user.id)
        .options(selectinload(User.roles))
    )
    user_result = created_user.scalar_one()

    return RegisterResponse(
        message="Пользователь успешно зарегистрирован",
        user=serialize_user(user_result),
    )


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    current_user.last_seen_at = datetime.utcnow()
    await db.commit()
    await db.refresh(current_user)
    return serialize_user(current_user)


@router.post("/presence", response_model=UserResponse)
async def update_presence(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    current_user.last_seen_at = datetime.utcnow()
    await db.commit()
    await db.refresh(current_user)
    return serialize_user(current_user)


@router.post("/presence/offline", response_model=UserResponse)
async def mark_offline(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    current_user.last_seen_at = None
    await db.commit()
    await db.refresh(current_user)
    return serialize_user(current_user)
