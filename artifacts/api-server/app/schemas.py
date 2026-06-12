from datetime import datetime, date
from typing import Optional, List
from pydantic import BaseModel


class LoginRequest(BaseModel):
    username: str
    password: str


class UserOut(BaseModel):
    id: int
    username: str
    role: str


class TokenResponse(BaseModel):
    token: str
    user: UserOut


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


class EmployeeOut(BaseModel):
    id: int
    name: str
    employee_number: str
    department: str
    position: str
    is_trained: bool
    photo_count: int
    avatar_url: Optional[str]
    created_at: Optional[str]


class AttendanceOut(BaseModel):
    id: int
    employee_id: int
    employee_name: str
    employee_number: str
    department: str
    check_in: Optional[str]
    check_out: Optional[str]
    duration_minutes: Optional[int]
    date: Optional[str]
    snapshot_url: Optional[str]


class AttendanceListResponse(BaseModel):
    records: List[AttendanceOut]
    total: int
    page: int
    limit: int


class FrameRequest(BaseModel):
    image: str


class TrainResponse(BaseModel):
    success: bool
    message: str
    photos_used: int
