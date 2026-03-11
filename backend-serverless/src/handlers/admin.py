"""
admin.py — Superadmin-only user & connection management endpoints.

Routes (all require Authorization: Bearer <superadmin-JWT>):
  GET    /admin/users                             → list all users
  POST   /admin/users                             → create new user
  GET    /admin/users/{user_id}                   → get single user
  PUT    /admin/users/{user_id}                   → update user (name, plan, role)
  DELETE /admin/users/{user_id}                   → delete user
  POST   /admin/users/{user_id}/reset-password    → set new password for a user
  PUT    /admin/me/change-password                → superadmin changes own password

  GET    /admin/connections?type=postgres|neo4j   → list saved connections
  POST   /admin/connections                       → save new connection
  DELETE /admin/connections/{connection_id}       → delete connection
  POST   /admin/connections/{connection_id}/test  → test connection

  GET    /admin/llm-settings                      → get LLM provider settings
  PUT    /admin/llm-settings                      → save LLM provider settings
"""

import json
import os
import uuid
import base64
import hashlib
import hmac
import logging
from datetime import datetime, timezone

import boto3
from boto3.dynamodb.conditions import Key, Attr

logger = logging.getLogger()
logger.setLevel(logging.INFO)

USERS_TABLE              = os.environ.get("USERS_TABLE", "mercury-grid-users")
CONNECTIONS_TABLE        = os.environ.get("DB_CONNECTIONS_TABLE", "mercury-grid-db-connections")
SETTINGS_TABLE           = os.environ.get("SETTINGS_TABLE", "mercury-grid-settings")
AGENT_PERMISSIONS_TABLE  = os.environ.get("AGENT_PERMISSIONS_TABLE", "mercury-grid-agent-permissions")
JWT_SECRET               = os.environ.get("JWT_SECRET", "mercury-grid-secret-change-in-prod")

ADMIN_USER_ID      = "__admin__"
LLM_SETTING_KEY    = "llm_config"
REDIS_SETTING_KEY  = "redis_config"

dynamodb              = boto3.resource("dynamodb")
users_table           = dynamodb.Table(USERS_TABLE)
conn_table            = dynamodb.Table(CONNECTIONS_TABLE)
settings_table        = dynamodb.Table(SETTINGS_TABLE)
agent_perms_table     = dynamodb.Table(AGENT_PERMISSIONS_TABLE)

CORS_HEADERS = {
    "Access-Control-Allow-Origin":  "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Content-Type": "application/json",
}


# ── Helpers ───────────────────────────────────────────────────

def _ok(body, status=200):
    return {"statusCode": status, "headers": CORS_HEADERS, "body": json.dumps(body, default=str)}


def _error(status, message):
    return {"statusCode": status, "headers": CORS_HEADERS, "body": json.dumps({"error": message})}


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _verify_jwt(token: str) -> dict | None:
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return None
        header, payload_enc, sig = parts
        expected = _b64url(
            hmac.new(JWT_SECRET.encode(), f"{header}.{payload_enc}".encode(), hashlib.sha256).digest()
        )
        if not hmac.compare_digest(sig, expected):
            return None
        padding = 4 - len(payload_enc) % 4
        payload = json.loads(base64.urlsafe_b64decode(payload_enc + "=" * padding))
        if payload.get("exp", 0) < datetime.now(timezone.utc).timestamp():
            return None
        return payload
    except Exception:
        return None


def _require_superadmin(event: dict):
    """Returns (payload, None) or (None, error_response)."""
    auth = (event.get("headers") or {}).get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None, _error(401, "Unauthorized")
    payload = _verify_jwt(auth[7:])
    if not payload:
        return None, _error(401, "Invalid or expired token")
    if payload.get("role") != "superadmin":
        return None, _error(403, "Superadmin access required")
    return payload, None


def _require_any_user(event: dict):
    """Returns (payload, None) for any authenticated user (not just superadmin)."""
    auth = (event.get("headers") or {}).get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None, _error(401, "Unauthorized")
    payload = _verify_jwt(auth[7:])
    if not payload:
        return None, _error(401, "Invalid or expired token")
    return payload, None


def _hash_password(password: str) -> str:
    salt = os.urandom(32)
    dk   = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 200_000)
    return base64.b64encode(salt + dk).decode()


def _verify_password(password: str, stored: str) -> bool:
    try:
        raw  = base64.b64decode(stored.encode())
        salt = raw[:32]
        dk   = raw[32:]
        new_dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 200_000)
        return hmac.compare_digest(dk, new_dk)
    except Exception:
        return False


def _safe_user(item: dict) -> dict:
    """Strip password before returning to client."""
    return {
        "user_id":    item.get("user_id", ""),
        "email":      item.get("email", ""),
        "name":       item.get("name", ""),
        "role":       item.get("role", "user"),
        "plan":       item.get("plan", "free"),
        "created_at": item.get("created_at", ""),
    }


def _safe_conn(item: dict) -> dict:
    """Return connection without exposing the password."""
    return {
        "connection_id": item.get("connection_id", ""),
        "type":          item.get("type", ""),
        "name":          item.get("name", ""),
        "host":          item.get("host", ""),
        "port":          item.get("port", ""),
        "database":      item.get("database", ""),
        "username":      item.get("username", ""),
        "has_password":  bool(item.get("password")),
        "created_at":    item.get("created_at", ""),
    }


# ── User route handlers ───────────────────────────────────────

def list_users(event: dict) -> dict:
    _, err = _require_superadmin(event)
    if err:
        return err

    result = users_table.scan()
    users  = [_safe_user(item) for item in result.get("Items", [])]
    while "LastEvaluatedKey" in result:
        result = users_table.scan(ExclusiveStartKey=result["LastEvaluatedKey"])
        users.extend([_safe_user(item) for item in result.get("Items", [])])

    users.sort(key=lambda u: u.get("created_at", ""), reverse=True)
    return _ok({"users": users, "total": len(users)})


def create_user(event: dict) -> dict:
    _, err = _require_superadmin(event)
    if err:
        return err

    try:
        body = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return _error(400, "Invalid JSON")

    name     = (body.get("name") or "").strip()
    email    = (body.get("email") or "").strip().lower()
    password = body.get("password") or ""
    role     = body.get("role", "user")
    plan     = body.get("plan", "free")

    if not name or not email or not password:
        return _error(400, "name, email and password are required")
    if len(password) < 8:
        return _error(400, "Password must be at least 8 characters")
    if role not in ("user", "superadmin"):
        return _error(400, "Invalid role")

    existing = users_table.get_item(Key={"email": email}).get("Item")
    if existing:
        return _error(409, "A user with this email already exists")

    now     = datetime.now(timezone.utc).isoformat()
    user_id = str(uuid.uuid4())
    users_table.put_item(Item={
        "email":      email,
        "user_id":    user_id,
        "name":       name,
        "role":       role,
        "plan":       plan,
        "password":   _hash_password(password),
        "created_at": now,
    })
    return _ok({"user": {"user_id": user_id, "email": email, "name": name, "role": role, "plan": plan, "created_at": now}}, 201)


def get_user(event: dict, user_id: str) -> dict:
    _, err = _require_superadmin(event)
    if err:
        return err

    result = users_table.scan(FilterExpression=Attr("user_id").eq(user_id))
    items = result.get("Items", [])
    if not items:
        return _error(404, "User not found")
    return _ok(_safe_user(items[0]))


def update_user(event: dict, user_id: str) -> dict:
    _, err = _require_superadmin(event)
    if err:
        return err

    try:
        body = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return _error(400, "Invalid JSON")

    result = users_table.scan(FilterExpression=Attr("user_id").eq(user_id))
    items  = result.get("Items", [])
    if not items:
        return _error(404, "User not found")
    email = items[0]["email"]

    updates = {}
    if "name" in body:
        updates["#n"] = ("name", body["name"])
    if "plan" in body:
        updates["plan"] = ("plan", body["plan"])
    if "role" in body and body["role"] in ("user", "superadmin"):
        updates["#r"] = ("role", body["role"])

    if not updates:
        return _error(400, "No valid fields to update")

    set_expr    = "SET " + ", ".join(f"{k} = :{k.lstrip('#')}" for k in updates)
    expr_names  = {k: v[0] for k, v in updates.items() if k.startswith("#")}
    expr_values = {f":{v[0]}": v[1] for v in updates.values()}

    kw = dict(
        Key={"email": email},
        UpdateExpression=set_expr,
        ExpressionAttributeValues=expr_values,
    )
    if expr_names:
        kw["ExpressionAttributeNames"] = expr_names
    users_table.update_item(**kw)

    updated = users_table.get_item(Key={"email": email}).get("Item", {})
    return _ok(_safe_user(updated))


def delete_user(event: dict, user_id: str) -> dict:
    payload, err = _require_superadmin(event)
    if err:
        return err

    if payload.get("sub") == user_id:
        return _error(400, "Cannot delete your own superadmin account")

    result = users_table.scan(FilterExpression=Attr("user_id").eq(user_id))
    items  = result.get("Items", [])
    if not items:
        return _error(404, "User not found")

    users_table.delete_item(Key={"email": items[0]["email"]})
    return _ok({"success": True, "deleted_user_id": user_id})


def reset_password(event: dict, user_id: str) -> dict:
    _, err = _require_superadmin(event)
    if err:
        return err

    try:
        body = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return _error(400, "Invalid JSON")

    new_password = body.get("new_password", "")
    if len(new_password) < 8:
        return _error(400, "Password must be at least 8 characters")

    result = users_table.scan(FilterExpression=Attr("user_id").eq(user_id))
    items  = result.get("Items", [])
    if not items:
        return _error(404, "User not found")

    users_table.update_item(
        Key={"email": items[0]["email"]},
        UpdateExpression="SET password = :p",
        ExpressionAttributeValues={":p": _hash_password(new_password)},
    )
    return _ok({"success": True, "message": "Password reset successfully"})


def change_own_password(event: dict) -> dict:
    payload, err = _require_superadmin(event)
    if err:
        return err

    try:
        body = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return _error(400, "Invalid JSON")

    current_password = body.get("current_password", "")
    new_password     = body.get("new_password", "")

    if not current_password or not new_password:
        return _error(400, "current_password and new_password are required")
    if len(new_password) < 8:
        return _error(400, "New password must be at least 8 characters")

    email = payload.get("email", "")
    user  = users_table.get_item(Key={"email": email}).get("Item")
    if not user:
        return _error(404, "User not found")
    if not _verify_password(current_password, user["password"]):
        return _error(401, "Current password is incorrect")

    users_table.update_item(
        Key={"email": email},
        UpdateExpression="SET password = :p",
        ExpressionAttributeValues={":p": _hash_password(new_password)},
    )
    return _ok({"success": True, "message": "Password changed successfully"})


# ── Connection route handlers ─────────────────────────────────

def list_connections(event: dict) -> dict:
    _, err = _require_superadmin(event)
    if err:
        return err

    params   = event.get("queryStringParameters") or {}
    conn_type = params.get("type", "")

    result = conn_table.query(KeyConditionExpression=Key("user_id").eq(ADMIN_USER_ID))
    items  = result.get("Items", [])
    while "LastEvaluatedKey" in result:
        result = conn_table.query(
            KeyConditionExpression=Key("user_id").eq(ADMIN_USER_ID),
            ExclusiveStartKey=result["LastEvaluatedKey"]
        )
        items.extend(result.get("Items", []))

    if conn_type:
        items = [i for i in items if i.get("type") == conn_type]

    items.sort(key=lambda c: c.get("created_at", ""), reverse=True)
    return _ok({"connections": [_safe_conn(i) for i in items]})


def save_connection(event: dict) -> dict:
    _, err = _require_superadmin(event)
    if err:
        return err

    try:
        body = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return _error(400, "Invalid JSON")

    conn_type = body.get("type", "")
    if conn_type not in ("postgres", "neo4j"):
        return _error(400, "type must be 'postgres' or 'neo4j'")

    name = (body.get("name") or "").strip()
    host = (body.get("host") or "").strip()
    if not name or not host:
        return _error(400, "name and host are required")

    conn_id = str(uuid.uuid4())
    now     = datetime.now(timezone.utc).isoformat()

    item = {
        "user_id":       ADMIN_USER_ID,
        "connection_id": conn_id,
        "type":          conn_type,
        "name":          name,
        "host":          host,
        "port":          str(body.get("port", "5432" if conn_type == "postgres" else "7687")),
        "database":      body.get("database", ""),
        "username":      body.get("username", ""),
        "password":      body.get("password", ""),
        "created_at":    now,
    }
    conn_table.put_item(Item=item)
    return _ok({"connection": _safe_conn(item)}, 201)


def delete_connection(event: dict, connection_id: str) -> dict:
    _, err = _require_superadmin(event)
    if err:
        return err

    conn_table.delete_item(Key={"user_id": ADMIN_USER_ID, "connection_id": connection_id})
    return _ok({"success": True})


def test_connection(event: dict, connection_id: str) -> dict:
    _, err = _require_superadmin(event)
    if err:
        return err

    result = conn_table.get_item(Key={"user_id": ADMIN_USER_ID, "connection_id": connection_id})
    item   = result.get("Item")
    if not item:
        return _error(404, "Connection not found")

    conn_type = item.get("type")
    host      = item.get("host", "")
    port      = int(item.get("port", 0))
    database  = item.get("database", "")
    username  = item.get("username", "")
    password  = item.get("password", "")

    if conn_type == "postgres":
        import pg8000.native
        import ssl as ssl_module

        def _pg_connect(ssl_ctx):
            conn = pg8000.native.Connection(
                user=username,
                password=password,
                host=host,
                port=port or 5432,
                database=database or "postgres",
                timeout=10,
                ssl_context=ssl_ctx,
            )
            conn.run("SELECT 1")
            conn.close()

        # Attempt 1: pure plain TCP — ssl_context=None means NO SSL in pg8000
        plain_err = None
        try:
            _pg_connect(None)
            return _ok({"success": True, "message": "PostgreSQL connection successful (no SSL)"})
        except Exception as plain_exc:
            plain_err = str(plain_exc)

        # Attempt 2: SSL without cert verification (for managed DBs / self-signed certs)
        try:
            ctx = ssl_module.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl_module.CERT_NONE
            _pg_connect(ctx)
            return _ok({"success": True, "message": "PostgreSQL connection successful (SSL)"})
        except Exception as ssl_exc:
            ssl_err = str(ssl_exc)

        # Both failed — report both errors so user knows what's happening
        return _ok({"success": False, "message": f"Connection failed (no-SSL: {plain_err})"})

    elif conn_type == "neo4j":
        try:
            from neo4j import GraphDatabase
            uri    = f"bolt://{host}:{port or 7687}"
            driver = GraphDatabase.driver(uri, auth=(username, password))
            with driver.session(database=database or "neo4j") as session:
                session.run("RETURN 1")
            driver.close()
            return _ok({"success": True, "message": "Neo4j connection successful"})
        except Exception as exc:
            return _ok({"success": False, "message": f"Connection failed: {exc}"})

    return _error(400, "Unknown connection type")


# ── LLM Settings handlers ────────────────────────────────────

DEFAULT_LLM_CONFIG = {
    "setting_key": LLM_SETTING_KEY,
    "active_provider": "openai",
    "openai": {
        "api_key": "",
        "model": "gpt-4o-mini",
        "max_tokens": 2048,
    },
    "vllm": {
        "api_key": "",
        "base_url": "http://localhost:8000",
        "model": "meta-llama/Llama-3-8b-instruct",
        "max_tokens": 2048,
    },
    "ollama": {
        "base_url": "http://localhost:11434",
        "model": "llama3",
        "max_tokens": 2048,
    },
}


def get_llm_settings(event: dict) -> dict:
    _, err = _require_superadmin(event)
    if err:
        return err
    result = settings_table.get_item(Key={"setting_key": LLM_SETTING_KEY})
    item = result.get("Item") or DEFAULT_LLM_CONFIG.copy()
    # Remove the DynamoDB key from response
    item.pop("setting_key", None)
    return _ok({"settings": item})


def save_llm_settings(event: dict) -> dict:
    _, err = _require_superadmin(event)
    if err:
        return err
    try:
        body = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return _error(400, "Invalid JSON")

    # Build the config to store, merging with defaults
    result = settings_table.get_item(Key={"setting_key": LLM_SETTING_KEY})
    existing = result.get("Item") or DEFAULT_LLM_CONFIG.copy()

    active_provider = body.get("active_provider", existing.get("active_provider", "openai"))

    # Merge per-provider settings
    for provider in ("openai", "vllm", "ollama"):
        if provider in body:
            merged = {**existing.get(provider, {}), **body[provider]}
            existing[provider] = merged

    existing["active_provider"] = active_provider
    existing["setting_key"] = LLM_SETTING_KEY
    existing["updated_at"] = datetime.now(timezone.utc).isoformat()

    settings_table.put_item(Item=existing)
    return _ok({"success": True, "message": "LLM settings saved"})


QDRANT_SETTING_KEY = "qdrant_config"


def get_qdrant_settings(event: dict) -> dict:
    _, err = _require_superadmin(event)
    if err:
        return err
    result = settings_table.get_item(Key={"setting_key": QDRANT_SETTING_KEY})
    item = result.get("Item") or {"url": "", "api_key": ""}
    item.pop("setting_key", None)
    return _ok({"settings": item})


def save_qdrant_settings(event: dict) -> dict:
    _, err = _require_superadmin(event)
    if err:
        return err
    try:
        body = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return _error(400, "Invalid JSON")

    url     = body.get("url", "").strip()
    api_key = body.get("api_key", "").strip()

    if not url:
        return _error(400, "url is required")

    from datetime import datetime, timezone
    settings_table.put_item(Item={
        "setting_key": QDRANT_SETTING_KEY,
        "url":         url,
        "api_key":     api_key,
        "updated_at":  datetime.now(timezone.utc).isoformat(),
    })
    return _ok({"success": True, "message": "Qdrant settings saved"})


def test_qdrant_connection(event: dict) -> dict:
    """Test Qdrant connectivity using the saved settings."""
    _, err = _require_superadmin(event)
    if err:
        return err

    result = settings_table.get_item(Key={"setting_key": QDRANT_SETTING_KEY})
    item   = result.get("Item") or {}
    url    = item.get("url", "").rstrip("/")
    api_key = item.get("api_key", "")

    if not url:
        return _ok({"success": False, "message": "No Qdrant URL configured. Please save settings first."})

    import urllib.request
    import urllib.error
    import ssl
    import time

    start = time.time()
    try:
        req = urllib.request.Request(f"{url}/collections")
        if api_key:
            req.add_header("api-key", api_key)
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        with urllib.request.urlopen(req, timeout=10, context=ctx) as resp:
            elapsed = round((time.time() - start) * 1000)
            body    = resp.read().decode("utf-8", errors="replace")
            return _ok({
                "success": True,
                "message": f"Connected successfully ({elapsed}ms). Qdrant is reachable.",
                "url":     url,
            })
    except urllib.error.HTTPError as e:
        elapsed = round((time.time() - start) * 1000)
        # 401 means connected but wrong key — still reachable
        if e.code == 401:
            return _ok({
                "success": True,
                "message": f"Connected ({elapsed}ms) — authentication required. Check your API key.",
                "url":     url,
            })
        return _ok({"success": False, "message": f"HTTP {e.code}: {str(e.reason)}"})
    except urllib.error.URLError as e:
        reason = str(e.reason)
        if "110" in reason or "timed out" in reason.lower() or "Connection refused" in reason:
            return _ok({
                "success": False,
                "message": f"Connection failed: {reason}. Make sure the Qdrant instance is publicly accessible from the internet (not a local/private IP).",
            })
        return _ok({"success": False, "message": f"Connection error: {reason}"})
    except Exception as e:
        return _ok({"success": False, "message": f"Unexpected error: {str(e)}"})


# ── Redis Settings ────────────────────────────────────────────

def get_redis_settings(event: dict) -> dict:
    _, err = _require_superadmin(event)
    if err:
        return err
    result = settings_table.get_item(Key={"setting_key": REDIS_SETTING_KEY})
    item = result.get("Item") or {"host": "", "port": "6379", "password": "", "db": "0"}
    item.pop("setting_key", None)
    return _ok({"settings": item})


def save_redis_settings(event: dict) -> dict:
    _, err = _require_superadmin(event)
    if err:
        return err
    try:
        body = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return _error(400, "Invalid JSON")

    host     = body.get("host", "").strip()
    port     = str(body.get("port", "6379")).strip()
    password = body.get("password", "").strip()
    db       = str(body.get("db", "0")).strip()

    if not host:
        return _error(400, "host is required")

    settings_table.put_item(Item={
        "setting_key": REDIS_SETTING_KEY,
        "host":        host,
        "port":        port,
        "password":    password,
        "db":          db,
        "updated_at":  datetime.now(timezone.utc).isoformat(),
    })
    return _ok({"success": True, "message": "Redis settings saved"})


def test_redis_connection(event: dict) -> dict:
    """Test Redis connectivity using the saved settings."""
    _, err = _require_superadmin(event)
    if err:
        return err

    result = settings_table.get_item(Key={"setting_key": REDIS_SETTING_KEY})
    item     = result.get("Item") or {}
    host     = item.get("host", "").strip()
    port     = int(item.get("port", "6379") or "6379")
    password = item.get("password", "").strip()
    db       = int(item.get("db", "0") or "0")

    if not host:
        return _ok({"success": False, "message": "No Redis host configured. Please save settings first."})

    import socket, time
    start = time.time()
    try:
        # Low-level TCP + PING check (no redis-py dependency needed)
        sock = socket.create_connection((host, port), timeout=10)
        # Send AUTH if password provided, then PING
        if password:
            auth_cmd = f"*2\r\n$4\r\nAUTH\r\n${len(password)}\r\n{password}\r\n"
            sock.sendall(auth_cmd.encode())
            auth_resp = sock.recv(256).decode("utf-8", errors="replace")
            if "ERR" in auth_resp or "WRONGPASS" in auth_resp:
                sock.close()
                return _ok({"success": False, "message": f"Authentication failed: {auth_resp.strip()}"})
        sock.sendall(b"*1\r\n$4\r\nPING\r\n")
        pong = sock.recv(256).decode("utf-8", errors="replace")
        sock.close()
        elapsed = round((time.time() - start) * 1000)
        if "+PONG" in pong or "PONG" in pong:
            return _ok({"success": True, "message": f"Connected successfully ({elapsed}ms). Redis is reachable."})
        return _ok({"success": False, "message": f"Unexpected response: {pong.strip()}"})
    except socket.timeout:
        return _ok({"success": False, "message": "Connection timed out. Check host/port and firewall rules."})
    except ConnectionRefusedError:
        return _ok({"success": False, "message": f"Connection refused on {host}:{port}."})
    except Exception as ex:
        return _ok({"success": False, "message": f"Error: {str(ex)}"})


# ── Agent Permissions ─────────────────────────────────────────

def get_agent_permission(event: dict, agent_id: str) -> dict:
    _, err = _require_any_user(event)
    if err:
        return err
    result = agent_perms_table.get_item(Key={"agent_id": agent_id})
    item = result.get("Item") or {"agent_id": agent_id, "visibility": "private", "shared_with": []}
    item["shared_with"] = list(item.get("shared_with") or [])
    return _ok({"permissions": item})


def set_agent_permission(event: dict, agent_id: str) -> dict:
    payload, err = _require_any_user(event)
    if err:
        return err
    try:
        body = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return _error(400, "Invalid JSON")

    visibility = body.get("visibility", "private")
    if visibility not in ("public", "private"):
        return _error(400, "visibility must be 'public' or 'private'")

    now = datetime.now(timezone.utc).isoformat()
    existing = agent_perms_table.get_item(Key={"agent_id": agent_id}).get("Item") or {}
    shared_with = list(existing.get("shared_with") or [])

    agent_perms_table.put_item(Item={
        "agent_id":    agent_id,
        "visibility":  visibility,
        "shared_with": shared_with,
        "owner_id":    existing.get("owner_id") or payload.get("sub") or payload.get("user_id") or "",
        "updated_at":  now,
        "created_at":  existing.get("created_at", now),
    })
    return _ok({"success": True, "visibility": visibility})


def share_agent(event: dict, agent_id: str) -> dict:
    """Add a user email/id to shared_with list."""
    payload, err = _require_any_user(event)
    if err:
        return err
    try:
        body = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return _error(400, "Invalid JSON")

    user_ref = (body.get("user_email") or body.get("user_id") or "").strip()
    if not user_ref:
        return _error(400, "user_email or user_id is required")

    now = datetime.now(timezone.utc).isoformat()
    existing = agent_perms_table.get_item(Key={"agent_id": agent_id}).get("Item") or {}
    shared_with = set(existing.get("shared_with") or [])
    shared_with.add(user_ref)

    agent_perms_table.put_item(Item={
        "agent_id":    agent_id,
        "visibility":  existing.get("visibility", "private"),
        "shared_with": list(shared_with),
        "owner_id":    existing.get("owner_id") or payload.get("sub") or payload.get("user_id") or "",
        "updated_at":  now,
        "created_at":  existing.get("created_at", now),
    })
    return _ok({"success": True, "shared_with": list(shared_with)})


def unshare_agent(event: dict, agent_id: str) -> dict:
    """Remove a user email/id from shared_with list."""
    payload, err = _require_any_user(event)
    if err:
        return err
    try:
        body = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return _error(400, "Invalid JSON")

    user_ref = (body.get("user_email") or body.get("user_id") or "").strip()
    if not user_ref:
        return _error(400, "user_email or user_id is required")

    now = datetime.now(timezone.utc).isoformat()
    existing = agent_perms_table.get_item(Key={"agent_id": agent_id}).get("Item") or {}
    shared_with = set(existing.get("shared_with") or [])
    shared_with.discard(user_ref)

    agent_perms_table.put_item(Item={
        "agent_id":    agent_id,
        "visibility":  existing.get("visibility", "private"),
        "shared_with": list(shared_with),
        "owner_id":    existing.get("owner_id") or payload.get("sub") or payload.get("user_id") or "",
        "updated_at":  now,
        "created_at":  existing.get("created_at", now),
    })
    return _ok({"success": True, "shared_with": list(shared_with)})


def list_all_agent_permissions(event: dict) -> dict:
    """List permissions for all agents."""
    _, err = _require_superadmin(event)
    if err:
        return err
    result = agent_perms_table.scan()
    items = result.get("Items", [])
    for item in items:
        item["shared_with"] = list(item.get("shared_with") or [])
    return _ok({"permissions": items})


# ── User-accessible Agent Permission Routes ───────────────────
# Any authenticated user can get/set permissions for their agents.

def user_get_agent_permission(event: dict, agent_id: str) -> dict:
    """Any authenticated user can fetch visibility for an agent."""
    _, err = _require_any_user(event)
    if err:
        return err
    result = agent_perms_table.get_item(Key={"agent_id": agent_id})
    item = result.get("Item") or {"agent_id": agent_id, "visibility": "private", "shared_with": []}
    item["shared_with"] = list(item.get("shared_with") or [])
    return _ok({"permissions": item})


def user_set_agent_permission(event: dict, agent_id: str) -> dict:
    """Any authenticated user can set visibility for their agent."""
    payload, err = _require_any_user(event)
    if err:
        return err
    try:
        body = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return _error(400, "Invalid JSON")

    visibility = body.get("visibility", "private")
    if visibility not in ("public", "private"):
        return _error(400, "visibility must be 'public' or 'private'")

    now = datetime.now(timezone.utc).isoformat()
    existing = agent_perms_table.get_item(Key={"agent_id": agent_id}).get("Item") or {}
    shared_with = list(existing.get("shared_with") or [])

    agent_perms_table.put_item(Item={
        "agent_id":    agent_id,
        "visibility":  visibility,
        "shared_with": shared_with,
        "owner_id":    existing.get("owner_id") or payload.get("sub") or payload.get("user_id") or "",
        "updated_at":  now,
        "created_at":  existing.get("created_at", now),
    })
    return _ok({"success": True, "visibility": visibility})


def user_share_agent(event: dict, agent_id: str) -> dict:
    """Any authenticated user can share their agent with another email."""
    payload, err = _require_any_user(event)
    if err:
        return err
    try:
        body = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return _error(400, "Invalid JSON")

    user_ref = (body.get("user_email") or body.get("user_id") or "").strip()
    if not user_ref:
        return _error(400, "user_email or user_id is required")

    now = datetime.now(timezone.utc).isoformat()
    existing = agent_perms_table.get_item(Key={"agent_id": agent_id}).get("Item") or {}
    shared_with = set(existing.get("shared_with") or [])
    shared_with.add(user_ref)

    agent_perms_table.put_item(Item={
        "agent_id":    agent_id,
        "visibility":  existing.get("visibility", "private"),
        "shared_with": list(shared_with),
        "owner_id":    existing.get("owner_id") or payload.get("sub") or payload.get("user_id") or "",
        "updated_at":  now,
        "created_at":  existing.get("created_at", now),
    })
    return _ok({"success": True, "shared_with": list(shared_with)})


def user_unshare_agent(event: dict, agent_id: str) -> dict:
    """Any authenticated user can remove a share from their agent."""
    payload, err = _require_any_user(event)
    if err:
        return err
    try:
        body = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return _error(400, "Invalid JSON")

    user_ref = (body.get("user_email") or body.get("user_id") or "").strip()
    if not user_ref:
        return _error(400, "user_email or user_id is required")

    now = datetime.now(timezone.utc).isoformat()
    existing = agent_perms_table.get_item(Key={"agent_id": agent_id}).get("Item") or {}
    shared_with = set(existing.get("shared_with") or [])
    shared_with.discard(user_ref)

    agent_perms_table.put_item(Item={
        "agent_id":    agent_id,
        "visibility":  existing.get("visibility", "private"),
        "shared_with": list(shared_with),
        "owner_id":    existing.get("owner_id") or payload.get("sub") or payload.get("user_id") or "",
        "updated_at":  now,
        "created_at":  existing.get("created_at", now),
    })
    return _ok({"success": True, "shared_with": list(shared_with)})


def user_batch_get_permissions(event: dict) -> dict:
    """Get permissions for a list of agent IDs (query param: ids=id1,id2,...)."""
    _, err = _require_any_user(event)
    if err:
        return err
    qs = event.get("queryStringParameters") or {}
    ids_str = qs.get("ids", "").strip()
    if not ids_str:
        return _ok({"permissions": {}})
    agent_ids = [i.strip() for i in ids_str.split(",") if i.strip()][:50]

    result_map = {}
    for aid in agent_ids:
        item = agent_perms_table.get_item(Key={"agent_id": aid}).get("Item")
        if item:
            item["shared_with"] = list(item.get("shared_with") or [])
            result_map[aid] = item
        else:
            result_map[aid] = {"agent_id": aid, "visibility": "private", "shared_with": []}
    return _ok({"permissions": result_map})


def get_restricted_agent_ids(event: dict) -> dict:
    """
    POST body: { "agent_ids": ["id1", "id2", ...] }

    For each submitted agent ID:
      - Has a record + visibility=public           → visible (visibility_map: 'public')
      - Has a record + private + owner match       → visible (visibility_map: 'owned')
      - Has a record + private + email in shared   → visible (visibility_map: 'shared')
      - Has a record + private + no match          → restricted
      - NO record at all                           → restricted (default private)

    Superadmins bypass and see everything.
    Response: { "restricted_ids": [...], "visibility_map": { id: 'public'|'owned'|'shared' } }
    """
    payload, err = _require_any_user(event)
    if err:
        return err

    user_id    = payload.get("sub") or payload.get("user_id") or ""
    user_email = (payload.get("email") or "").strip().lower()
    role       = payload.get("role", "user")

    # Parse submitted agent IDs
    try:
        body = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        body = {}
    agent_ids: list[str] = body.get("agent_ids") or []
    # Deduplicate while preserving order (DynamoDB batch_get_item rejects duplicate keys)
    seen: set[str] = set()
    unique_ids: list[str] = []
    for aid in agent_ids:
        if aid not in seen:
            seen.add(aid)
            unique_ids.append(aid)
    agent_ids = unique_ids

    # Superadmins can see everything
    if role == "superadmin":
        return _ok({"restricted_ids": [], "visibility_map": {id: "owned" for id in agent_ids}})

    if not agent_ids:
        return _ok({"restricted_ids": [], "visibility_map": {}})

    # Load permission records for just these agent IDs
    # Use individual GetItem calls (BatchGetItem requires separate IAM permission)
    try:
        ddb = boto3.resource("dynamodb", region_name=os.environ.get("AWS_REGION", "eu-north-1"))
        table = ddb.Table(AGENT_PERMISSIONS_TABLE)
        perm_map: dict[str, dict] = {}
        for aid in agent_ids:
            resp = table.get_item(Key={"agent_id": aid})
            if "Item" in resp:
                perm_map[aid] = resp["Item"]
    except Exception as exc:
        logger.error("get_item failed: %s", exc)
        perm_map = {}

    restricted: list[str] = []
    visibility_map: dict[str, str] = {}

    for aid in agent_ids:
        item = perm_map.get(aid)
        if item is None:
            # No record → default private, restricted
            restricted.append(aid)
            continue

        visibility  = item.get("visibility", "private")
        owner_id    = item.get("owner_id", "")
        shared_with = [s.strip().lower() for s in (item.get("shared_with") or [])]

        if visibility == "public":
            visibility_map[aid] = "public"
        elif owner_id and owner_id == user_id:
            visibility_map[aid] = "owned"
        elif user_email and user_email in shared_with:
            visibility_map[aid] = "shared"
        else:
            restricted.append(aid)

    return _ok({"restricted_ids": restricted, "visibility_map": visibility_map})


# ── Lambda entry point ────────────────────────────────────────

def lambda_handler(event: dict, context) -> dict:
    method = (event.get("httpMethod") or "").upper()
    path   = event.get("path", "")

    if method == "OPTIONS":
        return {"statusCode": 200, "headers": CORS_HEADERS, "body": ""}

    try:
        # ── User routes ──────────────────────────────────────
        if path == "/admin/users":
            if method == "GET":
                return list_users(event)
            if method == "POST":
                return create_user(event)

        if "/reset-password" in path and method == "POST":
            uid = path.split("/admin/users/")[1].replace("/reset-password", "")
            return reset_password(event, uid)

        if path.startswith("/admin/users/"):
            uid = path.split("/admin/users/")[1]
            if method == "GET":
                return get_user(event, uid)
            if method == "PUT":
                return update_user(event, uid)
            if method == "DELETE":
                return delete_user(event, uid)

        if path == "/admin/me/change-password" and method == "PUT":
            return change_own_password(event)

        # ── LLM Settings routes ──────────────────────
        if path == "/admin/llm-settings":
            if method == "GET":
                return get_llm_settings(event)
            if method == "PUT":
                return save_llm_settings(event)

        # ── Qdrant Settings routes ───────────────────
        if path == "/admin/qdrant-settings/test" and method == "POST":
            return test_qdrant_connection(event)

        if path == "/admin/qdrant-settings":
            if method == "GET":
                return get_qdrant_settings(event)
            if method == "PUT":
                return save_qdrant_settings(event)

        # ── Redis Settings routes ────────────────────
        if path == "/admin/redis-settings/test" and method == "POST":
            return test_redis_connection(event)

        if path == "/admin/redis-settings":
            if method == "GET":
                return get_redis_settings(event)
            if method == "PUT":
                return save_redis_settings(event)

        # ── Visible agent IDs (any user) ─────────────────────
        if path == "/admin/visible-agent-ids" and method == "POST":
            return get_restricted_agent_ids(event)

        # ── Agent Permissions routes (admin) ─────────────────
        if path == "/admin/agent-permissions" and method == "GET":
            return list_all_agent_permissions(event)

        if path.startswith("/admin/agent-permissions/"):
            remainder = path.split("/admin/agent-permissions/")[1]
            if remainder.endswith("/share"):
                aid = remainder.replace("/share", "")
                if method == "POST":
                    return share_agent(event, aid)
                if method == "DELETE":
                    return unshare_agent(event, aid)
            else:
                aid = remainder
                if method == "GET":
                    return get_agent_permission(event, aid)
                if method == "PUT":
                    return set_agent_permission(event, aid)

        # ── Agent Permissions routes (user-accessible) ────────
        if path == "/agents/permissions" and method == "GET":
            return user_batch_get_permissions(event)

        if path.startswith("/agents/") and "/permissions" in path:
            seg = path.split("/agents/")[1]
            if seg.endswith("/permissions/share"):
                aid = seg.replace("/permissions/share", "")
                if method == "POST":
                    return user_share_agent(event, aid)
                if method == "DELETE":
                    return user_unshare_agent(event, aid)
            elif seg.endswith("/permissions"):
                aid = seg.replace("/permissions", "")
                if method == "GET":
                    return user_get_agent_permission(event, aid)
                if method == "PUT":
                    return user_set_agent_permission(event, aid)

        # ── Connection routes ────────────────────────────────
        if path == "/admin/connections":
            if method == "GET":
                return list_connections(event)
            if method == "POST":
                return save_connection(event)

        if path.startswith("/admin/connections/"):
            cid = path.split("/admin/connections/")[1]
            if "/test" in cid:
                cid = cid.replace("/test", "")
                if method == "POST":
                    return test_connection(event, cid)
            else:
                if method == "DELETE":
                    return delete_connection(event, cid)

        return _error(404, f"Not found: {method} {path}")
    except Exception as exc:
        logger.exception("Unhandled error")
        return _error(500, str(exc))


