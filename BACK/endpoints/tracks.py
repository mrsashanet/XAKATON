from fastapi import APIRouter, Depends, HTTPException
from seed import community
from sqlalchemy.orm import Session
from sqlalchemy import func, select

from database import get_db
from models import Track, Vote, Membership, Community, User
from schemas.tracks import TrackCreate, TrackOut, TrackWithScore, VoteCreate, VoteOut
#from auth.dependencies import get_current_user

router = APIRouter(prefix="/tracks", tags=["tracks"])

def get_current_user(db: Session = Depends(get_db)) -> User:
    """Временная заглушка: всегда возвращает первого пользователя из БД."""
    user = db.scalar(select(User).limit(1))
    if user is None:
        raise HTTPException(status_code=401, detail="Нет пользователей в БД — запусти seed.py")
    return user

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






