from os import *
from datetime import *

from jwt import *
from pwdlib import *

SECRET_KEY = getenv('SECRET_KEY', 'dev-secret-change-me')
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_DAYS = 7

password_hash = PasswordHash.recommended()


def hash_password(password: str) -> str:
    return password_hash.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    return password_hash.verify(password, hashed)


def create_acsess_token(user_id:int)->str:
    expire=datetime.now(timezone.utc)+timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)
    playroad={'sub':str(user_id),"exp":expire}
    return encode(playroad,SECRET_KEY,algorithm=ALGORITHM)

def decode_acsess_token(token:str)->int|None:
    try:
        playroad=decode(token,SECRET_KEY,algorithms=[ALGORITHM])
        return int(playroad['sub'])
    except:
        return None


