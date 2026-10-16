from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import User


def get_current_user(db: Session = Depends(get_db)) -> User:
    user = db.get(User, 1)

    if user is None:
        raise HTTPException(
            status_code = 409,
            detail = "Тестовый пользователь не создан"
        )
    return user
