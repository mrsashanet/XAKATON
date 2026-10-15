"""Учебные обработчики: данные хранятся в памяти до перезапуска."""

from fastapi import APIRouter, HTTPException

from communities.schemas import CommunityCreate, CommunityRead

router = APIRouter(prefix="/communities", tags=["Сообщества"])

# Временное хранилище для одного процесса; следующий шаг — общая БД.
communities_store: dict[int, CommunityRead] = {
    1: CommunityRead(
        id=1,
        name="Группа 123",
        description="Общий плейлист группы 123",
        owner_id=1,
        members_count=1,
    )
}


@router.get("/{community_id}", response_model=CommunityRead)
def get_community(community_id: int) -> CommunityRead:
    community = communities_store.get(community_id)
    if community is None:
        raise HTTPException(status_code=404, detail="Сообщество не найдено")
    return community


@router.post("", response_model=CommunityRead, status_code=201)
def create_community(data: CommunityCreate) -> CommunityRead:
    new_id = max(communities_store, default=0) + 1
    community = CommunityRead(
        id=new_id,
        name=data.name,
        description=data.description,
        # Пока авторизация и таблица участников не подключены.
        owner_id=1,
        members_count=1,
    )
    communities_store[new_id] = community
    return community
