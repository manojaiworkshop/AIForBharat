"""
Chat handler — POST /chat
Calls the configured LLM provider (OpenAI / vLLM / Ollama) and returns the full response.
Saves conversation to DynamoDB. Provider is configured via admin LLM settings.
"""
import json
import logging
import os
import time
import uuid
import base64
from datetime import datetime, timezone

import boto3

logger = logging.getLogger()
logger.setLevel(logging.INFO)

CHATS_TABLE    = os.environ.get("CHATS_TABLE", "mercury-grid-chats")
SETTINGS_TABLE = os.environ.get("SETTINGS_TABLE", "mercury-grid-settings")
# Fallback env vars (used if DynamoDB settings not configured yet)
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
OPENAI_MODEL   = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")

dynamodb       = boto3.resource("dynamodb")
chats_table    = dynamodb.Table(CHATS_TABLE)
settings_table = dynamodb.Table(SETTINGS_TABLE)

# Module-level LLM config cache (5-min TTL)
_llm_cache: dict = {"data": None, "ts": 0.0}
LLM_CACHE_TTL = 300  # seconds

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Content-Type": "application/json",
}

SYSTEM_PROMPT = """You are Mercury Grid, an expert AI assistant specializing in:
- AWS cloud services (S3, Lambda, CloudFront, DynamoDB, API Gateway, Bedrock)
- Python and serverless architecture
- Next.js and modern web development
- DevOps, CI/CD, and infrastructure as code

Be concise, accurate, and practical. Use markdown formatting for code blocks.
When showing code, always specify the language."""


def _error(status: int, message: str) -> dict:
    return {
        "statusCode": status,
        "headers": CORS_HEADERS,
        "body": json.dumps({"error": message}),
    }


def _get_llm_config() -> dict:
    """Load LLM provider config from DynamoDB with 5-min cache."""
    now = time.time()
    if _llm_cache["data"] is not None and now - _llm_cache["ts"] < LLM_CACHE_TTL:
        return _llm_cache["data"]
    try:
        result = settings_table.get_item(Key={"setting_key": "llm_config"})
        item = result.get("Item")
        if item:
            _llm_cache["data"] = item
            _llm_cache["ts"] = now
            return item
    except Exception as e:
        logger.warning("Could not load LLM settings from DynamoDB: %s", e)
    # Fallback to env vars
    fallback = {
        "active_provider": "openai" if OPENAI_API_KEY else "none",
        "openai": {"api_key": OPENAI_API_KEY, "model": OPENAI_MODEL, "max_tokens": 2048},
    }
    return fallback


def _get_openai_reply(messages: list, cfg: dict) -> str:
    """Call OpenAI-compatible API and return full text."""
    from openai import OpenAI
    api_key   = cfg.get("api_key") or OPENAI_API_KEY
    model     = cfg.get("model") or OPENAI_MODEL
    max_tokens = int(cfg.get("max_tokens") or 2048)
    client = OpenAI(api_key=api_key)
    full_text = []
    stream = client.chat.completions.create(
        model=model,
        messages=messages,
        max_tokens=max_tokens,
        temperature=0.7,
        stream=True,
    )
    for chunk in stream:
        delta = chunk.choices[0].delta
        if hasattr(delta, "content") and delta.content:
            full_text.append(delta.content)
    return "".join(full_text)


def _get_vllm_reply(messages: list, cfg: dict) -> str:
    """Call vLLM server (OpenAI-compatible API)."""
    from openai import OpenAI
    base_url   = (cfg.get("base_url") or "http://localhost:8000").rstrip("/") + "/v1"
    api_key    = cfg.get("api_key") or "EMPTY"
    model      = cfg.get("model") or "default"
    max_tokens = int(cfg.get("max_tokens") or 2048)
    client = OpenAI(api_key=api_key, base_url=base_url)
    full_text = []
    stream = client.chat.completions.create(
        model=model,
        messages=messages,
        max_tokens=max_tokens,
        temperature=0.7,
        stream=True,
    )
    for chunk in stream:
        delta = chunk.choices[0].delta
        if hasattr(delta, "content") and delta.content:
            full_text.append(delta.content)
    return "".join(full_text)


def _get_ollama_reply(messages: list, cfg: dict) -> str:
    """Call Ollama server using its REST API."""
    import urllib.request
    base_url   = (cfg.get("base_url") or "http://localhost:11434").rstrip("/")
    model      = cfg.get("model") or "llama3"
    max_tokens = int(cfg.get("max_tokens") or 2048)
    payload = json.dumps({
        "model": model,
        "messages": messages,
        "stream": False,
        "options": {"num_predict": max_tokens},
    }).encode()
    req = urllib.request.Request(
        f"{base_url}/api/chat",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        data = json.loads(resp.read())
    return data.get("message", {}).get("content", "")


def _save_metadata(conversation_id: str, user_id: str, title: str, created_at: str):
    """Save a METADATA item so the conversation appears in the user's list."""
    chats_table.put_item(Item={
        "conversation_id": conversation_id,
        "sk":              "METADATA",
        "user_id":         user_id,
        "title":           title,
        "created_at":      created_at,
        "pinned":          False,
        "role":            "metadata",
        "content":         "",
        "timestamp":       created_at,
    })


def _save_message(conversation_id: str, user_id: str, role: str, content: str):
    now = datetime.now(timezone.utc).isoformat()
    chats_table.put_item(Item={
        "conversation_id": conversation_id,
        "sk":              f"{now}#{role}#{uuid.uuid4()}",
        "user_id":         user_id,
        "role":            role,
        "content":         content,
        "timestamp":       now,
    })


def _demo_reply(message: str) -> str:
    greetings = ["hello", "hi", "hey", "howdy"]
    lower = message.lower().strip()
    if any(g in lower for g in greetings):
        return "Hello! 👋 I'm Mercury Grid AI. How can I help you today?\n\n> **Note**: Set `OPENAI_API_KEY` in your Lambda environment variables to enable real AI responses."
    return (
        f"I received your message about **\"{message[:60]}{'...' if len(message)>60 else ''}\"**.\n\n"
        "⚠️ OpenAI is not yet connected. To enable real AI:\n\n"
        "1. Get your API key from [platform.openai.com](https://platform.openai.com)\n"
        "2. Add `OPENAI_API_KEY` to your Lambda environment variables\n"
        "3. Redeploy with `sam deploy`"
    )


def lambda_handler(event: dict, context) -> dict:
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": CORS_HEADERS, "body": ""}

    logger.info("Chat request received")

    try:
        body = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return _error(400, "Invalid JSON in request body")

    message         = (body.get("message") or "").strip()
    existing_conv_id = body.get("conversation_id") or ""
    is_new_conv      = not existing_conv_id
    conversation_id  = existing_conv_id or str(uuid.uuid4())
    history          = body.get("history") or []

    if not message:
        return _error(400, "Field 'message' is required and cannot be empty")

    # Extract user_id from JWT (optional — graceful degradation)
    user_id = "anonymous"
    auth_header = (event.get("headers") or {}).get("Authorization") or ""
    if auth_header.startswith("Bearer "):
        try:
            token  = auth_header[7:]
            parts  = token.split(".")
            if len(parts) == 3:
                padding = 4 - len(parts[1]) % 4
                payload = json.loads(base64.urlsafe_b64decode(parts[1] + "=" * padding))
                user_id = payload.get("sub", "anonymous")
        except Exception:
            pass

    # Build message list for OpenAI
    openai_messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    for h in history[-20:]:
        if h.get("role") in ("user", "assistant") and h.get("content"):
            openai_messages.append({"role": h["role"], "content": h["content"]})
    openai_messages.append({"role": "user", "content": message})

    try:
        llm_cfg    = _get_llm_config()
        provider   = llm_cfg.get("active_provider", "openai")
        prov_cfg   = llm_cfg.get(provider, {})

        if provider == "openai" and prov_cfg.get("api_key"):
            reply = _get_openai_reply(openai_messages, prov_cfg)
        elif provider == "vllm" and prov_cfg.get("base_url"):
            reply = _get_vllm_reply(openai_messages, prov_cfg)
        elif provider == "ollama" and prov_cfg.get("base_url"):
            reply = _get_ollama_reply(openai_messages, prov_cfg)
        elif OPENAI_API_KEY:  # env-var fallback
            reply = _get_openai_reply(openai_messages, {"api_key": OPENAI_API_KEY, "model": OPENAI_MODEL, "max_tokens": 2048})
        else:
            reply = _demo_reply(message)
    except Exception as exc:
        logger.error("LLM error: %s", exc)
        reply = _demo_reply(message)

    # Persist to DynamoDB
    try:
        now = datetime.now(timezone.utc).isoformat()
        # Save METADATA item on first message so it appears in conversation list
        if is_new_conv:
            title = message[:60] + ("..." if len(message) > 60 else "")
            _save_metadata(conversation_id, user_id, title, now)
        _save_message(conversation_id, user_id, "user", message)
        _save_message(conversation_id, user_id, "assistant", reply)
    except Exception as e:
        logger.warning("DynamoDB save failed (non-fatal): %s", e)

    return {
        "statusCode": 200,
        "headers": CORS_HEADERS,
        "body": json.dumps({
            "reply":           reply,
            "conversation_id": conversation_id,
            "timestamp":       datetime.now(timezone.utc).isoformat(),
        }),
    }
