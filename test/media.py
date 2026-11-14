"""Render the README pictures: four window shots, the banner and the catalog banner.

uv run --with playwright --with pillow python test/media.py
Writes media/shots/*.png, media/banner.png (2400x1500) and assets/catalog-banner.png (1200x600).
"""

import functools
import http.server
import pathlib
import threading

from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
SHOTS = ROOT / "media" / "shots"
SHOTS.mkdir(parents=True, exist_ok=True)
(ROOT / "assets").mkdir(exist_ok=True)

# The wordmark face ships with Hermes Desktop; borrow it from the local install for the pictures.
FONT = ROOT / "test" / "fonts" / "Collapse-Bold.woff2"
if not FONT.exists():
    built = pathlib.Path.home() / "AppData/Local/hermes/hermes-agent/apps/desktop/dist/assets"
    found = sorted(built.glob("Collapse-Bold-*.woff2"))
    if found:
        FONT.parent.mkdir(exist_ok=True)
        FONT.write_bytes(found[0].read_bytes())


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass


server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=str(ROOT)))
threading.Thread(target=server.serve_forever, daemon=True).start()
base = f"http://127.0.0.1:{server.server_port}/test/harness.html"

CASES = {
    "feisheng-day": ("feisheng", "light", 0),
    "feisheng-night": ("feisheng", "dark", 0),
    "cangfeng-day": ("cangfeng", "light", 120),
    "cangfeng-night": ("cangfeng", "dark", 120),
}

with sync_playwright() as p:
    browser = p.chromium.launch(
        channel="chrome", headless=True, args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
    )
    page = browser.new_page(viewport={"width": 1200, "height": 750}, device_scale_factor=2)
    for name, (theme, mode, t) in CASES.items():
        page.goto(f"{base}?theme={theme}&mode={mode}&t={t}")
        page.wait_for_function("document.title === 'ready'", timeout=30000)
        page.screenshot(path=str(SHOTS / f"{name}.png"))
        print("saved", name)
    browser.close()
server.shutdown()

# Banner: the window split on a diagonal, ink scroll by day on the left, the lake by night on the right.
left = Image.open(SHOTS / "feisheng-day.png").convert("RGB")
right = Image.open(SHOTS / "cangfeng-night.png").convert("RGB")
w, h = left.size
mask = Image.new("L", (w, h), 0)
ImageDraw.Draw(mask).polygon([(w * 0.62, 0), (w, 0), (w, h), (w * 0.38, h)], fill=255)
banner = left.copy()
banner.paste(right, (0, 0), mask)
banner.save(ROOT / "media" / "banner.png", optimize=True)
banner.resize((1200, 750), Image.Resampling.LANCZOS).crop((0, 75, 1200, 675)).save(ROOT / "assets" / "catalog-banner.png", optimize=True)
print("saved banner, catalog-banner")
