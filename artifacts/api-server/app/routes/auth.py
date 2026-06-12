from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..auth import hash_password, verify_password, create_access_token, get_current_user
from ..database import get_db
from ..models import AdminUserDB
from ..schemas import LoginRequest, TokenResponse, UserOut

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(AdminUserDB).filter(AdminUserDB.username == body.username).first()
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_access_token({"sub": str(user.id)})
    return {"token": token, "user": {"id": user.id, "username": user.username, "role": user.role}}


@router.get("/me", response_model=UserOut)
def get_me(current_user: AdminUserDB = Depends(get_current_user)):
    return {"id": current_user.id, "username": current_user.username, "role": current_user.role}
