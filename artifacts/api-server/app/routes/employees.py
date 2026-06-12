import shutil
from typing import Optional

import cv2
import numpy as np
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, BackgroundTasks
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..config import EMPLOYEES_DIR
from ..database import get_db
from ..face_service import face_cascade, retrain_all
from ..helpers import emp_photo_count, emp_to_dict
from ..models import EmployeeDB, AdminUserDB
from ..schemas import EmployeeCreate, EmployeeUpdate

router = APIRouter(prefix="/employees", tags=["employees"])


def _do_retrain(db_url: str, employees_data: list):
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from ..models import EmployeeDB as EmpModel

    engine = create_engine(db_url, pool_pre_ping=True)
    Session = sessionmaker(bind=engine)
    db = Session()
    try:
        emps = db.query(EmpModel).filter(EmpModel.is_trained == True).all()
        retrain_all(emps)
    finally:
        db.close()
        engine.dispose()


@router.get("")
def list_employees(
    department: Optional[str] = None,
    search: Optional[str] = None,
    page: int = 1,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: AdminUserDB = Depends(get_current_user),
):
    q = db.query(EmployeeDB)
    if department:
        q = q.filter(EmployeeDB.department == department)
    if search:
        q = q.filter(
            EmployeeDB.name.ilike(f"%{search}%")
            | EmployeeDB.employee_number.ilike(f"%{search}%")
        )
    employees = q.order_by(EmployeeDB.name).all()
    return [emp_to_dict(e) for e in employees]


@router.post("", status_code=201)
def create_employee(
    body: EmployeeCreate,
    db: Session = Depends(get_db),
    current_user: AdminUserDB = Depends(get_current_user),
):
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


@router.get("/departments")
def list_departments(
    db: Session = Depends(get_db),
    current_user: AdminUserDB = Depends(get_current_user),
):
    rows = db.query(EmployeeDB.department).distinct().all()
    return [r[0] for r in rows if r[0]]


@router.get("/{emp_id}")
def get_employee(
    emp_id: int,
    db: Session = Depends(get_db),
    current_user: AdminUserDB = Depends(get_current_user),
):
    emp = db.query(EmployeeDB).filter(EmployeeDB.id == emp_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
    return emp_to_dict(emp)


@router.put("/{emp_id}")
def update_employee(
    emp_id: int,
    body: EmployeeUpdate,
    db: Session = Depends(get_db),
    current_user: AdminUserDB = Depends(get_current_user),
):
    emp = db.query(EmployeeDB).filter(EmployeeDB.id == emp_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(emp, k, v)
    db.commit()
    db.refresh(emp)
    return emp_to_dict(emp)


@router.delete("/{emp_id}", status_code=204)
def delete_employee(
    emp_id: int,
    db: Session = Depends(get_db),
    current_user: AdminUserDB = Depends(get_current_user),
):
    emp = db.query(EmployeeDB).filter(EmployeeDB.id == emp_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
    emp_dir = EMPLOYEES_DIR / str(emp_id)
    if emp_dir.exists():
        shutil.rmtree(emp_dir)
    db.delete(emp)
    db.commit()


@router.post("/{emp_id}/photos")
async def upload_photo(
    emp_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: AdminUserDB = Depends(get_current_user),
):
    emp = db.query(EmployeeDB).filter(EmployeeDB.id == emp_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")

    emp_dir = EMPLOYEES_DIR / str(emp_id)
    emp_dir.mkdir(parents=True, exist_ok=True)

    content = await file.read()
    nparr = np.frombuffer(content, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        raise HTTPException(status_code=400, detail="Invalid image")

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    faces_detected = face_cascade.detectMultiScale(
        gray, scaleFactor=1.1, minNeighbors=5, minSize=(50, 50)
    )
    if len(faces_detected) == 0:
        raise HTTPException(status_code=400, detail="No face detected in image")

    count = len(list(emp_dir.glob("*.jpg")))
    photo_path = emp_dir / f"{count + 1}.jpg"
    cv2.imwrite(str(photo_path), img)
    return {"count": emp_photo_count(emp_id), "saved": True}


@router.get("/{emp_id}/photos/count")
def get_photo_count(
    emp_id: int,
    db: Session = Depends(get_db),
    current_user: AdminUserDB = Depends(get_current_user),
):
    return {"count": emp_photo_count(emp_id)}


@router.post("/{emp_id}/train")
def train_employee(
    emp_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: AdminUserDB = Depends(get_current_user),
):
    emp = db.query(EmployeeDB).filter(EmployeeDB.id == emp_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
    count = emp_photo_count(emp_id)
    if count < 5:
        raise HTTPException(status_code=400, detail=f"Need at least 5 photos, have {count}")

    emp.is_trained = True
    db.commit()

    trained_employees = db.query(EmployeeDB).filter(EmployeeDB.is_trained == True).all()
    background_tasks.add_task(retrain_all, trained_employees)

    return {"success": True, "message": "Training started in background", "photos_used": count}
