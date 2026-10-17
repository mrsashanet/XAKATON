from fastapi import APIRouter, Depends, HTTPException, File, Form, Response, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.exc import SQLAlchemyError
from audio_storage import save_mp3, audio_path
from sqlalchemy.orm import Session
from sqlalchemy import func, select, update

from database import get_db
from models import Track, Vote, Membership, Community, User
from schemas.tracks import TrackCreate, TrackOut, TrackWithScore, VoteCreate, VoteOut
from auth.dependencies import get_current_user

router = APIRouter(prefix="/tracks", tags=["tracks"])

@router.get("/{track_id}", response_model=TrackOut)
def get_track(track_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> TrackOut:
    track = db.scalar(select(Track).where(Track.id == track_id))
    if track is None:
        raise HTTPException(status_code=404, detail="Трек не найден")
    membership = db.scalar(select(Membership).where(Membership.user_id == user.id,Membership.community_id == track.community.id))

    if membership is None:
        raise HTTPException(status_code=403, detail="Вы не являетесь участником группы")
    return track

@router.post("", response_model=TrackOut, status_code=201)

def add_track(data: TrackCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> TrackOut:
    community = db.get(Community, data.community_id)
    if community is None:
        raise HTTPException(status_code=404, detail="Сообщество не найдёно")

    membership = db.scalar(select(Membership).where(Membership.user_id == user.id, Membership.community_id == data.community_id))

    if membership is None:
        raise HTTPException(status_code=403, detail="Вы не являетесь участником группы")

    track = Track(
        title=data.title,
        artist=data.artist,
        community_id=data.community_id,
        added_by=user.id)
    db.add(track)
    db.commit()
    db.refresh(track)
    return track

@router.post("/{track_id}/vote", response_model=VoteOut)
def vote(track_id: int, data: VoteCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> VoteOut:

    track = db.get(Track, track_id)
    if track is None:
        raise HTTPException(status_code=404, detail="Трек не найден")

    membership = db.scalar(
        select(Membership).where(
            Membership.user_id == user.id,
            Membership.community_id == track.community_id))

    if membership is None:
        raise HTTPException(status_code=403, detail="вы не являетесь участником группы")
    if track.added_by == user.id:
        raise HTTPException(status_code=403, detail="Нельзя голосовать за свой трек")
    #Проверка голосовал ли пользователь
    existing = db.scalar(select(Vote).where(Vote.user_id == user.id ,Vote.track_id == track_id))

    if existing:
        existing.value = data.value
        db.commit()
        db.refresh(existing)
        return existing

    vote = Vote(user_id=user.id,track_id=track_id,value=data.value)

    db.add(vote)
    db.commit()
    db.refresh(vote)
    return vote

@router.post("/upload", response_model=TrackOut, status_code=201)
def upload_track(
    title: str = Form(min_length=1, max_length=128),
    artist: str = Form(min_length=1, max_length=128),
    community_id: int = Form(),
    file: UploadFile = File(),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)) -> TrackOut:
    community = db.get(Community, community_id)
    if community is None:
        raise HTTPException(status_code=404, detail="Сообщество не найдено")
    membership = db.scalar(select(Membership).where(
        Membership.user_id == user.id, Membership.community_id == community_id))
    if membership is None:
        raise HTTPException(status_code=403, detail="Вы не являетесь участником группы")
    if not title.strip() or not artist.strip():
        raise HTTPException(status_code=422, detail="Укажите название трека и исполнителя")

    file_url = save_mp3(file)
    track = Track(
        title=title.strip(),
        artist=artist.strip(),
        community_id=community_id,
        added_by=user.id,
        file_url=file_url)
    try:
        db.add(track)
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        audio_path(file_url).unlink(missing_ok=True)
        raise
    db.refresh(track)
    return track


@router.post("/{track_id}/audio", response_model=TrackOut)
def attach_audio(
    track_id: int,
    file: UploadFile = File(),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)) -> TrackOut:
    track = get_track(track_id, db, user)
    community = db.get(Community, track.community_id)
    if track.added_by != user.id and community.owner_id != user.id:
        raise HTTPException(status_code=403, detail="MP3 может добавить автор трека или владелец сообщества")
    if track.file_url:
        raise HTTPException(status_code=409, detail="У этого трека уже есть MP3")

    file_url = save_mp3(file)
    try:
        result = db.execute(update(Track).where(
            Track.id == track_id, Track.file_url.is_(None)).values(file_url=file_url))
        if result.rowcount != 1:
            db.rollback()
            audio_path(file_url).unlink(missing_ok=True)
            raise HTTPException(status_code=409, detail="У этого трека уже есть MP3")
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        audio_path(file_url).unlink(missing_ok=True)
        raise
    db.refresh(track)
    return track


@router.get("/{track_id}/audio")
def get_audio(
    track_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)) -> FileResponse:
    track = get_track(track_id, db, user)
    if not track.file_url:
        raise HTTPException(status_code=404, detail="У этого трека пока нет MP3")
    path = audio_path(track.file_url)
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Аудиофайл не найден")
    return FileResponse(
        path,
        media_type="audio/mpeg",
        filename=track.title + ".mp3",
        content_disposition_type="inline",
        headers={"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"})


@router.delete("/{track_id}", status_code=204)
def delete_track(
    track_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)) -> Response:
    # get_track сам вернёт 404 (нет трека) или 403 (не участник сообщества)
    track = get_track(track_id, db, user)
    community = db.get(Community, track.community_id)
    if track.added_by != user.id and community.owner_id != user.id:
        raise HTTPException(status_code=403, detail="Удалить трек может автор или владелец сообщества")

    file_url = track.file_url
    db.delete(track)  # голоса за трек удалятся вместе с ним (cascade в модели)
    db.commit()
    if file_url:
        try:
            audio_path(file_url).unlink(missing_ok=True)
        except HTTPException:
            pass  # путь к файлу некорректный — удалять нечего
    return Response(status_code=204)
