import os
from pathlib import Path

PORT = int(os.environ.get("PORT", 8080))

SECRET_KEY = os.environ.get("SESSION_SECRET", "smartattendance-secret-key-2024")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7

DATABASE_URL = os.environ.get("DATABASE_URL", "")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL environment variable is required")

if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

DATA_DIR = Path(__file__).parent.parent / "data"
EMPLOYEES_DIR = DATA_DIR / "employees"
SNAPSHOTS_DIR = DATA_DIR / "snapshots"
MODEL_PATH = DATA_DIR / "face_model.yml"
LABELS_PATH = DATA_DIR / "face_labels.json"

DATA_DIR.mkdir(parents=True, exist_ok=True)
EMPLOYEES_DIR.mkdir(parents=True, exist_ok=True)
SNAPSHOTS_DIR.mkdir(parents=True, exist_ok=True)
