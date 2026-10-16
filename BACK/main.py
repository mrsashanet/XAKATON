from fastapi import FastAPI
from contextlib import asynccontextmanager
from endpoints import communities, tracks
import auth.dependencies, auth.security
import models
from database import Base, engine

@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind = engine)
    yield

app = FastAPI(lifespan = lifespan)

app.include_router(communities.router)
app.include_router(tracks.router)