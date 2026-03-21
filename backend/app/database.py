from typing import AsyncGenerator

from sqlalchemy import event, inspect, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from config.settings import settings
from app.models import Base

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    pool_pre_ping=True,
)
async_session_maker = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


if settings.DATABASE_URL.startswith("sqlite"):
    @event.listens_for(engine.sync_engine, "connect")
    def configure_sqlite(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.close()


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.run_sync(ensure_broadcast_state_columns)


def ensure_broadcast_state_columns(sync_conn):
    inspector = inspect(sync_conn)
    column_names = {column["name"] for column in inspector.get_columns("broadcast_states")}

    if "is_paused" not in column_names:
        sync_conn.execute(
            text("ALTER TABLE broadcast_states ADD COLUMN is_paused BOOLEAN NOT NULL DEFAULT 0")
        )

    if "paused_at" not in column_names:
        sync_conn.execute(
            text("ALTER TABLE broadcast_states ADD COLUMN paused_at DATETIME NULL")
        )


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_maker() as session:
        try:
            yield session
        finally:
            await session.close()
