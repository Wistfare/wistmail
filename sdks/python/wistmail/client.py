from __future__ import annotations

from typing import Any
from datetime import datetime

import httpx

from wistmail.errors import (
    WistMailError,
    AuthenticationError,
    RateLimitError,
    ValidationError,
    NotFoundError,
)

_DEFAULT_BASE_URL = "https://api.wistmail.com"
_DEFAULT_TIMEOUT = 30.0
_SDK_VERSION = "0.1.0"


class WistMail:
    """Official Python SDK for the WistMail email API."""

    def __init__(
        self,
        api_key: str,
        base_url: str = _DEFAULT_BASE_URL,
        timeout: float = _DEFAULT_TIMEOUT,
    ):
        if not api_key:
            raise ValueError("api_key is required")

        self._base_url = base_url.rstrip("/")
        self._client = httpx.Client(
            base_url=f"{self._base_url}/api/v1",
            headers={
                "X-API-Key": api_key,
                "User-Agent": f"wistmail-python/{_SDK_VERSION}",
                "Content-Type": "application/json",
            },
            timeout=timeout,
        )

        self.emails = _Emails(self)
        self.webhooks = _Webhooks(self)
        self.audiences = _Audiences(self)

    def _request(self, method: str, path: str, json: Any = None) -> Any:
        response = self._client.request(method, path, json=json)

        if response.status_code == 204:
            return None

        if not response.is_success:
            self._handle_error(response)

        return response.json()

    def _handle_error(self, response: httpx.Response) -> None:
        try:
            body = response.json()
            message = body.get("error", {}).get("message", f"Request failed with status {response.status_code}")
            details = body.get("error", {}).get("details")
        except Exception:
            message = f"Request failed with status {response.status_code}"
            details = None

        status = response.status_code
        if status == 401:
            raise AuthenticationError(message)
        elif status == 429:
            retry_after = int(response.headers.get("retry-after", "60"))
            raise RateLimitError(retry_after)
        elif status == 400:
            raise ValidationError(message, details)
        elif status == 404:
            raise NotFoundError(message)
        else:
            raise WistMailError(message, "UNKNOWN", status, details)

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> WistMail:
        return self

    def __exit__(self, *args: Any) -> None:
        self.close()


class _Emails:
    def __init__(self, client: WistMail):
        self._client = client

    def send(
        self,
        *,
        from_address: str,
        to: str | list[str],
        subject: str,
        html: str | None = None,
        text: str | None = None,
        cc: str | list[str] | None = None,
        bcc: str | list[str] | None = None,
        reply_to: str | list[str] | None = None,
        headers: dict[str, str] | None = None,
        tags: dict[str, str] | None = None,
        scheduled_at: str | datetime | None = None,
        template_id: str | None = None,
        variables: dict[str, str] | None = None,
    ) -> dict[str, str]:
        body: dict[str, Any] = {
            "from": from_address,
            "to": [to] if isinstance(to, str) else to,
            "subject": subject,
        }
        if html is not None:
            body["html"] = html
        if text is not None:
            body["text"] = text
        if cc is not None:
            body["cc"] = cc
        if bcc is not None:
            body["bcc"] = bcc
        if reply_to is not None:
            body["replyTo"] = reply_to
        if headers is not None:
            body["headers"] = headers
        if tags is not None:
            body["tags"] = tags
        if scheduled_at is not None:
            body["scheduledAt"] = (
                scheduled_at.isoformat() if isinstance(scheduled_at, datetime) else scheduled_at
            )
        if template_id is not None:
            body["templateId"] = template_id
        if variables is not None:
            body["variables"] = variables

        return self._client._request("POST", "/emails", json=body)

    def batch_send(self, emails: list[dict[str, Any]]) -> dict[str, list[str]]:
        return self._client._request("POST", "/emails/batch", json={"emails": emails})

    def get(self, email_id: str) -> dict[str, Any]:
        return self._client._request("GET", f"/emails/{email_id}")

    def cancel(self, email_id: str) -> None:
        self._client._request("PATCH", f"/emails/{email_id}/cancel")


class _Webhooks:
    def __init__(self, client: WistMail):
        self._client = client

    def create(self, *, url: str, events: list[str]) -> dict[str, Any]:
        return self._client._request("POST", "/webhooks", json={"url": url, "events": events})

    def list(self) -> list[dict[str, Any]]:
        result = self._client._request("GET", "/webhooks")
        return result.get("data", [])

    def get(self, webhook_id: str) -> dict[str, Any]:
        return self._client._request("GET", f"/webhooks/{webhook_id}")

    def update(self, webhook_id: str, **kwargs: Any) -> dict[str, Any]:
        return self._client._request("PATCH", f"/webhooks/{webhook_id}", json=kwargs)

    def delete(self, webhook_id: str) -> None:
        self._client._request("DELETE", f"/webhooks/{webhook_id}")

    def test(self, webhook_id: str) -> dict[str, Any]:
        return self._client._request("POST", f"/webhooks/{webhook_id}/test")


class _Audiences:
    def __init__(self, client: WistMail):
        self._client = client

    def create(self, name: str) -> dict[str, Any]:
        return self._client._request("POST", "/audiences", json={"name": name})

    def list(self) -> list[dict[str, Any]]:
        result = self._client._request("GET", "/audiences")
        return result.get("data", [])

    def get(self, audience_id: str) -> dict[str, Any]:
        return self._client._request("GET", f"/audiences/{audience_id}")

    def delete(self, audience_id: str) -> None:
        self._client._request("DELETE", f"/audiences/{audience_id}")

    def add_contact(
        self,
        audience_id: str,
        *,
        email: str,
        name: str | None = None,
        metadata: dict[str, Any] | None = None,
        topics: list[str] | None = None,
    ) -> dict[str, Any]:
        body: dict[str, Any] = {"email": email}
        if name is not None:
            body["name"] = name
        if metadata is not None:
            body["metadata"] = metadata
        if topics is not None:
            body["topics"] = topics
        return self._client._request("POST", f"/audiences/{audience_id}/contacts", json=body)

    def list_contacts(
        self, audience_id: str, page: int = 1, page_size: int = 25
    ) -> dict[str, Any]:
        return self._client._request(
            "GET", f"/audiences/{audience_id}/contacts?page={page}&pageSize={page_size}"
        )

    def update_contact(self, contact_id: str, **kwargs: Any) -> dict[str, Any]:
        return self._client._request("PATCH", f"/contacts/{contact_id}", json=kwargs)

    def delete_contact(self, contact_id: str) -> None:
        self._client._request("DELETE", f"/contacts/{contact_id}")
