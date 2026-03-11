"""
Unit tests for Lambda handlers.
Run with: python -m pytest tests/ -v
"""
import json
import sys
import os

# Allow imports from src/
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from handlers.health import lambda_handler as health_handler
from handlers.chat import lambda_handler as chat_handler
from handlers.conversations import lambda_handler as conversations_handler


class FakeContext:
    invoked_function_arn = "arn:aws:lambda:eu-north-1:123456789012:function:test"


CTX = FakeContext()


# ── Health ─────────────────────────────────────────────────────
class TestHealth:
    def test_returns_200(self):
        resp = health_handler({}, CTX)
        assert resp["statusCode"] == 200

    def test_body_has_status(self):
        resp = health_handler({}, CTX)
        body = json.loads(resp["body"])
        assert body["status"] == "healthy"

    def test_cors_header_present(self):
        resp = health_handler({}, CTX)
        assert resp["headers"]["Access-Control-Allow-Origin"] == "*"


# ── Chat ───────────────────────────────────────────────────────
class TestChat:
    def _event(self, body: dict) -> dict:
        return {
            "httpMethod": "POST",
            "body": json.dumps(body),
        }

    def test_valid_message_returns_200(self):
        event = self._event({"message": "Hello!"})
        resp = chat_handler(event, CTX)
        assert resp["statusCode"] == 200

    def test_reply_in_response(self):
        event = self._event({"message": "Hello!"})
        resp = chat_handler(event, CTX)
        body = json.loads(resp["body"])
        assert "reply" in body
        assert len(body["reply"]) > 0

    def test_empty_message_returns_400(self):
        event = self._event({"message": ""})
        resp = chat_handler(event, CTX)
        assert resp["statusCode"] == 400

    def test_missing_message_returns_400(self):
        event = self._event({})
        resp = chat_handler(event, CTX)
        assert resp["statusCode"] == 400

    def test_invalid_json_returns_400(self):
        event = {"httpMethod": "POST", "body": "not-json"}
        resp = chat_handler(event, CTX)
        assert resp["statusCode"] == 400

    def test_options_preflight_returns_200(self):
        event = {"httpMethod": "OPTIONS"}
        resp = chat_handler(event, CTX)
        assert resp["statusCode"] == 200

    def test_conversation_id_preserved(self):
        event = self._event({"message": "Hi", "conversation_id": "abc-123"})
        resp = chat_handler(event, CTX)
        body = json.loads(resp["body"])
        assert body["conversation_id"] == "abc-123"

    def test_auto_conversation_id_generated(self):
        event = self._event({"message": "Hi"})
        resp = chat_handler(event, CTX)
        body = json.loads(resp["body"])
        assert "conversation_id" in body
        assert len(body["conversation_id"]) > 0


# ── Conversations ──────────────────────────────────────────────
class TestConversations:
    def test_returns_200(self):
        resp = conversations_handler({"httpMethod": "GET"}, CTX)
        assert resp["statusCode"] == 200

    def test_returns_list(self):
        resp = conversations_handler({"httpMethod": "GET"}, CTX)
        body = json.loads(resp["body"])
        assert isinstance(body["conversations"], list)
        assert body["total"] == len(body["conversations"])
