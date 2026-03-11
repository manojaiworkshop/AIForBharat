"""
Auth handler — POST /auth/register  and  POST /auth/login
"""
import json
import logging
import os
import uuid
import hashlib
import hmac
import base64
from datetime import datetime, timezone, timedelta

import boto3
from boto3.dynamodb.conditions import Key

logger = logging.getLogger()
logger.setLevel(logging.INFO)

USERS_TABLE        = os.environ.get("USERS_TABLE", "mercury-grid-users")
JWT_SECRET         = os.environ.get("JWT_SECRET", "mercury-grid-secret-change-in-prod")
SUPERADMIN_EMAIL   = os.environ.get("SUPERADMIN_EMAIL", "").strip().lower()
SUPERADMIN_PASSWORD = os.environ.get("SUPERADMIN_PASSWORD", "")

dynamodb = boto3.resource("dynamodb")
users_table = dynamodb.Table(USERS_TABLE)

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Content-Type": "application/json",
}


def _ok(body: dict, status: int = 200) -> dict:
    return {"statusCode": status, "headers": CORS_HEADERS, "body": json.dumps(body)}


def _error(status: int, message: str) -> dict:
    return {"statusCode": status, "headers": CORS_HEADERS, "body": json.dumps({"error": message})}


# ── Lightweight JWT (HS256) without external libs ────────────────────────────

def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _create_jwt(payload: dict) -> str:
    header  = _b64url(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    payload_enc = _b64url(json.dumps(payload).encode())
    sig = hmac.new(
        JWT_SECRET.encode(),
        f"{header}.{payload_enc}".encode(),
        hashlib.sha256,
    ).digest()
    return f"{header}.{payload_enc}.{_b64url(sig)}"


def _ensure_superadmin():
    """Create / update the superadmin record in DynamoDB on first login."""
    if not SUPERADMIN_EMAIL or not SUPERADMIN_PASSWORD:
        return
    existing = users_table.get_item(Key={"email": SUPERADMIN_EMAIL}).get("Item")
    if not existing:
        users_table.put_item(Item={
            "email":      SUPERADMIN_EMAIL,
            "user_id":    "superadmin",
            "name":       "Super Admin",
            "password":   _hash_password(SUPERADMIN_PASSWORD),
            "role":       "superadmin",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "plan":       "unlimited",
        })
    elif existing.get("role") != "superadmin":
        # Promote if already registered as normal user
        users_table.update_item(
            Key={"email": SUPERADMIN_EMAIL},
            UpdateExpression="SET #r = :r",
            ExpressionAttributeNames={"#r": "role"},
            ExpressionAttributeValues={":r": "superadmin"},
        )


def _verify_jwt(token: str) -> dict | None:
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return None
        header, payload_enc, sig = parts
        expected_sig = _b64url(
            hmac.new(JWT_SECRET.encode(), f"{header}.{payload_enc}".encode(), hashlib.sha256).digest()
        )
        if not hmac.compare_digest(sig, expected_sig):
            return None
        padding = 4 - len(payload_enc) % 4
        payload = json.loads(base64.urlsafe_b64decode(payload_enc + "=" * padding))
        if payload.get("exp", 0) < datetime.now(timezone.utc).timestamp():
            return None
        return payload
    except Exception:
        return None


# ── Password hashing ─────────────────────────────────────────────────────────

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


# ── Handlers ─────────────────────────────────────────────────────────────────

def _register(body: dict) -> dict:
    name     = (body.get("name") or "").strip()
    email    = (body.get("email") or "").strip().lower()
    password = body.get("password") or ""

    if not name or not email or not password:
        return _error(400, "name, email, and password are required")
    if len(password) < 8:
        return _error(400, "Password must be at least 8 characters")
    if "@" not in email:
        return _error(400, "Invalid email address")

    # Check if email already exists
    existing = users_table.get_item(Key={"email": email}).get("Item")
    if existing:
        return _error(409, "An account with this email already exists")

    user_id  = str(uuid.uuid4())
    pw_hash  = _hash_password(password)
    now      = datetime.now(timezone.utc).isoformat()

    users_table.put_item(Item={
        "email":      email,
        "user_id":    user_id,
        "name":       name,
        "password":   pw_hash,
        "created_at": now,
        "role":       "user",
        "plan":       "free",
    })

    token = _create_jwt({
        "sub":     user_id,
        "email":   email,
        "name":    name,
        "role":    "user",
        "exp":     int((datetime.now(timezone.utc) + timedelta(days=30)).timestamp()),
    })

    return _ok({"user_id": user_id, "name": name, "email": email, "token": token, "role": "user"}, 201)


def _login(body: dict) -> dict:
    email    = (body.get("email") or "").strip().lower()
    password = body.get("password") or ""

    if not email or not password:
        return _error(400, "email and password are required")

    # Ensure superadmin exists in DynamoDB
    if email == SUPERADMIN_EMAIL:
        _ensure_superadmin()

    user = users_table.get_item(Key={"email": email}).get("Item")
    if not user or not _verify_password(password, user["password"]):
        return _error(401, "Invalid email or password")

    role = user.get("role", "user")
    token = _create_jwt({
        "sub":   user["user_id"],
        "email": user["email"],
        "name":  user["name"],
        "role":  role,
        "exp":   int((datetime.now(timezone.utc) + timedelta(days=30)).timestamp()),
    })

    return _ok({
        "user_id": user["user_id"],
        "name":    user["name"],
        "email":   user["email"],
        "token":   token,
        "role":    role,
    })


def lambda_handler(event: dict, context) -> dict:
    method = event.get("httpMethod", "")
    path   = event.get("path", "")

    if method == "OPTIONS":
        return {"statusCode": 200, "headers": CORS_HEADERS, "body": ""}

    try:
        body = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return _error(400, "Invalid JSON body")

    if path.endswith("/register"):
        return _register(body)
    if path.endswith("/login"):
        return _login(body)

    return _error(404, "Not found")
