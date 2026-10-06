/* stones.js — choose 3 of 15 stones, then simulate their skips on water */
(function () {
  "use strict";
  const { clamp, pixelText, rect, strokeRect, circle, line, createGameShell } = window.Retro;
  const { STONES, skipStone } = window.GamePhysics;
  Events.register({
    id: "stones", name: "STENKAST", nameShort: "STEN",
    blurb: "VÆLG 3 AF 15 FORSKELLIGE STEN. MASSE, FLADHED OG BALANCE TÆLLER. KAST HVER STEN ÉN GANG. FLEST HOP I DIT BEDSTE KAST VINDER.",
    meta: "PILE VÆLGER STEN · SPACE VÆLGER · ←/→ HÆLDNING · HOLD SPACE FOR KRAFT · SLIP FOR KAST",
    hint: "VÆLG 3 STEN MED PILE OG SPACE. FLADE, BALANCEREDE STEN GLIDER BEDST.",
    lowerIsBetter: false, unit: "hop", scoreLabel: "HOP (BEDSTE KAST)",
    start(api) {
      const shell = createGameShell({ canvas: api.canvas }), { ctx, kb, PAL } = shell;
      let mode = "select", cursor = 0, chosen = [], throwNo = 0, best = 0;
      let angle = 10, power = 0, direction = 1, charging = false, armRelease = false;
      let flight = null, elapsed = 0, pathIndex = 0, timer = 0, clock = 0;
      const results = [], previous = {};
      const hit = key => kb.down(key) && !previous[key];
      function ellipse(x, y, rx, ry, color) {
        ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
      }
      function stoneIcon(s, x, y, size, tilt = 0) {
        ctx.save(); ctx.translate(x, y); ctx.rotate(tilt);
        const flat = .28 + .4 * (1 - s.flatness);
        ellipse(1, 3, size, size * flat + 2, "#343b43");
        ellipse(0, 0, size, size * flat, ["#97a3a5", "#c2b398", "#8e9299"][s.id % 3]);
        line(ctx, -size * .6, -2, size * .5, -2, "#e0d8c2", 2);
        line(ctx, -size * .25, 2, size * .2, 3, "#636e75", 1);
        ctx.restore();
      }
      function setupThrow() {
        mode = "ready"; angle = 10; power = 0; direction = 1; charging = false;
        api.setHint("KAST " + (throwNo + 1) + "/3 · " + STONES[chosen[throwNo]].name +
          " · ←/→ HÆLDNING · HOLD SPACE FOR KRAFT · SLIP FOR KAST");
      }
      function step(dt) {
        clock += dt;
        if (mode === "select") {
          if (hit("Left") || hit("A")) cursor = (cursor + 14) % 15;
          if (hit("Right") || hit("D")) cursor = (cursor + 1) % 15;
          if (hit("Up") || hit("W")) cursor = (cursor + 10) % 15;
          if (hit("Down") || hit("S")) cursor = (cursor + 5) % 15;
          if (hit("Backspace")) chosen.pop();
          if (hit("Space") || hit("Enter")) {
            if (!chosen.includes(cursor)) chosen.push(cursor);
            if (chosen.length === 3) { armRelease = true; setupThrow(); }
          }
        } else if (mode === "ready") {
          if (armRelease) { if (!kb.down("Space") && !kb.down("Enter")) armRelease = false; }
          else {
            if (kb.down("Left") || kb.down("A")) angle -= 22 * dt;
            if (kb.down("Right") || kb.down("D")) angle += 22 * dt;
            angle = clamp(angle, 5, 40);
            if (kb.down("Space")) {
              charging = true; power += direction * dt;
              if (power > 1) { power = 2 - power; direction = -1; }
              if (power < 0) { power = -power; direction = 1; }
            } else if (charging) {
              flight = skipStone(STONES[chosen[throwNo]], angle, power);
              elapsed = 0; pathIndex = 0; mode = "fly"; charging = false;
              api.setHint("SE STENENS HOP · " + STONES[chosen[throwNo]].name);
            }
          }
        } else if (mode === "fly") {
          elapsed = Math.min(flight.duration, elapsed + dt * .55);
          while (pathIndex + 1 < flight.path.length && flight.path[pathIndex + 1].t <= elapsed) pathIndex++;
          if (elapsed >= flight.duration) {
            best = Math.max(best, flight.hops); results.push(flight.hops);
            mode = "result"; timer = 1.5;
            api.setHint(flight.hops + " HOP · " + flight.distance.toFixed(1) + " M · BEDSTE " + best);
          }
        } else if (mode === "result") {
          timer -= dt;
          if (timer <= 0) {
            throwNo++;
            if (throwNo >= 3) {
              mode = "done"; shell.dispose();
              api.finish(best, "3 STEN · " + results.join(" / ") + " HOP · BEDSTE KAST: " + best);
            } else setupThrow();
          }
        }
        for (const key of ["Left", "Right", "Up", "Down", "A", "D", "W", "S", "Space", "Enter", "Backspace"]) previous[key] = kb.down(key);
      }
      function drawSelection() {
        rect(ctx, 0, 0, 640, 400, "#122b36");
        pixelText(ctx, "FIND DINE TRE STEN", 320, 15, PAL.sand, 19, "center");
        pixelText(ctx, "FLADHED + BALANCE · LETTE SKIVER KRÆVER GOD TEKNIK", 320, 42, PAL.cyan, 10, "center");
        STONES.forEach((s, i) => {
          const x = 20 + i % 5 * 122, y = 65 + Math.floor(i / 5) * 84;
          const selected = chosen.indexOf(i);
          rect(ctx, x, y, 112, 75, selected >= 0 ? "#345549" : "#203c48");
          strokeRect(ctx, x, y, 112, 75, i === cursor ? PAL.yellow : selected >= 0 ? PAL.green : "#45616b", i === cursor ? 3 : 1);
          stoneIcon(s, x + 56, y + 23, 16 + s.radius * 150);
          pixelText(ctx, s.name, x + 56, y + 41, PAL.white, 10, "center");
          pixelText(ctx, Math.round(s.mass * 1000) + "G · " + Math.round(s.thickness * 1000) + "MM", x + 56, y + 58, PAL.sand, 9, "center");
          if (selected >= 0) { circle(ctx, x + 12, y + 12, 8, PAL.green); pixelText(ctx, String(selected + 1), x + 12, y + 7, "#122b36", 10, "center"); }
        });
        const s = STONES[cursor];
        pixelText(ctx, s.name + " · FLADHED " + Math.round(s.flatness * 100) + "% · BALANCE " + Math.round(s.stability * 100) + "%", 320, 326, PAL.yellow, 11, "center");
        pixelText(ctx, "VALGT " + chosen.length + "/3 · PILE VÆLGER · SPACE BEKRÆFTER", 320, 355, PAL.white, 11, "center");
        pixelText(ctx, "BACKSPACE FORTRYDER · HVER STEN KAN KUN VÆLGES ÉN GANG", 320, 378, PAL.purple, 9, "center");
      }
      function drawLake() {
        rect(ctx, 0, 0, 640, 400, "#d7af91");
        rect(ctx, 0, 72, 640, 79, "#e4c3a2");
        circle(ctx, 493, 91, 26, "#ffe0a0");
        for (let i = 0; i < 12; i++) {
          circle(ctx, i * 65 - 10, 173, 46 + i % 3 * 14, "#667e77");
          circle(ctx, i * 65 + 22, 193, 42 + i % 2 * 13, "#375d5f");
        }
        rect(ctx, 0, 205, 640, 124, "#3c8291");
        for (let row = 0; row < 10; row++) {
          const y = 211 + row * 11;
          for (let i = 0; i < 13; i++) {
            const x = (i * 58 + row * 17 + clock * (2 + row)) % 685 - 35;
            line(ctx, x, y, x + 13 + row * 2, y, row % 2 ? "#72a8af" : "#61979f", 1);
          }
        }
        for (let i = 0; i < 7; i++) line(ctx, 460 - i * 5, 214 + i * 9, 522 + i * 3, 214 + i * 9, "#c1b999", 2);
        if (mode === "ready") {
          rect(ctx, 0, 271, 87, 58, "#bdaa83");
          for (let i = 0; i < 14; i++) stoneIcon(STONES[i], i * 7, 309 + i % 3 * 5, 4);
          rect(ctx, 40, 235, 14, 36, "#253944");
          line(ctx, 43, 270, 35, 287, "#304956", 7); line(ctx, 51, 270, 59, 287, "#304956", 7);
          circle(ctx, 46, 225, 9, "#e4b394");
          line(ctx, 48, 242, 77, 269, "#e4b394", 5);
          stoneIcon(STONES[chosen[throwNo]], 80, 271, 7, -angle * Math.PI / 180);
        }
      }
      function draw() {
        if (mode === "select") { drawSelection(); return; }
        drawLake();
        const s = STONES[chosen[Math.min(throwNo, 2)]];
        const point = flight && (mode === "fly" || mode === "result" || mode === "done") ? flight.path[pathIndex] : null;
        const camera = point ? Math.max(0, point.x * 23 - 375) : 0;
        if (point) {
          flight.splashes.forEach(p => {
            const age = elapsed - p.t, x = 80 + p.x * 23 - camera;
            if (age >= 0 && age < 1.3 && x > -30 && x < 670) {
              ellipse(x, 284, 6 + age * 21, 2 + age * 4, "#86c5c8");
              ellipse(x, 284, 4 + age * 17, 1 + age * 3, "#3c8291");
              line(ctx, x - 3, 278, x - 6, 269 + age * 11, PAL.cyan, 1);
              line(ctx, x + 4, 279, x + 7, 270 + age * 11, PAL.white, 1);
            }
          });
          for (let i = Math.max(0, pathIndex - 12); i < pathIndex; i++) {
            const p = flight.path[i]; circle(ctx, 80 + p.x * 23 - camera, 284 - p.z * 110, 1, "#cbdcd0");
          }
          if (mode === "fly") stoneIcon(s, 80 + point.x * 23 - camera, 284 - point.z * 110, 5, -angle * Math.PI / 180 + elapsed * 12);
          pixelText(ctx, "HOP " + (mode === "result" ? flight.hops : point.hops), 321, 55, PAL.white, 25, "center");
          pixelText(ctx, point.x.toFixed(1) + " M", 321, 84, PAL.cyan, 12, "center");
        }
        rect(ctx, 0, 0, 640, 38, "#122b36");
        pixelText(ctx, api.player.name, 16, 12, PAL.cyan, 12);
        pixelText(ctx, "KAST " + (Math.min(throwNo, 2) + 1) + "/3 · " + s.name, 178, 12, PAL.white, 11);
        pixelText(ctx, "BEDSTE " + best, 511, 12, PAL.yellow, 12);
        rect(ctx, 0, 329, 640, 71, "#122b36");
        if (mode === "ready") {
          pixelText(ctx, "HÆLDNING  ← / →", 24, 339, PAL.cyan, 11);
          stoneIcon(s, 162, 380, 25, -angle * Math.PI / 180);
          line(ctx, 130, 390, 202, 390, "#86a4a4", 1);
          pixelText(ctx, Math.round(angle) + "°", 234, 370, PAL.yellow, 17);
          pixelText(ctx, "KRAFT · HOLD SPACE", 332, 339, PAL.cyan, 11);
          rect(ctx, 332, 361, 280, 12, "#294852");
          rect(ctx, 332, 361, power * 280, 12, "#e9b46b");
          strokeRect(ctx, 332, 361, 280, 12, PAL.sand, 1);
          pixelText(ctx, Math.round(power * 100) + "% · SLIP FOR KAST", 472, 381, PAL.white, 10, "center");
        } else {
          pixelText(ctx, mode === "fly" ? "STENEN GLIDER OVER VANDET" : flight.hops + " HOP · " + flight.distance.toFixed(1) + " METER", 320, 343, PAL.yellow, 15, "center");
          pixelText(ctx, "DINE KAST: " + results.join(" / ") + " · BEDSTE KAST TÆLLER", 320, 377, PAL.cyan, 11, "center");
        }
      }
      shell.start(step, draw); return shell;
    },
  });
})();
