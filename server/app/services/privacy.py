"""Keep personal contact details out of KnightLend. Messages are the permanent record of a rental."""

import re

HIDDEN = "[contact info hidden]"
_EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
_PHONE = re.compile(r"(?<!\d)(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}(?!\d)")
_HANDLE = re.compile(r"(?i)\b(?:snap(?:chat)?|insta(?:gram)?|ig|whatsapp|telegram)\s*[:@]\s*@?[\w.]{3,}")


def redact(text: str) -> tuple[str, bool]:
    out = _EMAIL.sub(HIDDEN, text)
    out = _PHONE.sub(HIDDEN, out)
    out = _HANDLE.sub(HIDDEN, out)
    return out, out != text
