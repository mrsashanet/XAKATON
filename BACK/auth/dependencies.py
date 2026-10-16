import token

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from sqlalchemy.sql.functions import user

from database import get_db
from models import User
from auth.security import decode_acsess_token

...

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def get_current_user(

        token: str = Depends(oauth2_scheme),
        db: Session = Depends(get_db)) -> User:
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="не удалось проверить токен",
        headers={"WWW-Authenticate": "Bearer"}, )

    user_id = decode_acsess_token(token)
    if user_id is None:
        raise credentials_error
    user = db.get(User, user_id)
    if user is None:
        raise credentials_error

    return user
