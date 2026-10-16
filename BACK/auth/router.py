from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from database import get_db
from models import User
from auth.schemas import UserCreate, UserOut, Token
from auth.security import hash_password, verify_password, create_acsess_token
from auth.dependencies import get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post('/register', response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register(data: UserCreate, db: Session = Depends(get_db))->UserOut:
    user = User.create(username=data.username, password=hash_password(data.password))
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "такой username уже занят")
    db.refresh(user)
    return user


@router.post('/login', response_model=Token)
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db))->Token:
    user = db.scalar(select(User).where(User.username == form.username))
    if (user is None) or (verify_password(form.password, user.password)):
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "ты ввёл неверный логин или пароль, попробуй ещё раз)))",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return Token(create_acsess_token=create_acsess_token(user.id))


