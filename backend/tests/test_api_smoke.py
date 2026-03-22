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


def make_wav_file(filename: str = "sample.wav", duration_seconds: int = 20) -> tuple[str, bytes, str]:
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(8000)
        wav_file.writeframes(b"\x00\x00" * 8000 * duration_seconds)
    return filename, buffer.getvalue(), "audio/wav"


def make_audio_stub_file(filename: str, content_type: str, content: bytes | None = None) -> tuple[str, bytes, str]:
    return filename, content or b"transcom-audio-stub", content_type


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
                "SECRET_KEY": "test-secret-key-1234567890-1234567890",
                "DEBUG": "False",
                "DEFAULT_ADMIN_PASSWORD": "SmokeAdmin123!",
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

        admin_auth = self.login("admin", "SmokeAdmin123!")
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
        self.assertEqual({role["name"] for role in payload["roles"]}, {"Ведущий"})

        listener_auth = self.login("listener", "listener123!")
        host_auth = self.login("hoster", "hoster123!")
        listener_headers = self.auth_headers(listener_auth["access_token"])
        host_headers = self.auth_headers(host_auth["access_token"])

        status, payload = self.request("GET", "/api/auth/me", headers=host_headers)
        self.assertEqual(status, 200, payload)
        self.assertEqual(payload["login"], "hoster")
        self.assertTrue(payload["is_online"])

        status, payload = self.request(
            "POST",
            "/api/host/broadcast/live-audio/start",
            headers=host_headers,
        )
        self.assertEqual(status, 200, payload)
        self.assertTrue(payload["is_broadcasting"])
        self.assertTrue(payload["live_audio_active"])
        self.assertIsNone(payload["current_media"])
        live_audio_started_at = payload["started_at"]

        time.sleep(0.35)
        status, payload = self.request(
            "GET",
            "/api/host/broadcast/status",
            headers=host_headers,
        )
        self.assertEqual(status, 200, payload)
        self.assertEqual(payload["started_at"], live_audio_started_at)
        self.assertGreater(payload["position_seconds"], 0.2)

        status, payload = self.request(
            "POST",
            "/api/host/broadcast/live-audio/stop",
            headers=host_headers,
        )
        self.assertEqual(status, 200, payload)
        self.assertFalse(payload["is_broadcasting"])

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
            "PUT",
            f"/api/host/media/{second_media_id}",
            headers=host_headers,
            json_body={"original_name": "Обновлённое имя файла.wav"},
        )
        self.assertEqual(status, 200, payload)
        self.assertEqual(payload["original_name"], "Обновлённое имя файла.wav")

        status, payload = self.request(
            "POST",
            "/api/host/record",
            headers=host_headers,
            files={"file": ("microphone-recording.wav", wav_bytes, wav_content_type)},
        )
        self.assertEqual(status, 200, payload)
        self.assertEqual(payload["original_name"], "microphone-recording.wav")
        self.assertGreater(payload["duration"], 0)
        recorded_media_id = payload["id"]

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
            "/api/host/record",
            headers=host_headers,
            form_fields={"target_mode": "playlist", "playlist_id": playlist_id},
            files={"file": ("playlist-recording.wav", wav_bytes, wav_content_type)},
        )
        self.assertEqual(status, 200, payload)
        playlist_recorded_media_id = payload["id"]

        status, payload = self.request("GET", "/api/host/media", headers=host_headers)
        self.assertEqual(status, 200, payload)
        media_ids = [item["id"] for item in payload]
        self.assertIn(recorded_media_id, media_ids)
        self.assertNotIn(playlist_recorded_media_id, media_ids)

        status, payload = self.request("GET", "/api/host/playlists", headers=host_headers)
        self.assertEqual(status, 200, payload)
        playlist_payload = next(item for item in payload if item["id"] == playlist_id)
        self.assertEqual(len(playlist_payload["items"]), 2)
        second_item_id = next(item["id"] for item in playlist_payload["items"] if item["media_id"] == playlist_recorded_media_id)

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
        first_started_at = payload["started_at"]

        status, payload = self.request(
            "GET",
            "/api/host/broadcast/status",
            headers=host_headers,
        )
        self.assertEqual(status, 200, payload)
        self.assertTrue(payload["is_broadcasting"])
        self.assertEqual(payload["current_media"]["id"], first_media_id)
        self.assertLess(abs(payload["position_seconds"] - player_initial_position), 0.75)

        time.sleep(0.2)
        status, payload = self.request(
            "GET",
            "/api/player/broadcast-status",
            headers=listener_headers,
        )
        self.assertEqual(status, 200, payload)
        self.assertEqual(payload["started_at"], first_started_at)

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
            "/api/host/broadcast/pause",
            headers=host_headers,
        )
        self.assertEqual(status, 200, payload)
        self.assertTrue(payload["is_paused"])
        paused_position = payload["position_seconds"]

        time.sleep(0.5)
        status, payload = self.request(
            "GET",
            "/api/player/broadcast-status",
            headers=listener_headers,
        )
        self.assertEqual(status, 200, payload)
        self.assertTrue(payload["is_paused"])
        self.assertLess(abs(payload["position_seconds"] - paused_position), 0.2)

        status, payload = self.request(
            "POST",
            "/api/host/broadcast/resume",
            headers=host_headers,
        )
        self.assertEqual(status, 200, payload)
        self.assertFalse(payload["is_paused"])

        time.sleep(0.4)
        status, payload = self.request(
            "GET",
            "/api/player/broadcast-status",
            headers=listener_headers,
        )
        self.assertEqual(status, 200, payload)
        self.assertFalse(payload["is_paused"])
        self.assertGreater(payload["position_seconds"], paused_position + 0.2)

        status, payload = self.request(
            "PUT",
            "/api/host/broadcast/volume",
            headers=host_headers,
            json_body={"volume": 0.35},
        )
        self.assertEqual(status, 200, payload)
        self.assertAlmostEqual(payload["volume"], 0.35, places=2)

        status, payload = self.request(
            "POST",
            "/api/host/media/upload",
            headers=host_headers,
            files={"file": ("sample-third.wav", wav_bytes, wav_content_type)},
        )
        self.assertEqual(status, 200, payload)
        third_media_id = payload["id"]

        status, payload = self.request(
            "POST",
            f"/api/host/playlists/{playlist_id}/items",
            headers=host_headers,
            json_body={"media_id": third_media_id},
        )
        self.assertEqual(status, 200, payload)
        self.assertEqual(len(payload["items"]), 3)

        status, payload = self.request(
            "GET",
            "/api/host/broadcast/status",
            headers=host_headers,
        )
        self.assertEqual(status, 200, payload)
        self.assertEqual(len(payload["playlist"]), 3)
        self.assertAlmostEqual(payload["volume"], 0.35, places=2)

        status, payload = self.request(
            "DELETE",
            f"/api/host/playlists/{playlist_id}/items/{second_item_id}",
            headers=host_headers,
        )
        self.assertEqual(status, 200, payload)
        self.assertEqual(len(payload["items"]), 2)
        self.assertNotIn(playlist_recorded_media_id, [item["media_id"] for item in payload["items"]])

        status, payload = self.request(
            "POST",
            "/api/host/broadcast/finish",
            headers=host_headers,
        )
        self.assertEqual(status, 200, payload)
        self.assertEqual(payload["current_media"]["id"], third_media_id)
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

        status, payload = self.request(
            "POST",
            "/api/host/broadcast/stop",
            headers=host_headers,
        )
        self.assertEqual(status, 200, payload)

        status, payload = self.request(
            "GET",
            "/api/player/broadcast-status",
            headers=listener_headers,
        )
        self.assertEqual(status, 200, payload)
        self.assertFalse(payload["is_broadcasting"])
        self.assertIsNone(payload["current_media"])

        status, payload = self.request(
            "PUT",
            f"/api/host/playlists/{playlist_id}/toggle-loop",
            headers=host_headers,
        )
        self.assertEqual(status, 200, payload)
        self.assertTrue(payload["is_looping"])

        status, payload = self.request(
            "POST",
            "/api/host/record",
            headers=host_headers,
            form_fields={"target_mode": "air", "playlist_id": playlist_id},
            files={"file": make_wav_file("air-recording.wav", duration_seconds=1)},
        )
        self.assertEqual(status, 200, payload)
        air_recorded_media_id = payload["id"]

        status, payload = self.request(
            "GET",
            "/api/host/broadcast/status",
            headers=host_headers,
        )
        self.assertEqual(status, 200, payload)
        self.assertTrue(payload["is_broadcasting"])
        self.assertEqual(payload["current_media"]["id"], air_recorded_media_id)

        time.sleep(1.2)
        status, payload = self.request(
            "GET",
            "/api/host/broadcast/status",
            headers=host_headers,
        )
        self.assertEqual(status, 200, payload)
        self.assertFalse(payload["is_broadcasting"])
        self.assertIsNone(payload["current_media"])

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

        status, payload = self.request("GET", "/api/player/voice-messages", headers=listener_headers)
        self.assertEqual(status, 200, payload)
        self.assertEqual(len(payload), 1)

        status, payload = self.request("GET", "/api/host/voice-messages", headers=host_headers)
        self.assertEqual(status, 200, payload)
        listener_voice_message = next(item for item in payload if item["user_login"] == "listener")
        voice_message_id = listener_voice_message["id"]
        self.assertEqual(listener_voice_message["status"], "new")

        status, payload = self.request(
            "PUT",
            f"/api/host/voice-messages/{voice_message_id}/status",
            headers=host_headers,
            json_body={"status": "in_progress"},
        )
        self.assertEqual(status, 200, payload)
        self.assertEqual(payload["status"], "in_progress")

        status, payload = self.request(
            "PUT",
            f"/api/host/voice-messages/{voice_message_id}/status",
            headers=host_headers,
            json_body={"status": "completed"},
        )
        self.assertEqual(status, 200, payload)
        self.assertEqual(payload["status"], "completed")

        status, payload = self.request("GET", "/api/host/voice-messages", headers=host_headers)
        self.assertEqual(status, 200, payload)
        self.assertFalse(any(item["id"] == voice_message_id for item in payload))

        status, payload = self.request("GET", "/api/host/voice-messages/archive", headers=host_headers)
        self.assertEqual(status, 200, payload)
        archived_listener_voice = next(item for item in payload if item["id"] == voice_message_id)
        self.assertEqual(archived_listener_voice["status"], "completed")

        status, payload = self.request("POST", "/api/auth/presence/offline", headers=host_headers)
        self.assertEqual(status, 200, payload)
        self.assertFalse(payload["is_online"])

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

    def test_audio_format_compatibility(self):
        listener_payload = {
            "login": "compatlistener",
            "fio": "Иван Иванов",
            "password": "compatlistener123!",
            "password_confirm": "compatlistener123!",
        }
        host_payload = {
            "login": "compathost",
            "fio": "Петр Петров",
            "password": "compathost123!",
            "password_confirm": "compathost123!",
        }

        status, payload = self.request("POST", "/api/auth/register", json_body=listener_payload)
        self.assertEqual(status, 201, payload)

        status, payload = self.request("POST", "/api/auth/register", json_body=host_payload)
        self.assertEqual(status, 201, payload)

        admin_auth = self.login("admin", "SmokeAdmin123!")
        admin_headers = self.auth_headers(admin_auth["access_token"])

        status, roles_payload = self.request("GET", "/api/admin/roles", headers=admin_headers)
        self.assertEqual(status, 200, roles_payload)
        roles = {role["name"]: role["id"] for role in roles_payload}

        status, users_payload = self.request("GET", "/api/admin/users", headers=admin_headers)
        self.assertEqual(status, 200, users_payload)
        users = {user["login"]: user for user in users_payload}

        status, payload = self.request(
            "POST",
            f"/api/admin/users/{users['compathost']['id']}/roles",
            headers=admin_headers,
            json_body={"role_ids": [roles["Ведущий"]]},
        )
        self.assertEqual(status, 200, payload)

        listener_auth = self.login("compatlistener", "compatlistener123!")
        host_auth = self.login("compathost", "compathost123!")
        listener_headers = self.auth_headers(listener_auth["access_token"])
        host_headers = self.auth_headers(host_auth["access_token"])

        status, payload = self.request(
            "POST",
            "/api/host/media/upload",
            headers=host_headers,
            files={"file": ("mobile-recording.m4a", b"m4a-stub", "audio/mp4")},
        )
        self.assertEqual(status, 200, payload)
        self.assertEqual(payload["file_type"], "audio")
        self.assertTrue(payload["storage_url"].endswith(".m4a"))

        status, payload = self.request(
            "POST",
            "/api/host/record",
            headers=host_headers,
            files={"file": make_audio_stub_file("browser-recording.webm", "audio/webm")},
        )
        self.assertEqual(status, 200, payload)
        self.assertTrue(payload["storage_url"].endswith(".webm"))

        status, payload = self.request(
            "POST",
            "/api/player/voice",
            headers=listener_headers,
            files={"file": make_audio_stub_file("voice-message.ogg", "audio/ogg")},
        )
        self.assertEqual(status, 200, payload)
        self.assertTrue(payload["storage_url"].endswith(".ogg"))

        status, payload = self.request(
            "POST",
            "/api/player/voice",
            headers=listener_headers,
            files={"file": make_audio_stub_file("voice-message", "audio/mp4")},
        )
        self.assertEqual(status, 200, payload)
        self.assertTrue(payload["storage_url"].endswith(".m4a"))

        status, payload = self.request(
            "POST",
            "/api/player/voice",
            headers=listener_headers,
            files={"file": make_audio_stub_file("voice-message.bin", "application/octet-stream")},
        )
        self.assertEqual(status, 400, payload)
        self.assertEqual(payload["detail"], "Неподдерживаемый формат")

        status, payload = self.request(
            "POST",
            "/api/host/playlists",
            headers=host_headers,
            json_body={"name": "Mobile Air"},
        )
        self.assertEqual(status, 201, payload)
        playlist_id = payload["id"]

        status, payload = self.request(
            "POST",
            "/api/host/record",
            headers=host_headers,
            form_fields={"target_mode": "air", "playlist_id": playlist_id, "duration_seconds": 1},
            files={"file": make_audio_stub_file("air-mobile-recording.webm", "audio/webm")},
        )
        self.assertEqual(status, 200, payload)
        self.assertAlmostEqual(payload["duration"], 1.0, delta=0.05)

        time.sleep(1.2)
        status, payload = self.request(
            "GET",
            "/api/host/broadcast/status",
            headers=host_headers,
        )
        self.assertEqual(status, 200, payload)
        self.assertFalse(payload["is_broadcasting"])
        self.assertIsNone(payload["current_media"])

    def test_single_public_broadcast_owner(self):
        first_host_payload = {
            "login": "hostalpha",
            "fio": "Альфа Ведущий",
            "password": "hostalpha123!",
            "password_confirm": "hostalpha123!",
        }
        second_host_payload = {
            "login": "hostbeta",
            "fio": "Бета Ведущий",
            "password": "hostbeta123!",
            "password_confirm": "hostbeta123!",
        }

        status, payload = self.request("POST", "/api/auth/register", json_body=first_host_payload)
        self.assertEqual(status, 201, payload)

        status, payload = self.request("POST", "/api/auth/register", json_body=second_host_payload)
        self.assertEqual(status, 201, payload)

        admin_auth = self.login("admin", "SmokeAdmin123!")
        admin_headers = self.auth_headers(admin_auth["access_token"])

        status, roles_payload = self.request("GET", "/api/admin/roles", headers=admin_headers)
        self.assertEqual(status, 200, roles_payload)
        roles = {role["name"]: role["id"] for role in roles_payload}

        status, users_payload = self.request("GET", "/api/admin/users", headers=admin_headers)
        self.assertEqual(status, 200, users_payload)
        users = {user["login"]: user for user in users_payload}

        for login in ("hostalpha", "hostbeta"):
            status, payload = self.request(
                "POST",
                f"/api/admin/users/{users[login]['id']}/roles",
                headers=admin_headers,
                json_body={"role_ids": [roles["Ведущий"]]},
            )
            self.assertEqual(status, 200, payload)

        first_host_auth = self.login("hostalpha", "hostalpha123!")
        second_host_auth = self.login("hostbeta", "hostbeta123!")
        first_host_headers = self.auth_headers(first_host_auth["access_token"])
        second_host_headers = self.auth_headers(second_host_auth["access_token"])

        wav_name, wav_bytes, wav_content_type = make_wav_file()

        status, payload = self.request(
            "POST",
            "/api/host/media/upload",
            headers=first_host_headers,
            files={"file": (wav_name, wav_bytes, wav_content_type)},
        )
        self.assertEqual(status, 200, payload)
        first_media_id = payload["id"]

        status, payload = self.request(
            "POST",
            "/api/host/playlists",
            headers=first_host_headers,
            json_body={"name": "Эфир Альфа"},
        )
        self.assertEqual(status, 201, payload)
        first_playlist_id = payload["id"]

        status, payload = self.request(
            "POST",
            f"/api/host/playlists/{first_playlist_id}/items",
            headers=first_host_headers,
            json_body={"media_id": first_media_id},
        )
        self.assertEqual(status, 200, payload)

        status, payload = self.request(
            "POST",
            f"/api/host/playlists/{first_playlist_id}/activate",
            headers=first_host_headers,
        )
        self.assertEqual(status, 200, payload)

        status, payload = self.request(
            "POST",
            "/api/host/media/upload",
            headers=second_host_headers,
            files={"file": ("beta.wav", wav_bytes, wav_content_type)},
        )
        self.assertEqual(status, 200, payload)
        second_media_id = payload["id"]

        status, payload = self.request(
            "POST",
            "/api/host/playlists",
            headers=second_host_headers,
            json_body={"name": "Эфир Бета"},
        )
        self.assertEqual(status, 201, payload)
        second_playlist_id = payload["id"]

        status, payload = self.request(
            "POST",
            f"/api/host/playlists/{second_playlist_id}/items",
            headers=second_host_headers,
            json_body={"media_id": second_media_id},
        )
        self.assertEqual(status, 200, payload)

        status, payload = self.request(
            "POST",
            f"/api/host/playlists/{second_playlist_id}/activate",
            headers=second_host_headers,
        )
        self.assertEqual(status, 200, payload)

        status, payload = self.request(
            "POST",
            "/api/host/broadcast/start",
            headers=first_host_headers,
            form_fields={"playlist_id": first_playlist_id},
        )
        self.assertEqual(status, 200, payload)

        status, payload = self.request(
            "GET",
            "/api/player/broadcast-status",
            headers=admin_headers,
        )
        self.assertEqual(status, 200, payload)
        self.assertEqual(payload["current_media"]["id"], first_media_id)

        status, payload = self.request(
            "POST",
            "/api/host/broadcast/start",
            headers=second_host_headers,
            form_fields={"playlist_id": second_playlist_id},
        )
        self.assertEqual(status, 200, payload)

        status, payload = self.request(
            "GET",
            "/api/player/broadcast-status",
            headers=admin_headers,
        )
        self.assertEqual(status, 200, payload)
        self.assertTrue(payload["is_broadcasting"])
        self.assertEqual(payload["current_media"]["id"], second_media_id)

        status, payload = self.request(
            "GET",
            "/api/host/broadcast/status",
            headers=first_host_headers,
        )
        self.assertEqual(status, 200, payload)
        self.assertFalse(payload["is_broadcasting"])
        self.assertIsNone(payload["current_media"])


if __name__ == "__main__":
    unittest.main()
