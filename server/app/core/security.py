from datetime import timedelta

import bcrypt
import jwt
from beanie import PydanticObjectId
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.clock import real_utcnow
from app.core.config import settings
from app.models.user import User

bearer = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=10)).decode()


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), hashed.encode())
    except ValueError:
        return False


def create_token(user_id: PydanticObjectId) -> str:
    # Token expiry uses real time on purpose: advancing the demo clock should not log people out.
    payload = {"sub": str(user_id), "exp": real_utcnow() + timedelta(minutes=settings.jwt_expires_minutes)}
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


async def _user_from_token(creds: HTTPAuthorizationCredentials | None) -> User | None:
    if creds is None:
        return None
    try:
        payload = jwt.decode(creds.credentials, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        return await User.get(PydanticObjectId(payload["sub"]))
    except (jwt.PyJWTError, KeyError, ValueError):
        return None


async def get_optional_user(creds: HTTPAuthorizationCredentials | None = Depends(bearer)) -> User | None:
    return await _user_from_token(creds)


async def get_current_user(creds: HTTPAuthorizationCredentials | None = Depends(bearer)) -> User:
    user = await _user_from_token(creds)
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sign in to continue.")
    return user


async def require_active_member(user: User = Depends(get_current_user)) -> User:
    """Blocks restricted accounts from listing and requesting."""
    if user.restricted:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Your account is restricted, so you can't list or request items right now. Contact a moderator.",
        )
    return user


async def require_moderator(user: User = Depends(get_current_user)) -> User:
    if user.role != "moderator":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Moderators only.")
    return user


async def require_demo_mode() -> None:
    if not settings.demo_mode:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
