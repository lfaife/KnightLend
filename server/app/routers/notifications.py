from datetime import datetime

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, HTTPException

from app.core.security import get_current_user
from app.models.notification import Notification
from app.models.user import User
from app.schemas.common import OK, APIModel, IdStr

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


class NotificationOut(APIModel):
    id: IdStr
    kind: str
    title: str
    body: str
    rental_id: IdStr | None
    link: str | None
    read: bool
    created_at: datetime


class NotificationList(APIModel):
    items: list[NotificationOut]
    unread: int


@router.get("", response_model=NotificationList)
async def list_notifications(user: User = Depends(get_current_user)) -> NotificationList:
    items = await Notification.find(Notification.user_id == user.id).sort(-Notification.created_at).limit(50).to_list()
    unread = await Notification.find(Notification.user_id == user.id, Notification.read == False).count()  # noqa: E712
    return NotificationList(items=[NotificationOut(**n.model_dump()) for n in items], unread=unread)


@router.post("/read-all", response_model=OK)
async def read_all(user: User = Depends(get_current_user)) -> OK:
    await Notification.find(Notification.user_id == user.id, Notification.read == False).update({"$set": {"read": True}})  # noqa: E712
    return OK(message="All caught up")


@router.post("/{notification_id}/read", response_model=OK)
async def read_one(notification_id: PydanticObjectId, user: User = Depends(get_current_user)) -> OK:
    n = await Notification.get(notification_id)
    if n is None or n.user_id != user.id:
        raise HTTPException(404, "Notification not found.")
    n.read = True
    await n.save()
    return OK()
