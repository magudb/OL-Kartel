/* water.js — 200m vandudfordring, ca. 20–30 sekunder med en god rytme */
(function () {
  "use strict";
  const { PAL, clamp, pixelText, rect, strokeRect, circle, line, createGameShell } = window.Retro;

  const DIST = 200; // At the 8.5 m/s cap, the swim takes at least 23.5 seconds.
  const MAX_SPEED = 8.5;
  const FINISH_X = 580;
  const START_X = 60;

  Events.register({
    id: "water",
    name: "VANDUDFORDRING",
    nameShort: "VAND",
    blurb: DIST + " METER FRA BREDEN. CA. 20–30 SEKUNDER MED EN GOD RYTME. HURTIGSTE TID VINDER.",
    meta: "SKIFT MELLEM ← OG → SÅ HURTIGT DU KAN — HOLD RYTMEN HELE VEJEN",
    hint: "VEKSL ← / → SÅ HURTIGT SOM MULIGT · " + DIST + " METER",
    lowerIsBetter: true,
    unit: "sek",
    scoreLabel: "TID",
    start: function (api) {
      const shell = createGameShell({ canvas: api.canvas });
      const { ctx, kb, PAL } = shell;
      const W = 640;
      const H = 400;

      let t = 0;
      let speed = 0;
      let dist = 0;
      let lastKey = null;
      let splashT = 0;
      let finished = false;
      let finalTime = 0;
      let showT = 0;
      let strokePhase = 0;
      let started = false;

      function update(dt) {
        if (finished) {
          showT -= dt;
          if (showT <= 0) {
            api.finish(finalTime, finalTime.toFixed(2) + " SEK · " + DIST + " M");
            shell.dispose();
          }
          return;
        }

        // clock starts on first stroke (fair start)
        if (!started) {
          if (kb.pressed("Left") || kb.pressed("Right")) {
            started = true;
            t = 0;
          } else {
            api.setHint("KLAR... FØRSTE SLAG STARTER URET · VEKSL ← / →");
            return;
          }
        }

        t += dt;

        // alternate keys builds power; rhythm decays
        if (kb.pressed("Left") && lastKey !== "Left") {
          if (lastKey === "Right" || lastKey === null) {
            speed = clamp(speed + 2.2, 0, MAX_SPEED);
            splashT = 0.15;
            strokePhase += 1;
          } else {
            speed = clamp(speed - 0.4, 0, MAX_SPEED);
          }
          lastKey = "Left";
        }
        if (kb.pressed("Right") && lastKey !== "Right") {
          if (lastKey === "Left" || lastKey === null) {
            speed = clamp(speed + 2.2, 0, MAX_SPEED);
            splashT = 0.15;
            strokePhase += 1;
          } else {
            speed = clamp(speed - 0.4, 0, MAX_SPEED);
          }
          lastKey = "Right";
        }

        // drag
        speed = clamp(speed - 2.6 * dt, 0, MAX_SPEED);
        // if they spam one key only, little speed
        dist += speed * dt;
        splashT = Math.max(0, splashT - dt);

        if (dist >= DIST) {
          dist = DIST;
          finished = true;
          finalTime = t;
          showT = 1.6;
          api.setHint("I MÅL! " + finalTime.toFixed(2) + " SEK");
        } else {
          api.setHint(
            (DIST - dist).toFixed(1) +
              " M TILBAGE · " +
              t.toFixed(1) +
              " S · VEKSL ← →"
          );
        }
      }

      function drawSwimmer(x, y, phase) {
        // body
        rect(ctx, x - 14, y - 4, 28, 8, PAL.orange);
        // head
        circle(ctx, x + 16, y - 2, 5, PAL.sand);
        // arms
        const a = Math.sin(phase) * 10;
        line(ctx, x + 4, y, x + 14, y - 10 + a, PAL.sand, 2);
        line(ctx, x - 2, y, x - 12, y + 10 - a, PAL.sand, 2);
        // splash
        if (splashT > 0) {
          circle(ctx, x + 18, y + 4, 4, PAL.cyan);
          circle(ctx, x + 24, y + 2, 3, PAL.white);
        }
      }

      function draw() {
        // sky
        rect(ctx, 0, 0, W, 80, "#5a8fd4");
        // beach
        rect(ctx, 0, 80, W, 24, PAL.sand);
        rect(ctx, 0, 100, 40, 300, PAL.sand);
        // water
        rect(ctx, 0, 104, W, H - 104, PAL.water);
        for (let y = 112; y < H; y += 12) {
          line(ctx, 40, y, W, y, "#4a8fd4", 1);
        }

        // distance markers
        const totalPx = FINISH_X - START_X;
        for (let m = 0; m <= DIST; m += 40) {
          const x = START_X + (m / DIST) * totalPx;
          line(ctx, x, 120, x, 130, PAL.white, 1);
          pixelText(ctx, m + "M", x, 132, PAL.cyan, 9, "center");
        }

        // finish line
        rect(ctx, FINISH_X, 150, 6, 120, PAL.white);
        rect(ctx, FINISH_X + 6, 150, 4, 120, PAL.red);

        // lane
        line(ctx, START_X, 230, FINISH_X, 230, PAL.white, 1);

        // swimmer
        const x = START_X + (dist / DIST) * totalPx;
        drawSwimmer(x, 210, strokePhase);

        // progress bar
        rect(ctx, 40, 360, 560, 16, PAL.deep);
        rect(ctx, 42, 362, 556 * (dist / DIST), 12, PAL.green);
        strokeRect(ctx, 40, 360, 560, 16, PAL.white, 1);

        // HUD
        pixelText(ctx, api.player.name, 16, 14, PAL.green, 12);
        pixelText(ctx, t.toFixed(2) + " S", 220, 14, PAL.yellow, 14);
        pixelText(ctx, dist.toFixed(1) + " M", 360, 14, PAL.cyan, 12);
        pixelText(ctx, "HAST " + speed.toFixed(1), 500, 14, PAL.orange, 11);

        // key indicators
        const litL = lastKey === "Left" ? PAL.yellow : PAL.deep;
        const litR = lastKey === "Right" ? PAL.yellow : PAL.deep;
        rect(ctx, 250, 300, 50, 36, litL);
        strokeRect(ctx, 250, 300, 50, 36, PAL.white, 2);
        pixelText(ctx, "←", 275, 308, PAL.white, 18, "center");
        rect(ctx, 340, 300, 50, 36, litR);
        strokeRect(ctx, 340, 300, 50, 36, PAL.white, 2);
        pixelText(ctx, "→", 365, 308, PAL.white, 18, "center");

        if (finished) {
          pixelText(ctx, "I MÅL!", W / 2, 180, PAL.yellow, 28, "center");
          pixelText(ctx, finalTime.toFixed(2) + " SEK", W / 2, 215, PAL.white, 16, "center");
        }
      }

      api.setHint("KLAR... FØRSTE SLAG STARTER URET · VEKSL ← / →");
      shell.start(update, draw);
      return shell;
    },
  });
})();
