"""รับ JWT เป็น message แรกเพื่อไม่ให้ token ติด URL; replay log และ pub/sub"""

import asyncio
import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException
from redis.asyncio import Redis
from redis.exceptions import RedisError
from sqlalchemy import select
from backend.auth import token_user
from backend.config import REDIS_URL, CORS_ORIGINS
from backend.database import SessionLocal
from backend.models import BotRun

router = APIRouter()


@router.websocket("/ws/logs/{task_id}")
async def logs(ws: WebSocket, task_id: str):
    origin = ws.headers.get("origin")
    if origin and origin not in CORS_ORIGINS:
        await ws.close(code=1008)
        return
    await ws.accept()
    client = None
    pubsub = None
    try:
        first = await asyncio.wait_for(ws.receive_json(), timeout=10)
        with SessionLocal() as db:
            user = token_user(first.get("token", ""), db)
            run = db.scalar(select(BotRun).where(BotRun.task_id == task_id))
            if run is None or (run.started_by != user.id and not user.is_admin):
                raise HTTPException(403, "ไม่อนุญาต")
        client = Redis.from_url(
            REDIS_URL, decode_responses=True, socket_connect_timeout=3
        )
        pubsub = client.pubsub()
        await pubsub.subscribe(f"rov:logs:{task_id}")
        seen = set()
        for item in await client.lrange(f"rov:history:{task_id}", 0, -1):
            data = json.loads(item)
            seen.add(data["id"])
            await ws.send_json(data)
        while True:
            message = await pubsub.get_message(
                ignore_subscribe_messages=True, timeout=1
            )
            if message:
                data = json.loads(message["data"])
                if data["id"] not in seen:
                    seen.add(data["id"])
                    await ws.send_json(data)
            else:
                await ws.send_json({"type": "ping"})
            # ตรวจ expiration ระหว่างเชื่อมต่อระยะยาว
            with SessionLocal() as db:
                token_user(first.get("token", ""), db)
    except (HTTPException, asyncio.TimeoutError, ValueError, AttributeError):
        await ws.close(code=1008)
    except RedisError:
        await ws.send_json({"type": "error", "message": "Redis ไม่พร้อม กรุณาเชื่อมต่อใหม่"})
        await ws.close(code=1011)
    except (WebSocketDisconnect, RuntimeError):
        pass
    finally:
        if pubsub:
            await pubsub.aclose()
        if client:
            await client.aclose()
