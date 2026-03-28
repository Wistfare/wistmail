from __future__ import annotations
from typing import Any


class WistMailError(Exception):
    def __init__(
        self,
        message: str,
        code: str = "UNKNOWN",
        status_code: int = 500,
        details: dict[str, Any] | None = None,
    ):
        super().__init__(message)
        self.code = code
        self.status_code = status_code
        self.details = details


class AuthenticationError(WistMailError):
    def __init__(self, message: str = "Invalid API key"):
        super().__init__(message, "UNAUTHORIZED", 401)


class RateLimitError(WistMailError):
    def __init__(self, retry_after: int = 60):
        super().__init__(
            f"Rate limit exceeded. Retry after {retry_after} seconds",
            "RATE_LIMITED",
            429,
        )
        self.retry_after = retry_after


class ValidationError(WistMailError):
    def __init__(self, message: str, details: dict[str, Any] | None = None):
        super().__init__(message, "VALIDATION_ERROR", 400, details)


class NotFoundError(WistMailError):
    def __init__(self, resource: str = "Resource"):
        super().__init__(f"{resource} not found", "NOT_FOUND", 404)
