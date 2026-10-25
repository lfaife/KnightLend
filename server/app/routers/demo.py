"""Demo-only controls. The router answers 404 unless DEMO_MODE=true."""

from fastapi import APIRouter, Depends, HTTPException

from app.core.security import create_token, require_demo_mode
from app.models.user import User
from app.schemas.common import APIModel, IdStr
from app.schemas.user import TokenOut, user_me
from app.seed.users import DEMO_ACCOUNTS

router = APIRouter(prefix="/api/demo", tags=["demo"], dependencies=[Depends(require_demo_mode)])


class DemoUser(APIModel):
    id: IdStr
    label: str
    name: str
    role: str
    affiliation: str


class LoginAsIn(APIModel):
    user_id: IdStr


@router.get("/users", response_model=list[DemoUser])
async def demo_users() -> list[DemoUser]:
    out = []
    for email, label in DEMO_ACCOUNTS.items():
        u = await User.find_one(User.email == email)
        if u:
            out.append(DemoUser(id=u.id, label=label, name=u.name, role=u.role, affiliation=u.affiliation))
    return out


@router.post("/login-as", response_model=TokenOut)
async def login_as(body: LoginAsIn) -> TokenOut:
    user = await User.get(body.user_id)
    if user is None:
        raise HTTPException(404, "User not found")
    return TokenOut(access_token=create_token(user.id), user=user_me(user))
