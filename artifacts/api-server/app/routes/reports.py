from calendar import monthrange
from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..database import get_db
from ..helpers import att_to_dict
from ..models import AttendanceDB, EmployeeDB, AdminUserDB

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/daily")
def get_daily_report(
    date: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: AdminUserDB = Depends(get_current_user),
):
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

    emp_ids = {r.employee_id for r in records}
    emps = {e.id: e for e in db.query(EmployeeDB).filter(EmployeeDB.id.in_(emp_ids)).all()}

    return {
        "date": report_date.isoformat(),
        "total_employees": total,
        "present": present,
        "absent": absent,
        "late": late,
        "records": [att_to_dict(r, emps.get(r.employee_id)) for r in records],
    }


@router.get("/monthly")
def get_monthly_report(
    month: Optional[int] = None,
    year: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: AdminUserDB = Depends(get_current_user),
):
    today = datetime.today().date()
    m = month or today.month
    y = year or today.year

    days_in_month = monthrange(y, m)[1]
    month_start = date(y, m, 1)
    month_end = date(y, m, days_in_month)

    records = (
        db.query(AttendanceDB)
        .filter(AttendanceDB.date >= month_start, AttendanceDB.date <= month_end)
        .all()
    )

    employees = db.query(EmployeeDB).all()
    total_emp = len(employees)
    working_days = sum(
        1 for d in range(1, days_in_month + 1) if date(y, m, d).weekday() < 5
    )

    total_checkins = len(records)
    attendance_rate = 0.0
    if total_emp > 0 and working_days > 0:
        attendance_rate = round((total_checkins / (total_emp * working_days)) * 100, 1)

    records_by_emp: dict = {}
    for r in records:
        records_by_emp.setdefault(r.employee_id, []).append(r)

    by_employee = []
    for emp in employees:
        emp_recs = records_by_emp.get(emp.id, [])
        days_present = len(emp_recs)
        days_absent = max(0, working_days - days_present)
        completed = [r for r in emp_recs if r.check_out and r.check_in]
        avg_hours = 0.0
        if completed:
            total_mins = sum(
                (r.check_out - r.check_in).total_seconds() / 60 for r in completed
            )
            avg_hours = round(total_mins / 60 / len(completed), 1)
        emp_rate = round((days_present / working_days) * 100, 1) if working_days > 0 else 0
        by_employee.append(
            {
                "employee_id": emp.id,
                "name": emp.name,
                "department": emp.department,
                "days_present": days_present,
                "days_absent": days_absent,
                "avg_work_hours": avg_hours,
                "attendance_rate": emp_rate,
            }
        )

    return {
        "month": m,
        "year": y,
        "summary": {
            "total_days": days_in_month,
            "working_days": working_days,
            "total_checkins": total_checkins,
            "avg_attendance_rate": attendance_rate,
        },
        "by_employee": sorted(by_employee, key=lambda x: x["days_present"], reverse=True),
    }
