# TEST REPORT

## Changes in this hardened pass
- Fixed `scripts/academy_login.py` to require `--user-id` and save the correct per-user session.
- Added Redis distributed lock per Academy user session (`worker/session_lock.py`).
- Academy login and Academy auto-answer now acquire that lock; demo mode does not.
- Added `GET /bot/academy-session` for the signed-in user.
- Added fixed-window rate limiting for `/auth/login` and `/auth/register` (Redis-backed; auth fails open if Redis itself is down).
- Added `/ready` readiness check for SQLite + Redis.
- Kept WebSocket JWT as first message (not URL) and origin/ownership checks already present.
- Kept submit verification: success is counted only after Academy completion/question transition.
- Removed Academy username/password configuration in the previous hardening pass; manual login remains required.

## Tests actually executed in this environment
### PASS
- `python -m compileall -q .` — PASS after the changes.
- Static inspection: no `ACADEMY_USERNAME` / `ACADEMY_PASSWORD` references remain.
- Static inspection: CLI and worker browser calls now pass a concrete `user_id`.

### BLOCKED (not counted as pass)
- `pytest -q` — BLOCKED at import because this sandbox does not have `python-jose` installed (`ModuleNotFoundError: jose`).
- Frontend `npm run build` — BLOCKED because `frontend/node_modules` is not installed in this sandbox.
- Real Academy E2E — NOT RUN. It requires a real manual Academy login, current live DOM/selectors, browser runtime and network access.

## Required verification on an internet-enabled host
```bash
python -m venv .venv
# Windows: .venv\\Scripts\\activate
# Linux/macOS: source .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
playwright install chromium
python scripts/setup_env.py
pytest -q

cd frontend
npm ci
npm run build
```

For live Academy verification, configure selectors from the current site, start Redis/API/worker, call Academy login for the signed-in user, manually authenticate, then run one known chapter and confirm the returned run is successful only after observed Academy progress.

## Verdict
The source compiles and the additional hardening is present. Full automated test/build and live Academy verification are **not claimed as passed** because required dependencies/network/live login were unavailable in this execution environment.
