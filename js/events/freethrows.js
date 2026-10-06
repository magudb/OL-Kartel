/* freethrows.js — 3 × 2 straffekast med sigte, kraft og boldbane */
(function () {
  "use strict";
  const { clamp, pixelText, rect, strokeRect, circle, line, createGameShell } = window.Retro;
  const W = 640, H = 400;
  const ROUNDS = 3, PER_ROUND = 2, TOTAL = ROUNDS * PER_ROUND;
  const DISTANCE = 380, RIM_HEIGHT = 170, RELEASE_HEIGHT = 90;
  const GRAVITY = 600, ELEVATION = Math.PI * 0.27;
  const MIN_SPEED = 360, MAX_SPEED = 660;
  const RIM_RADIUS = 26, BALL_RADIUS = 7, HEIGHT_TOLERANCE = 14;
  const TURN_SPEED = 0.5, AIM_LIMIT = 0.4;
  const CHARGE_RATES = [0.85, 1, 1.15];
  const COURT = { night: "#0b1426", panel: "#111f36", wood: "#bf8449", plank: "#986336", paint: "#214c60", orange: "#ff9c38" };

  function project(x, z, height) {
    const scale = 1 - 0.35 * clamp(z / DISTANCE, 0, 1.4);
    return { x: W / 2 + x * scale, y: 276 - z * 0.22 - height * scale * 0.68, scale };
  }

  const hoop = project(0, DISTANCE, RIM_HEIGHT);

  Events.register({
    id: "freethrows", name: "STRAFFEKAST", nameShort: "KAST",
    blurb: "3 RUNDER × 2 STRAFFEKAST FRA MIDTEN. BÅDE SIGTE OG KRAFT SKAL PASSE. FLEST AF 6 TRÆF VINDER.",
    meta: "←/→ SIGTE · HOLD SPACE FOR KRAFT · SLIP FOR KAST · MARKERINGER VISES KUN 1 SEKUND EFTER KAST",
    hint: "←/→ SIGTE · HOLD SPACE OG SLIP · LÆR AF MARKERINGERNE EFTER KASTET",
    lowerIsBetter: false, unit: "træf", scoreLabel: "TRÆF (6 KAST)",
    start: function (api) {
      const shell = createGameShell({ canvas: api.canvas });
      const { ctx, kb, PAL } = shell;
      let shotIndex = 0, makes = 0, aim = 0, power = 0, powerDirection = 1;
      let charging = false, mode = "ready", timer = 0, flightTime = 0, review = 0;
      let ball = { x: 0, z: 0, height: RELEASE_HEIGHT };
      let velocity = { x: 0, z: 0, height: 0 };
      let impact = null, made = false, feedback = "", trail = [];
      const outcomes = [];

      function currentRound() { return Math.min(ROUNDS - 1, Math.floor(shotIndex / PER_ROUND)); }

      function prepareShot() {
        if (shotIndex % PER_ROUND === 0) aim = 0.08;
        power = 0; powerDirection = 1; charging = false;
        mode = "ready"; flightTime = 0; review = 0; trail = []; made = false; impact = null;
        ball = { x: 0, z: 0, height: RELEASE_HEIGHT };
        api.setHint("RUNDE " + (currentRound() + 1) + "/3 · MIDTEN" +
          " · KAST " + (shotIndex % PER_ROUND + 1) + "/2 · ←/→ SIGTE · HOLD SPACE OG SLIP");
      }

      function pointAt(time) {
        return {
          x: velocity.x * time,
          z: velocity.z * time,
          height: RELEASE_HEIGHT + velocity.height * time - GRAVITY * time * time / 2,
        };
      }

      function shoot() {
        const speed = MIN_SPEED + power * (MAX_SPEED - MIN_SPEED);
        const forward = speed * Math.cos(ELEVATION);
        velocity = { x: Math.sin(aim) * forward, z: Math.cos(aim) * forward, height: speed * Math.sin(ELEVATION) };
        flightTime = 0; review = 1; charging = false; mode = "flight";
      }

      function resolve(ok, message) {
        made = ok;
        if (ok) makes += 1;
        outcomes.push(ok);
        feedback = message;
        impact = { ...ball };
        mode = ok ? "net" : "miss";
        timer = ok ? 0.35 : 0.65;
        api.setHint(ok ? "TRÆF! · " + makes + "/6" : message + " · JUSTÉR SIGTE OG KRAFT");
      }

      function nextShot() {
        shotIndex += 1;
        if (shotIndex >= TOTAL) {
          mode = "done";
          shell.dispose();
          api.finish(makes, "3 RUNDER × 2 KAST · " + makes + "/6 TRÆF I ALT");
        } else prepareShot();
      }

      function update(dt) {
        review = Math.max(0, review - dt);
        if (mode === "ready") {
          if (kb.down("Left") || kb.down("A")) aim -= TURN_SPEED * dt;
          if (kb.down("Right") || kb.down("D")) aim += TURN_SPEED * dt;
          aim = clamp(aim, -AIM_LIMIT, AIM_LIMIT);
          if (kb.down("Space")) {
            charging = true;
            power += powerDirection * dt * CHARGE_RATES[currentRound()];
            if (power > 1) { power = 2 - power; powerDirection = -1; }
            if (power < 0) { power = -power; powerDirection = 1; }
          } else if (charging) shoot();
        } else if (mode === "flight") {
          flightTime += dt;
          const crossingTime = DISTANCE / velocity.z;
          if (flightTime >= crossingTime) {
            // Evaluate the exact rim crossing, even if a frame steps past it.
            flightTime = crossingTime;
            ball = pointAt(crossingTime);
            const aligned = Math.abs(ball.x) <= RIM_RADIUS - BALL_RADIUS;
            const heightOK = Math.abs(ball.height - RIM_HEIGHT) <= HEIGHT_TOLERANCE;
            const descending = velocity.height - GRAVITY * crossingTime < 0;
            const message = !aligned ? (ball.x < 0 ? "FORBI VENSTRE" : "FORBI HØJRE")
              : ball.height > RIM_HEIGHT ? "FOR HÅRDT" : "FOR KORT";
            resolve(aligned && heightOK && descending, aligned && heightOK && descending ? "TRÆF! +1" : message);
          } else {
            ball = pointAt(flightTime);
            if (ball.height <= BALL_RADIUS) resolve(false, "FOR KORT");
          }
          trail.push(project(ball.x, ball.z, ball.height));
          if (trail.length > 8) trail.shift();
        } else if (mode === "net") {
          timer -= dt;
          const progress = clamp(1 - timer / 0.35, 0, 1);
          ball = { x: impact.x * (1 - progress), z: DISTANCE, height: RIM_HEIGHT - 65 * progress };
          if (timer <= 0) { mode = "result"; timer = 0.75; }
        } else if (mode === "miss") {
          timer -= dt;
          const progress = clamp(1 - timer / 0.65, 0, 1);
          // The miss remains visible as it drops back onto the court.
          ball = {
            x: impact.x + (impact.x < 0 ? -1 : 1) * 35 * progress,
            z: impact.z - 65 * progress,
            height: Math.max(BALL_RADIUS, impact.height * (1 - progress) + 30 * Math.sin(progress * Math.PI)),
          };
          if (timer <= 0) { mode = "result"; timer = 0.75; }
        } else if (mode === "result") {
          timer -= dt;
          if (timer <= 0) nextShot();
        }
      }

      function ellipse(x, y, rx, ry, color, outline = false) {
        ctx.beginPath();
        ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
        if (outline) { ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke(); }
        else { ctx.fillStyle = color; ctx.fill(); }
      }

      function polygon(points, color) {
        ctx.beginPath();
        ctx.moveTo(points[0][0], points[0][1]);
        points.slice(1).forEach(([x, y]) => ctx.lineTo(x, y));
        ctx.closePath(); ctx.fillStyle = color; ctx.fill();
      }

      function drawCourt() {
        rect(ctx, 0, 0, W, H, COURT.night);
        // Stadium seating, with a clear court in front.
        for (let row = 0; row < 4; row++) {
          rect(ctx, 0, 46 + row * 24, W, 20, row % 2 ? "#182b44" : "#122239");
          for (let seat = 0; seat < 26; seat++) {
            const x = 10 + seat * 25 + (row % 2) * 8, y = 53 + row * 24;
            circle(ctx, x, y, 3, [PAL.purple, PAL.orange, PAL.cyan][(seat + row) % 3]);
            rect(ctx, x - 4, y + 3, 8, 6, (seat + row) % 2 ? "#37516b" : "#594663");
          }
        }
        line(ctx, 18, 45, 160, 45, PAL.yellow, 2);
        line(ctx, 480, 45, 622, 45, PAL.yellow, 2);
        polygon([[72, 150], [568, 150], [640, 318], [0, 318]], COURT.wood);
        for (let x = 0; x <= W; x += 32) line(ctx, 72 + x * 0.775, 150, x, 318, COURT.plank, 1);
        for (let y = 170; y < 318; y += 23) {
          const inset = 72 * (1 - (y - 150) / 168);
          line(ctx, inset, y, W - inset, y, "#d49a59", 1);
        }
        polygon([[266, 162], [374, 162], [432, 278], [208, 278]], COURT.paint);
        line(ctx, 266, 162, 208, 278, PAL.white, 2);
        line(ctx, 374, 162, 432, 278, PAL.white, 2);
        line(ctx, 208, 278, 432, 278, PAL.white, 2);
        ellipse(320, 278, 112, 23, PAL.white, true);
        line(ctx, 76, 153, 8, 312, "#ffdb9d", 2);
        line(ctx, 564, 153, 632, 312, "#ffdb9d", 2);
        line(ctx, 8, 312, 632, 312, "#ffdb9d", 2);
      }

      function drawHoop(front) {
        if (!front) {
          ellipse(320, 194, 36, 7, "#805b39");
          rect(ctx, 314, 89, 12, 102, "#14283c");
          line(ctx, 320, 145, 301, 190, "#2d4356", 5);
          rect(ctx, 252, 50, 136, 61, "#96b7c6");
          strokeRect(ctx, 252, 50, 136, 61, PAL.white, 4);
          rect(ctx, 260, 57, 120, 45, "#aecbd5");
          strokeRect(ctx, 300, 76, 40, 30, PAL.white, 3);
          line(ctx, 320, 107, hoop.x, hoop.y, COURT.orange, 4);
          ellipse(hoop.x, hoop.y, 18, 6, COURT.orange, true);
        } else {
          const sway = mode === "net" ? Math.sin((1 - timer / 0.35) * Math.PI * 2) * 3 : 0;
          for (let i = 0; i < 7; i++) {
            const top = hoop.x - 17 + i * 5.6, bottom = hoop.x - 10 + i * 3.3 + sway;
            line(ctx, top, hoop.y + 3, bottom, hoop.y + 28, "#d5e7ec", 1);
          }
          line(ctx, hoop.x - 15, hoop.y + 12, hoop.x + 15, hoop.y + 12, PAL.white, 1);
          line(ctx, hoop.x - 12 + sway, hoop.y + 22, hoop.x + 12 + sway, hoop.y + 22, PAL.white, 1);
          ctx.beginPath(); ctx.ellipse(hoop.x, hoop.y, 18, 6, 0, 0, Math.PI);
          ctx.strokeStyle = COURT.orange; ctx.lineWidth = 3; ctx.stroke();
        }
      }

      function drawShooter() {
        const x = W / 2, shooting = mode === "flight" || mode === "net";
        ellipse(x, 284, 24, 6, "#163343");
        line(ctx, x - 7, 256, x - 11, 280, "#db9c71", 6);
        line(ctx, x + 7, 256, x + 13, 280, "#db9c71", 6);
        rect(ctx, x - 17, 278, 12, 5, PAL.white);
        rect(ctx, x + 8, 278, 13, 5, PAL.white);
        rect(ctx, x - 13, 236, 26, 25, "#4fc5b6");
        rect(ctx, x - 13, 258, 26, 8, "#163343");
        line(ctx, x - 8, 237, x - 12, shooting ? 206 : 218, "#eab18c", 5);
        line(ctx, x + 8, 237, x + 11, shooting ? 201 : 218, "#eab18c", 5);
        circle(ctx, x, 227, 9, "#eab18c");
        rect(ctx, x - 8, 218, 16, 5, "#242236");
        pixelText(ctx, "26", x, 240, PAL.white, 10, "center");
      }

      function drawBasketball() {
        const point = project(ball.x, ball.z, ball.height);
        const ground = project(ball.x, ball.z, 0);
        const radius = BALL_RADIUS * point.scale;
        ellipse(ground.x, ground.y, radius + 2, 2.5, "#805b39");
        ctx.save(); ctx.translate(point.x, point.y); ctx.rotate(flightTime * 8);
        circle(ctx, 0, 0, radius, COURT.orange);
        circle(ctx, -radius * 0.3, -radius * 0.3, radius * 0.45, "#ffbb62");
        line(ctx, -radius, 0, radius, 0, "#774326", 1);
        ellipse(0, 0, radius * 0.45, radius, "#774326", true);
        ctx.restore();
      }

      function powerForHeight(height) {
        const forwardDistance = DISTANCE / Math.cos(aim);
        const drop = RELEASE_HEIGHT + Math.tan(ELEVATION) * forwardDistance - height;
        const speed = Math.sqrt(GRAVITY * forwardDistance * forwardDistance /
          (2 * Math.pow(Math.cos(ELEVATION), 2) * drop));
        return clamp((speed - MIN_SPEED) / (MAX_SPEED - MIN_SPEED), 0, 1);
      }

      function drawControls() {
        rect(ctx, 0, 322, W, 78, COURT.panel);
        line(ctx, 16, 322, 624, 322, "#345168", 2);
        const ax = 24, ay = 350, aw = 244, px = 332, pw = 280;
        pixelText(ctx, "SIGTE  ← / →", ax, 332, PAL.cyan, 11);
        pixelText(ctx, "KRAFT  HOLD SPACE", px, 332, PAL.cyan, 11);
        rect(ctx, ax, ay, aw, 12, COURT.night);
        rect(ctx, px, ay, pw, 12, COURT.night);
        if (review > 0) {
          const lowAim = Math.atan2(-(RIM_RADIUS - BALL_RADIUS), DISTANCE);
          const highAim = -lowAim;
          rect(ctx, ax + (lowAim + AIM_LIMIT) / (2 * AIM_LIMIT) * aw, ay,
            (highAim - lowAim) / (2 * AIM_LIMIT) * aw, 12, PAL.green);
          const lowPower = powerForHeight(RIM_HEIGHT - HEIGHT_TOLERANCE);
          const highPower = powerForHeight(RIM_HEIGHT + HEIGHT_TOLERANCE);
          rect(ctx, px + lowPower * pw, ay, (highPower - lowPower) * pw, 12, PAL.green);
        }
        strokeRect(ctx, ax, ay, aw, 12, "#96b7c6", 1);
        strokeRect(ctx, px, ay, pw, 12, "#96b7c6", 1);
        rect(ctx, ax + (aim + AIM_LIMIT) / (2 * AIM_LIMIT) * aw - 2, ay - 3, 4, 18, PAL.yellow);
        rect(ctx, px + power * pw - 2, ay - 3, 4, 18, PAL.yellow);
        pixelText(ctx, review > 0 ? "MARKERINGER · 1 SEKUND" : "SIGTE " + Math.round(aim * 180 / Math.PI) + "°", ax, 375, PAL.purple, 10);
        pixelText(ctx, mode === "ready" ? "SLIP FOR KAST · " + Math.round(power * 100) + "%" : "KASTET MED " + Math.round(power * 100) + "%",
          px, 375, PAL.purple, 10);
      }

      function draw() {
        drawCourt(); drawHoop(false); drawShooter();
        if (review > 0) {
          const marker = project(Math.tan(aim) * DISTANCE, DISTANCE, RIM_HEIGHT);
          ellipse(hoop.x, hoop.y, 9, 9, PAL.green, true);
          line(ctx, marker.x - 5, marker.y, marker.x + 5, marker.y, PAL.yellow, 1);
          line(ctx, marker.x, marker.y - 5, marker.x, marker.y + 5, PAL.yellow, 1);
          ellipse(marker.x, marker.y, 9, 9, PAL.yellow, true);
        }
        if (mode === "ready") pixelText(ctx, "MIDTEN", W / 2, 299, PAL.white, 10, "center");
        if (mode === "flight") trail.forEach((point, index) => circle(ctx, point.x, point.y, 1 + index * 0.15, "#e2b47a"));
        drawBasketball(); drawHoop(true); drawControls();
        rect(ctx, 0, 0, W, 39, COURT.panel);
        pixelText(ctx, api.player.name, 16, 10, PAL.cyan, 12);
        pixelText(ctx, "RUNDE " + (currentRound() + 1) + "/3 · KAST " + (Math.min(shotIndex, TOTAL - 1) % PER_ROUND + 1) + "/2",
          195, 10, PAL.white, 11);
        pixelText(ctx, "TRÆF " + makes + "/6", 499, 10, PAL.yellow, 13);
        for (let i = 0; i < TOTAL; i++) {
          const active = i === shotIndex && outcomes[i] === undefined;
          circle(ctx, 286 + i * 14, 29, 3, outcomes[i] === undefined ? (active ? PAL.yellow : "#345168") : outcomes[i] ? PAL.green : PAL.red);
        }
        if (mode === "net" || mode === "miss" || mode === "result") {
          rect(ctx, 206, 170, 228, 32, COURT.panel);
          strokeRect(ctx, 206, 170, 228, 32, made ? PAL.green : PAL.red, 1);
          pixelText(ctx, feedback, 320, 180, made ? PAL.green : PAL.orange, 15, "center");
        }
      }

      prepareShot();
      shell.start(update, draw);
      return shell;
    },
  });
})();
