import pytest
import httpx
import respx

from wistmail import WistMail, AuthenticationError, RateLimitError, ValidationError, NotFoundError


BASE_URL = "http://localhost:3001/api/v1"


@pytest.fixture
def client():
    c = WistMail(api_key="wm_test_key_123", base_url="http://localhost:3001")
    yield c
    c.close()


class TestConstructor:
    def test_requires_api_key(self):
        with pytest.raises(ValueError, match="api_key is required"):
            WistMail(api_key="")

    def test_context_manager(self):
        with WistMail(api_key="wm_test") as c:
            assert c is not None


class TestEmails:
    @respx.mock
    def test_send_email(self, client):
        respx.post(f"{BASE_URL}/emails").mock(
            return_value=httpx.Response(201, json={"id": "eml_abc123"})
        )
        result = client.emails.send(
            from_address="sender@example.com",
            to="recipient@example.com",
            subject="Hello",
            html="<p>Hi</p>",
        )
        assert result["id"] == "eml_abc123"

    @respx.mock
    def test_send_with_list_recipients(self, client):
        respx.post(f"{BASE_URL}/emails").mock(
            return_value=httpx.Response(201, json={"id": "eml_abc"})
        )
        result = client.emails.send(
            from_address="a@b.com",
            to=["x@y.com", "z@w.com"],
            subject="Test",
            text="hello",
        )
        assert result["id"] == "eml_abc"
        import json
        data = json.loads(respx.calls.last.request.content)
        assert data["to"] == ["x@y.com", "z@w.com"]

    @respx.mock
    def test_batch_send(self, client):
        respx.post(f"{BASE_URL}/emails/batch").mock(
            return_value=httpx.Response(201, json={"ids": ["eml_1", "eml_2"]})
        )
        result = client.emails.batch_send([
            {"from": "a@b.com", "to": ["x@y.com"], "subject": "One", "html": "<p>1</p>"},
            {"from": "a@b.com", "to": ["z@w.com"], "subject": "Two", "text": "two"},
        ])
        assert result["ids"] == ["eml_1", "eml_2"]

    @respx.mock
    def test_get_email(self, client):
        respx.get(f"{BASE_URL}/emails/eml_abc").mock(
            return_value=httpx.Response(200, json={"id": "eml_abc", "status": "delivered"})
        )
        result = client.emails.get("eml_abc")
        assert result["status"] == "delivered"

    @respx.mock
    def test_cancel_email(self, client):
        respx.patch(f"{BASE_URL}/emails/eml_abc/cancel").mock(
            return_value=httpx.Response(204)
        )
        client.emails.cancel("eml_abc")


class TestWebhooks:
    @respx.mock
    def test_create_webhook(self, client):
        respx.post(f"{BASE_URL}/webhooks").mock(
            return_value=httpx.Response(201, json={
                "id": "whk_abc", "url": "https://example.com/webhook",
                "events": ["email.sent"], "secret": "whsec_abc123", "active": True,
            })
        )
        result = client.webhooks.create(url="https://example.com/webhook", events=["email.sent"])
        assert result["id"] == "whk_abc"
        assert result["secret"].startswith("whsec_")

    @respx.mock
    def test_test_webhook(self, client):
        respx.post(f"{BASE_URL}/webhooks/whk_abc/test").mock(
            return_value=httpx.Response(200, json={"status": 200})
        )
        result = client.webhooks.test("whk_abc")
        assert result["status"] == 200


class TestAudiences:
    @respx.mock
    def test_create_audience(self, client):
        respx.post(f"{BASE_URL}/audiences").mock(
            return_value=httpx.Response(201, json={"id": "aud_abc", "name": "Newsletter", "contactCount": 0})
        )
        result = client.audiences.create("Newsletter")
        assert result["name"] == "Newsletter"

    @respx.mock
    def test_add_contact(self, client):
        respx.post(f"{BASE_URL}/audiences/aud_abc/contacts").mock(
            return_value=httpx.Response(201, json={"id": "con_abc", "email": "user@example.com", "name": "User"})
        )
        result = client.audiences.add_contact("aud_abc", email="user@example.com", name="User")
        assert result["email"] == "user@example.com"


class TestErrorHandling:
    @respx.mock
    def test_authentication_error(self, client):
        respx.get(f"{BASE_URL}/emails/eml_abc").mock(
            return_value=httpx.Response(401, json={"error": {"code": "UNAUTHORIZED", "message": "Invalid API key"}})
        )
        with pytest.raises(AuthenticationError):
            client.emails.get("eml_abc")

    @respx.mock
    def test_rate_limit_error(self, client):
        respx.get(f"{BASE_URL}/emails/eml_abc").mock(
            return_value=httpx.Response(429, json={"error": {"code": "RATE_LIMITED", "message": "Too many requests"}}, headers={"retry-after": "30"})
        )
        with pytest.raises(RateLimitError) as exc_info:
            client.emails.get("eml_abc")
        assert exc_info.value.retry_after == 30

    @respx.mock
    def test_validation_error(self, client):
        respx.post(f"{BASE_URL}/emails").mock(
            return_value=httpx.Response(400, json={"error": {"code": "VALIDATION_ERROR", "message": "Invalid email"}})
        )
        with pytest.raises(ValidationError):
            client.emails.send(from_address="", to="x@y.com", subject="Hi", html="<p>test</p>")

    @respx.mock
    def test_not_found_error(self, client):
        respx.get(f"{BASE_URL}/emails/eml_nonexistent").mock(
            return_value=httpx.Response(404, json={"error": {"code": "NOT_FOUND", "message": "Email not found"}})
        )
        with pytest.raises(NotFoundError):
            client.emails.get("eml_nonexistent")


class TestRequestHeaders:
    @respx.mock
    def test_sends_api_key_and_user_agent(self, client):
        respx.get(f"{BASE_URL}/audiences").mock(
            return_value=httpx.Response(200, json={"data": []})
        )
        client.audiences.list()
        request = respx.calls.last.request
        assert request.headers["x-api-key"] == "wm_test_key_123"
        assert "wistmail-python/" in request.headers["user-agent"]
