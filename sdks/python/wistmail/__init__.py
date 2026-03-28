from wistmail.client import WistMail
from wistmail.errors import (
    WistMailError,
    AuthenticationError,
    RateLimitError,
    ValidationError,
    NotFoundError,
)

__version__ = "0.1.0"
__all__ = [
    "WistMail",
    "WistMailError",
    "AuthenticationError",
    "RateLimitError",
    "ValidationError",
    "NotFoundError",
]
