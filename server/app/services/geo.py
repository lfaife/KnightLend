"""Places near UCF and distance math. Distance is computed in Python so mongomock works too."""

from math import asin, cos, radians, sin, sqrt

CAMPUS_CENTER = (28.6024, -81.2001)

PICKUP_SPOTS = [
    {
        "id": "student-union",
        "name": "Student Union, main entrance",
        "lat": 28.6017,
        "lng": -81.2003,
        "accessibility": "Step-free entrance, elevators and accessible restrooms inside.",
        "hours": "7am to 11pm",
    },
    {
        "id": "library",
        "name": "John C. Hitt Library, front entrance",
        "lat": 28.6006,
        "lng": -81.2015,
        "accessibility": "Ramp and automatic doors at the main entrance.",
        "hours": "24 hours most weekdays",
    },
    {
        "id": "rwc",
        "name": "Recreation and Wellness Center lobby",
        "lat": 28.5959,
        "lng": -81.1995,
        "accessibility": "Step-free lobby with seating.",
        "hours": "6am to midnight",
    },
    {
        "id": "garage-a",
        "name": "Parking Garage A, ground floor by the elevators",
        "lat": 28.5999,
        "lng": -81.1966,
        "accessibility": "Elevator access, well lit at night, close parking for drop-offs.",
        "hours": "Open 24 hours",
    },
    {
        "id": "engineering",
        "name": "Engineering atrium",
        "lat": 28.6015,
        "lng": -81.1983,
        "accessibility": "Step-free from the north walkway.",
        "hours": "7am to 10pm",
    },
    {
        "id": "visual-arts",
        "name": "Visual Arts Building courtyard",
        "lat": 28.6031,
        "lng": -81.2026,
        "accessibility": "Paved courtyard, benches, ramp from the main path.",
        "hours": "Daylight hours",
    },
]

AREAS = [
    {
        "id": "alafaya-north",
        "name": "Apartments along Alafaya Trail (north)",
        "kind": "apartment",
        "lat": 28.6128,
        "lng": -81.2069,
    },
    {
        "id": "university-west",
        "name": "Apartments near University Blvd (west)",
        "kind": "apartment",
        "lat": 28.5968,
        "lng": -81.2141,
    },
    {
        "id": "research-park",
        "name": "Apartments near Research Park (south)",
        "kind": "apartment",
        "lat": 28.5872,
        "lng": -81.1948,
    },
    {"id": "mcculloch", "name": "Apartments off McCulloch Rd (north)", "kind": "apartment", "lat": 28.6181, "lng": -81.1988},
    {"id": "on-campus", "name": "On-campus housing", "kind": "on_campus", "lat": 28.6049, "lng": -81.1979},
    {"id": "oviedo", "name": "Oviedo (commuter)", "kind": "commuter", "lat": 28.6700, "lng": -81.2081},
    {"id": "waterford", "name": "Waterford Lakes (commuter)", "kind": "commuter", "lat": 28.5536, "lng": -81.2010},
]


def spot(spot_id: str) -> dict | None:
    return next((s for s in PICKUP_SPOTS if s["id"] == spot_id), None)


def haversine_miles(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 3958.8
    dlat, dlng = radians(lat2 - lat1), radians(lng2 - lng1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlng / 2) ** 2
    return 2 * r * asin(sqrt(a))
