"""Shared HTTP-test fixtures."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from core.api.main import _seed_bunq_users


@pytest.fixture(autouse=True)
def _ensure_seeded():
    _seed_bunq_users()


@pytest.fixture
def signed_in_cookie():
    return {"bunq_user": "anton"}


@pytest.fixture
def plain_client():
    from core.api.main import app
    return TestClient(app)
