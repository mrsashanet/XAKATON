from pydantic import BaseModel, ConfigDict, Field

class UserCreate(BaseModel):
    username: str=Field(min_length=2, max_length=32,pattern=r'^[a-zA-Z0-9_-]+$')
    password: str=Field(min_length=8, max_length=32)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id:int
    username: str

class Token(BaseModel):
    access_token: str
    token_type: str = 'bearer'



