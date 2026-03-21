import json
from collections import defaultdict

from fastapi import WebSocket


class ConnectionManager:
    def __init__(self):
        self.host_connections: dict[str, list[WebSocket]] = defaultdict(list)
        self.listener_connections: list[WebSocket] = []
        self.live_audio_host_id: str | None = None
        self.live_audio_metadata: dict | None = None

    @property
    def listeners_count(self) -> int:
        return len(self.listener_connections)

    def activate_live_audio(self, host_id: str) -> None:
        self.live_audio_host_id = host_id

    def deactivate_live_audio(self, host_id: str | None = None) -> None:
        if host_id is None or self.live_audio_host_id == host_id:
            self.live_audio_host_id = None
            self.live_audio_metadata = None

    def is_live_audio_active_for(self, host_id: int | str | None) -> bool:
        if host_id is None or self.live_audio_host_id is None:
            return False
        return str(host_id) == str(self.live_audio_host_id)

    async def connect_host(self, websocket: WebSocket, host_id: str) -> None:
        await websocket.accept()
        self.host_connections[host_id].append(websocket)

    def disconnect_host(self, websocket: WebSocket, host_id: str) -> None:
        connections = self.host_connections.get(host_id, [])
        if websocket in connections:
            connections.remove(websocket)
        if not connections and host_id in self.host_connections:
            del self.host_connections[host_id]
            if self.live_audio_host_id == host_id:
                self.live_audio_host_id = None
                self.live_audio_metadata = None

    async def connect_listener(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self.listener_connections.append(websocket)
        if self.live_audio_metadata and self.live_audio_host_id is not None:
            await websocket.send_json(self.live_audio_metadata)

    def disconnect_listener(self, websocket: WebSocket) -> None:
        if websocket in self.listener_connections:
            self.listener_connections.remove(websocket)

    async def broadcast_text(self, host_id: str, payload: str) -> None:
        if self.live_audio_host_id != host_id:
            return

        try:
            parsed_payload = json.loads(payload)
        except json.JSONDecodeError:
            parsed_payload = None

        if isinstance(parsed_payload, dict):
            event_type = parsed_payload.get("type")
            if event_type == "live_audio_start":
                self.live_audio_metadata = parsed_payload
            elif event_type == "live_audio_stop":
                self.live_audio_metadata = None

        stale_connections = []
        for connection in list(self.listener_connections):
            try:
                await connection.send_text(payload)
            except Exception:
                stale_connections.append(connection)

        for connection in stale_connections:
            self.disconnect_listener(connection)

    async def broadcast_binary(self, host_id: str, chunk: bytes) -> None:
        if self.live_audio_host_id != host_id:
            return

        stale_connections = []
        for connection in list(self.listener_connections):
            try:
                await connection.send_bytes(chunk)
            except Exception:
                stale_connections.append(("listener", connection))

        for connection_type, connection in stale_connections:
            if connection_type == "listener":
                self.disconnect_listener(connection)
            else:
                self.disconnect_host(connection, host_id)


manager = ConnectionManager()
