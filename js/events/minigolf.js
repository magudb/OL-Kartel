/* minigolf.js — 12 huller, putte-fysik, vægge og forhindringer */
(function () {
  "use strict";
  const { clamp, dist, angleTo, pixelText, rect, strokeRect, circle, line, createGameShell } = window.Retro;

  const W = 640;
  const H = 400;
  const HOLE_R = 7;
  const BALL_R = 4;
  const MAX_STROKES = 8;
  const NUM_HOLES = 12;
  // The previous maximum (560 px/s) is now about 65% strength.
  const MAX_SPEED = 860;
  const STOP_SPEED = 8;
  const POWER_CURVE = 3;
  const GRASS_DRAG = 0.75;
  const SAND_DRAG = Math.log(4) * 2.8;

  /** Each hole: walls[] {x,y,w,h}, tee {x,y}, cup {x,y}, water[] optional, sand[] optional */
  const HOLES = [
    // 1 straight
    { tee: { x: 80, y: 200 }, cup: { x: 540, y: 200 }, walls: [
      { x: 40, y: 120, w: 560, h: 16 }, { x: 40, y: 264, w: 560, h: 16 },
      { x: 40, y: 136, w: 16, h: 128 }, { x: 584, y: 136, w: 16, h: 128 },
    ], sand: [], water: [] },
    // 2 dogleg right
    { tee: { x: 90, y: 80 }, cup: { x: 520, y: 320 }, walls: [
      { x: 40, y: 40, w: 16, h: 200 }, { x: 56, y: 224, w: 200, h: 16 },
      { x: 240, y: 240, w: 16, h: 120 }, { x: 256, y: 344, w: 320, h: 16 },
      { x: 56, y: 40, w: 500, h: 16 }, { x: 544, y: 56, w: 16, h: 304 },
    ], sand: [{ x: 300, y: 80, w: 80, h: 40 }], water: [] },
    // 3 dogleg left
    { tee: { x: 550, y: 80 }, cup: { x: 100, y: 320 }, walls: [
      { x: 584, y: 40, w: 16, h: 200 }, { x: 380, y: 224, w: 220, h: 16 },
      { x: 380, y: 240, w: 16, h: 120 }, { x: 80, y: 344, w: 316, h: 16 },
      { x: 80, y: 40, w: 520, h: 16 }, { x: 80, y: 56, w: 16, h: 304 },
    ], sand: [], water: [{ x: 200, y: 80, w: 70, h: 50 }] },
    // 4 central pillar
    { tee: { x: 90, y: 200 }, cup: { x: 550, y: 200 }, walls: [
      { x: 40, y: 80, w: 560, h: 16 }, { x: 40, y: 304, w: 560, h: 16 },
      { x: 40, y: 96, w: 16, h: 208 }, { x: 584, y: 96, w: 16, h: 208 },
      { x: 300, y: 150, w: 40, h: 100 },
    ], sand: [], water: [] },
    // 5 water stretch
    { tee: { x: 80, y: 200 }, cup: { x: 560, y: 200 }, walls: [
      { x: 40, y: 100, w: 560, h: 16 }, { x: 40, y: 284, w: 560, h: 16 },
      { x: 40, y: 116, w: 16, h: 168 }, { x: 584, y: 116, w: 16, h: 168 },
    ], sand: [], water: [{ x: 240, y: 156, w: 160, h: 88 }] },
    // 6 L-shape
    { tee: { x: 80, y: 80 }, cup: { x: 520, y: 320 }, walls: [
      { x: 40, y: 40, w: 560, h: 16 }, { x: 40, y: 344, w: 560, h: 16 },
      { x: 40, y: 56, w: 16, h: 288 }, { x: 584, y: 56, w: 16, h: 288 },
      { x: 144, y: 56, w: 440, h: 200 },
    ], sand: [{ x: 400, y: 280, w: 60, h: 40 }], water: [] },
    // 7 bump lane
    { tee: { x: 90, y: 320 }, cup: { x: 540, y: 80 }, walls: [
      { x: 40, y: 40, w: 560, h: 16 }, { x: 40, y: 344, w: 560, h: 16 },
      { x: 40, y: 56, w: 16, h: 288 }, { x: 584, y: 56, w: 16, h: 288 },
      { x: 200, y: 56, w: 16, h: 160 }, { x: 360, y: 184, w: 16, h: 160 },
    ], sand: [], water: [] },
    // 8 U-shape
    { tee: { x: 320, y: 320 }, cup: { x: 320, y: 100 }, walls: [
      { x: 160, y: 60, w: 16, h: 280 }, { x: 464, y: 60, w: 16, h: 280 },
      { x: 176, y: 60, w: 288, h: 16 }, { x: 176, y: 324, w: 120, h: 16 },
      { x: 344, y: 324, w: 120, h: 16 }, { x: 176, y: 340, w: 288, h: 16 },
    ], sand: [], water: [{ x: 240, y: 140, w: 160, h: 60 }] },
    // 9 zig
    { tee: { x: 70, y: 320 }, cup: { x: 560, y: 80 }, walls: [
      { x: 40, y: 40, w: 560, h: 16 }, { x: 40, y: 344, w: 560, h: 16 },
      { x: 40, y: 56, w: 16, h: 288 }, { x: 584, y: 56, w: 16, h: 288 },
      { x: 180, y: 56, w: 16, h: 200 }, { x: 320, y: 144, w: 16, h: 200 },
      { x: 460, y: 56, w: 16, h: 200 },
    ], sand: [], water: [] },
    // 10 island green
    { tee: { x: 80, y: 200 }, cup: { x: 520, y: 200 }, walls: [
      { x: 40, y: 80, w: 560, h: 16 }, { x: 40, y: 304, w: 560, h: 16 },
      { x: 40, y: 96, w: 16, h: 208 }, { x: 584, y: 96, w: 16, h: 208 },
      { x: 440, y: 140, w: 140, h: 16 }, { x: 440, y: 244, w: 140, h: 16 },
      { x: 564, y: 156, w: 16, h: 88 },
    ], sand: [{ x: 200, y: 160, w: 50, h: 80 }],
      water: [{ x: 300, y: 120, w: 100, h: 160 }] },
    // 11 corridor
    { tee: { x: 80, y: 200 }, cup: { x: 560, y: 200 }, walls: [
      { x: 40, y: 170, w: 280, h: 14 }, { x: 40, y: 216, w: 280, h: 14 },
      { x: 40, y: 184, w: 14, h: 32 },
      { x: 320, y: 120, w: 14, h: 64 }, { x: 320, y: 216, w: 14, h: 64 },
      { x: 320, y: 120, w: 280, h: 14 },
      { x: 320, y: 266, w: 280, h: 14 }, { x: 584, y: 134, w: 14, h: 146 },
    ], sand: [], water: [] },
    // 12 finale diamond
    { tee: { x: 320, y: 340 }, cup: { x: 320, y: 80 }, walls: [
      { x: 40, y: 40, w: 560, h: 16 }, { x: 40, y: 360, w: 560, h: 16 },
      { x: 40, y: 56, w: 16, h: 304 }, { x: 584, y: 56, w: 16, h: 304 },
      { x: 200, y: 160, w: 240, h: 16 }, { x: 280, y: 176, w: 80, h: 80 },
    ], sand: [], water: [{ x: 80, y: 220, w: 80, h: 80 }, { x: 480, y: 220, w: 80, h: 80 }] },
  ];

  function ballInRect(x, y, r, w) {
    // circle vs rect resolution returns {nx,ny,reflected}
    const cx = clamp(x, w.x, w.x + w.w);
    const cy = clamp(y, w.y, w.y + w.h);
    const dx = x - cx;
    const dy = y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 > r * r) return null;
    // push out and reflect
    if (d2 > 0.0001) {
      const d = Math.sqrt(d2);
      const nx = dx / d;
      const ny = dy / d;
      const pen = r - d;
      return { nx: nx, ny: ny, pen: pen };
    }
    // center inside rect: push out along smallest axis
    const left = x - w.x;
    const right = w.x + w.w - x;
    const top = y - w.y;
    const bot = w.y + w.h - y;
    const m = Math.min(left, right, top, bot);
    if (m === left) return { nx: -1, ny: 0, pen: left + r };
    if (m === right) return { nx: 1, ny: 0, pen: right + r };
    if (m === top) return { nx: 0, ny: -1, pen: top + r };
    return { nx: 0, ny: 1, pen: bot + r };
  }

  function inRect(x, y, r) {
    return x + BALL_R > r.x && x - BALL_R < r.x + r.w && y + BALL_R > r.y && y - BALL_R < r.y + r.h;
  }

  function inAny(x, y, list) {
    for (const r of list || []) {
      if (inRect(x, y, r)) return true;
    }
    return false;
  }

  function puttStrength(charge) {
    return Math.expm1(POWER_CURVE * charge) / Math.expm1(POWER_CURVE);
  }

  Events.register({
    id: "minigolf",
    name: "MINIGOLF",
    nameShort: "MINIGOLF",
    blurb: "12 HULLER. LAVESTE SLAGTAL VINDER. VAND KOSTER ÉT EKSTRA SLAG. MAKS. 8 SLAG PR. HUL.",
    meta: "HOLD ← → FOR AT SIGTE · HOLD MELLEMRUM FOR KRAFT · SLIP FOR AT PUTTE",
    hint: "←/→ SIGTE · HOLD [SPACE] KRAFT · SLIP = PUT",
    lowerIsBetter: true,
    unit: "slag",
    scoreLabel: "SLAG (12 HULLER)",
    start: function (api) {
      const shell = createGameShell({ canvas: api.canvas });
      const { ctx, kb, PAL } = shell;
      const W = 640;
      const H = 400;

      let holeIndex = 0;
      let strokes = 0;
      let totalStrokes = 0;
      let aim = 0; // radians, 0 = +x
      let charging = false;
      let power = 0;
      let mode = "aim"; // aim | roll | sink | done
      let hole = HOLES[0];
      let ball = { x: 0, y: 0, vx: 0, vy: 0 };
      let shotOrigin = { x: 0, y: 0 };
      let fxTimer = 0;
      let fxMsg = "";

      function loadHole() {
        hole = HOLES[holeIndex];
        ball.x = hole.tee.x;
        ball.y = hole.tee.y;
        ball.vx = 0;
        ball.vy = 0;
        strokes = 0;
        aim = angleTo(hole.tee.x, hole.tee.y, hole.cup.x, hole.cup.y);
        mode = "aim";
        power = 0;
        charging = false;
        api.setHint(
          "HUL " + (holeIndex + 1) + "/" + NUM_HOLES +
            " · ←/→ SIGTE · HOLD [SPACE] · SLIP = PUT"
        );
      }

      function putt() {
        // Exponential strength gives fine control early and grows rapidly near full charge.
        // Start above the stopping threshold so a quick tap still moves the ball.
        const spd = STOP_SPEED + puttStrength(power) * (MAX_SPEED - STOP_SPEED);
        shotOrigin = { x: ball.x, y: ball.y };
        ball.vx = Math.cos(aim) * spd;
        ball.vy = Math.sin(aim) * spd;
        strokes += 1;
        mode = "roll";
        charging = false;
        power = 0;
      }

      let afterSplash = false;

      function finishHole(sunk) {
        if (!sunk) {
          fxMsg = "MAX SLAG";
          strokes = MAX_STROKES;
        } else {
          fxMsg = strokes === 1 ? "HOLE IN ONE!" : strokes + " SLAG";
        }
        fxTimer = 1.4;
        mode = "sink";
        afterSplash = false;
      }

      function splash() {
        fxMsg = "VAND!";
        fxTimer = 0.9;
        mode = "sink";
        afterSplash = true;
      }

      function update(dt) {
        if (fxTimer > 0) {
          fxTimer -= dt;
          if (fxTimer <= 0 && mode === "sink") {
            if (afterSplash) {
              afterSplash = false;
              if (strokes >= MAX_STROKES) {
                finishHole(false);
                return;
              }
              ball.x = shotOrigin.x;
              ball.y = shotOrigin.y;
              ball.vx = 0;
              ball.vy = 0;
              mode = "aim";
              power = 0;
              charging = false;
              aim = angleTo(ball.x, ball.y, hole.cup.x, hole.cup.y);
              return;
            }
            totalStrokes += strokes;
            holeIndex += 1;
            if (holeIndex >= NUM_HOLES) {
              mode = "done";
              api.finish(totalStrokes, "12 HULLER · " + totalStrokes + " SLAG I ALT");
              shell.dispose();
              return;
            }
            loadHole();
          }
          return;
        }

        if (mode === "aim") {
          const turn = 1.9 * dt;
          if (kb.down("Left") || kb.down("A")) aim -= turn;
          if (kb.down("Right") || kb.down("D")) aim += turn;
          if (kb.down("Space")) {
            charging = true;
            power += dt * 1.15;
            if (power > 1) power = 1;
          } else if (charging) {
            putt();
          }
        } else if (mode === "roll") {
          // Small steps keep fast balls from passing through thin walls or cups.
          const steps = Math.max(1, Math.ceil(dt * 120),
            Math.ceil(dt * Math.hypot(ball.vx, ball.vy) / BALL_R));
          const step = dt / steps;
          for (let i = 0; i < steps; i++) {
            rollBall(step);
            if (mode !== "roll") break;
          }
        }
      }

      function rollBall(dt) {
        // Low grass resistance lets a hard putt cross the course and keep rolling.
        const drag = inAny(ball.x, ball.y, hole.sand) ? SAND_DRAG : GRASS_DRAG;
        const damping = Math.exp(-drag * dt);
        const travel = (1 - damping) / drag;
        ball.x += ball.vx * travel;
        ball.y += ball.vy * travel;
        ball.vx *= damping;
        ball.vy *= damping;

        for (const wrect of hole.water) {
          if (inRect(ball.x, ball.y, wrect)) {
            // splash path handles reset
            strokes = Math.min(MAX_STROKES, strokes + 1);
            ball.vx = 0;
            ball.vy = 0;
            splash();
            return;
          }
        }

        for (const w of hole.walls) {
          const hit = ballInRect(ball.x, ball.y, BALL_R, w);
          if (hit) {
            ball.x += hit.nx * hit.pen;
            ball.y += hit.ny * hit.pen;
            const vn = ball.vx * hit.nx + ball.vy * hit.ny;
            if (vn < 0) {
              ball.vx -= 1.82 * vn * hit.nx;
              ball.vy -= 1.82 * vn * hit.ny;
            }
          }
        }

        if (ball.x < BALL_R) { ball.x = BALL_R; ball.vx = Math.abs(ball.vx) * 0.8; }
        if (ball.x > W - BALL_R) { ball.x = W - BALL_R; ball.vx = -Math.abs(ball.vx) * 0.8; }
        if (ball.y < BALL_R) { ball.y = BALL_R; ball.vy = Math.abs(ball.vy) * 0.8; }
        if (ball.y > H - BALL_R) { ball.y = H - BALL_R; ball.vy = -Math.abs(ball.vy) * 0.8; }

        const dc = dist(ball.x, ball.y, hole.cup.x, hole.cup.y);
        const sp = Math.hypot(ball.vx, ball.vy);
        if (dc < HOLE_R && sp < 220) {
          ball.x = hole.cup.x;
          ball.y = hole.cup.y;
          ball.vx = 0;
          ball.vy = 0;
          finishHole(true);
          return;
        }

        if (sp < STOP_SPEED) {
          ball.vx = 0;
          ball.vy = 0;
          if (strokes >= MAX_STROKES) {
            finishHole(false);
          } else {
            mode = "aim";
            power = 0;
            charging = false;
            aim = angleTo(ball.x, ball.y, hole.cup.x, hole.cup.y);
          }
        }
      }

      function draw() {
        // fairway
        rect(ctx, 0, 0, W, H, PAL.greenDark);
        rect(ctx, 8, 8, W - 16, H - 16, PAL.grass);

        // water
        for (const wr of hole.water) {
          rect(ctx, wr.x, wr.y, wr.w, wr.h, PAL.water);
          for (let y = wr.y + 4; y < wr.y + wr.h; y += 8) {
            line(ctx, wr.x + 4, y, wr.x + wr.w - 4, y, "#4a8fd4", 1);
          }
        }
        // sand
        for (const sr of hole.sand) {
          rect(ctx, sr.x, sr.y, sr.w, sr.h, PAL.sand);
        }

        // walls (put track border)
        for (const w of hole.walls) {
          rect(ctx, w.x, w.y, w.w, w.h, PAL.brown);
          strokeRect(ctx, w.x, w.y, w.w, w.h, PAL.orange, 1);
        }

        // cup
        circle(ctx, hole.cup.x, hole.cup.y, HOLE_R, PAL.black);
        circle(ctx, hole.cup.x, hole.cup.y, HOLE_R - 2, "#111");
        // flag
        line(ctx, hole.cup.x, hole.cup.y, hole.cup.x, hole.cup.y - 28, PAL.white, 2);
        rect(ctx, hole.cup.x, hole.cup.y - 28, 14, 8, PAL.red);

        // aim line
        if (mode === "aim") {
          const strength = puttStrength(power);
          const len = 30 + strength * 120;
          line(
            ctx,
            ball.x,
            ball.y,
            ball.x + Math.cos(aim) * len,
            ball.y + Math.sin(aim) * len,
            PAL.yellow,
            2
          );
          // power bar
          rect(ctx, 16, H - 22, 120, 12, PAL.deep);
          rect(ctx, 18, H - 20, 116 * strength, 8, PAL.yellow);
          strokeRect(ctx, 16, H - 22, 120, 12, PAL.white, 1);
          pixelText(ctx, "KRAFT", 144, H - 22, PAL.cyan, 10);
          pixelText(ctx, Math.round(strength * 100) + "%", 190, H - 22, PAL.yellow, 10);
        }

        // ball
        circle(ctx, ball.x, ball.y, BALL_R, PAL.white);
        circle(ctx, ball.x - 1, ball.y - 1, 1.2, PAL.cyan);

        // HUD
        pixelText(ctx, "HUL " + (holeIndex + 1) + "/" + NUM_HOLES, 16, 14, PAL.yellow, 12);
        pixelText(ctx, "SLAG " + strokes, 200, 14, PAL.white, 12);
        pixelText(ctx, "TOTAL " + totalStrokes, 360, 14, PAL.cyan, 12);
        pixelText(ctx, api.player.name, 500, 14, PAL.green, 12);

        if (fxTimer > 0) {
          pixelText(ctx, fxMsg, W / 2, H / 2 - 8, PAL.yellow, 22, "center");
        }
      }

      loadHole();
      shell.start(update, draw);
      return shell;
    },
  });
})();
