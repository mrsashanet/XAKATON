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



router=APIRouter(prefix="/auth", tags=["auth"])


@router.post('/register',response_model=UserOut,status_code=status.HTTP_201_CREATED)
def register(data: UserCreate, db: Session = Depends(get_db)):
    user=User.create(username=data.username,password=hash_password(data.password))
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT,"такой username уже занят")
    db.refresh(user)
    return user
