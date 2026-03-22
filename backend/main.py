import logging
from datetime import datetime

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select, text
from sqlalchemy.orm import selectinload

from api.admin.admin_router import router as admin_router
from api.auth.auth_router import router as auth_router
from api.host.host_router import router as host_router
from api.player.player_router import router as player_router
from api.stream.stream_router import router as stream_router
from app.constants import DEFAULT_ROLES, RoleName
from app.database import async_session_maker, init_db
from app.models import Role, User
from app.services.auth import hash_password
from app.services.media import ensure_storage_structure, storage_root
from config.settings import settings


logger = logging.getLogger(__name__)

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Система управления потоковым вещанием",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ensure_storage_structure()
app.mount("/storage/audio", StaticFiles(directory=storage_root() / "audio"), name="storage-audio")
app.mount("/storage/video", StaticFiles(directory=storage_root() / "video"), name="storage-video")

app.include_router(auth_router)
app.include_router(admin_router)
app.include_router(player_router)
app.include_router(host_router)
app.include_router(stream_router)


@app.on_event("startup")
async def startup_event():
    await init_db()
    await create_default_roles()
    await create_default_admin()


async def create_default_roles() -> None:
    async with async_session_maker() as session:
        existing_roles = await session.execute(select(Role))
        existing_role_names = {role.name for role in existing_roles.scalars().all()}

        for role_name in DEFAULT_ROLES:
            if role_name not in existing_role_names:
                session.add(Role(name=role_name))
        await session.commit()


async def create_default_admin() -> None:
    async with async_session_maker() as session:
        roles_result = await session.execute(select(Role))
        roles_by_name = {role.name: role for role in roles_result.scalars().all()}
        admin_role = roles_by_name.get(RoleName.ADMIN.value)
        host_role = roles_by_name.get(RoleName.HOST.value)
        if admin_role is None or host_role is None:
            return

        active_admin_result = await session.execute(
            select(User)
            .where(User.is_deleted.is_(False))
            .where(User.roles.any(Role.name == RoleName.ADMIN.value))
            .options(selectinload(User.roles))
        )
        active_admin = active_admin_result.scalar_one_or_none()
        if active_admin:
            return

        login_result = await session.execute(
            select(User)
            .where(User.login == settings.DEFAULT_ADMIN_LOGIN)
            .options(selectinload(User.roles))
        )
        admin_user = login_result.scalar_one_or_none()

        if admin_user is None:
            admin_user = User(
                login=settings.DEFAULT_ADMIN_LOGIN,
                fio=settings.DEFAULT_ADMIN_FIO,
                password_hash=hash_password(settings.DEFAULT_ADMIN_PASSWORD),
                is_deleted=False,
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow(),
                roles=[],
            )
            session.add(admin_user)
            await session.flush()
        else:
            admin_user.fio = settings.DEFAULT_ADMIN_FIO
            admin_user.is_deleted = False
            admin_user.updated_at = datetime.utcnow()

        await session.refresh(admin_user, attribute_names=["roles"])
        role_names = {role.name for role in admin_user.roles}
        if RoleName.ADMIN.value not in role_names:
            admin_user.roles.append(admin_role)
        if RoleName.HOST.value not in role_names:
            admin_user.roles.append(host_role)
        if RoleName.USER.value in role_names:
            admin_user.roles = [role for role in admin_user.roles if role.name != RoleName.USER.value]

        await session.commit()


@app.get("/")
async def root():
    return {
        "name": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "status": "running",
    }


@app.get("/health")
async def health_check():
    return {"status": "healthy"}


@app.get("/health/ready")
async def readiness_check():
    checks = {
        "database": False,
        "storage": False,
    }

    try:
        async with async_session_maker() as session:
            await session.execute(text("SELECT 1"))
        checks["database"] = True
    except Exception:
        logger.warning("Readiness database check failed")

    try:
        root = storage_root()
        required_dirs = ("audio", "video", "voice_messages")
        checks["storage"] = all((root / directory_name).exists() for directory_name in required_dirs)
    except Exception:
        logger.warning("Readiness storage check failed")

    if all(checks.values()):
        return {"status": "ready", "checks": checks}

    return JSONResponse(status_code=503, content={"status": "not_ready", "checks": checks})
