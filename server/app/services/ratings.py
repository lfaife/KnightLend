"""Recompute ratings and counts from the Review and Rental collections."""

from beanie import PydanticObjectId

from app.models.listing import Listing
from app.models.rental import Rental
from app.models.review import Review
from app.models.user import User

FLAG_LOW_RATING = 2
FLAG_MIN_LOW_REVIEWS = 2


async def recompute_user(user_id: PydanticObjectId) -> None:
    user = await User.get(user_id)
    if user is None:
        return
    reviews = await Review.find(Review.subject_id == user_id).to_list()
    user.rating_count = len(reviews)
    user.rating_avg = round(sum(r.rating for r in reviews) / len(reviews), 2) if reviews else 0
    user.lent_count = await Rental.find(Rental.lender_id == user_id, Rental.status == "completed").count()
    user.borrowed_count = await Rental.find(Rental.borrower_id == user_id, Rental.status == "completed").count()
    user.rentals_count = user.lent_count + user.borrowed_count
    low = [r for r in reviews if r.rating <= FLAG_LOW_RATING]
    if len(low) >= FLAG_MIN_LOW_REVIEWS and not user.flagged:
        user.flagged = True
        user.flag_reason = f"{len(low)} reviews of {FLAG_LOW_RATING} stars or less"
    await user.save()


async def recompute_listing(listing_id: PydanticObjectId) -> None:
    listing = await Listing.get(listing_id)
    if listing is None:
        return
    reviews = await Review.find(Review.listing_id == listing_id, Review.subject_role == "lender").to_list()
    listing.rating_count = len(reviews)
    listing.rating_avg = round(sum(r.rating for r in reviews) / len(reviews), 2) if reviews else 0
    listing.rentals_count = await Rental.find(Rental.listing_id == listing_id, Rental.status == "completed").count()
    await listing.save()
