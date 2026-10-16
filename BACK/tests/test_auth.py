import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from main import app
from database import Base, get_db


@pytest.fixture
def client():
    # Отдельная база в памяти: тесты не трогают app.db и не зависят друг от друга
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestSession = sessionmaker(bind=engine)
    Base.metadata.create_all(bind=engine)

    def override_get_db():
        db = TestSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app)
    app.dependency_overrides.clear()


def register(client, username="daniil", password="secret123"):
    return client.post("/auth/register", json={"username": username, "password": password})


def login(client, username="daniil", password="secret123"):
    # Вход по стандарту OAuth2 — форма, а не JSON
    return client.post("/auth/login", data={"username": username, "password": password})


def auth_header(client, username="daniil", password="secret123"):
    token = login(client, username, password).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_register_ok(client):
    r = register(client)
    assert r.status_code == 201
    assert r.json() == {"id": 1, "username": "daniil"}


def test_register_duplicate(client):
    register(client)
    assert register(client).status_code == 409


def test_register_short_password(client):
    assert register(client, password="123").status_code == 422


def test_login_ok(client):
    register(client)
    r = login(client)
    assert r.status_code == 200
    assert r.json()["token_type"] == "bearer"
    assert r.json()["access_token"]


def test_login_wrong_password(client):
    register(client)
    assert login(client, password="wrong_pass").status_code == 401


def test_login_unknown_user(client):
    assert login(client, username="nobody").status_code == 401


def test_me(client):
    register(client)
    r = client.get("/auth/me", headers=auth_header(client))
    assert r.status_code == 200
    assert r.json() == {"id": 1, "username": "daniil"}


def test_me_without_token(client):
    assert client.get("/auth/me").status_code == 401


def test_me_with_fake_token(client):
    r = client.get("/auth/me", headers={"Authorization": "Bearer fake.token.here"})
    assert r.status_code == 401


def test_protected_endpoint_requires_token(client):
    # Ручки команды защищены через get_current_user
    assert client.post("/communities", json={"name": "M522K"}).status_code == 401
    register(client)
    r = client.post("/communities", json={"name": "M522K"}, headers=auth_header(client))
    assert r.status_code == 201
