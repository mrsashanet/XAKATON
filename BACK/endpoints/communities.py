from enum import member

from schemas.communities import CommunityRead, CommunityCreate, CommunityCreated
from fastapi import APIRouter, HTTPException, Depends, Response
from sqlalchemy.orm import Session
from sqlalchemy import case, delete, func, select
from secrets import token_urlsafe
from sqlalchemy.exc import SQLAlchemyError, IntegrityError

from dependencies import get_current_user
from schemas.communities import CommunityJoin
from schemas.tracks import TrackWithScore
from database import get_db
from models import Community, Membership, User, Track, Vote


router = APIRouter(
    prefix="/communities",
    tags =["Сообщества"]

)

@router.get("/{community_id}", response_model = CommunityRead)
def get_community(community_id: int,
                   db: Session = Depends(get_db),
                   user : User = Depends(get_current_user)) -> CommunityRead:
    community = db.get(Community, community_id)

    if community is None:
        raise HTTPException(status_code = 404, detail = "Сообщество не найдено")

    membership = db.scalar(
        select(Membership).
        where(Membership.community_id == community_id,
            Membership.user_id == user.id)
            )
    if membership is None:
        raise HTTPException(
            status_code = 403,
            detail = "Вы не являетесь участником группы"
        )

    
    members_count = db.scalar(
        select(func.count())
        .select_from(Membership)
        .where(Membership.community_id == community_id))
    
    return CommunityRead(
        id = community_id,
        name = community.com_name,
        description = None,
        owner_id = community.owner_id,
        members_count = members_count
    )

@router.post("", response_model = CommunityCreated, status_code = 201)
def create_community(
    data: CommunityCreate,
    db: Session = Depends(get_db), 
    owner: User = Depends(get_current_user)) -> CommunityCreated:

   
    community = Community(
        com_name = data.name,
        invite_token = token_urlsafe(24),
        owner_id = owner.id)

    try:
        db.add(community)
        db.flush()

        membership = Membership(
            user_id = owner.id,
            community_id = community.id
        )
        db.add(membership)

        db.commit()
    except SQLAlchemyError:
        db.rollback()
        raise
    db.refresh(community)

    return CommunityCreated(
        id = community.id,
        name = community.com_name,
        description = None,
        owner_id = community.owner_id,
        members_count = 1,
        invite_token = community.invite_token
    )

@router.post("/join", response_model = CommunityRead)
def join_community(
    data: CommunityJoin,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)) -> CommunityRead:

    community = db.scalar(
        select(Community).where(Community.invite_token == data.invite_token)
    )

    if community is None:
        raise HTTPException(
            status_code = 404,
            detail = "Приглашение не найдено"
        )

    membership = db.scalar(
        select(Membership).where(Membership.user_id == user.id,
            Membership.community_id == community.id)
    )

    if membership is None:
        try: 
            db.add(
                Membership(user_id = user.id, community_id = community.id )
            )
            db.commit()
        except IntegrityError:
            db.rollback()
            membership = db.scalar(
                select(Membership).
                where(Membership.user_id == user.id,
                     Membership.community_id == community.id
                     )
            )
            if membership is None:
                raise
        except SQLAlchemyError:
            db.rollback()
            raise
    return get_community(community.id, db, user)

@router.get("/{community_id}/playlist", response_model=list[TrackWithScore])
def get_playlist(
        community_id: int,
        db: Session = Depends(get_db),
        user: User = Depends(get_current_user),
) -> list[TrackWithScore]:
    community = db.get(Community, community_id)
    if community is None:
        raise HTTPException(status_code=404, detail="Сообщество не найдено")

    membership = db.scalar(
        select(Membership).where(
            Membership.user_id == user.id,
            Membership.community_id == community_id,
        )
    )

    if membership is None:
        raise HTTPException(status_code=403, detail="Вы не являетесь участником группы")

    result = db.execute(
        select(
            Track,
            func.coalesce(func.sum(Vote.value), 0).label("score"),
            func.coalesce(func.sum(case((Vote.user_id == user.id, Vote.value), else_=0)), 0).label("my_vote"),
        )
        .outerjoin(Vote, Vote.track_id == Track.id)
        .where(Track.community_id == community_id)
        .group_by(Track.id)
        .order_by(func.coalesce(func.sum(Vote.value), 0).desc(), Track.id.asc())
    ).all()

    return[TrackWithScore(id = t.id, title=t.title, artist=t.artist,score=score, my_vote=my_vote, file_url=t.file_url, added_by=t.added_by) for t, score, my_vote in result]

    



@router.get("", response_model=list[CommunityRead])
def list_communities(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[CommunityRead]:
    counts = (
        select(Membership.community_id, func.count().label("members_count"))
        .group_by(Membership.community_id)
        .subquery()
    )
    rows = db.execute(
        select(Community, counts.c.members_count)
        .join(counts, counts.c.community_id == Community.id)
        .where(Community.id.in_(
            select(Membership.community_id).where(Membership.user_id == user.id)
        ))
        .order_by(Community.id.desc())
    ).all()
    return [CommunityRead(
        id=community.id, name=community.com_name, owner_id=community.owner_id,
        members_count=count, description=None,
    ) for community, count in rows]


@router.get("/{community_id}/invitation")
def get_invitation(
    community_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, str]:
    get_community(community_id, db, user)
    community = db.get(Community, community_id)
    return {"invite_token": community.invite_token}


@router.post("/{community_id}/leave", status_code=204)
def leave_community(
    community_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    community = db.get(Community, community_id)
    if community is None:
        raise HTTPException(status_code=404, detail="Сообщество не найдено")
    if community.owner_id == user.id:
        raise HTTPException(status_code=409, detail="Владелец не может покинуть своё сообщество")

    membership = db.scalar(select(Membership).where(
        Membership.user_id == user.id, Membership.community_id == community_id))
    if membership is None:
        raise HTTPException(status_code=403, detail="Вы не являетесь участником группы")

    # Голоса ушедшего больше не влияют на рейтинг; его треки остаются в плейлисте
    db.execute(delete(Vote).where(
        Vote.user_id == user.id,
        Vote.track_id.in_(select(Track.id).where(Track.community_id == community_id))))
    db.delete(membership)
    db.commit()
    return Response(status_code=204)
