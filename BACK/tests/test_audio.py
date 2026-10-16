import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ.setdefault("SECRET_KEY", "audio-tests-secret-key-with-at-least-32-bytes")
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, select
from sqlalchemy.orm import sessionmaker

import main
import audio_storage
from database import Base, get_db
from models import Track

SAMPLE = (Path(__file__).parent / "fixtures" / "test-tone.mp3").read_bytes()


class AudioTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.root = Path(self.folder.name)
        self.engine = create_engine("sqlite:///" + str(self.root / "test.db"), connect_args={"check_same_thread": False})
        @event.listens_for(self.engine, "connect")
        def foreign_keys(connection, record):
            connection.execute("PRAGMA foreign_keys=ON")
        self.sessions = sessionmaker(bind=self.engine)
        def db():
            with self.sessions() as session:
                yield session
        self.old_engine = main.engine
        main.engine = self.engine
        main.app.dependency_overrides[get_db] = db
        self.storage = patch.object(audio_storage, "TRACKS_DIRECTORY", self.root / "audio")
        self.storage.start()
        self.client = TestClient(main.app).__enter__()
        self.alice = self.account("alice")
        self.bob = self.account("bob")
        result = self.client.post("/communities", json={"name": "Music"}, headers=self.alice)
        self.group = result.json()

    def tearDown(self):
        self.client.__exit__(None, None, None)
        main.app.dependency_overrides.clear()
        main.engine = self.old_engine
        self.storage.stop()
        self.engine.dispose()
        self.folder.cleanup()

    def account(self, username):
        result = self.client.post("/auth/register", json={"username": username, "password": "Test-pass-2026"})
        self.assertEqual(result.status_code, 201)
        token = self.client.post("/auth/login", data={"username": username, "password": "Test-pass-2026"}).json()["access_token"]
        return {"Authorization": "Bearer " + token}

    def upload(self, payload=SAMPLE, filename="song.mp3", headers=None, **fields):
        return self.client.post("/tracks/upload", headers=self.alice if headers is None else headers,
            data={"title": " First Light ", "artist": " Universe Voicee ", "community_id": self.group["id"], **fields},
            files={"file": (filename, payload, "audio/mpeg")})

    def test_upload_playlist_and_private_audio(self):
        response = self.upload()
        self.assertEqual(response.status_code, 201, response.text)
        track = response.json()
        self.assertEqual(track["title"], "First Light")
        path = audio_storage.audio_path(track["file_url"])
        self.assertEqual(path.read_bytes(), SAMPLE)
        playlist = self.client.get(f'/communities/{self.group["id"]}/playlist', headers=self.alice).json()
        self.assertEqual(playlist[0]["file_url"], track["file_url"])
        audio = self.client.get(f'/tracks/{track["id"]}/audio', headers=self.alice)
        self.assertEqual(audio.status_code, 200)
        self.assertEqual(audio.content, SAMPLE)
        self.assertEqual(audio.headers["content-type"], "audio/mpeg")
        self.assertIn("no-store", audio.headers["cache-control"])
        self.assertEqual(self.client.get(f'/tracks/{track["id"]}/audio').status_code, 401)
        self.assertEqual(self.client.get(f'/tracks/{track["id"]}/audio', headers=self.bob).status_code, 403)
        self.assertEqual(self.client.get(track["file_url"]).status_code, 404)

    def test_ranges_and_missing_audio(self):
        track = self.upload().json()
        response = self.client.get(f'/tracks/{track["id"]}/audio', headers={**self.alice, "Range": "bytes=100-199"})
        self.assertEqual(response.status_code, 206)
        self.assertEqual(response.content, SAMPLE[100:200])
        self.assertEqual(self.client.get(f'/tracks/{track["id"]}/audio', headers={**self.alice, "Range": "bytes=999999-"}).status_code, 416)
        audio_storage.audio_path(track["file_url"]).unlink()
        self.assertEqual(self.client.get(f'/tracks/{track["id"]}/audio', headers=self.alice).status_code, 404)
        self.assertEqual(self.client.get('/tracks/999999/audio', headers=self.alice).status_code, 404)

    def test_reject_invalid_files_and_no_orphans(self):
        for payload, name in [(b"", "empty.mp3"), (b"ID3" + b"fake" * 300, "fake.mp3"), (SAMPLE, "song.wav")]:
            with self.subTest(name=name):
                self.assertEqual(self.upload(payload, name).status_code, 415)
        self.assertEqual(self.upload(title="   ").status_code, 422)
        with patch.object(audio_storage, "MAX_MP3_SIZE", 100):
            self.assertEqual(self.upload().status_code, 413)
        with self.sessions() as db:
            self.assertEqual(db.scalars(select(Track)).all(), [])
        self.assertFalse(list((self.root / "audio").glob("*.mp3")))

    def test_membership_and_auth_checked_on_upload(self):
        self.assertEqual(self.upload(headers={}).status_code, 401)
        self.assertEqual(self.upload(headers=self.bob).status_code, 403)
        self.assertEqual(self.upload(community_id=999999).status_code, 404)
        self.assertFalse(list((self.root / "audio").glob("*.mp3")))

    def test_attach_to_legacy_track_once(self):
        track = self.client.post('/tracks', headers=self.alice, json={"title": "Legacy", "artist": "Artist", "community_id": self.group["id"]}).json()
        url = f'/tracks/{track["id"]}/audio'
        self.assertEqual(self.client.get(url, headers=self.alice).status_code, 404)
        self.client.post('/communities/join', headers=self.bob, json={"invite_token": self.group["invite_token"]})
        self.assertEqual(self.client.post(url, headers=self.bob, files={"file": ("sample.mp3", SAMPLE)}).status_code, 403)
        result = self.client.post(url, headers=self.alice, files={"file": ("../../sample.MP3", SAMPLE)})
        self.assertEqual(result.status_code, 200, result.text)
        self.assertEqual(self.client.get(url, headers=self.bob).content, SAMPLE)
        self.assertEqual(self.client.post(url, headers=self.alice, files={"file": ("another.mp3", SAMPLE)}).status_code, 409)
        self.assertEqual(len(list((self.root / "audio").glob("*.mp3"))), 1)

    def test_path_traversal_in_database_is_not_served(self):
        track = self.upload().json()
        with self.sessions() as db:
            item = db.get(Track, track["id"])
            item.file_url = "/media/tracks/../../pyproject.toml"
            db.commit()
        self.assertEqual(self.client.get(f'/tracks/{track["id"]}/audio', headers=self.alice).status_code, 404)

    def test_database_failure_removes_uploaded_file(self):
        from sqlalchemy.exc import SQLAlchemyError
        with patch("sqlalchemy.orm.Session.commit", side_effect=SQLAlchemyError("simulated")):
            with self.assertRaises(SQLAlchemyError):
                self.upload()
        self.assertFalse(list((self.root / "audio").glob("*.mp3")))


if __name__ == "__main__":
    unittest.main()
