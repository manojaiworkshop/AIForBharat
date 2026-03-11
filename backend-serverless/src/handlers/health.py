"""
Health check handler — GET /health
"""
import json
import logging
from datetime import datetime, timezone

logger = logging.getLogger()
logger.setLevel(logging.INFO)

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Request-ID",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Content-Type": "application/json",
}


def lambda_handler(event: dict, context) -> dict:
    logger.info("Health check requested")

    return {
        "statusCode": 200,
        "headers": CORS_HEADERS,
        "body": json.dumps({
            "status": "healthy",
            "service": "mercury-grid-backend",
            "version": "1.0.0",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "region": context.invoked_function_arn.split(":")[3] if context else "local",
        }),
    }
