<div align="center">

  # Jianghu

  **Two wuxia landscapes behind your Hermes desktop.**

  Two themes for Hermes Desktop, each with a scene behind the whole window.
  Feisheng is an ink-wash mountain scroll painted with a bristle brush.
  Cangfeng Lake is a dithered karst lake with a pagoda, a boat and passing rain.

  <sub>FOR <a href="https://github.com/NousResearch/hermes-agent">HERMES DESKTOP</a> &nbsp;·&nbsp; COMMUNITY THEME &nbsp;·&nbsp; FORK OF <a href="https://github.com/Adolanium/hermes-borealis">BOREALIS</a> &nbsp;·&nbsp; VERSION 0.1.0</sub>

</div>

![The Hermes Desktop window split diagonally: on the left, an ink-wash mountain scroll on rice paper; on the right, a dithered karst lake at night with a pagoda and a moon](media/banner.png?v=0.1.0)

## Try it

You need Hermes Desktop 0.22.2 or later.

1. **Install.** In Hermes Desktop, open **Capabilities → Plugins**, click **Install from Git** and paste `https://github.com/hsilvosa/hermes-jianghu`. Or in a terminal: `hermes plugins install hsilvosa/hermes-jianghu`.
2. **Turn it on.** Flip the **Desktop** switch of **Jianghu** in **Capabilities → Plugins**. Desktop plugins installed from a package start turned off.
3. **Pick a theme.** Type `/skin feisheng` or `/skin cangfeng` in the message box. `/skin nous` goes back to the stock look.

## The two themes

| [![Feisheng, light](media/shots/feisheng-day.png?v=0.1.0)](media/shots/feisheng-day.png?v=0.1.0) | [![Feisheng, dark](media/shots/feisheng-night.png?v=0.1.0)](media/shots/feisheng-night.png?v=0.1.0) |
|:---:|:---:|
| **Feisheng**, light | **Feisheng**, dark |
| [![Cangfeng Lake, light](media/shots/cangfeng-day.png?v=0.1.0)](media/shots/cangfeng-day.png?v=0.1.0) | [![Cangfeng Lake, dark](media/shots/cangfeng-night.png?v=0.1.0)](media/shots/cangfeng-night.png?v=0.1.0) |
| **Cangfeng Lake**, light | **Cangfeng Lake**, dark |

- **Feisheng** (`/skin feisheng`). Ranges, pines, a pavilion, a boat and reeds, every mark a brush stroke made of separate bristles: black ink and a cinnabar sun on rice paper by day, pale ink on an ink stone by night. Two bands of mist drift between the ranges and the boat rocks. The painting comes from the backdrop of [feishengmt](https://feishengmt.com).
- **Cangfeng Lake** (`/skin cangfeng`). Rounded limestone peaks in jade mist, a five-storey pagoda on the highest crest, a fisherman's boat, and a lake that mirrors everything. A cinnabar sun by day; by night a moon, stars, moonlit eaves and lamps in the pagoda windows. Rain comes and goes on a two-and-a-half-minute cycle. The style follows the Cangfeng Lake scene on [hsilvosa.com](https://hsilvosa.com).

## Small decisions, already made

- **The chat stays readable.** The scene is at full strength only on an empty chat. Behind a conversation or any other page it fades to about a third.
- **A title for each scene.** A new chat keeps Hermes's own HERMES AGENT lettering, dressed for the theme. Feisheng: wet black ink with a cinnabar seal (飛昇, "ascend") at its corner and an italic book line under it. Cangfeng Lake: jade pixel letters on a stepped cinnabar shadow, a 蒼峰湖 place tag above and a dithered shore line below.
- **The colours are yours to change.** Both scenes read the theme's paper, ink and accent, so another accent in **Settings → Appearance** recolours the sun, the tab marks and the pagoda.
- **Opaque by design.** The scene sits on its own paper, so **Window Translucency** has no visible effect while a Jianghu theme is active.
- **Easy on the machine.** Feisheng paints once (on load, resize and theme change) with Canvas 2D; afterwards only CSS animations run. Cangfeng draws one WebGL shader at one pixel per 3px cell, 20 frames a second, and stops while the window is hidden.
- **Calm when you ask for it.** With reduced motion on, both hold still.
- **Nothing leaves your machine.** One JavaScript file, no images, fonts or network requests, no agent tools.

## Preview without Hermes

`test/harness.html` loads the plugin with a stub SDK and the theme variables. Query options: `theme`, `mode=dark`, `t` (shifts the clock; 40 is mid-rain), `glass=1` (fakes Window Translucency over a loud background), `intro=0` (a chat with text).

```sh
uv run --with playwright python test/shots.py out/            # light, dark and glass screenshots
uv run --with playwright --with pillow python test/media.py   # the pictures in this README
```

Both use the installed Chrome, headless, with SwiftShader WebGL. `media.py` borrows the wordmark face from a local Hermes install when there is one; it is not part of this repository.

## Update or remove

```sh
hermes plugins update hermes-jianghu
hermes plugins remove hermes-jianghu
```

## Credits

A fork of [Borealis](https://github.com/Adolanium/hermes-borealis) by Adolanium: the stage, the colour probe, the Bayer dither and the window CSS follow it. MIT, see [LICENSE](LICENSE).

> **Community project.** Jianghu is an independent community theme. It is not affiliated with, endorsed by, or officially associated with Nous Research or the Hermes Agent project. Hermes, Hermes Agent and Nous Research are names and marks belonging to their respective owners.
