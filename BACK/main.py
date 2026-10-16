from fastapi import FastAPI
from contextlib import asynccontextmanager
from endpoints import communities, tracks
import auth.dependencies, auth.security
import models
from database import Base, engine
from fastapi.middleware.cors import CORSMiddleware

@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind = engine)
    yield

app = FastAPI(lifespan = lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type"],
)
app.include_router(communities.router)
app.include_router(tracks.router)