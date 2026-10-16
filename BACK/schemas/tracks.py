from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field



class TrackCreate(BaseModel):
    title: str = Field(min_length=1, max_length=128)
    artist: str = Field(min_length=1, max_length=128)

class TrackOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    artist: str
    community_id: int
    added_by: int
    file_url: str | None = None
    created_at: datetime

class TrackWithScore(BaseModel):
    id: int
    title: str
    artist: str
    score: int

class VoteCreate(BaseModel):
    value: int = Field(ge=-1, le=1)

class VoteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    track_id: int
    value: int
    created_at: datetime
