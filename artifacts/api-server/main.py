import os
import sys
import json
import base64
import pickle
import shutil
import logging
from datetime import datetime, date, timedelta
from typing import Optional, List
from pathlib import Path

import bcrypt as bcryptlib
import cv2
import numpy as np
from fastapi import FastAPI, HTTPException, Depends, UploadFile, File, Form, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from sqlalchemy import create_engine, Column, Integer, String, Boolean, DateTime, Date, Float, Text, func
from sqlalchemy.orm import declarative_base, sessionmaker, Session
from jose import JWTError, jwt

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ─── Config ───────────────────────────────────────────────────────────────────

PORT = int(os.environ.get("PORT", 8080))
SECRET_KEY = os.environ.get("SESSION_SECRET", "smartattendance-secret-key-2024")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7

# Paths — script lives at artifacts/api-server/main.py
DATA_DIR = Path(__file__).parent / "data"
EMPLOYEES_DIR = DATA_DIR / "employees"
SNAPSHOTS_DIR = DATA_DIR / "snapshots"
DB_PATH = DATA_DIR / "attendance.db"

DATA_DIR.mkdir(parents=True, exist_ok=True)
EMPLOYEES_DIR.mkdir(parents=True, exist_ok=True)
SNAPSHOTS_DIR.mkdir(parents=True, exist_ok=True)

# ─── Database ────────────────────────────────────────────────────────────────

engine = create_engine(f"sqlite:///{DB_PATH}", connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class AdminUserDB(Base):
    __tablename__ = "admin_users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    role = Column(String, default="admin")

class EmployeeDB(Base):
    __tablename__ = "employees"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    employee_number = Column(String, unique=True, nullable=False)
    department = Column(String, nullable=False)
    position = Column(String, nullable=False)
    is_trained = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

class AttendanceDB(Base):
    __tablename__ = "attendance"
    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, nullable=False)
    date = Column(Date, nullable=False)
    check_in = Column(DateTime, nullable=False)
    check_out = Column(DateTime, nullable=True)
    snapshot_path = Column(String, nullable=True)

Base.metadata.create_all(bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# ─── Auth ─────────────────────────────────────────────────────────────────────

bearer_scheme = HTTPBearer(auto_error=False)

def hash_password(password: str) -> str:
    return bcryptlib.hashpw(password.encode(), bcryptlib.gensalt()).decode()

def verify_password(plain: str, hashed: str) -> bool:
    return bcryptlib.checkpw(plain.encode(), hashed.encode())

def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    db: Session = Depends(get_db)
) -> AdminUserDB:
    if not credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        sub = payload.get("sub")
        if sub is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        user_id: int = int(sub)
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = db.query(AdminUserDB).filter(AdminUserDB.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user

# ─── Face Recognition Service ─────────────────────────────────────────────────

MODEL_PATH = DATA_DIR / "face_model.yml"
LABELS_PATH = DATA_DIR / "face_labels.json"

face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")

_recognizer = None
_label_map: dict = {}

def _load_recognizer():
    global _recognizer, _label_map
    if MODEL_PATH.exists() and LABELS_PATH.exists():
        rec = cv2.face.LBPHFaceRecognizer_create()
        rec.read(str(MODEL_PATH))
        with open(LABELS_PATH) as f:
            _label_map = {int(k): v for k, v in json.load(f).items()}
        _recognizer = rec
        logger.info(f"Loaded face model with {len(_label_map)} employees")

_load_recognizer()

def retrain_all(db: Session):
    """Retrain the LBPH model using all trained employees' photos."""
    global _recognizer, _label_map
    faces, labels = [], []
    new_label_map = {}

    employees = db.query(EmployeeDB).filter(EmployeeDB.is_trained == True).all()
    for emp in employees:
        emp_dir = EMPLOYEES_DIR / str(emp.id)
        if not emp_dir.exists():
            continue
        photos = list(emp_dir.glob("*.jpg")) + list(emp_dir.glob("*.png"))
        if not photos:
            continue
        new_label_map[emp.id] = {"id": emp.id, "name": emp.name, "employee_number": emp.employee_number}
        for photo_path in photos:
            img = cv2.imread(str(photo_path), cv2.IMREAD_GRAYSCALE)
            if img is None:
                continue
            detected = face_cascade.detectMultiScale(img, scaleFactor=1.1, minNeighbors=5, minSize=(50, 50))
            for (x, y, w, h) in detected:
                face_roi = cv2.resize(img[y:y+h, x:x+w], (100, 100))
                faces.append(face_roi)
                labels.append(emp.id)

    if not faces:
        return False, "No face data available for training"

    rec = cv2.face.LBPHFaceRecognizer_create()
    rec.train(faces, np.array(labels))
    rec.save(str(MODEL_PATH))
    with open(LABELS_PATH, "w") as f:
        json.dump({str(k): v for k, v in new_label_map.items()}, f)

    _recognizer = rec
    _label_map = new_label_map
    logger.info(f"Trained model with {len(faces)} face samples from {len(employees)} employees")
    return True, f"Trained with {len(faces)} photos from {len(new_label_map)} employees"

def recognize_frame(image_b64: str) -> List[dict]:
    """Detect and recognize faces in a base64-encoded JPEG frame."""
    try:
        img_bytes = base64.b64decode(image_b64)
        nparr = np.frombuffer(img_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is None:
            return []

        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        detected = face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(50, 50))

        results = []
        for (x, y, w, h) in detected:
            face_roi = cv2.resize(gray[y:y+h, x:x+w], (100, 100))
            if _recognizer is not None and _label_map:
                label, confidence = _recognizer.predict(face_roi)
                if confidence < 80 and label in _label_map:
                    emp_info = _label_map[label]
                    results.append({
                        "employee_id": emp_info["id"],
                        "name": emp_info["name"],
                        "confidence": round(float(100 - confidence), 1),
                        "bbox": [int(x), int(y), int(w), int(h)]
                    })
                else:
                    results.append({
                        "employee_id": None,
                        "name": "Unknown",
                        "confidence": 0.0,
                        "bbox": [int(x), int(y), int(w), int(h)]
                    })
            else:
                results.append({
                    "employee_id": None,
                    "name": "Unknown",
                    "confidence": 0.0,
                    "bbox": [int(x), int(y), int(w), int(h)]
                })
        return results
    except Exception as e:
        logger.error(f"Recognition error: {e}")
        return []

# ─── Pydantic Schemas ─────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    username: str
    password: str

class EmployeeCreate(BaseModel):
    name: str
    employee_number: str
    department: str
    position: str

class EmployeeUpdate(BaseModel):
    name: Optional[str] = None
    employee_number: Optional[str] = None
    department: Optional[str] = None
    position: Optional[str] = None

class FrameRequest(BaseModel):
    image: str

# ─── Helpers ─────────────────────────────────────────────────────────────────

def emp_photo_count(emp_id: int) -> int:
    emp_dir = EMPLOYEES_DIR / str(emp_id)
    if not emp_dir.exists():
        return 0
    return len(list(emp_dir.glob("*.jpg")) + list(emp_dir.glob("*.png")))

def emp_to_dict(emp: EmployeeDB) -> dict:
    return {
        "id": emp.id,
        "name": emp.name,
        "employee_number": emp.employee_number,
        "department": emp.department,
        "position": emp.position,
        "is_trained": emp.is_trained,
        "photo_count": emp_photo_count(emp.id),
        "avatar_url": None,
        "created_at": emp.created_at.isoformat() if emp.created_at else None,
    }

def att_to_dict(att: AttendanceDB, db: Session) -> dict:
    emp = db.query(EmployeeDB).filter(EmployeeDB.id == att.employee_id).first()
    duration = None
    if att.check_out and att.check_in:
        duration = int((att.check_out - att.check_in).total_seconds() / 60)
    snapshot_url = None
    if att.snapshot_path:
        snapshot_url = f"/api/snapshots/{Path(att.snapshot_path).name}"
    return {
        "id": att.id,
        "employee_id": att.employee_id,
        "employee_name": emp.name if emp else "Unknown",
        "employee_number": emp.employee_number if emp else "",
        "department": emp.department if emp else "",
        "check_in": att.check_in.isoformat() if att.check_in else None,
        "check_out": att.check_out.isoformat() if att.check_out else None,
        "duration_minutes": duration,
        "date": att.date.isoformat() if att.date else None,
        "snapshot_url": snapshot_url,
    }

# ─── App ─────────────────────────────────────────────────────────────────────

app = FastAPI(title="Attendance System API", root_path="/api")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve snapshot images
if SNAPSHOTS_DIR.exists():
    app.mount("/snapshots", StaticFiles(directory=str(SNAPSHOTS_DIR)), name="snapshots")

# ─── Seed admin on startup ────────────────────────────────────────────────────

def seed_admin():
    db = SessionLocal()
    try:
        if not db.query(AdminUserDB).first():
            admin = AdminUserDB(
                username="admin",
                hashed_password=hash_password("admin123"),
                role="admin"
            )
            db.add(admin)
            db.commit()
            logger.info("Created default admin: admin / admin123")
    finally:
        db.close()

seed_admin()

# ─── Routes ───────────────────────────────────────────────────────────────────

@app.get("/healthz")
def health_check():
    return {"status": "ok"}

# Auth
@app.post("/auth/login")
def login(body: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(AdminUserDB).filter(AdminUserDB.username == body.username).first()
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_access_token({"sub": str(user.id)})
    return {
        "token": token,
        "user": {"id": user.id, "username": user.username, "role": user.role}
    }

@app.get("/auth/me")
def get_me(current_user: AdminUserDB = Depends(get_current_user)):
    return {"id": current_user.id, "username": current_user.username, "role": current_user.role}

# Employees
@app.get("/employees")
def list_employees(
    department: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: AdminUserDB = Depends(get_current_user)
):
    q = db.query(EmployeeDB)
    if department:
        q = q.filter(EmployeeDB.department == department)
    if search:
        q = q.filter(EmployeeDB.name.ilike(f"%{search}%") | EmployeeDB.employee_number.ilike(f"%{search}%"))
    return [emp_to_dict(e) for e in q.all()]

@app.post("/employees", status_code=201)
def create_employee(body: EmployeeCreate, db: Session = Depends(get_db), current_user: AdminUserDB = Depends(get_current_user)):
    existing = db.query(EmployeeDB).filter(EmployeeDB.employee_number == body.employee_number).first()
    if existing:
        raise HTTPException(status_code=400, detail="Employee number already exists")
    emp = EmployeeDB(**body.model_dump())
    db.add(emp)
    db.commit()
    db.refresh(emp)
    emp_dir = EMPLOYEES_DIR / str(emp.id)
    emp_dir.mkdir(parents=True, exist_ok=True)
    return emp_to_dict(emp)

@app.get("/employees/{id}")
def get_employee(id: int, db: Session = Depends(get_db), current_user: AdminUserDB = Depends(get_current_user)):
    emp = db.query(EmployeeDB).filter(EmployeeDB.id == id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
    return emp_to_dict(emp)

@app.put("/employees/{id}")
def update_employee(id: int, body: EmployeeUpdate, db: Session = Depends(get_db), current_user: AdminUserDB = Depends(get_current_user)):
    emp = db.query(EmployeeDB).filter(EmployeeDB.id == id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(emp, k, v)
    db.commit()
    db.refresh(emp)
    return emp_to_dict(emp)

@app.delete("/employees/{id}", status_code=204)
def delete_employee(id: int, db: Session = Depends(get_db), current_user: AdminUserDB = Depends(get_current_user)):
    emp = db.query(EmployeeDB).filter(EmployeeDB.id == id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
    emp_dir = EMPLOYEES_DIR / str(id)
    if emp_dir.exists():
        shutil.rmtree(emp_dir)
    db.delete(emp)
    db.commit()

# Photo upload (multipart)
@app.post("/employees/{id}/photos")
async def upload_photo(
    id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: AdminUserDB = Depends(get_current_user)
):
    emp = db.query(EmployeeDB).filter(EmployeeDB.id == id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
    emp_dir = EMPLOYEES_DIR / str(id)
    emp_dir.mkdir(parents=True, exist_ok=True)
    count = len(list(emp_dir.glob("*.jpg")))
    photo_path = emp_dir / f"{count + 1}.jpg"
    content = await file.read()
    nparr = np.frombuffer(content, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        raise HTTPException(status_code=400, detail="Invalid image")
    # Detect face and save
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    faces_detected = face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(50, 50))
    if len(faces_detected) == 0:
        raise HTTPException(status_code=400, detail="No face detected in image")
    cv2.imwrite(str(photo_path), img)
    return {"count": emp_photo_count(id), "saved": True}

@app.get("/employees/{id}/photos/count")
def get_photo_count(id: int, db: Session = Depends(get_db), current_user: AdminUserDB = Depends(get_current_user)):
    return {"count": emp_photo_count(id)}

@app.post("/employees/{id}/train")
def train_employee(id: int, db: Session = Depends(get_db), current_user: AdminUserDB = Depends(get_current_user)):
    emp = db.query(EmployeeDB).filter(EmployeeDB.id == id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
    count = emp_photo_count(id)
    if count < 5:
        raise HTTPException(status_code=400, detail=f"Need at least 5 photos, have {count}")
    emp.is_trained = True
    db.commit()
    success, message = retrain_all(db)
    return {"success": success, "message": message, "photos_used": count}

@app.get("/departments")
def list_departments(db: Session = Depends(get_db), current_user: AdminUserDB = Depends(get_current_user)):
    rows = db.query(EmployeeDB.department).distinct().all()
    return [r[0] for r in rows if r[0]]

# Face Recognition + Attendance
@app.post("/recognize")
def recognize_face(body: FrameRequest, db: Session = Depends(get_db), current_user: AdminUserDB = Depends(get_current_user)):
    faces = recognize_frame(body.image)
    attendance_recorded = False
    today = date.today()

    for face in faces:
        if face["employee_id"] is None:
            continue
        emp_id = face["employee_id"]
        existing = db.query(AttendanceDB).filter(
            AttendanceDB.employee_id == emp_id,
            AttendanceDB.date == today
        ).first()
        if not existing:
            snapshot_path = None
            try:
                img_bytes = base64.b64decode(body.image)
                nparr = np.frombuffer(img_bytes, np.uint8)
                img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
                if img is not None:
                    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
                    snap_name = f"{emp_id}_{ts}.jpg"
                    snap_path = SNAPSHOTS_DIR / snap_name
                    cv2.imwrite(str(snap_path), img)
                    snapshot_path = str(snap_path)
            except Exception:
                pass

            record = AttendanceDB(
                employee_id=emp_id,
                date=today,
                check_in=datetime.now(),
                snapshot_path=snapshot_path
            )
            db.add(record)
            db.commit()
            attendance_recorded = True

    return {"faces": faces, "attendance_recorded": attendance_recorded}

# Attendance
@app.get("/attendance")
def list_attendance(
    date: Optional[str] = None,
    employee_id: Optional[int] = None,
    page: int = 1,
    limit: int = 20,
    db: Session = Depends(get_db),
    current_user: AdminUserDB = Depends(get_current_user)
):
    q = db.query(AttendanceDB)
    if date:
        try:
            d = datetime.strptime(date, "%Y-%m-%d").date()
            q = q.filter(AttendanceDB.date == d)
        except ValueError:
            pass
    if employee_id:
        q = q.filter(AttendanceDB.employee_id == employee_id)
    total = q.count()
    records = q.order_by(AttendanceDB.check_in.desc()).offset((page - 1) * limit).limit(limit).all()
    return {
        "records": [att_to_dict(r, db) for r in records],
        "total": total,
        "page": page,
        "limit": limit
    }

@app.get("/attendance/today")
def get_today_attendance(db: Session = Depends(get_db), current_user: AdminUserDB = Depends(get_current_user)):
    today = date.today()
    records = db.query(AttendanceDB).filter(AttendanceDB.date == today).order_by(AttendanceDB.check_in.desc()).all()
    return [att_to_dict(r, db) for r in records]

@app.get("/attendance/stats")
def get_attendance_stats(db: Session = Depends(get_db), current_user: AdminUserDB = Depends(get_current_user)):
    today = date.today()
    total_employees = db.query(EmployeeDB).count()
    trained_employees = db.query(EmployeeDB).filter(EmployeeDB.is_trained == True).count()
    today_records = db.query(AttendanceDB).filter(AttendanceDB.date == today).all()
    present_today = len(today_records)
    absent_today = max(0, total_employees - present_today)
    checked_out = sum(1 for r in today_records if r.check_out is not None)

    # Avg work hours this month
    month_start = today.replace(day=1)
    month_records = db.query(AttendanceDB).filter(
        AttendanceDB.date >= month_start,
        AttendanceDB.check_out.isnot(None)
    ).all()
    if month_records:
        total_mins = sum(
            (r.check_out - r.check_in).total_seconds() / 60
            for r in month_records if r.check_out and r.check_in
        )
        avg_hours = round(total_mins / 60 / max(len(month_records), 1), 1)
    else:
        avg_hours = 0.0

    recent = db.query(AttendanceDB).order_by(AttendanceDB.check_in.desc()).limit(10).all()
    return {
        "total_employees": total_employees,
        "trained_employees": trained_employees,
        "present_today": present_today,
        "absent_today": absent_today,
        "checked_out_today": checked_out,
        "avg_work_hours": avg_hours,
        "recent_activity": [att_to_dict(r, db) for r in recent]
    }

@app.post("/attendance/{id}/checkout")
def manual_checkout(id: int, db: Session = Depends(get_db), current_user: AdminUserDB = Depends(get_current_user)):
    record = db.query(AttendanceDB).filter(AttendanceDB.id == id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Attendance record not found")
    if record.check_out:
        raise HTTPException(status_code=400, detail="Already checked out")
    record.check_out = datetime.now()
    db.commit()
    db.refresh(record)
    return att_to_dict(record, db)

# Reports
@app.get("/reports/daily")
def get_daily_report(date: Optional[str] = None, db: Session = Depends(get_db), current_user: AdminUserDB = Depends(get_current_user)):
    if date:
        try:
            report_date = datetime.strptime(date, "%Y-%m-%d").date()
        except ValueError:
            report_date = datetime.today().date()
    else:
        report_date = datetime.today().date()

    total = db.query(EmployeeDB).count()
    records = db.query(AttendanceDB).filter(AttendanceDB.date == report_date).all()
    present = len(records)
    absent = max(0, total - present)

    work_start = datetime.combine(report_date, datetime.min.time().replace(hour=9))
    late = sum(1 for r in records if r.check_in and r.check_in > work_start)

    return {
        "date": report_date.isoformat(),
        "total_employees": total,
        "present": present,
        "absent": absent,
        "late": late,
        "records": [att_to_dict(r, db) for r in records]
    }

@app.get("/reports/monthly")
def get_monthly_report(month: Optional[int] = None, year: Optional[int] = None, db: Session = Depends(get_db), current_user: AdminUserDB = Depends(get_current_user)):
    today = date.today()
    m = month or today.month
    y = year or today.year

    from calendar import monthrange
    days_in_month = monthrange(y, m)[1]
    month_start = date(y, m, 1)
    month_end = date(y, m, days_in_month)

    records = db.query(AttendanceDB).filter(
        AttendanceDB.date >= month_start,
        AttendanceDB.date <= month_end
    ).all()

    total_checkins = len(records)
    employees = db.query(EmployeeDB).all()
    total_emp = len(employees)

    working_days = sum(1 for d in range(1, days_in_month + 1) if date(y, m, d).weekday() < 5)

    attendance_rate = 0.0
    if total_emp > 0 and working_days > 0:
        attendance_rate = round((total_checkins / (total_emp * working_days)) * 100, 1)

    by_employee = []
    for emp in employees:
        emp_recs = [r for r in records if r.employee_id == emp.id]
        days_present = len(emp_recs)
        days_absent = max(0, working_days - days_present)
        completed = [r for r in emp_recs if r.check_out and r.check_in]
        avg_hours = 0.0
        if completed:
            total_mins = sum((r.check_out - r.check_in).total_seconds() / 60 for r in completed)
            avg_hours = round(total_mins / 60 / len(completed), 1)
        emp_rate = round((days_present / working_days) * 100, 1) if working_days > 0 else 0
        by_employee.append({
            "employee_id": emp.id,
            "name": emp.name,
            "department": emp.department,
            "days_present": days_present,
            "days_absent": days_absent,
            "avg_work_hours": avg_hours,
            "attendance_rate": emp_rate
        })

    return {
        "month": m,
        "year": y,
        "summary": {
            "total_days": days_in_month,
            "working_days": working_days,
            "total_checkins": total_checkins,
            "avg_attendance_rate": attendance_rate
        },
        "by_employee": sorted(by_employee, key=lambda x: x["days_present"], reverse=True)
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=PORT)
