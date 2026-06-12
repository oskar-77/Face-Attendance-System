import logging
import os
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import PORT, SNAPSHOTS_DIR
from app.database import engine, SessionLocal
from app.models import Base
from app.auth import hash_password
from app.models import AdminUserDB
from app.face_service import load_model
from app.routes.auth import router as auth_router
from app.routes.employees import router as employees_router
from app.routes.attendance import router as attendance_router
from app.routes.reports import router as reports_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


def init_db():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        if not db.query(AdminUserDB).first():
            admin = AdminUserDB(
                username="admin",
                hashed_password=hash_password("admin123"),
                role="admin",
            )
            db.add(admin)
            db.commit()
            logger.info("Created default admin: admin / admin123")
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting up...")
    init_db()
    load_model()
    logger.info("Startup complete.")
    yield
    logger.info("Shutting down...")
    engine.dispose()


app = FastAPI(
    title="Attendance System API",
    root_path="/api",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

if SNAPSHOTS_DIR.exists():
    app.mount("/snapshots", StaticFiles(directory=str(SNAPSHOTS_DIR)), name="snapshots")

app.include_router(auth_router)
app.include_router(employees_router)
app.include_router(attendance_router)
app.include_router(reports_router)


@app.get("/healthz")
def health_check():
    return {"status": "ok"}


@app.get("/departments")
def list_departments_root():
    from app.database import get_db
    from app.models import EmployeeDB
    db = next(get_db())
    try:
        rows = db.query(EmployeeDB.department).distinct().all()
        return [r[0] for r in rows if r[0]]
    finally:
        db.close()


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=PORT,
        timeout_graceful_shutdown=10,
        access_log=True,
    )
