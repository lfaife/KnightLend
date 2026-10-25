"""Local placeholder images. No network: every image is a generated SVG on a gold and black background."""

from pathlib import Path
from xml.sax.saxutils import escape

from app.core.config import settings

GOLD = "#FFC904"
BLACK = "#000000"
WHITE = "#FFFFFF"

CATEGORY_LABEL = {
    "calculators_electronics": "Calculators and electronics",
    "art_supplies": "Art supplies",
    "tools": "Tools",
    "cameras_media": "Cameras and media gear",
    "household_appliances": "Household and appliances",
    "clothing_events": "Clothing and events",
}


def _wrap(text: str, width: int) -> list[str]:
    words, lines, line = text.split(), [], ""
    for w in words:
        if len(line) + len(w) + 1 > width and line:
            lines.append(line)
            line = w
        else:
            line = f"{line} {w}".strip()
    if line:
        lines.append(line)
    return lines[:4]


def _text_block(lines: list[str], x: int, y: int, size: int, fill: str, weight: int = 800) -> str:
    out = []
    for i, line in enumerate(lines):
        out.append(
            f'<text x="{x}" y="{y + i * int(size * 1.18)}" font-family="Helvetica, Arial, sans-serif" '
            f'font-size="{size}" font-weight="{weight}" fill="{fill}">{escape(line)}</text>'
        )
    return "".join(out)


def _mark(x: int, y: int, fill: str, hole: str) -> str:
    return (
        f'<g transform="translate({x} {y}) scale(1.6)">'
        f'<path d="M16 3 6 7v7.6c0 6.2 4.2 11.5 10 13.4 5.8-1.9 10-7.2 10-13.4V7L16 3Z" fill="{fill}"/>'
        f'<circle cx="16" cy="13.5" r="3.2" fill="{hole}"/><path d="M14.4 15.5h3.2l1 6.2h-5.2z" fill="{hole}"/></g>'
    )


def cover_svg(title: str, category: str) -> str:
    lines = _wrap(title, 22)
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="800" height="600">'
        f'<rect width="800" height="600" fill="{BLACK}"/>'
        f'<rect x="40" y="40" width="720" height="520" rx="28" fill="{GOLD}"/>'
        f'<rect x="40" y="440" width="720" height="120" rx="0" fill="{BLACK}" opacity="0.92"/>'
        f'{_text_block(lines, 80, 140, 52, BLACK)}'
        f'{_text_block([CATEGORY_LABEL.get(category, "")], 80, 512, 26, GOLD, 600)}'
        f'{_mark(660, 470, GOLD, BLACK)}'
        "</svg>"
    )


def detail_svg(title: str, specs: list[tuple[str, str]]) -> str:
    rows = "".join(
        _text_block([label.upper()], 80, 230 + i * 70, 18, GOLD, 700)
        + _text_block([value if len(value) <= 44 else value[:43] + "…"], 80, 258 + i * 70, 24, WHITE, 500)
        for i, (label, value) in enumerate(specs[:4])
    )
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="800" height="600">'
        f'<rect width="800" height="600" fill="{BLACK}"/>'
        f'<rect x="0" y="0" width="800" height="150" fill="{GOLD}"/>'
        f'{_text_block(_wrap(title, 34)[:2], 80, 70, 34, BLACK)}'
        f"{rows}"
        f'{_mark(680, 500, GOLD, BLACK)}'
        "</svg>"
    )


def condition_svg(title: str, caption: str) -> str:
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="800" height="600">'
        f'<rect width="800" height="600" fill="{GOLD}"/>'
        f'<rect x="60" y="60" width="680" height="400" rx="20" fill="{BLACK}"/>'
        f'{_text_block(_wrap(title, 26)[:3], 100, 170, 40, GOLD)}'
        f'{_text_block([caption], 60, 530, 30, BLACK, 700)}'
        "</svg>"
    )


def write_listing_images(slug: str, title: str, category: str, specs: list[tuple[str, str]]) -> list[str]:
    out_dir: Path = settings.seed_image_dir
    out_dir.mkdir(parents=True, exist_ok=True)
    files = {
        f"{slug}-1.svg": cover_svg(title, category),
        f"{slug}-2.svg": detail_svg(title, specs),
        f"{slug}-pickup.svg": condition_svg(title, "Condition photo: at pickup"),
        f"{slug}-return.svg": condition_svg(title, "Condition photo: at return"),
    }
    for name, svg in files.items():
        (out_dir / name).write_text(svg, encoding="utf-8")
    return [f"/seed-images/{slug}-1.svg", f"/seed-images/{slug}-2.svg"]


def condition_url(slug: str, phase: str) -> str:
    return f"/seed-images/{slug}-{phase}.svg"
