from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func

from database import get_db

router = APIRouter(prefix="/tracks", tags=["tracks"])
def get_db():
    return None

def get_current_user():
    return 1

@router.get("/{track_id}")
async def get_track(track_id: int, db: Session = Depends(get_db):
    track = db.query(Track).filter(Track.id == track_id).first()
    if not track:
        raise HTTPException(status_code = 404, detail ="Track not found")
    return track