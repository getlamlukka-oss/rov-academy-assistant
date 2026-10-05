"""ทดสอบข้อมูลจริง สิทธิ์ และกรณีโกง/ตอบซ้ำที่คะแนนต้องไม่เปลี่ยน"""

from collections import Counter
from unittest.mock import patch
from sqlalchemy import select
from backend.database import SessionLocal
from backend.importer import clean_workbook, import_records
from backend.config import ROOT
from backend.models import Question
from worker.matcher import option_index, match_question
from tests.conftest import register_login
import pytest


def test_excel_integrity_and_idempotence(client):
    records = clean_workbook(ROOT / "data/RoV_Academy_Answers_แก้ชีส.xlsx")
    assert len(records) == 184
    assert len({q["chapter_id"] for q in records}) == 40
    assert sum(q["verified"] for q in records) == 6
    assert Counter(q["source_type"] for q in records)["กำกวม"] == 3
    assert all(q["options"][q["answer_idx"]] == q["answer_text"] for q in records)
    with SessionLocal() as db:
        q = db.scalar(select(Question).limit(1))
        q.note = "admin edit"
        db.commit()
        result = import_records(db, records)
        assert result["added"] == 0 and result["skipped"] == 184
        assert db.get(Question, q.id).note == "admin edit"


def test_auth_and_permissions(client, admin, member):
    assert client.get("/questions/").status_code == 401
    assert client.get("/auth/me", headers=admin).json()["is_admin"]
    assert not client.get("/auth/me", headers=member).json()["is_admin"]
    assert client.get("/settings/users", headers=member).status_code == 403
    assert "hashed_pw" not in client.get("/settings/users", headers=admin).text
    assert client.patch("/questions/1/verify", headers=member).status_code == 403
    assert (
        client.put("/questions/1", headers=member, json={"answer_idx": 0}).status_code
        == 403
    )
    assert (
        client.post(
            "/auth/login", json={"username": "admin", "password": "wrong"}
        ).status_code
        == 401
    )
    assert (
        client.post(
            "/auth/register",
            json={
                "username": "ADMIN",
                "email": "test@example.com",
                "password": "TestPassword123",
            },
        ).status_code
        == 409
    )


def test_stats_filters_and_edit(client, admin):
    stats = client.get("/stats/", headers=admin).json()
    assert (
        stats["total"],
        stats["chapters"],
        stats["verified"],
        stats["ambiguous"],
        stats["analyzed"],
        stats["reference"],
    ) == (184, 40, 6, 3, 36, 139)
    chapters = client.get("/stats/chapters", headers=admin).json()
    assert len(chapters) == 40 and sum(c["total"] for c in chapters) == 184
    assert len(client.get("/questions/?status=ambiguous", headers=admin).json()) == 3
    q = client.get("/questions/38/1", headers=admin).json()
    assert q["verified"]
    changed = client.put(
        f'/questions/{q["id"]}',
        headers=admin,
        json={"answer_idx": (q["answer_idx"] + 1) % 4, "note": "edited"},
    ).json()
    assert not changed["verified"]
    assert changed["answer_text"] == changed["options"][changed["answer_idx"]]
    assert client.patch(f'/questions/{q["id"]}/verify', headers=admin).json()[
        "verified"
    ]


def test_quiz_score_snapshot_and_duplicates(client, admin, member):
    session = client.post(
        "/quiz/start", headers=member, json={"chapters": [30], "count": 100}
    ).json()
    assert session["total"] == 3
    assert all(
        "answer_idx" not in q and "answer_text" not in q and "note" not in q
        for q in session["questions"]
    )
    sid = session["session_id"]
    assert client.get(f"/quiz/summary/{sid}", headers=admin).status_code == 404
    assert (
        client.get(f"/quiz/summary/{sid}", headers=member).json()["wrong_answers"] == []
    )
    q = session["questions"][0]
    original = client.get(
        f'/questions/{q["chapter_id"]}/{q["no"]}', headers=admin
    ).json()
    client.put(
        f'/questions/{q["id"]}',
        headers=admin,
        json={"answer_idx": (original["answer_idx"] + 1) % 4},
    )
    payload = {
        "session_id": sid,
        "question_id": q["id"],
        "answer_idx": original["answer_idx"],
    }
    answer = client.post("/quiz/answer", headers=member, json=payload)
    assert answer.status_code == 200 and answer.json()["correct"]
    assert client.post("/quiz/answer", headers=member, json=payload).status_code == 409
    end = client.post(f"/quiz/end/{sid}", headers=member).json()
    assert end["score"] == 1 and len(end["wrong_answers"]) == 2
    assert client.post("/quiz/answer", headers=member, json=payload).status_code == 409
    assert client.post(f"/quiz/end/{sid}", headers=member).json()["score"] == 1


def test_quiz_order_and_timeout(client, admin):
    s = client.post(
        "/quiz/start", headers=admin, json={"chapters": [30], "count": 3}
    ).json()
    assert (
        client.post(
            "/quiz/answer",
            headers=admin,
            json={
                "session_id": s["session_id"],
                "question_id": s["questions"][1]["id"],
                "answer_idx": 0,
            },
        ).status_code
        == 409
    )
    for q in s["questions"]:
        r = client.post(
            "/quiz/answer",
            headers=admin,
            json={
                "session_id": s["session_id"],
                "question_id": q["id"],
                "answer_idx": None,
            },
        )
        assert r.status_code == 200 and not r.json()["correct"]
    assert (
        client.post(f'/quiz/end/{s["session_id"]}', headers=admin).json()["score"] == 0
    )


def test_bot_queue_ownership_and_stop(client, admin, member):
    with patch("backend.routers.bot.Redis") as redis, patch(
        "backend.routers.bot.run_auto_answer.apply_async"
    ) as task, patch("backend.routers.bot.celery_app.control.revoke"):
        run = client.post(
            "/bot/start",
            headers=member,
            json={"chapters": [30], "mode": "demo", "delay": 2},
        ).json()
        assert run["status"] == "queued" and task.called
        outsider = register_login(client, "outsider")
        assert (
            client.get(f'/bot/status/{run["task_id"]}', headers=outsider).status_code
            == 404
        )
        assert (
            client.post(
                "/bot/start", headers=admin, json={"chapters": [31]}
            ).status_code
            == 409
        )
        assert (
            client.post(f'/bot/stop/{run["task_id"]}', headers=member).json()["status"]
            == "cancelled"
        )
        # Academy mode is no longer admin-only because each user has isolated storage state.
        # Active-run protection still applies while the earlier run exists.
        assert client.post(
            "/bot/start", headers=member, json={"chapters": [30], "mode": "academy"}
        ).status_code == 409
        assert (
            client.post(
                "/bot/start", headers=admin, json={"chapters": [999]}
            ).status_code
            == 400
        )
        assert (
            client.post(
                "/bot/start", headers=admin, json={"chapters": [30], "delay": 0}
            ).status_code
            == 422
        )


def test_danger_confirmations(client, admin, member):
    assert (
        client.request(
            "DELETE",
            "/settings/data",
            headers=member,
            json={"confirmation": "DELETE DATA"},
        ).status_code
        == 403
    )
    assert (
        client.request(
            "DELETE", "/settings/data", headers=admin, json={"confirmation": "bad"}
        ).status_code
        == 400
    )
    assert (
        client.request(
            "DELETE",
            "/settings/data",
            headers=admin,
            json={"confirmation": "DELETE DATA"},
        ).status_code
        == 200
    )
    assert client.get("/stats/", headers=admin).json()["total"] == 0
    assert client.get("/auth/me", headers=admin).status_code == 200


def test_upload_import(client, admin):
    with (ROOT / "data/RoV_Academy_Answers_แก้ชีส.xlsx").open("rb") as f:
        response = client.post(
            "/questions/import",
            headers=admin,
            files={
                "file": (
                    "questions.xlsx",
                    f,
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                )
            },
        )
    assert response.status_code == 200 and response.json()["skipped"] == 184
    assert (
        client.post(
            "/questions/import", headers=admin, files={"file": ("bad.xlsx", b"bad")}
        ).status_code
        == 400
    )


def test_matching_options_reordered(client):
    with SessionLocal() as db:
        rows = db.scalars(select(Question).where(Question.chapter_id == 30)).all()
        q = rows[0]
        assert match_question("  " + q.question + "  ", rows).id == q.id
        reordered = list(reversed(q.options))
        assert reordered[option_index(q, reordered)] == q.answer_text
        with pytest.raises(ValueError):
            option_index(q, ["wrong"] * 4)
        with pytest.raises(ValueError):
            match_question("unknown", rows)


def test_academy_storage_is_per_user():
    from backend.config import academy_storage_for
    a = academy_storage_for(1)
    b = academy_storage_for(2)
    assert a != b
    assert a.name == "user_1.json" and b.name == "user_2.json"
    assert a.parent == b.parent


def test_academy_error_has_stable_code():
    from worker.browser import AcademyFlowError
    error = AcademyFlowError("SESSION_EXPIRED", "login required")
    assert str(error).startswith("SESSION_EXPIRED:")


def test_academy_login_cli_requires_user_id():
    import subprocess, sys
    result = subprocess.run(
        [sys.executable, str(ROOT / "scripts/academy_login.py"), "--help"],
        capture_output=True, text=True
    )
    assert result.returncode == 0
    assert "--user-id" in result.stdout


def test_session_status_is_isolated(client, member):
    response = client.get("/bot/academy-session", headers=member)
    assert response.status_code == 200
    body = response.json()
    assert body["user_id"] > 0
    assert isinstance(body["exists"], bool)
