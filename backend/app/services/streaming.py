from collections import defaultdict

from fastapi import WebSocket


class ConnectionManager:
    def __init__(self):
        self.host_connections: dict[str, list[WebSocket]] = defaultdict(list)
        self.listener_connections: list[WebSocket] = []

    @property
    def listeners_count(self) -> int:
        return len(self.listener_connections)

    async def connect_host(self, websocket: WebSocket, host_id: str) -> None:
        await websocket.accept()
        self.host_connections[host_id].append(websocket)

    def disconnect_host(self, websocket: WebSocket, host_id: str) -> None:
        connections = self.host_connections.get(host_id, [])
        if websocket in connections:
            connections.remove(websocket)
        if not connections and host_id in self.host_connections:
            del self.host_connections[host_id]

    async def connect_listener(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self.listener_connections.append(websocket)

    def disconnect_listener(self, websocket: WebSocket) -> None:
        if websocket in self.listener_connections:
            self.listener_connections.remove(websocket)

    async def broadcast_binary(self, host_id: str, chunk: bytes) -> None:
        stale_connections = []
        for connection in self.host_connections.get(host_id, []):
            try:
                await connection.send_bytes(chunk)
            except Exception:
                stale_connections.append(("host", connection))

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
