from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from app.core.security import get_current_user, get_optional_user
from app.models.listing import Listing
from app.models.rental import Rental
from app.models.review import Review
from app.models.user import User
from app.schemas.common import APIModel
from app.schemas.listing import ListingCard, ReviewOut
from app.schemas.user import ProfileUpdateIn, UserMe, UserPublic, user_me, user_public
from app.services import listings as lsvc
from app.services.geo import AREAS
from app.services.uploads import save_images

router = APIRouter(prefix="/api/users", tags=["users"])


class PastRental(APIModel):
    listing_title: str
    role: str
    start_date: str
    end_date: str


class Profile(APIModel):
    user: UserPublic
    reviews_as_lender: list[ReviewOut]
    reviews_as_borrower: list[ReviewOut]
    listings: list[ListingCard]
    past_rentals: list[PastRental]
    is_me: bool


@router.get("/{user_id}", response_model=Profile)
async def profile(user_id: PydanticObjectId, viewer: User | None = Depends(get_optional_user)) -> Profile:
    u = await User.get(user_id)
    if u is None:
        raise HTTPException(404, "Member not found.")
    reviews = await Review.find(Review.subject_id == u.id).sort(-Review.created_at).limit(40).to_list()
    out = await lsvc.reviews_out(reviews)
    listings = await Listing.find(Listing.owner_id == u.id, Listing.status == "active").to_list()
    past = (
        await Rental.find({"$or": [{"borrower_id": u.id}, {"lender_id": u.id}], "status": "completed"})
        .sort(-Rental.updated_at)
        .limit(10)
        .to_list()
    )
    titles = {x.id: x.title for x in await Listing.find({"_id": {"$in": [r.listing_id for r in past]}}).to_list()}
    return Profile(
        user=user_public(u),
        reviews_as_lender=[r for r in out if r.subject_role == "lender"],
        reviews_as_borrower=[r for r in out if r.subject_role == "borrower"],
        listings=[lsvc.card(x, u, lsvc.distance_from(x, u.home_lat, u.home_lng)) for x in listings],
        past_rentals=[
            PastRental(
                listing_title=titles.get(r.listing_id, "Item"),
                role="lent" if r.lender_id == u.id else "borrowed",
                start_date=r.start_date,
                end_date=r.end_date,
            )
            for r in past
        ],
        is_me=bool(viewer and viewer.id == u.id),
    )


@router.patch("/me", response_model=UserMe)
async def update_me(body: ProfileUpdateIn, user: User = Depends(get_current_user)) -> UserMe:
    data = body.model_dump(exclude_none=True)
    if "home_area" in data:
        area = next((a for a in AREAS if a["name"] == data["home_area"]), None)
        if area is None:
            raise HTTPException(422, "Pick one of the listed areas.")
        user.home_lat, user.home_lng, user.home_area_kind = area["lat"], area["lng"], area["kind"]
    for k, v in data.items():
        if k != "home_area_kind":
            setattr(user, k, v.strip() if isinstance(v, str) else v)
    await user.save()
    return user_me(user)


@router.post("/me/avatar", response_model=UserMe)
async def upload_avatar(file: UploadFile = File(...), user: User = Depends(get_current_user)) -> UserMe:
    user.avatar_url = (await save_images([file], f"avatars/{user.id}"))[0]
    await user.save()
    return user_me(user)
