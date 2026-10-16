from os import getenv
from pathlib import Path
from re import fullmatch
from uuid import uuid4

from fastapi import HTTPException, UploadFile
from mutagen import MutagenError
from mutagen.mp3 import MP3

TRACKS_DIRECTORY = Path(getenv("TRACKS_DIRECTORY", Path(__file__).resolve().parent / "media" / "tracks"))
MAX_MP3_SIZE = 30 * 1024 * 1024


def save_mp3(file: UploadFile) -> str:
    if Path(file.filename or "").suffix.lower() != ".mp3":
        raise HTTPException(status_code=415, detail="Выберите файл в формате MP3")
    if file.size is not None and file.size > MAX_MP3_SIZE:
        raise HTTPException(status_code=413, detail="MP3 должен быть не больше 30 МБ")
    try:
        file.file.seek(0)
        info = MP3(file.file).info
        if info.layer != 3 or info.length <= 0:
            raise ValueError("Not MP3")
    except (MutagenError, ValueError, EOFError):
        raise HTTPException(status_code=415, detail="Не удалось прочитать MP3. Возможно, файл повреждён")
    file.file.seek(0)
    TRACKS_DIRECTORY.mkdir(parents=True, exist_ok=True)
    filename = uuid4().hex + ".mp3"
    path = TRACKS_DIRECTORY / filename
    try:
        size = 0
        with path.open("xb") as target:
            while chunk := file.file.read(1024 * 1024):
                size += len(chunk)
                if size > MAX_MP3_SIZE:
                    raise HTTPException(status_code=413, detail="MP3 должен быть не больше 30 МБ")
                target.write(chunk)
    except BaseException:
        path.unlink(missing_ok=True)
        raise
    return "/media/tracks/" + filename


def audio_path(file_url: str) -> Path:
    filename = file_url.removeprefix("/media/tracks/")
    if not fullmatch(r"[a-f0-9]{32}\.mp3", filename):
        raise HTTPException(status_code=404, detail="Аудиофайл не найден")
    return TRACKS_DIRECTORY / filename
