/* Nine target throws with wind, heading and disc bank; one-second shot review. */
(function () {
  "use strict";
  const { clamp, pixelText, rect, strokeRect, circle, line, createGameShell } = window.Retro;
  const { DISC_TEE: TEE, WINDS, discFlight, discSolution } = window.GamePhysics;
  const TARGET_R = 18, PER_RANGE = 3, THROWS = 9;
  const TARGETS = [
    { x: 260, y: 268, name: "KORT", points: 1 },
    { x: 400, y: 194, name: "MELLEM", points: 3 },
    { x: 550, y: 105, name: "LANG", points: 5 },
  ];
  Events.register({
    id: "frisbee", name: "FRISBEEKAST", nameShort: "FRISBEE",
    blurb: "3 KAST PR. AFSTAND: KORT = 1, MELLEM = 3, LANG = 5 POINT. SIGTE, DISKHÆLDNING OG VIND ÆNDRER DISKENS BANE. 9 KAST I ALT.",
    meta: "←/→ SIGTE · ↑/↓ DISKHÆLDNING · HOLD SPACE FOR KRAFT · SWEET SPOT VISES KUN 1 SEKUND EFTER KAST",
    hint: "LÆS VINDEN · ←/→ SIGTE · ↑/↓ HÆLDNING · HOLD SPACE · SLIP FOR KAST",
    lowerIsBetter: false, unit: "point", scoreLabel: "POINT (9 KAST)",
    start(api) {
      const shell = createGameShell({ canvas: api.canvas }), { ctx, kb, PAL } = shell;
      let shot = 0, selected = 0, score = 0, aim = 0, bank = 0, power = 0, direction = 1;
      let mode = "aim", charging = false, elapsed = 0, timer = 0, lastPoints = 0, clock = 0;
      let flight = null, solution = null, review = 0;
      const outcomes = [];
      const wind = () => WINDS[Math.min(shot, THROWS - 1)];
      function prepare() {
        selected = Math.floor(shot / PER_RANGE);
        const target = TARGETS[selected];
        aim = Math.atan2(target.y - TEE.y, target.x - TEE.x) + (shot % 2 ? -.09 : .09);
        bank = 0; power = 0; direction = 1; charging = false; mode = "aim"; review = 0;
        api.setHint(target.name + " · KAST " + (shot % 3 + 1) + "/3 · ←/→ SIGTE · ↑/↓ HÆLDNING · HOLD SPACE OG SLIP");
      }
      function update(dt) {
        clock += dt; review = Math.max(0, review - dt);
        if (mode === "aim") {
          if (kb.down("Left") || kb.down("A")) aim -= .8 * dt;
          if (kb.down("Right") || kb.down("D")) aim += .8 * dt;
          if (kb.down("Up") || kb.down("W")) bank += 35 * dt;
          if (kb.down("Down") || kb.down("S")) bank -= 35 * dt;
          aim = clamp(aim, -1.3, .35); bank = clamp(bank, -30, 30);
          if (kb.down("Space")) {
            charging = true; power += direction * dt * .85;
            if (power > 1) { power = 2 - power; direction = -1; }
            if (power < 0) { power = -power; direction = 1; }
          } else if (charging) {
            flight = discFlight(aim, bank, power, wind());
            solution = discSolution(TARGETS[selected], bank, wind());
            review = 1; elapsed = 0; mode = "fly"; charging = false;
          }
        } else if (mode === "fly") {
          elapsed = Math.min(flight.duration, elapsed + dt);
          if (elapsed >= flight.duration) {
            const target = TARGETS[selected];
            lastPoints = Math.hypot(flight.landing.x - target.x, flight.landing.y - target.y) <= TARGET_R ? target.points : 0;
            score += lastPoints; outcomes.push(lastPoints); timer = .85; mode = "result";
            api.setHint(lastPoints ? "TRÆF! +" + lastPoints + " POINT" : "FORBI! · VINDEN OG DISKHÆLDNINGEN ÆNDRER BANEN");
          }
        } else if (mode === "result") {
          timer -= dt;
          if (timer <= 0) {
            shot++;
            if (shot >= THROWS) {
              mode = "done"; shell.dispose();
              api.finish(score, "9 KAST · " + outcomes.filter(p => p > 0).length + " TRÆF · " + score + " POINT I ALT");
            } else prepare();
          }
        }
      }
      function drawDisc(x, y, rotation) {
        ctx.save(); ctx.translate(x, y); ctx.rotate(rotation);
        circle(ctx, 0, 0, 7, "#e8fbf1"); circle(ctx, 0, 0, 5, "#35d6c8");
        line(ctx, -3, 0, 3, 0, PAL.white, 1); ctx.restore();
      }
      function draw() {
        rect(ctx, 0, 0, 640, 400, "#1c3f46");
        rect(ctx, 8, 40, 624, 282, "#4a7650");
        for (let row = 0; row < 8; row++) {
          rect(ctx, 8, 40 + row * 35, 624, 17, "#507f55");
          for (let i = 0; i < 10; i++) {
            const x = i * 70 + row * 13 % 70;
            line(ctx, x, 56 + row * 35, x + 3, 53 + row * 35, "#73a266", 1);
          }
        }
        for (let i = 0; i < 10; i++) { circle(ctx, i * 70, 44, 20, "#2c5952"); circle(ctx, i * 70 + 20, 47, 13, "#37694f"); }
        TARGETS.forEach((t, i) => {
          if (i === selected) circle(ctx, t.x, t.y, TARGET_R + 5, "#e2c67f");
          circle(ctx, t.x, t.y, TARGET_R, "#ecede0"); circle(ctx, t.x, t.y, 14, "#e47b61");
          circle(ctx, t.x, t.y, 9, "#ecede0"); circle(ctx, t.x, t.y, 5, "#e47b61");
          pixelText(ctx, t.name, t.x, t.y - 43, i === selected ? PAL.yellow : PAL.white, 11, "center");
          pixelText(ctx, t.points + " POINT", t.x, t.y + 28, PAL.cyan, 10, "center");
        });
        rect(ctx, TEE.x - 23, TEE.y - 12, 47, 25, "#c5b486");
        line(ctx, TEE.x + 24, TEE.y - 15, TEE.x + 24, TEE.y + 13, PAL.white, 3);
        pixelText(ctx, "KASTELINJE", TEE.x, TEE.y + 17, PAL.white, 9, "center");
        if (mode === "aim") {
          line(ctx, TEE.x, TEE.y, TEE.x + Math.cos(aim) * 58, TEE.y + Math.sin(aim) * 58, PAL.yellow, 2);
          drawDisc(TEE.x, TEE.y, bank * Math.PI / 180);
        } else if (flight) {
          const progress = clamp(elapsed / flight.duration, 0, 1);
          for (let i = 1; i <= 10; i++) {
            const p = flight.at(Math.max(0, elapsed - i * .035)); circle(ctx, p.x, p.y, 1, "#b2d4b5");
          }
          const p = flight.at(elapsed);
          circle(ctx, p.x, p.y + 3, 6, "#2d5345");
          drawDisc(p.x, p.y - Math.sin(progress * Math.PI) * 28, elapsed * 18);
        }
        // Reveals guidance only for the first second after release, never while aiming.
        if (review > 0 && solution) {
          line(ctx, TEE.x, TEE.y, TEE.x + Math.cos(solution.aim) * 92, TEE.y + Math.sin(solution.aim) * 92, PAL.green, 2);
          pixelText(ctx, "SWEET SPOT · " + Math.round(solution.power * 100) + "%", 320, 65, PAL.green, 13, "center");
        }
        const w = wind(), wx = 48, wy = 91, length = Math.hypot(w.x, w.y);
        rect(ctx, 13, 54, 122, 91, "#24454a");
        pixelText(ctx, "VIND " + (length / 10).toFixed(1) + " M/S", 24, 61, PAL.cyan, 10);
        const dx = w.x / length * 23, dy = w.y / length * 23;
        line(ctx, wx - dx * .6, wy - dy * .6, wx + dx, wy + dy, PAL.white, 2);
        line(ctx, wx + dx, wy + dy, wx + dx * .6 - dy * .3, wy + dy * .6 + dx * .3, PAL.white, 2);
        line(ctx, wx + dx, wy + dy, wx + dx * .6 + dy * .3, wy + dy * .6 - dx * .3, PAL.white, 2);
        pixelText(ctx, "KOMPENSÉR", 24, 128, PAL.sand, 10);
        rect(ctx, 0, 0, 640, 38, "#142d35");
        pixelText(ctx, api.player.name, 16, 12, PAL.cyan, 12);
        pixelText(ctx, TARGETS[selected].name + " · KAST " + (Math.min(shot, 8) % 3 + 1) + "/3", 205, 12, PAL.white, 12);
        pixelText(ctx, "POINT " + score, 503, 12, PAL.yellow, 12);
        rect(ctx, 0, 327, 640, 73, "#142d35");
        pixelText(ctx, "HÆLDNING ↑/↓ " + Math.round(bank) + "°", 16, 339, PAL.cyan, 10);
        line(ctx, 42, 376, 136, 376, "#567978", 1);
        line(ctx, 70, 376 + bank * .5, 110, 376 - bank * .5, PAL.white, 3);
        const bx = 190, by = 373, bw = 300;
        pixelText(ctx, mode === "aim" ? "KRAFT · HOLD SPACE OG SLIP" : "KASTET · LÆS BANEN", bx, 339, PAL.white, 10);
        rect(ctx, bx, by, bw, 13, "#24454a");
        if (review > 0) rect(ctx, bx + (solution.power - .025) * bw, by, .05 * bw, 13, PAL.green);
        strokeRect(ctx, bx, by, bw, 13, "#7eaaa3", 1);
        rect(ctx, bx + power * bw - 2, by - 3, 4, 19, PAL.yellow);
        pixelText(ctx, Math.round(power * 100) + "%", 507, by, PAL.yellow, 12);
        if (mode === "result") pixelText(ctx, lastPoints ? "+" + lastPoints + " POINT!" : "FORBI!", 320, 153, lastPoints ? PAL.green : PAL.orange, 23, "center");
        outcomes.forEach((p, i) => circle(ctx, 230 + i * 15, 312, 3, p ? PAL.green : PAL.red));
      }
      prepare(); shell.start(update, draw); return shell;
    },
  });
})();
