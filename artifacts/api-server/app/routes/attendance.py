import base64
import logging
from datetime import datetime, date
from typing import Optional

import cv2
import numpy as np
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..config import SNAPSHOTS_DIR
from ..database import get_db
from ..face_service import recognize_frame
from ..helpers import att_to_dict
from ..models import AttendanceDB, EmployeeDB, AdminUserDB
from ..schemas import FrameRequest

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/attendance", tags=["attendance"])


def _get_emp(db: Session, emp_id: int) -> Optional[EmployeeDB]:
    return db.query(EmployeeDB).filter(EmployeeDB.id == emp_id).first()


@router.post("/recognize")
def recognize_face(
    body: FrameRequest,
    db: Session = Depends(get_db),
    current_user: AdminUserDB = Depends(get_current_user),
):
    faces = recognize_frame(body.image)
    attendance_recorded = False
    today = date.today()

    for face in faces:
        if face["employee_id"] is None:
            continue
        emp_id = face["employee_id"]

        existing = (
            db.query(AttendanceDB)
            .filter(AttendanceDB.employee_id == emp_id, AttendanceDB.date == today)
            .first()
        )
        if existing:
            continue

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
        except Exception as e:
            logger.warning("Snapshot save failed: %s", e)

        record = AttendanceDB(
            employee_id=emp_id,
            date=today,
            check_in=datetime.now(),
            snapshot_path=snapshot_path,
        )
        db.add(record)
        db.commit()
        attendance_recorded = True

    return {"faces": faces, "attendance_recorded": attendance_recorded}


@router.get("")
def list_attendance(
    date: Optional[str] = None,
    employee_id: Optional[int] = None,
    page: int = 1,
    limit: int = 20,
    db: Session = Depends(get_db),
    current_user: AdminUserDB = Depends(get_current_user),
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
    records = (
        q.order_by(AttendanceDB.check_in.desc())
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )

    emp_ids = {r.employee_id for r in records}
    emps = {e.id: e for e in db.query(EmployeeDB).filter(EmployeeDB.id.in_(emp_ids)).all()}

    return {
        "records": [att_to_dict(r, emps.get(r.employee_id)) for r in records],
        "total": total,
        "page": page,
        "limit": limit,
    }


@router.get("/today")
def get_today_attendance(
    db: Session = Depends(get_db),
    current_user: AdminUserDB = Depends(get_current_user),
):
    today = date.today()
    records = (
        db.query(AttendanceDB)
        .filter(AttendanceDB.date == today)
        .order_by(AttendanceDB.check_in.desc())
        .all()
    )
    emp_ids = {r.employee_id for r in records}
    emps = {e.id: e for e in db.query(EmployeeDB).filter(EmployeeDB.id.in_(emp_ids)).all()}
    return [att_to_dict(r, emps.get(r.employee_id)) for r in records]


@router.get("/stats")
def get_attendance_stats(
    db: Session = Depends(get_db),
    current_user: AdminUserDB = Depends(get_current_user),
):
    today = date.today()
    total_employees = db.query(EmployeeDB).count()
    trained_employees = db.query(EmployeeDB).filter(EmployeeDB.is_trained == True).count()

    today_records = db.query(AttendanceDB).filter(AttendanceDB.date == today).all()
    present_today = len(today_records)
    absent_today = max(0, total_employees - present_today)
    checked_out = sum(1 for r in today_records if r.check_out is not None)

    month_start = today.replace(day=1)
    month_records = (
        db.query(AttendanceDB)
        .filter(AttendanceDB.date >= month_start, AttendanceDB.check_out.isnot(None))
        .all()
    )
    if month_records:
        total_mins = sum(
            (r.check_out - r.check_in).total_seconds() / 60
            for r in month_records
            if r.check_out and r.check_in
        )
        avg_hours = round(total_mins / 60 / max(len(month_records), 1), 1)
    else:
        avg_hours = 0.0

    recent = (
        db.query(AttendanceDB).order_by(AttendanceDB.check_in.desc()).limit(10).all()
    )
    emp_ids = {r.employee_id for r in recent + today_records}
    emps = {e.id: e for e in db.query(EmployeeDB).filter(EmployeeDB.id.in_(emp_ids)).all()}

    return {
        "total_employees": total_employees,
        "trained_employees": trained_employees,
        "present_today": present_today,
        "absent_today": absent_today,
        "checked_out_today": checked_out,
        "avg_work_hours": avg_hours,
        "recent_activity": [att_to_dict(r, emps.get(r.employee_id)) for r in recent],
    }


@router.post("/{att_id}/checkout")
def manual_checkout(
    att_id: int,
    db: Session = Depends(get_db),
    current_user: AdminUserDB = Depends(get_current_user),
):
    record = db.query(AttendanceDB).filter(AttendanceDB.id == att_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Attendance record not found")
    if record.check_out:
        raise HTTPException(status_code=400, detail="Already checked out")
    record.check_out = datetime.now()
    db.commit()
    db.refresh(record)
    emp = _get_emp(db, record.employee_id)
    return att_to_dict(record, emp)
