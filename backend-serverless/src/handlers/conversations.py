"""
Conversations handler — GET /conversations

Returns a list of mock conversations.
Swap the body of `_fetch_conversations()` to read from DynamoDB.
"""
import json
import logging
from datetime import datetime, timezone, timedelta

logger = logging.getLogger()
logger.setLevel(logging.INFO)

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Request-ID",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Content-Type": "application/json",
}


def _fetch_conversations() -> list:
    """
    Replace with DynamoDB scan/query:
    ──────────────────────────────────
    import boto3, os
    table = boto3.resource("dynamodb").Table(os.environ["CONVERSATIONS_TABLE"])
    result = table.scan()
    return result.get("Items", [])
    """
    now = datetime.now(timezone.utc)
    return [
        {
            "id": "conv-001",
            "title": "Getting started with AWS",
            "preview": "How do I deploy to S3 + CloudFront?",
            "timestamp": (now - timedelta(minutes=5)).isoformat(),
            "message_count": 4,
        },
        {
            "id": "conv-002",
            "title": "Python Lambda tips",
            "preview": "What is the best way to handle errors in Lambda?",
            "timestamp": (now - timedelta(hours=2)).isoformat(),
            "message_count": 7,
        },
        {
            "id": "conv-003",
            "title": "Next.js static export",
            "preview": "Why use output: export in next.config.js?",
            "timestamp": (now - timedelta(days=1)).isoformat(),
            "message_count": 3,
        },
    ]


def lambda_handler(event: dict, context) -> dict:
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": CORS_HEADERS, "body": ""}

    logger.info("Conversations list requested")

    conversations = _fetch_conversations()

    return {
        "statusCode": 200,
        "headers": CORS_HEADERS,
        "body": json.dumps({
            "conversations": conversations,
            "total": len(conversations),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }),
    }
