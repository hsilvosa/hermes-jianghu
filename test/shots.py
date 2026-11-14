"""Screenshot both themes in light and dark through the preview harness.

uv run --with playwright python test/shots.py [out_dir]
Uses the installed Chrome (channel "chrome"), headless, with SwiftShader WebGL.
"""

import functools
import http.server
import pathlib
import sys
import threading

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else ROOT / "test" / "shots")
OUT.mkdir(parents=True, exist_ok=True)

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass


handler = functools.partial(Quiet, directory=str(ROOT))
server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
threading.Thread(target=server.serve_forever, daemon=True).start()
base = f"http://127.0.0.1:{server.server_port}/test/harness.html"

# (theme, mode, clock, extra query): glass=1 fakes Window Translucency over a loud
# desktop, intro=0 is a chat with text (scene faded).
CASES = [
    ("feisheng", "light", 0, ""),
    ("feisheng", "dark", 0, ""),
    ("cangfeng", "light", 120, ""),
    ("cangfeng", "dark", 120, ""),
    ("cangfeng", "dark", 40, ""),  # raining
    ("feisheng", "light", 0, "glass=1&intro=0"),
    ("cangfeng", "light", 120, "glass=1&intro=0"),
]

with sync_playwright() as p:
    browser = p.chromium.launch(
        channel="chrome", headless=True, args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
    )
    page = browser.new_page(viewport={"width": 1400, "height": 860})
    errors = []
    page.on("console", lambda m: errors.append(m.text) if m.type in ("error", "warning") else None)
    page.on("pageerror", lambda e: errors.append(str(e)))
    for theme, mode, t, extra in CASES:
        page.goto(f"{base}?theme={theme}&mode={mode}&t={t}&{extra}")
        page.wait_for_function("document.title === 'ready'", timeout=30000)
        name = f"{theme}-{mode}-{t}{'-' + extra.replace('&', '-').replace('=', '') if extra else ''}.png"
        page.screenshot(path=str(OUT / name))
        print("saved", OUT / name)
    browser.close()
server.shutdown()
print("console errors:", errors or "none")
