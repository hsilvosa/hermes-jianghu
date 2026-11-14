"""Crops of the Cangfeng pagoda at several moments, light and dark, empty chat and behind text.

uv run --with playwright --with pillow python test/pagoda_crops.py out_dir
Writes one board, pagoda-board.png: rows are moments, columns are light/dark x empty/text.
"""

import functools
import http.server
import io
import pathlib
import sys
import threading

from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else ROOT / "test" / "shots")
OUT.mkdir(parents=True, exist_ok=True)
W, H = 1400, 860
BOX = (int(W / 2 + 0.6 * H - 170), int(H * 0.3), int(W / 2 + 0.6 * H + 170), int(H * 0.88))
TIMES = [0, 30, 60, 100, 140]
COLS = [("light", "1"), ("light", "0"), ("dark", "1"), ("dark", "0")]


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass


server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=str(ROOT)))
threading.Thread(target=server.serve_forever, daemon=True).start()
base = f"http://127.0.0.1:{server.server_port}/test/harness.html?theme=cangfeng"

cw, ch = BOX[2] - BOX[0], BOX[3] - BOX[1]
board = Image.new("RGB", (cw * len(COLS), ch * len(TIMES)), "white")
with sync_playwright() as p:
    browser = p.chromium.launch(
        channel="chrome", headless=True, args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
    )
    page = browser.new_page(viewport={"width": W, "height": H})
    for r, t in enumerate(TIMES):
        for c, (mode, intro) in enumerate(COLS):
            page.goto(f"{base}&mode={mode}&intro={intro}&t={t}")
            page.wait_for_function("document.title === 'ready'", timeout=30000)
            page.evaluate("document.querySelector('.wordmark') && (document.querySelector('.wordmark').style.visibility = 'hidden')")
            page.wait_for_timeout(800)  # the fade behind text takes 700 ms
            im = Image.open(io.BytesIO(page.screenshot())).convert("RGB").crop(BOX)
            board.paste(im, (c * cw, r * ch))
    browser.close()
server.shutdown()
board.save(OUT / "pagoda-board.png")
print("saved", OUT / "pagoda-board.png")
