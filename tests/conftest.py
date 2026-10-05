"""ทดสอบด้วย DB ชั่วคราว แยกจากข้อมูลใช้งานจริง"""

import os
import tempfile
from pathlib import Path
import pytest

os.environ["JWT_SECRET"] = "test-only-" + "x" * 64
temporary = tempfile.TemporaryDirectory(prefix="rov-test-")
os.environ["DATABASE_URL"] = "sqlite:///" + str(Path(temporary.name) / "test.db")
os.environ["ACADEMY_STORAGE"] = str(Path(temporary.name) / "academy_sessions")

from fastapi.testclient import TestClient
from backend.main import app
from backend.database import Base, engine, SessionLocal
from backend.importer import clean_workbook, import_records
from backend.config import ROOT


@pytest.fixture
def client():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        import_records(db, clean_workbook(ROOT / "data/RoV_Academy_Answers_แก้ชีส.xlsx"))
    with TestClient(app) as client:
        yield client


def register_login(client, username):
    response = client.post(
        "/auth/register",
        json={
            "username": username,
            "email": f"{username}@example.com",
            "password": "TestPassword123",
        },
    )
    assert response.status_code == 201, response.text
    response = client.post(
        "/auth/login", json={"username": username, "password": "TestPassword123"}
    )
    assert response.status_code == 200
    return {"Authorization": "Bearer " + response.json()["access_token"]}


@pytest.fixture
def admin(client):
    return register_login(client, "admin")


@pytest.fixture
def member(client, admin):
    return register_login(client, "member")
