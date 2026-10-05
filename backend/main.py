"""ประกอบแอป; บัญชีและข้อสอบไม่มีข้อมูลจำลองใน API"""

from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from backend.config import CORS_ORIGINS, validate_config
from backend.database import init_db, SessionLocal
from backend.routers import auth, questions, stats, quiz, bot, settings
from backend.ws.logs import router as ws_router
from backend.config import REDIS_URL
from redis import Redis, RedisError
from sqlalchemy import text


@asynccontextmanager
async def lifespan(app):
    validate_config()
    init_db()
    yield


app = FastAPI(title="RoV Academy Web API", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)
for router in [
    auth.router,
    questions.router,
    stats.router,
    quiz.router,
    bot.router,
    settings.router,
    ws_router,
]:
    app.include_router(router)


@app.get("/health")
def health():
    return {"status": "ok", "service": "rov-academy"}

@app.get("/ready")
def ready():
    checks={"database":False,"redis":False}
    try:
        with SessionLocal() as db: db.execute(text("SELECT 1")); checks["database"]=True
    except Exception: pass
    client=Redis.from_url(REDIS_URL,socket_connect_timeout=1,socket_timeout=1)
    try: checks["redis"]=bool(client.ping())
    except RedisError: pass
    finally: client.close()
    if not all(checks.values()): raise HTTPException(503,detail={"status":"not_ready","checks":checks})
    return {"status":"ready","checks":checks}
