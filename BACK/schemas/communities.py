from pydantic import BaseModel, ConfigDict, Field



class CommunityCreate(BaseModel):
    model_config = ConfigDict(
        str_strip_whitespace=True,
        extra="forbid",
    )

    name: str = Field(min_length=1, max_length=100)


class CommunityRead(BaseModel):
    id: int
    name: str
    description: str | None = None
    owner_id: int
    members_count: int = Field(ge=0)

class CommunityCreated(CommunityRead):
    invite_token: str

class CommunityJoin(BaseModel):
    invite_token: str = Field(min_length=1)