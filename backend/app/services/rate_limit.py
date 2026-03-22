import asyncio
import time
from collections import defaultdict, deque
from dataclasses import dataclass
from typing import Deque

from fastapi import HTTPException, Request, WebSocket, status


RATE_LIMIT_ERROR_MESSAGE = "Слишком много запросов. Повторите позже."


@dataclass
class RateLimitDecision:
    allowed: bool
    retry_after_seconds: int = 0


class InMemoryRateLimiter:
    def __init__(self) -> None:
        self._buckets: dict[str, Deque[float]] = defaultdict(deque)
        self._lock = asyncio.Lock()

    async def _evaluate(self, bucket_key: str, *, limit: int, window_seconds: int) -> RateLimitDecision:
        now = time.monotonic()
        async with self._lock:
            bucket = self._buckets[bucket_key]
            while bucket and now - bucket[0] >= window_seconds:
                bucket.popleft()

            if len(bucket) >= limit:
                retry_after = max(1, int(window_seconds - (now - bucket[0])))
                return RateLimitDecision(allowed=False, retry_after_seconds=retry_after)

            bucket.append(now)
            return RateLimitDecision(allowed=True)

    async def enforce(self, bucket_key: str, *, limit: int, window_seconds: int) -> None:
        decision = await self._evaluate(bucket_key, limit=limit, window_seconds=window_seconds)
        if decision.allowed:
            return

        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=RATE_LIMIT_ERROR_MESSAGE,
            headers={"Retry-After": str(decision.retry_after_seconds)},
        )

    async def evaluate_websocket(self, bucket_key: str, *, limit: int, window_seconds: int) -> RateLimitDecision:
        return await self._evaluate(bucket_key, limit=limit, window_seconds=window_seconds)


def _extract_forwarded_ip(header_value: str | None) -> str | None:
    if not header_value:
        return None
    first_part = header_value.split(",", maxsplit=1)[0].strip()
    return first_part or None


def get_request_client_ip(request: Request) -> str:
    forwarded_ip = _extract_forwarded_ip(request.headers.get("x-forwarded-for"))
    if forwarded_ip:
        return forwarded_ip
    return request.client.host if request.client else "unknown"


def get_websocket_client_ip(websocket: WebSocket) -> str:
    forwarded_ip = _extract_forwarded_ip(websocket.headers.get("x-forwarded-for"))
    if forwarded_ip:
        return forwarded_ip
    return websocket.client.host if websocket.client else "unknown"


def build_rate_limit_key(scope: str, client_ip: str, identity: str | int | None = None) -> str:
    if identity is None:
        return f"{scope}:{client_ip}"
    return f"{scope}:{client_ip}:{identity}"


rate_limiter = InMemoryRateLimiter()
