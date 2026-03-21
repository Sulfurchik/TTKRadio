import io
import json
import os
import socket
import subprocess
import tempfile
import time
import unittest
import urllib.error
import urllib.request
import uuid
import wave
from pathlib import Path


TEST_TEMP_DIR = tempfile.TemporaryDirectory()
TEST_ROOT = Path(TEST_TEMP_DIR.name)
BACKEND_DIR = Path(__file__).resolve().parents[1]


def get_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def make_wav_file(filename: str = "sample.wav") -> tuple[str, bytes, str]:
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(8000)
        wav_file.writeframes(b"\x00\x00" * 8000 * 20)
    return filename, buffer.getvalue(), "audio/wav"


def build_multipart_body(fields: dict | None = None, files: dict | None = None) -> tuple[str, bytes]:
    fields = fields or {}
    files = files or {}
    boundary = f"----TransComBoundary{uuid.uuid4().hex}"
    body = bytearray()

    for name, value in fields.items():
        body.extend(f"--{boundary}\r\n".encode())
        body.extend(f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode())
        body.extend(str(value).encode())
        body.extend(b"\r\n")

    for name, (filename, content, content_type) in files.items():
        body.extend(f"--{boundary}\r\n".encode())
        body.extend(
            f'Content-Disposition: form-data; name="{name}"; filename="{filename}"\r\n'.encode()
        )
        body.extend(f"Content-Type: {content_type}\r\n\r\n".encode())
        body.extend(content)
        body.extend(b"\r\n")

    body.extend(f"--{boundary}--\r\n".encode())
    return f"multipart/form-data; boundary={boundary}", bytes(body)


class BackendSmokeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.port = get_free_port()
        cls.base_url = f"http://127.0.0.1:{cls.port}"

        env = os.environ.copy()
        env.update(
            {
                "DATABASE_URL": f"sqlite+aiosqlite:///{(TEST_ROOT / 'test.db').as_posix()}",
                "STORAGE_PATH": str(TEST_ROOT / "storage"),
                "SECRET_KEY": "test-secret-key-1234567890",
                "DEBUG": "False",
            }
        )

        cls.server = subprocess.Popen(
            [
                str(BACKEND_DIR / "venv/bin/python"),
                "-m",
                "uvicorn",
                "main:app",
                "--host",
                "127.0.0.1",
                "--port",
                str(cls.port),
                "--log-level",
                "warning",
            ],
            cwd=BACKEND_DIR,
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )

        for _ in range(60):
            try:
                status, _ = cls.request("GET", "/health")
                if status == 200:
                    return
            except Exception:
                time.sleep(0.25)

        stderr_output = cls.server.stderr.read() if cls.server.stderr else ""
        raise RuntimeError(f"Backend server did not start.\n{stderr_output}")

    @classmethod
    def tearDownClass(cls):
        if cls.server.poll() is None:
            cls.server.terminate()
            try:
                cls.server.wait(timeout=10)
            except subprocess.TimeoutExpired:
                cls.server.kill()
        if cls.server.stdout:
            cls.server.stdout.close()
        if cls.server.stderr:
            cls.server.stderr.close()
        TEST_TEMP_DIR.cleanup()

    @classmethod
    def request(
        cls,
        method: str,
        path: str,
        *,
        headers: dict | None = None,
        json_body: dict | None = None,
        form_fields: dict | None = None,
        files: dict | None = None,
    ) -> tuple[int, dict | list | str | None]:
        request_headers = dict(headers or {})
        body = None

        if json_body is not None:
            body = json.dumps(json_body).encode("utf-8")
            request_headers["Content-Type"] = "application/json"
        elif form_fields is not None or files is not None:
            content_type, body = build_multipart_body(form_fields, files)
            request_headers["Content-Type"] = content_type

        request = urllib.request.Request(
            url=f"{cls.base_url}{path}",
            data=body,
            headers=request_headers,
            method=method,
        )

        try:
            with urllib.request.urlopen(request, timeout=15) as response:
                raw = response.read().decode("utf-8")
                payload = json.loads(raw) if raw else None
                return response.status, payload
        except urllib.error.HTTPError as error:
            raw = error.read().decode("utf-8")
            try:
                payload = json.loads(raw) if raw else None
            except json.JSONDecodeError:
                payload = raw
            error.close()
            return error.code, payload

    def auth_headers(self, token: str) -> dict:
        return {"Authorization": f"Bearer {token}"}

    def login(self, login: str, password: str) -> dict:
        status, payload = self.request(
            "POST",
            "/api/auth/login",
            json_body={"login": login, "password": password},
        )
        self.assertEqual(status, 200, payload)
        return payload

    def test_full_backend_flow(self):
        listener_payload = {
            "login": "listener",
            "fio": "Иван Иванов",
            "password": "listener123!",
            "password_confirm": "listener123!",
        }
        host_payload = {
            "login": "hoster",
            "fio": "Петр Петров",
            "password": "hoster123!",
            "password_confirm": "hoster123!",
        }

        status, payload = self.request("POST", "/api/auth/register", json_body=listener_payload)
        self.assertEqual(status, 201, payload)

        status, payload = self.request("POST", "/api/auth/register", json_body=host_payload)
        self.assertEqual(status, 201, payload)

        admin_auth = self.login("admin", "admin123")
        admin_headers = self.auth_headers(admin_auth["access_token"])

        status, roles_payload = self.request("GET", "/api/admin/roles", headers=admin_headers)
        self.assertEqual(status, 200, roles_payload)
        roles = {role["name"]: role["id"] for role in roles_payload}

        status, users_payload = self.request("GET", "/api/admin/users", headers=admin_headers)
        self.assertEqual(status, 200, users_payload)
        users = {user["login"]: user for user in users_payload}

        status, payload = self.request(
            "POST",
            f"/api/admin/users/{users['hoster']['id']}/roles",
            headers=admin_headers,
            json_body={"role_ids": [roles["Пользователь"], roles["Ведущий"]]},
        )
        self.assertEqual(status, 200, payload)

        listener_auth = self.login("listener", "listener123!")
        host_auth = self.login("hoster", "hoster123!")
        listener_headers = self.auth_headers(listener_auth["access_token"])
        host_headers = self.auth_headers(host_auth["access_token"])

        status, payload = self.request(
            "POST",
            "/api/player/messages",
            headers=listener_headers,
            json_body={"text": "Привет ведущему"},
        )
        self.assertEqual(status, 200, payload)
        message_id = payload["id"]

        wav_name, wav_bytes, wav_content_type = make_wav_file()
        status, payload = self.request(
            "POST",
            "/api/host/media/upload",
            headers=host_headers,
            files={"file": (wav_name, wav_bytes, wav_content_type)},
        )
        self.assertEqual(status, 200, payload)
        first_media_id = payload["id"]

        status, payload = self.request(
            "POST",
            "/api/host/media/upload",
            headers=host_headers,
            files={"file": ("sample-second.wav", wav_bytes, wav_content_type)},
        )
        self.assertEqual(status, 200, payload)
        second_media_id = payload["id"]

        status, payload = self.request(
            "POST",
            "/api/host/playlists",
            headers=host_headers,
            json_body={"name": "Утренний эфир"},
        )
        self.assertEqual(status, 201, payload)
        playlist_id = payload["id"]

        status, payload = self.request(
            "POST",
            f"/api/host/playlists/{playlist_id}/items",
            headers=host_headers,
            json_body={"media_id": first_media_id},
        )
        self.assertEqual(status, 200, payload)

        status, payload = self.request(
            "POST",
            f"/api/host/playlists/{playlist_id}/items",
            headers=host_headers,
            json_body={"media_id": second_media_id},
        )
        self.assertEqual(status, 200, payload)
        self.assertEqual(len(payload["items"]), 2)

        status, payload = self.request(
            "POST",
            f"/api/host/playlists/{playlist_id}/activate",
            headers=host_headers,
        )
        self.assertEqual(status, 200, payload)

        status, payload = self.request(
            "POST",
            "/api/host/broadcast/start",
            headers=host_headers,
            form_fields={"playlist_id": playlist_id},
        )
        self.assertEqual(status, 200, payload)

        status, payload = self.request(
            "GET",
            "/api/player/broadcast-status",
            headers=listener_headers,
        )
        self.assertEqual(status, 200, payload)
        self.assertTrue(payload["is_broadcasting"])
        self.assertEqual(payload["current_media"]["id"], first_media_id)
        self.assertIn("position_seconds", payload)
        self.assertIn("server_timestamp_ms", payload)
        player_initial_position = payload["position_seconds"]

        status, payload = self.request(
            "GET",
            "/api/host/broadcast/status",
            headers=host_headers,
        )
        self.assertEqual(status, 200, payload)
        self.assertTrue(payload["is_broadcasting"])
        self.assertEqual(payload["current_media"]["id"], first_media_id)
        self.assertLess(abs(payload["position_seconds"] - player_initial_position), 0.75)

        time.sleep(1.3)

        status, payload = self.request(
            "GET",
            "/api/player/broadcast-status",
            headers=listener_headers,
        )
        self.assertEqual(status, 200, payload)
        self.assertGreater(payload["position_seconds"], player_initial_position + 0.8)

        status, payload = self.request(
            "POST",
            "/api/host/broadcast/next",
            headers=host_headers,
        )
        self.assertEqual(status, 200, payload)
        self.assertEqual(payload["current_media"]["id"], second_media_id)
        self.assertLess(payload["position_seconds"], 0.75)

        status, payload = self.request(
            "POST",
            "/api/host/broadcast/previous",
            headers=host_headers,
        )
        self.assertEqual(status, 200, payload)
        self.assertEqual(payload["current_media"]["id"], first_media_id)
        self.assertLess(payload["position_seconds"], 0.75)

        status, payload = self.request("GET", "/api/player/stream", headers=listener_headers)
        self.assertEqual(status, 200, payload)
        self.assertTrue(payload["stream_url"].endswith(".wav"))
        self.assertIn("server_timestamp_ms", payload)

        status, payload = self.request("GET", "/api/host/messages", headers=host_headers)
        self.assertEqual(status, 200, payload)
        self.assertEqual(payload[0]["user_login"], "listener")

        status, payload = self.request(
            "POST",
            "/api/player/voice",
            headers=listener_headers,
            files={"file": ("voice.wav", wav_bytes, wav_content_type)},
        )
        self.assertEqual(status, 200, payload)

        status, payload = self.request("GET", "/api/host/voice-messages", headers=host_headers)
        self.assertEqual(status, 200, payload)
        self.assertEqual(len(payload), 1)

        status, payload = self.request(
            "PUT",
            f"/api/host/messages/{message_id}/status",
            headers=host_headers,
            json_body={"status": "completed"},
        )
        self.assertEqual(status, 200, payload)
        self.assertEqual(payload["status"], "completed")

        status, payload = self.request("GET", "/api/host/messages/archive", headers=host_headers)
        self.assertEqual(status, 200, payload)
        self.assertEqual(payload[0]["id"], message_id)

        status, payload = self.request(
            "DELETE",
            f"/api/admin/users/{users['listener']['id']}",
            headers=admin_headers,
        )
        self.assertEqual(status, 200, payload)

        status, payload = self.request(
            "POST",
            "/api/auth/login",
            json_body={"login": "listener", "password": "listener123!"},
        )
        self.assertEqual(status, 401, payload)


if __name__ == "__main__":
    unittest.main()
