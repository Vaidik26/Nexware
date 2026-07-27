"""
API integration tests for Nexware FastAPI endpoints.
Requires a running test DB (set TEST_DATABASE_URL env var).
"""
import pytest
from httpx import AsyncClient, ASGITransport
import os

# Skip if no test DB configured
pytestmark = pytest.mark.skipif(
    not os.getenv("TEST_DATABASE_URL"),
    reason="TEST_DATABASE_URL not set"
)


@pytest.fixture(scope="session")
def anyio_backend():
    return "asyncio"


@pytest.mark.anyio
async def test_health_endpoint():
    from backend.main import app
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


@pytest.mark.anyio
async def test_login_invalid_credentials():
    from backend.main import app
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post("/auth/login", json={"email": "bad@test.com", "password": "wrong"})
    assert resp.status_code == 401


@pytest.mark.anyio
async def test_protected_route_without_token():
    from backend.main import app
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.get("/picklists/")
    assert resp.status_code == 401
