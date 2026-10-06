/* boccia.js — exponential strength, adjustable lobs and long rolling throws */
(function () {
  "use strict";
  const { clamp, dist, angleTo, pixelText, rect, strokeRect, circle, line, createGameShell } = window.Retro;
  const { BOCCIA, bocciaStrength, bocciaLaunch, bocciaStep } = window.GamePhysics;
  const W = 640, H = 400, BALLS = 4, BALL_R = 8;
  const TEE = { x: 80, y: 288 }, PALLINO = { x: 480, y: 172 };
  const COURT = { left: 28, right: 612, top: 48, bottom: 317 };

  Events.register({
    id: "boccia", name: "BOCCIA", nameShort: "BOCCIA",
    blurb: "4 KUGLER MOD PALLINO. VÆLG RETNING, KASTEVINKEL OG KRAFT. LAVE KAST RULLER LANGT; HØJE KAST KAN GÅ OVER ANDRE KUGLER. LAVESTE SAMLEDE AFSTAND VINDER.",
    meta: "←/→ RETNING · ↑/↓ KASTEVINKEL · HOLD SPACE FOR EKSPONENTIEL KRAFT · SLIP FOR KAST",
    hint: "←/→ RETNING · ↑/↓ KASTEVINKEL · HOLD SPACE OG SLIP · FULD KRAFT SENDER KUGLEN LANGT",
    lowerIsBetter: true, unit: "px", scoreLabel: "AFSTAND (SUM)",
    start(api) {
      const shell = createGameShell({ canvas: api.canvas }), { ctx, kb, PAL } = shell;
      let aim = 0, elevation = 15 * Math.PI / 180, charge = 0, charging = false, mode = "ready";
      let ball = { ...TEE, vx: 0, vy: 0, height: 6, vz: 0 };
      let throwNo = 0, totalDist = 0, lastDist = 0, timer = 0, feedback = "";
      const landed = [], trail = [];
      function setupThrow() {
        charge = 0; charging = false; mode = "ready"; trail.length = 0;
        ball = { ...TEE, vx: 0, vy: 0, height: 6, vz: 0 };
        aim = angleTo(TEE.x, TEE.y, PALLINO.x, PALLINO.y); elevation = 15 * Math.PI / 180;
        api.setHint("KUGLE " + (throwNo + 1) + "/4 · ←/→ RETNING · ↑/↓ KASTEVINKEL · HOLD SPACE OG SLIP");
      }
      function settle() {
        lastDist = dist(ball.x, ball.y, PALLINO.x, PALLINO.y);
        totalDist += lastDist; landed.push({ x: ball.x, y: ball.y, d: lastDist });
        mode = "result"; timer = 1;
        feedback = Math.round(lastDist) + " PX";
        api.setHint(feedback + " · SUM " + Math.round(totalDist));
      }
      function simulate(dt) {
        const steps = Math.max(1, Math.ceil(dt * 240)), step = dt / steps;
        for (let i = 0; i < steps; i++) {
          bocciaStep(ball, step);
          // A lob can clear settled balls; low throws collide with them.
          if (ball.height < BALL_R * 2) for (const b of landed) {
            const distance = dist(ball.x, ball.y, b.x, b.y);
            if (distance >= BALL_R * 2) continue;
            const nx = distance > .001 ? (ball.x - b.x) / distance : 1;
            const ny = distance > .001 ? (ball.y - b.y) / distance : 0;
            ball.x = b.x + nx * (BALL_R * 2 + .01); ball.y = b.y + ny * (BALL_R * 2 + .01);
            const approach = ball.vx * nx + ball.vy * ny;
            if (approach < 0) { ball.vx -= 1.5 * approach * nx; ball.vy -= 1.5 * approach * ny; }
          }
          if (ball.x < COURT.left) { ball.x = COURT.left; ball.vx = Math.abs(ball.vx) * .7; }
          if (ball.x > COURT.right) { ball.x = COURT.right; ball.vx = -Math.abs(ball.vx) * .7; }
          if (ball.y < COURT.top) { ball.y = COURT.top; ball.vy = Math.abs(ball.vy) * .7; }
          if (ball.y > COURT.bottom) { ball.y = COURT.bottom; ball.vy = -Math.abs(ball.vy) * .7; }
          if (ball.height <= 0 && Math.hypot(ball.vx, ball.vy) <= BOCCIA.STOP_SPEED) {
            ball.vx = 0; ball.vy = 0; settle(); return;
          }
        }
        trail.push({ x: ball.x, y: ball.y - ball.height * .38 });
        if (trail.length > 12) trail.shift();
      }
      function update(dt) {
        if (mode === "ready") {
          if (kb.down("Left") || kb.down("A")) aim -= 1.4 * dt;
          if (kb.down("Right") || kb.down("D")) aim += 1.4 * dt;
          if (kb.down("Up") || kb.down("W")) elevation += .6 * dt;
          if (kb.down("Down") || kb.down("S")) elevation -= .6 * dt;
          aim = clamp(aim, -Math.PI / 2, Math.PI / 2);
          elevation = clamp(elevation, 5 * Math.PI / 180, 55 * Math.PI / 180);
          if (kb.down("Space")) { charging = true; charge = Math.min(1, charge + dt * 1.15); }
          else if (charging) {
            ball = bocciaLaunch(TEE.x, TEE.y, aim, elevation, charge);
            mode = "throw"; charging = false;
          }
        } else if (mode === "throw") simulate(dt);
        else if (mode === "result") {
          timer -= dt;
          if (timer <= 0) {
            throwNo++;
            if (throwNo >= BALLS) {
              mode = "done"; shell.dispose();
              api.finish(Math.round(totalDist), "4 KUGLER · SUM " + Math.round(totalDist) + " PX AFSTAND");
            } else setupThrow();
          }
        }
      }
      function drawBall(x, y, color) {
        circle(ctx, x, y, BALL_R, color); circle(ctx, x - 2, y - 2, 3, PAL.white);
      }
      function draw() {
        rect(ctx, 0, 0, W, H, "#183b39");
        rect(ctx, 14, 38, 612, 291, "#9b7749");
        rect(ctx, 20, 40, 600, 286, "#d4b47c");
        for (let row = 0; row < 13; row++) for (let i = 0; i < 22; i++) {
          const x = 30 + i * 27 + row % 3 * 4, y = 53 + row * 21;
          line(ctx, x, y, x + 3, y, "#bea06c", 1);
        }
        strokeRect(ctx, 20, 40, 600, 286, "#f0d9a1", 2);
        line(ctx, 108, 43, 108, 323, "#f0d9a1", 2);
        pixelText(ctx, "KASTELINJE", 31, 58, "#725836", 9);
        circle(ctx, PALLINO.x + 1, PALLINO.y + 2, 6, "#997b48");
        circle(ctx, PALLINO.x, PALLINO.y, 6, PAL.red); circle(ctx, PALLINO.x - 1, PALLINO.y - 1, 2, PAL.yellow);
        pixelText(ctx, "PALLINO", PALLINO.x, PALLINO.y - 22, "#725836", 10, "center");
        landed.forEach((b, i) => {
          circle(ctx, b.x + 1, b.y + 2, BALL_R, "#997b48"); drawBall(b.x, b.y, PAL.cyan);
          pixelText(ctx, String(i + 1), b.x, b.y - 5, "#183b39", 9, "center");
        });
        circle(ctx, TEE.x, TEE.y, 10, "#9b7749");
        if (mode === "ready") {
          const length = 40 + bocciaStrength(charge) * 50;
          line(ctx, TEE.x, TEE.y, TEE.x + Math.cos(aim) * length, TEE.y + Math.sin(aim) * length, PAL.yellow, 2);
        }
        if (mode === "ready" || mode === "throw") {
          if (mode === "throw") trail.forEach(p => circle(ctx, p.x, p.y, 1, "#e7dbb9"));
          circle(ctx, ball.x, ball.y + 3, BALL_R + 1, "#997b48");
          drawBall(ball.x, ball.y - ball.height * .38, PAL.white);
        }
        rect(ctx, 0, 0, W, 37, "#15312f");
        pixelText(ctx, api.player.name, 16, 12, PAL.cyan, 12);
        pixelText(ctx, "KUGLE " + (Math.min(throwNo, 3) + 1) + "/4", 244, 12, PAL.white, 12);
        pixelText(ctx, "SUM " + Math.round(totalDist), 508, 12, PAL.yellow, 12);
        rect(ctx, 0, 331, W, 69, "#15312f");
        const degrees = elevation * 180 / Math.PI, strength = bocciaStrength(charge);
        pixelText(ctx, "RETNING ←/→ " + Math.round(aim * 180 / Math.PI) + "°", 16, 342, PAL.cyan, 10);
        pixelText(ctx, "KASTEVINKEL ↑/↓ " + Math.round(degrees) + "°", 16, 364, PAL.white, 10);
        line(ctx, 239, 385, 292, 385, "#718f78", 1);
        line(ctx, 246, 384, 246 + Math.cos(elevation) * 40, 384 - Math.sin(elevation) * 40, PAL.orange, 2);
        pixelText(ctx, "KRAFT · HOLD SPACE", 332, 342, PAL.cyan, 11);
        rect(ctx, 332, 363, 280, 12, "#284a41"); rect(ctx, 332, 363, strength * 280, 12, PAL.yellow);
        strokeRect(ctx, 332, 363, 280, 12, "#9fbe9c", 1);
        pixelText(ctx, Math.round(strength * 100) + "% · SLIP FOR KAST", 472, 383, PAL.white, 10, "center");
        if (mode === "result") pixelText(ctx, feedback, W / 2, 100, PAL.white, 21, "center");
      }
      setupThrow(); shell.start(update, draw); return shell;
    },
  });
})();
