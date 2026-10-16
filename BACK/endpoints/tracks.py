from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, select

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


