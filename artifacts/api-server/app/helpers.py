from pathlib import Path
from typing import Optional
from sqlalchemy.orm import Session

from .config import EMPLOYEES_DIR, SNAPSHOTS_DIR
from .models import EmployeeDB, AttendanceDB


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


def att_to_dict(att: AttendanceDB, emp: Optional[EmployeeDB]) -> dict:
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
