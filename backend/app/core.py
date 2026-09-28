import hashlib
import json
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4


def now() -> str:
    return datetime.now(UTC).isoformat()


def uid(prefix: str) -> str:
    return f"{prefix}_{datetime.now(UTC):%Y%m%d_%H%M%S}_{uuid4().hex[:12]}"


def canonical(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()


def digest(value: Any) -> str:
    return hashlib.sha256(canonical(value)).hexdigest()


class BusinessError(Exception):
    def __init__(
        self,
        message: str,
        status: int = 422,
        code: int = 10001,
        reason: str = "invalid_input",
        issues: list | None = None,
    ):
        self.message, self.status, self.code, self.reason = message, status, code, reason
        self.issues = issues or []
        super().__init__(message)
