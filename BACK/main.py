from fastapi import FastAPI
from contextlib import asynccontextmanager
from endpoints import communities
import models
from database import Base, engine

@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind = engine)
    yield

app = FastAPI(lifespan = lifespan)

app.include_router(communities.router)
