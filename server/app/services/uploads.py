"""Image uploads: checked by declared type, magic bytes and size, then saved under /uploads."""

import secrets

from fastapi import HTTPException, UploadFile

from app.core.config import settings

# Magic bytes for the formats we accept. Declared content types alone are easy to fake.
SIGNATURES = {
    "image/jpeg": (b"\xff\xd8\xff",),
    "image/png": (b"\x89PNG\r\n\x1a\n",),
    "image/webp": (b"RIFF",),
    "image/gif": (b"GIF87a", b"GIF89a"),
}
EXT = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif"}


async def save_images(files: list[UploadFile], subdir: str) -> list[str]:
    if not files:
        raise HTTPException(422, "Add at least one photo.")
    if len(files) > settings.max_files_per_upload:
        raise HTTPException(422, f"Upload up to {settings.max_files_per_upload} photos at a time.")
    limit = settings.max_upload_mb * 1024 * 1024
    checked: list[tuple[str, bytes]] = []
    for f in files:
        kind = (f.content_type or "").lower()
        if kind not in SIGNATURES:
            raise HTTPException(415, f"{f.filename or 'That file'} isn't a JPG, PNG, WebP or GIF photo.")
        data = await f.read(limit + 1)
        if len(data) > limit:
            raise HTTPException(413, f"{f.filename or 'A photo'} is over {settings.max_upload_mb} MB. Try a smaller photo.")
        if not data.startswith(SIGNATURES[kind]) or (kind == "image/webp" and data[8:12] != b"WEBP"):
            raise HTTPException(415, f"{f.filename or 'That file'} doesn't look like a real {EXT[kind].upper()} image.")
        checked.append((kind, data))
    folder = settings.upload_dir / subdir
    folder.mkdir(parents=True, exist_ok=True)
    urls = []
    for kind, data in checked:
        name = f"{secrets.token_hex(12)}.{EXT[kind]}"
        (folder / name).write_bytes(data)
        urls.append(f"/uploads/{subdir}/{name}")
    return urls
