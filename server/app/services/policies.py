"""Policies shown to people, kept in one place so the UI and the rules never disagree."""

CANCELLATION_RULES = [
    "Before the lender approves: cancel anytime. Nothing is charged or held.",
    "More than 24 hours before pickup: full refund of the rental fee. The hold is released right away.",
    "Within 24 hours of pickup: half the rental fee is refunded. The hold is released right away.",
    "The protection hold is never used for cancellations.",
]

SHORTCUTS = [
    {"id": "finance", "label": "Finance calculators", "hint": "FIN 3403, ACG 2021", "category": "calculators_electronics", "tag": "Finance"},
    {"id": "art", "label": "Art supplies", "hint": "Markers, paints, pencils", "category": "art_supplies", "tag": None},
    {"id": "film", "label": "Film/Media gear", "hint": "Cameras, lights, audio", "category": "cameras_media", "tag": None},
    {"id": "stem", "label": "Math and science", "hint": "MAC 2311, STA 2023", "category": "calculators_electronics", "tag": "Calculus"},
    {"id": "senior-design", "label": "Senior design builds", "hint": "Drills, sanders, levels", "category": "tools", "tag": None},
    {"id": "career", "label": "Career fair and formal", "hint": "Suits, dresses, gowns", "category": "clothing_events", "tag": None},
]

CATEGORIES = [
    {"id": "calculators_electronics", "label": "Calculators and electronics"},
    {"id": "art_supplies", "label": "Art supplies"},
    {"id": "tools", "label": "Tools"},
    {"id": "cameras_media", "label": "Cameras and media gear"},
    {"id": "household_appliances", "label": "Household and appliances"},
    {"id": "clothing_events", "label": "Clothing and events"},
]

CONDITIONS = [
    {"id": "new", "label": "New"},
    {"id": "like_new", "label": "Like new"},
    {"id": "good", "label": "Good"},
    {"id": "fair", "label": "Fair"},
]

TIMES_OF_DAY = [
    {"id": "morning", "label": "Morning (8am to noon)"},
    {"id": "afternoon", "label": "Afternoon (noon to 5pm)"},
    {"id": "evening", "label": "Evening (5pm to 9pm)"},
]

RETURN_CHECKLIST = [
    "Item is clean",
    "All parts and accessories are included",
    "Batteries are charged (if it has any)",
    "Reset or wiped (calculators and electronics)",
    "Return photos added",
]
