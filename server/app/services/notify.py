from beanie import PydanticObjectId

from app.core import clock
from app.models.notification import Notification


async def notify(
    user_id: PydanticObjectId,
    kind: str,
    title: str,
    body: str = "",
    rental_id: PydanticObjectId | None = None,
    link: str | None = None,
) -> Notification:
    n = Notification(
        user_id=user_id,
        kind=kind,
        title=title,
        body=body,
        rental_id=rental_id,
        link=link or (f"/rentals/{rental_id}" if rental_id else None),
        created_at=await clock.now(),
    )
    await n.insert()
    return n
