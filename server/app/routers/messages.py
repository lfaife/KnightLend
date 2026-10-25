from fastapi import APIRouter, Depends

from app.core.security import get_current_user
from app.models.listing import Listing
from app.models.message import Message
from app.models.rental import Rental
from app.models.user import User
from app.schemas.rental import Conversation
from app.schemas.user import user_public
from app.services.rentals import STATUS_LABEL

router = APIRouter(prefix="/api/conversations", tags=["messages"])


@router.get("", response_model=list[Conversation])
async def conversations(user: User = Depends(get_current_user)) -> list[Conversation]:
    """One conversation per rental. Newest activity first."""
    rentals = await Rental.find({"$or": [{"borrower_id": user.id}, {"lender_id": user.id}]}).to_list()
    ids = [r.id for r in rentals]
    msgs = await Message.find({"rental_id": {"$in": ids}}).sort(-Message.created_at).to_list()
    latest: dict = {}
    unread: dict = {}
    for m in msgs:
        latest.setdefault(m.rental_id, m)
        if m.sender_id != user.id and user.id not in m.read_by:
            unread[m.rental_id] = unread.get(m.rental_id, 0) + 1
    listings = {x.id: x for x in await Listing.find({"_id": {"$in": [r.listing_id for r in rentals]}}).to_list()}
    people = {
        u.id: u
        for u in await User.find({"_id": {"$in": [r.borrower_id for r in rentals] + [r.lender_id for r in rentals]}}).to_list()
    }
    out = []
    for r in rentals:
        last = latest.get(r.id)
        if last is None and r.status in ("completed", "rejected", "cancelled"):
            continue  # finished rentals without messages don't need a thread
        listing = listings[r.listing_id]
        other = people[r.lender_id if r.borrower_id == user.id else r.borrower_id]
        out.append(
            Conversation(
                rental_id=r.id,
                listing_title=listing.title,
                listing_photo=listing.photos[0] if listing.photos else None,
                other_party=user_public(other),
                status=r.status,
                status_label=STATUS_LABEL[r.status],
                last_message=last.body if last else None,
                last_at=last.created_at if last else r.updated_at,
                unread=unread.get(r.id, 0),
            )
        )
    out.sort(key=lambda c: c.last_at, reverse=True)
    return out
