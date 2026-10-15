from fastapi import FastAPI

from endpoints import communities

app = FastAPI()

app.include_router(communities.router)
