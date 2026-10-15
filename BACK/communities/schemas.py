from pydantic import BaseModel, ConfigDict, Field


class CommunityCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str = Field(min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=1000)


class CommunityRead(BaseModel):
    id: int
    name: str
    description: str | None = None
    owner_id: int
    members_count: int = Field(ge=0)
