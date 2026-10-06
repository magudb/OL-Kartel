# ØL 2026 — Sommerlege

Seven retro browser games: minigolf, basketball free throws, stone skipping, a water race, frisbee throws, boccia, and Bob.

[Play the games](https://magudb.github.io/OL-Kartel/) · [Test an individual game](https://magudb.github.io/OL-Kartel/?test=true)

Each player completes the games independently, using the same tournament code. Completed disciplines are saved in the browser. After all seven, share your signed result code and collect everyone's codes to calculate the standings. Codes are signed locally in the browser; they preserve a shared code's integrity without authenticating gameplay.

Open `index.html` to play locally. Add `?test=true` to the URL to show the menu for launching, restarting, and switching individual games. Practice scores do not affect tournament progress.

Run the physics, scoring, and result-code checks with Node.js 22 or later:

```sh
node --test tests/*.test.cjs
```

`tests/browser.cjs` also exercises the game controls, practice mode, saved progress, and result sharing. It requires Playwright and its Chromium browser.

Pushes to `main` run the checks and deploy `index.html`, `css/`, and `js/` to GitHub Pages automatically. Screenshots and browser logs stay local.
