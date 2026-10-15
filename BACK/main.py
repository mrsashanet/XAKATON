from fastapi import FastAPI
from endpoints import tracks

app = FastAPI()

app.include_router(tracks.router)

@app.get("/")
async def root():
    return {"message": "Backend is running"}