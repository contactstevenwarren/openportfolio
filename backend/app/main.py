from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI

from . import models  # noqa: F401  -- register models with Base before create_all
from .auth import require_admin_token
from .db import Base, engine
from .llm import extract_positions
from .schemas import ExtractionResult, ExtractRequest


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(lifespan=lifespan)


@app.get("/health")
def health() -> dict[str, bool]:
    return {"ok": True}


@app.post("/api/extract", dependencies=[Depends(require_admin_token)])
def extract(body: ExtractRequest) -> ExtractionResult:
    return extract_positions(body.text)
