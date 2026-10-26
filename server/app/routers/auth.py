from fastapi import APIRouter, Depends, HTTPException, status

from app.core import clock
from app.core.security import create_token, get_current_user, hash_password, verify_password
from app.models.user import User
from app.schemas.user import LoginIn, RegisterIn, TokenOut, UserMe, user_me
from app.services.geo import CAMPUS_CENTER

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=TokenOut, status_code=201)
async def register(body: RegisterIn) -> TokenOut:
    email = body.email.lower()
    if await User.find_one(User.email == email):
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with that email already exists. Try signing in.")
    user = User(
        email=email,
        password_hash=hash_password(body.password),
        name=body.name.strip(),
        affiliation=body.affiliation,
        major=body.major,
        grad_year=body.grad_year,
        home_lat=CAMPUS_CENTER[0],
        home_lng=CAMPUS_CENTER[1],
        created_at=await clock.now(),
    )
    await user.insert()
    return TokenOut(access_token=create_token(user.id), user=user_me(user))


@router.post("/login", response_model=TokenOut)
async def login(body: LoginIn) -> TokenOut:
    user = await User.find_one(User.email == body.email.lower())
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "That email and password don't match.")
    return TokenOut(access_token=create_token(user.id), user=user_me(user))


@router.get("/me", response_model=UserMe)
async def me(user: User = Depends(get_current_user)) -> UserMe:
    return user_me(user)
