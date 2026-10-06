/* Bobspil: wooden board, 15 rings per team, striker placement and real turns. */
(function () {
  "use strict";
  const { clamp, pixelText, rect, strokeRect, circle, line, createGameShell } = window.Retro;
  const B = window.BobPhysics, OX = 163, OY = 39;
  Events.register({
    id: "bob", name: "BOBSPIL", nameShort: "BOB",
    blurb: "DU ER GUL, COMPUTEREN ER RØD OG SPILLER PÅ LET NIVEAU. 15 RINGE HVER PÅ ET BOBBORD MED 4 HJØRNEHULLER. EGEN RING GIVER EKSTRA TUR. STØDRING I HUL GIVER EN RING TILBAGE. FØRST FÆRDIG VINDER; RØD HAR SIDSTE STØD.",
    meta: "A/D FLYT · S SIDE · ←/→ SIGTE · HOLD SPACE OG SLIP · SEJR +30, UAFGJORT +15, EGNE RINGE − RØDE RINGE",
    hint: "SPRED RINGENE MED DIT ÅBNINGSSTØD · A/D FLYT · ←/→ SIGTE · HOLD SPACE OG SLIP",
    lowerIsBetter: false, unit: "point", scoreLabel: "POINT (BOB)",
    start(api) {
      const shell = createGameShell({ canvas: api.canvas }), { ctx, kb, PAL } = shell;
      let rings = B.rack(), stored = { yellow: [], red: [] }, mode = "ready", actor = "yellow";
      let side = "bottom", position = 160, aim = -Math.PI / 2, power = 0, direction = 1;
      let charging = false, shot = null, timer = 0, turns = 0, humanShots = 0, message = "DIT ÅBNINGSSTØD";
      let opening = 2, finalRed = false, winner = null, previous = {};
      const hit = key => kb.down(key) && !previous[key];
      function ellipse(x, y, rx, ry, color, outline = false) {
        ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
        if (outline) { ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke(); }
        else { ctx.fillStyle = color; ctx.fill(); }
      }
      function finish(result) {
        mode = "done"; winner = result; shell.dispose();
        const score = stored.yellow.length - stored.red.length + (result === "yellow" ? 30 : result === "draw" ? 15 : 0);
        api.finish(score, (result === "yellow" ? "DU VANDT" : result === "draw" ? "UAFGJORT" : "RØD VANDT") +
          " · GUL " + stored.yellow.length + "/15 · RØD " + stored.red.length + "/15 · " + humanShots + " STØD");
      }
      function readyHuman() {
        actor = "yellow"; mode = "ready"; power = 0; direction = 1; charging = false;
        api.setHint(message + " · A/D FLYT · S SKIFT SIDE · ←/→ SIGTE · HOLD SPACE OG SLIP · F AFSLUT");
      }
      function readyAI() { actor = "red"; mode = "think"; timer = .65; api.setHint(finalRed ? "RØDS SIDSTE STØD" : "RØD PLANLÆGGER SIT STØD"); }
      function launch(spec) {
        const next = B.startShot(rings, spec.side, spec.position, spec.angle, spec.power);
        if (!next) { message = "FLYT STØDRINGEN FRI"; api.setHint(message + " · BRUG A/D ELLER S"); charging = false; power = 0; return false; }
        shot = next; side = spec.side; position = spec.position; aim = spec.angle;
        mode = "flight"; charging = false; turns++; if (actor === "yellow") humanShots++;
        api.setHint(actor === "yellow" ? "DIT STØD" : "RØDS STØD"); return true;
      }
      function settle() {
        const result = B.applyRules(shot, actor, stored); rings = result.rings;
        message = shot.strikerPocketed ? (result.returned ? "STØDRING I HUL · 1 RING TILBAGE" : "STØDRING I HUL")
          : result.other ? "MODSTANDERS RING · TUREN SKIFTER" : result.extraTurn ? "EGEN RING · EKSTRA TUR!" : "TUREN SKIFTER";
        mode = "result"; timer = .8;
        api.setHint(message);
        if (opening > 0) return;
        const outcome = B.winnerAfterShot(stored, actor, finalRed);
        winner = outcome.winner; finalRed = outcome.lastRedShot;
      }
      function update(dt) {
        if (mode === "ready") {
          if (hit("F")) { mode = "confirm"; api.setHint("AFSLUT SOM TABT SPIL? ENTER BEKRÆFTER · ESC ANNULLERER"); }
          if (hit("S")) { side = side === "bottom" ? "left" : "bottom"; aim = side === "bottom" ? -Math.PI / 2 : 0; }
          if (kb.down("A")) position -= 100 * dt;
          if (kb.down("D")) position += 100 * dt;
          position = clamp(position, 48, 272);
          const center = side === "bottom" ? -Math.PI / 2 : 0;
          if (kb.down("Left")) aim -= .9 * dt;
          if (kb.down("Right")) aim += .9 * dt;
          aim = clamp(aim, center - 1.4, center + 1.4);
          if (kb.down("Space")) {
            charging = true; power += direction * dt;
            if (power > 1) { power = 2 - power; direction = -1; }
            if (power < 0) { power = -power; direction = 1; }
          } else if (charging) launch({ side, position, angle: aim, power });
        } else if (mode === "confirm") {
          if (hit("Enter")) finish("red");
          else if (hit("Escape")) readyHuman();
        } else if (mode === "think") {
          timer -= dt;
          if (timer <= 0) {
            const breakPosition = [160, 112, 208, 80, 240, 48, 272].find(p => B.canPlace(rings, B.striker("top", p)));
            const spec = opening && breakPosition !== undefined
              ? { side: "top", position: breakPosition, angle: Math.atan2(160 - 31, 160 - breakPosition) + .07, power: .85 }
              : B.chooseShot(rings, "red", ["top", "right"], turns);
            if (spec) launch(spec);
            else { message = "RØD KAN IKKE PLACERE STØDRINGEN · DIN TUR"; readyHuman(); }
          }
        } else if (mode === "flight") {
          B.step(shot, dt);
          if (shot.settled) settle();
        } else if (mode === "result") {
          timer -= dt;
          if (timer <= 0) {
            if (winner) { finish(winner); return; }
            if (opening) {
              opening--;
              if (opening === 1) readyAI();
              else { message = "GUL ÅBNER SPILLET"; side = "bottom"; aim = -Math.PI / 2; readyHuman(); }
            } else if (finalRed) readyAI();
            else {
              const own = shot.pocketed.some(r => r.color === actor);
              const other = shot.pocketed.some(r => r.color !== actor);
              const extra = own && !other && !shot.strikerPocketed;
              if ((extra && actor === "yellow") || (!extra && actor === "red")) {
                side = "bottom"; aim = -Math.PI / 2; readyHuman();
              } else readyAI();
            }
          }
        }
        for (const key of ["S", "F", "Enter", "Escape"]) previous[key] = kb.down(key);
      }
      function drawRing(r) {
        const x = OX + r.x, y = OY + r.y, color = r.color === "yellow" ? "#eac34c" : r.color === "red" ? "#cf5443" : "#26313a";
        ellipse(x + 1, y + 2, r.r + 1, r.r, "#9f754a");
        circle(ctx, x, y, r.r, color);
        circle(ctx, x, y, r.r * .4, r.color === "black" ? "#111e23" : "#ac8154");
        line(ctx, x - r.r * .5, y - r.r * .5, x + r.r * .35, y - r.r * .5, r.color === "yellow" ? "#ffe48a" : r.color === "red" ? "#f39470" : "#6a7478", 1);
      }
      function draw() {
        rect(ctx, 0, 0, 640, 400, "#142730");
        // Square wooden Bob board, corner pockets, red boundary lines and circles.
        rect(ctx, OX - 15, OY - 15, 350, 350, "#9a623b");
        strokeRect(ctx, OX - 15, OY - 15, 350, 350, "#dca46c", 4);
        rect(ctx, OX, OY, 320, 320, "#ddba80");
        for (let y = 0; y < 320; y += 16) line(ctx, OX, OY + y, OX + 320, OY + y, y % 32 ? "#d9b57d" : "#dfbf88", 1);
        strokeRect(ctx, OX + 34, OY + 34, 252, 252, "#b65b44", 2);
        ellipse(OX + 160, OY + 160, 53, 53, "#b65b44", true);
        pixelText(ctx, "BOB", OX + 160, OY + 150, "#b65b44", 20, "center");
        for (const x of [34, 286]) for (const y of [34, 286]) ellipse(OX + x, OY + y, 7, 7, "#b65b44", true);
        B.POCKETS.forEach(([x, y]) => { circle(ctx, OX + x, OY + y, B.POCKET_R + 2, "#9a623b"); circle(ctx, OX + x, OY + y, B.POCKET_R, "#17242a"); circle(ctx, OX + x, OY + y + 2, 9, "#101a20"); });
        if (mode === "flight") shot.bodies.forEach(drawRing); else rings.forEach(drawRing);
        if (mode === "ready" || mode === "confirm") {
          const s = B.striker(side, position), valid = B.canPlace(rings, s); drawRing(s);
          line(ctx, OX + s.x, OY + s.y, OX + s.x + Math.cos(aim) * 60, OY + s.y + Math.sin(aim) * 60, valid ? PAL.white : PAL.red, 1);
          line(ctx, OX + s.x - Math.cos(aim) * (26 + power * 40), OY + s.y - Math.sin(aim) * (26 + power * 40),
            OX + s.x - Math.cos(aim) * 12, OY + s.y - Math.sin(aim) * 12, "#e3c49c", 4);
          if (side === "bottom") line(ctx, OX + 48, OY + 295, OX + 272, OY + 295, PAL.yellow, 2);
          else line(ctx, OX + 25, OY + 48, OX + 25, OY + 272, PAL.yellow, 2);
        }
        pixelText(ctx, "BOBSPIL", 16, 20, PAL.white, 18);
        pixelText(ctx, api.player.name, 16, 57, PAL.cyan, 12);
        pixelText(ctx, "DU ER GUL", 16, 78, PAL.yellow, 11);
        pixelText(ctx, stored.yellow.length + "/15 I HUL", 16, 104, PAL.yellow, 13);
        pixelText(ctx, "COMPUTER", 516, 57, PAL.cyan, 11);
        pixelText(ctx, "RØD · LET", 516, 78, PAL.red, 11);
        pixelText(ctx, stored.red.length + "/15 I HUL", 516, 104, PAL.red, 13);
        for (let i = 0; i < 15; i++) {
          circle(ctx, 25 + i % 5 * 22, 147 + Math.floor(i / 5) * 21, 6, i < stored.yellow.length ? PAL.yellow : "#36505a");
          circle(ctx, 525 + i % 5 * 22, 147 + Math.floor(i / 5) * 21, 6, i < stored.red.length ? PAL.red : "#36505a");
        }
        pixelText(ctx, actor === "yellow" ? "DIN TUR" : "RØDS TUR", actor === "yellow" ? 16 : 516, 227, actor === "yellow" ? PAL.yellow : PAL.red, 12);
        pixelText(ctx, "A/D FLYT", 16, 263, PAL.white, 10);
        pixelText(ctx, "S SIDE", 16, 282, PAL.white, 10);
        pixelText(ctx, "←/→ SIGTE", 16, 301, PAL.white, 10);
        pixelText(ctx, "F AFSLUT", 16, 340, PAL.purple, 9);
        pixelText(ctx, "EGEN RING:", 516, 261, PAL.white, 9); pixelText(ctx, "EKSTRA TUR", 516, 276, PAL.green, 9);
        pixelText(ctx, "STØDRING", 516, 309, PAL.white, 9); pixelText(ctx, "I HUL:", 516, 324, PAL.white, 9);
        pixelText(ctx, "1 TILBAGE", 516, 340, PAL.orange, 9);
        rect(ctx, 148, 377, 350, 12, "#28444e");
        rect(ctx, 148, 377, power * 350, 12, PAL.yellow);
        pixelText(ctx, "HOLD SPACE", 16, 378, PAL.cyan, 10);
        pixelText(ctx, Math.round(power * 100) + "%", 515, 378, PAL.yellow, 11);
        if (mode === "result" || mode === "confirm") {
          rect(ctx, 150, 190, 346, mode === "confirm" ? 68 : 44, "#142730");
          strokeRect(ctx, 150, 190, 346, mode === "confirm" ? 68 : 44, PAL.sand, 1);
          pixelText(ctx, mode === "confirm" ? "AFSLUT SOM TABT SPIL?" : message, 323, 204, PAL.sand, 11, "center");
          if (mode === "confirm") pixelText(ctx, "ENTER JA · ESC FORTSÆT", 323, 237, PAL.cyan, 11, "center");
        }
      }
      shell.start(update, draw); return shell;
    },
  });
})();
