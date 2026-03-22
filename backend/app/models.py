from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Boolean, Table, Float
from sqlalchemy.orm import relationship, declarative_base
from datetime import datetime

Base = declarative_base()

# Таблица для связи многие-ко-многим пользователей и ролей
user_roles = Table(
    'user_roles',
    Base.metadata,
    Column('user_id', Integer, ForeignKey('users.id', ondelete='CASCADE')),
    Column('role_id', Integer, ForeignKey('roles.id', ondelete='CASCADE'))
)

# Таблица для связи плейлиста и медиа
playlist_items = Table(
    'playlist_items',
    Base.metadata,
    Column('id', Integer, primary_key=True),
    Column('playlist_id', Integer, ForeignKey('playlists.id', ondelete='CASCADE')),
    Column('media_id', Integer, ForeignKey('media_library.id', ondelete='CASCADE')),
    Column('order', Integer, default=0),
    Column('added_at', DateTime, default=datetime.utcnow)
)


class User(Base):
    __tablename__ = 'users'

    id = Column(Integer, primary_key=True)
    login = Column(String(50), unique=True, nullable=False, index=True)
    fio = Column(String(150), nullable=False)
    password_hash = Column(String(255), nullable=False)
    is_deleted = Column(Boolean, default=False)  # Soft delete
    last_seen_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Связи
    roles = relationship('Role', secondary=user_roles, back_populates='users')
    messages = relationship('Message', foreign_keys='Message.user_id', back_populates='user')
    host_messages = relationship('Message', foreign_keys='Message.host_id', back_populates='host')
    voice_messages = relationship('VoiceMessage', foreign_keys='VoiceMessage.user_id', back_populates='user')
    host_voice_messages = relationship('VoiceMessage', foreign_keys='VoiceMessage.host_id', back_populates='host')
    media_files = relationship('MediaLibrary', back_populates='user')
    playlists = relationship('Playlist', back_populates='user')
    broadcast_state = relationship('BroadcastState', back_populates='host', uselist=False)


class Role(Base):
    __tablename__ = 'roles'

    id = Column(Integer, primary_key=True)
    name = Column(String(50), unique=True, nullable=False)  # Пользователь, Ведущий, Администратор

    users = relationship('User', secondary=user_roles, back_populates='roles')


class Message(Base):
    __tablename__ = 'messages'

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='SET NULL'))
    host_id = Column(Integer, ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    text = Column(String(1000), nullable=False)
    status = Column(String(20), default='new')  # new, in_progress, completed
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship('User', foreign_keys=[user_id], back_populates='messages')
    host = relationship('User', foreign_keys=[host_id], back_populates='host_messages')


class VoiceMessage(Base):
    __tablename__ = 'voice_messages'

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='SET NULL'))
    host_id = Column(Integer, ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    file_path = Column(String(255), nullable=False)
    duration = Column(Float, default=0)
    status = Column(String(20), default='new')
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship('User', foreign_keys=[user_id], back_populates='voice_messages')
    host = relationship('User', foreign_keys=[host_id], back_populates='host_voice_messages')


class MediaLibrary(Base):
    __tablename__ = 'media_library'

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'))
    file_path = Column(String(255), nullable=False)
    original_name = Column(String(255), nullable=False)
    file_type = Column(String(10), nullable=False)  # audio, video
    file_size = Column(Integer, nullable=False)  # в байтах
    duration = Column(Float, default=0)  # длительность в секундах
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship('User', back_populates='media_files')
    playlists = relationship('Playlist', secondary=playlist_items, back_populates='items')
    active_broadcasts = relationship(
        'BroadcastState',
        foreign_keys='BroadcastState.current_media_id',
        back_populates='current_media'
    )


class Playlist(Base):
    __tablename__ = 'playlists'

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'))
    name = Column(String(100), default='Основной плейлист')
    is_looping = Column(Boolean, default=False)
    is_shuffle = Column(Boolean, default=False)
    is_active = Column(Boolean, default=False)  # Активный плейлист для вещания
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship('User', back_populates='playlists')
    items = relationship('MediaLibrary', secondary=playlist_items, back_populates='playlists')
    broadcast_states = relationship('BroadcastState', back_populates='playlist')


class BroadcastState(Base):
    __tablename__ = 'broadcast_states'

    id = Column(Integer, primary_key=True)
    host_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), unique=True, nullable=False)
    playlist_id = Column(Integer, ForeignKey('playlists.id', ondelete='SET NULL'), nullable=True)
    current_media_id = Column(Integer, ForeignKey('media_library.id', ondelete='SET NULL'), nullable=True)
    source_type = Column(String(20), default='playlist', nullable=False)
    is_broadcasting = Column(Boolean, default=False, nullable=False)
    is_paused = Column(Boolean, default=False, nullable=False)
    volume = Column(Float, default=1.0, nullable=False)
    started_at = Column(DateTime, nullable=True)
    paused_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    host = relationship('User', back_populates='broadcast_state')
    playlist = relationship('Playlist', back_populates='broadcast_states')
    current_media = relationship('MediaLibrary', back_populates='active_broadcasts')


class BroadcastHistory(Base):
    __tablename__ = 'broadcast_history'

    id = Column(Integer, primary_key=True)
    host_id = Column(Integer, ForeignKey('users.id', ondelete='SET NULL'))
    media_id = Column(Integer, ForeignKey('media_library.id', ondelete='SET NULL'), nullable=True)
    played_at = Column(DateTime, default=datetime.utcnow)
    duration = Column(Float, default=0)

    host = relationship('User')
    media = relationship('MediaLibrary')
