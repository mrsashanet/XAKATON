from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import audio_storage
from main import app
from database import Base, get_db

SAMPLE = (Path(__file__).parent / "fixtures" / "test-tone.mp3").read_bytes()


@pytest.fixture
def client(tmp_path, monkeypatch):
    # Отдельная база в памяти и временная папка для MP3: рабочие данные не трогаем
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

    monkeypatch.setattr(audio_storage, "TRACKS_DIRECTORY", tmp_path)
    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app)
    app.dependency_overrides.clear()


def account(client, username):
    client.post("/auth/register", json={"username": username, "password": "secret123"})
    token = client.post("/auth/login", data={"username": username, "password": "secret123"}).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def group(client):
    """Владелец owner, участники alice и bob, у каждого из участников по треку."""
    owner, alice, bob = account(client, "owner"), account(client, "alice"), account(client, "bob")
    community = client.post("/communities", json={"name": "M522K"}, headers=owner).json()
    for member in (alice, bob):
        client.post("/communities/join", json={"invite_token": community["invite_token"]}, headers=member)
    track_alice = client.post("/tracks", json={"title": "A", "artist": "X", "community_id": community["id"]}, headers=alice).json()
    track_bob = client.post("/tracks", json={"title": "B", "artist": "Y", "community_id": community["id"]}, headers=bob).json()
    return {"id": community["id"], "owner": owner, "alice": alice, "bob": bob,
            "track_alice": track_alice["id"], "track_bob": track_bob["id"]}


def playlist(client, group, who="owner"):
    return client.get(f"/communities/{group['id']}/playlist", headers=group[who]).json()


# --- удаление трека ---

def test_owner_deletes_any_track(client, group):
    client.post(f"/tracks/{group['track_alice']}/vote", json={"value": 1}, headers=group["bob"])
    assert client.delete(f"/tracks/{group['track_alice']}", headers=group["owner"]).status_code == 204
    assert [t["id"] for t in playlist(client, group)] == [group["track_bob"]]


def test_author_deletes_own_track(client, group):
    assert client.delete(f"/tracks/{group['track_alice']}", headers=group["alice"]).status_code == 204


def test_member_cannot_delete_someone_elses_track(client, group):
    assert client.delete(f"/tracks/{group['track_alice']}", headers=group["bob"]).status_code == 403
    assert len(playlist(client, group)) == 2


def test_stranger_and_unknown_track(client, group):
    stranger = account(client, "stranger")
    assert client.delete(f"/tracks/{group['track_alice']}", headers=stranger).status_code == 403
    assert client.delete("/tracks/9999", headers=group["owner"]).status_code == 404


def test_delete_removes_mp3_file(client, group, tmp_path):
    track = client.post("/tracks/upload", headers=group["alice"],
                        data={"title": "Song", "artist": "Band", "community_id": str(group["id"])},
                        files={"file": ("song.mp3", SAMPLE, "audio/mpeg")}).json()
    assert len(list(tmp_path.glob("*.mp3"))) == 1
    assert client.delete(f"/tracks/{track['id']}", headers=group["owner"]).status_code == 204
    assert list(tmp_path.glob("*.mp3")) == []


# --- выход из сообщества ---

def test_member_leaves_and_votes_disappear(client, group):
    client.post(f"/tracks/{group['track_alice']}/vote", json={"value": 1}, headers=group["bob"])
    assert client.post(f"/communities/{group['id']}/leave", headers=group["bob"]).status_code == 204
    assert client.get(f"/communities/{group['id']}", headers=group["bob"]).status_code == 403
    scores = {t["id"]: t["score"] for t in playlist(client, group)}
    assert scores[group["track_alice"]] == 0          # голос ушедшего не считается
    assert group["track_bob"] in scores               # его трек остался


def test_owner_cannot_leave(client, group):
    assert client.post(f"/communities/{group['id']}/leave", headers=group["owner"]).status_code == 409


def test_stranger_cannot_leave(client, group):
    stranger = account(client, "stranger")
    assert client.post(f"/communities/{group['id']}/leave", headers=stranger).status_code == 403
    assert client.post("/communities/9999/leave", headers=stranger).status_code == 404


def test_can_rejoin_after_leaving(client, group):
    client.post(f"/communities/{group['id']}/leave", headers=group["bob"])
    invite = client.get(f"/communities/{group['id']}/invitation", headers=group["owner"]).json()["invite_token"]
    assert client.post("/communities/join", json={"invite_token": invite}, headers=group["bob"]).status_code == 200


# --- голос за свой трек ---

def test_cannot_vote_for_own_track(client, group):
    assert client.post(f"/tracks/{group['track_alice']}/vote", json={"value": 1}, headers=group["alice"]).status_code == 403
    assert client.post(f"/tracks/{group['track_alice']}/vote", json={"value": 1}, headers=group["bob"]).status_code == 200
