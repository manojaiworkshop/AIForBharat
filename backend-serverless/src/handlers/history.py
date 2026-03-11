"""
History handler
  GET  /history/conversations          — list all conversations for the authenticated user
  GET  /history?conversation_id=<id>   — get messages for a conversation
  DELETE /history?conversation_id=<id> — delete a conversation and all its messages
"""
import json
import logging
import os
import base64

import boto3
from boto3.dynamodb.conditions import Key

logger = logging.getLogger()
logger.setLevel(logging.INFO)

CHATS_TABLE = os.environ.get("CHATS_TABLE", "mercury-grid-chats")

dynamodb    = boto3.resource("dynamodb")
chats_table = dynamodb.Table(CHATS_TABLE)

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
    "Content-Type": "application/json",
}


def _ok(body: dict) -> dict:
    return {"statusCode": 200, "headers": CORS_HEADERS, "body": json.dumps(body, default=str)}


def _error(status: int, message: str) -> dict:
    return {"statusCode": status, "headers": CORS_HEADERS, "body": json.dumps({"error": message})}


def _get_user_id(event: dict) -> str:
    auth = (event.get("headers") or {}).get("Authorization") or ""
    if auth.startswith("Bearer "):
        try:
            token  = auth[7:]
            parts  = token.split(".")
            if len(parts) == 3:
                padding = 4 - len(parts[1]) % 4
                payload = json.loads(base64.urlsafe_b64decode(parts[1] + "=" * padding))
                return payload.get("sub", "anonymous")
        except Exception:
            pass
    return "anonymous"


def _list_conversations(user_id: str) -> dict:
    """Return all conversation metadata items for this user, newest first."""
    response = chats_table.query(
        IndexName="user-id-index",
        KeyConditionExpression=Key("user_id").eq(user_id) & Key("sk").eq("METADATA"),
        ScanIndexForward=False,
    )
    conversations = [
        {
            "id":         item["conversation_id"],
            "title":      item.get("title", "Untitled"),
            "created_at": item.get("created_at", ""),
            "pinned":     item.get("pinned", False),
        }
        for item in response.get("Items", [])
    ]
    return _ok({"conversations": conversations})


def _get_messages(conversation_id: str) -> dict:
    """Return all chat messages for a conversation (excludes METADATA item)."""
    response = chats_table.query(
        KeyConditionExpression=Key("conversation_id").eq(conversation_id),
        ScanIndexForward=True,
    )
    messages = [
        {
            "role":      item["role"],
            "content":   item["content"],
            "timestamp": item["timestamp"],
        }
        for item in response.get("Items", [])
        if item["sk"] != "METADATA"
    ]
    return _ok({"conversation_id": conversation_id, "messages": messages})


def _delete_conversation(conversation_id: str) -> dict:
    """Delete all DynamoDB items for a conversation."""
    # Fetch all item keys first
    response = chats_table.query(
        KeyConditionExpression=Key("conversation_id").eq(conversation_id),
        ProjectionExpression="conversation_id, sk",
    )
    items = response.get("Items", [])
    if not items:
        return _ok({"deleted": 0})

    # Batch delete (max 25 per call)
    with chats_table.batch_writer() as batch:
        for item in items:
            batch.delete_item(Key={"conversation_id": item["conversation_id"], "sk": item["sk"]})

    logger.info("Deleted %d items for conversation %s", len(items), conversation_id)
    return _ok({"deleted": len(items)})


def _update_title(conversation_id: str, user_id: str, new_title: str) -> dict:
    """Update the title of a conversation's METADATA item."""
    chats_table.update_item(
        Key={"conversation_id": conversation_id, "sk": "METADATA"},
        UpdateExpression="SET title = :t",
        ExpressionAttributeValues={":t": new_title},
    )
    return _ok({"updated": True})


def lambda_handler(event: dict, context) -> dict:
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": CORS_HEADERS, "body": ""}

    method = event.get("httpMethod", "GET")
    path   = event.get("path", "")
    params = event.get("queryStringParameters") or {}
    user_id = _get_user_id(event)

    # GET /history/conversations
    if method == "GET" and path.endswith("/conversations"):
        return _list_conversations(user_id)

    conversation_id = params.get("conversation_id")

    # GET /history?conversation_id=xxx
    if method == "GET" and conversation_id:
        return _get_messages(conversation_id)

    # DELETE /history?conversation_id=xxx
    if method == "DELETE" and conversation_id:
        return _delete_conversation(conversation_id)

    # PATCH /history — rename
    if method == "PATCH":
        try:
            body = json.loads(event.get("body") or "{}")
        except Exception:
            return _error(400, "Invalid JSON")
        cid   = body.get("conversation_id")
        title = (body.get("title") or "").strip()
        if not cid or not title:
            return _error(400, "conversation_id and title required")
        return _update_title(cid, user_id, title)

    return _error(400, "Provide ?conversation_id= parameter")
