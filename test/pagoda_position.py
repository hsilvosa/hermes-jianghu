"""Check that the Cangfeng pagoda stays on the same peak when the window size, the clock or the pointer changes.

uv run --with playwright --with pillow python test/pagoda_position.py
Finds the cinnabar walls (light mode) above the horizon and prints their centre
relative to the window centre, in units of the window height. All rows must agree.
"""

import functools
import http.server
import io
import pathlib
import threading

from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
ACCENT = (0xB5, 0x37, 0x2D)


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass


server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=str(ROOT)))
threading.Thread(target=server.serve_forever, daemon=True).start()
base = f"http://127.0.0.1:{server.server_port}/test/harness.html?theme=cangfeng&mode=light"


def centre(png, w, h):
    data = Image.open(io.BytesIO(png)).convert("RGB").tobytes()
    xs, ys = [], []
    for y in range(int(h * 0.25), int(h * 0.75)):  # above the lake, below the sun
        for x in range(w // 2, w):
            i = (y * w + x) * 3
            r, g, b = data[i], data[i + 1], data[i + 2]
            if abs(r - ACCENT[0]) < 12 and abs(g - ACCENT[1]) < 12 and abs(b - ACCENT[2]) < 12:
                xs.append(x)
                ys.append(y)
    if not xs:
        return None
    return round((sum(xs) / len(xs) - w / 2) / h, 3), round(1 - (sum(ys) / len(ys)) / h, 3), len(xs)


rows = []
with sync_playwright() as p:
    browser = p.chromium.launch(
        channel="chrome", headless=True, args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
    )
    for w, h, t, mouse in [(1400, 860, 120, None), (1100, 860, 120, None), (1800, 860, 120, None),
                           (1400, 700, 120, None), (1400, 860, 200, None), (1400, 860, 120, 0)]:
        page = browser.new_page(viewport={"width": w, "height": h})
        page.goto(f"{base}&t={t}")
        page.wait_for_function("document.title === 'ready'", timeout=30000)
        page.evaluate("document.querySelector('.wordmark').style.visibility = 'hidden'")
        if mouse is not None:
            page.mouse.move(mouse, h / 2)
            page.wait_for_timeout(1500)
        rows.append(((w, h, t, mouse), centre(page.screenshot(), w, h)))
        page.close()
    browser.close()
server.shutdown()
for case, c in rows:
    print(case, "->", c)
