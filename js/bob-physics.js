/* Bob: circular ring collisions, four pockets and the linked Danish turn rules. */
(function (global) {
  "use strict";
  const SIZE = 320, RING_R = 6.5, STRIKER_R = 8.5, POCKET_R = 14;
  const POCKETS = [[12, 12], [308, 12], [12, 308], [308, 308]];
  const AI_SKILLS = {
    casual: { search: 2, angleError: .065, powerError: .18 },
    expert: { search: 10, angleError: 0, powerError: 0 },
  };
  function aiSample(turn, salt) {
    let seed = Math.imul((turn + 1) ^ salt, 0x45d9f3b);
    seed = Math.imul(seed ^ (seed >>> 16), 0x45d9f3b);
    return ((seed ^ (seed >>> 16)) >>> 0) / 4294967296;
  }
  function aiError(turn, salt) {
    const u = Math.max(.000001, aiSample(turn, salt));
    const v = aiSample(turn, salt + 31);
    return Math.max(-1, Math.min(1, Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) / 2));
  }
  function inwardAngle(side) { return side === "bottom" ? -Math.PI / 2 : side === "top" ? Math.PI / 2 : side === "left" ? 0 : Math.PI; }
  function canAim(side, angle) {
    const offset = angle - inwardAngle(side);
    return Math.abs(Math.atan2(Math.sin(offset), Math.cos(offset))) <= 1.4;
  }
  function executeAI(spec, turn, skill) {
    const base = inwardAngle(spec.side);
    const offset = Math.atan2(Math.sin(spec.angle - base), Math.cos(spec.angle - base));
    const difficulty = spec.difficulty || 1;
    const angleError = aiError(turn, 7919) * skill.angleError * difficulty;
    const powerError = aiError(turn, 104729) * skill.powerError;
    return { ...spec, angle: base + Math.max(-1.4, Math.min(1.4, offset + angleError)),
      power: Math.max(.05, Math.min(1, spec.power * (1 + powerError))) };
  }
  function rack() {
    const rings = []; let id = 0;
    // Thirty non-overlapping rings inside the marked central circle.
    for (let row = 0; row < 5; row++) for (let col = 0; col < 6; col++) {
      rings.push({ id: id++, color: (row + col) % 2 ? "red" : "yellow", x: 160 + (col - 2.5) * 14,
        y: 160 + (row - 2) * 14, r: RING_R, mass: 1, vx: 0, vy: 0 });
    }
    return rings;
  }
  function striker(side, position = 160) {
    const p = Math.max(48, Math.min(272, position));
    const coords = side === "bottom" ? [p, 289] : side === "top" ? [p, 31] : side === "left" ? [31, p] : [289, p];
    return { id: -1, color: "black", x: coords[0], y: coords[1], r: STRIKER_R, mass: 1.6, vx: 0, vy: 0 };
  }
  function canPlace(rings, s) { return rings.every(r => Math.hypot(r.x - s.x, r.y - s.y) >= r.r + s.r + .5); }
  function startShot(rings, side, position, angle, power) {
    const s = striker(side, position);
    if (!canPlace(rings, s)) return null;
    const speed = 90 + Math.max(0, Math.min(1, power)) * 510;
    s.vx = Math.cos(angle) * speed; s.vy = Math.sin(angle) * speed;
    return { bodies: [...rings.map(r => ({ ...r })), s], pocketed: [], strikerPocketed: false, elapsed: 0, settled: false };
  }
  function step(shot, dt) {
    if (shot.settled) return;
    const count = Math.max(1, Math.ceil(dt * 240)), h = dt / count;
    for (let n = 0; n < count; n++) {
      shot.elapsed += h;
      for (let i = shot.bodies.length - 1; i >= 0; i--) {
        const b = shot.bodies[i]; b.x += b.vx * h; b.y += b.vy * h;
        if (POCKETS.some(([x, y]) => Math.hypot(b.x - x, b.y - y) <= POCKET_R)) {
          if (b.id === -1) shot.strikerPocketed = true; else shot.pocketed.push(b);
          shot.bodies.splice(i, 1); continue;
        }
        if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx) * .82; }
        if (b.x > SIZE - b.r) { b.x = SIZE - b.r; b.vx = -Math.abs(b.vx) * .82; }
        if (b.y < b.r) { b.y = b.r; b.vy = Math.abs(b.vy) * .82; }
        if (b.y > SIZE - b.r) { b.y = SIZE - b.r; b.vy = -Math.abs(b.vy) * .82; }
        const speed = Math.hypot(b.vx, b.vy);
        const next = Math.max(0, speed * Math.exp(-.8 * h) - 35 * h);
        if (speed > 0) { b.vx *= next / speed; b.vy *= next / speed; }
      }
      for (let i = 0; i < shot.bodies.length; i++) for (let j = i + 1; j < shot.bodies.length; j++) {
        const a = shot.bodies[i], b = shot.bodies[j];
        const dx = b.x - a.x, dy = b.y - a.y, distance = Math.hypot(dx, dy), sum = a.r + b.r;
        if (distance >= sum) continue;
        const nx = distance > 1e-8 ? dx / distance : 1, ny = distance > 1e-8 ? dy / distance : 0;
        const separation = sum - distance + .01, total = a.mass + b.mass;
        a.x -= nx * separation * b.mass / total; a.y -= ny * separation * b.mass / total;
        b.x += nx * separation * a.mass / total; b.y += ny * separation * a.mass / total;
        const approach = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (approach < 0) {
          const impulse = -(1 + .94) * approach / (1 / a.mass + 1 / b.mass);
          a.vx -= impulse * nx / a.mass; a.vy -= impulse * ny / a.mass;
          b.vx += impulse * nx / b.mass; b.vy += impulse * ny / b.mass;
        }
      }
    }
    if (shot.bodies.every(b => Math.hypot(b.vx, b.vy) < 5)) {
      shot.settled = true;
      shot.bodies.forEach(b => { b.vx = 0; b.vy = 0; });
    }
  }
  function centerSpot(rings) {
    for (let layer = 0; layer < 14; layer++) {
      const count = layer ? layer * 8 : 1;
      for (let i = 0; i < count; i++) {
        const angle = i * Math.PI * 2 / count, p = { x: 160 + Math.cos(angle) * layer * 14, y: 160 + Math.sin(angle) * layer * 14 };
        if (rings.every(r => Math.hypot(r.x - p.x, r.y - p.y) > r.r + RING_R + .5)) return p;
      }
    }
    return { x: 160, y: 160 };
  }
  function applyRules(shot, color, stored) {
    const rings = shot.bodies.filter(b => b.id !== -1).map(b => ({ ...b, vx: 0, vy: 0 }));
    shot.pocketed.forEach(r => stored[r.color].push({ ...r, vx: 0, vy: 0 }));
    const own = shot.pocketed.filter(r => r.color === color).length;
    const other = shot.pocketed.length - own;
    let returned = false;
    if (shot.strikerPocketed && stored[color].length) {
      const ring = stored[color].pop(), spot = centerSpot(rings);
      rings.push({ ...ring, ...spot, vx: 0, vy: 0 }); returned = true;
    }
    return { rings, own, other, returned, extraTurn: own > 0 && other === 0 && !shot.strikerPocketed };
  }
  function clearLine(rings, from, to, radius, ignoreId) {
    const dx = to.x - from.x, dy = to.y - from.y, length2 = dx * dx + dy * dy;
    return rings.every(r => {
      if (r.id === ignoreId) return true;
      const t = Math.max(0, Math.min(1, ((r.x - from.x) * dx + (r.y - from.y) * dy) / Math.max(1, length2)));
      return Math.hypot(r.x - from.x - t * dx, r.y - from.y - t * dy) > r.r + radius + .2;
    });
  }
  function winnerAfterShot(stored, color, lastRedShot) {
    if (lastRedShot) return { winner: stored.red.length === 15 ? "draw" : "yellow", lastRedShot: false };
    if (stored.red.length === 15) return { winner: stored.yellow.length === 15 ? "draw" : "red", lastRedShot: false };
    if (stored.yellow.length === 15) return { winner: color === "red" ? "yellow" : null, lastRedShot: color === "yellow" };
    return { winner: null, lastRedShot: false };
  }
  function chooseShot(rings, color, sides, turn, level = "casual") {
    const skill = AI_SKILLS[level] || AI_SKILLS.casual;
    const candidates = [];
    for (const side of sides) for (const position of [48, 80, 112, 144, 176, 208, 240, 272]) {
      const s = striker(side, position);
      if (!canPlace(rings, s)) continue;
      for (const target of rings.filter(r => r.color === color)) for (const [px, py] of POCKETS) {
        const distance = Math.hypot(px - target.x, py - target.y);
        const ux = (px - target.x) / distance, uy = (py - target.y) / distance;
        const ghost = { x: target.x - ux * (target.r + s.r), y: target.y - uy * (target.r + s.r) };
        const dx = ghost.x - s.x, dy = ghost.y - s.y, travel = Math.hypot(dx, dy);
        const angle = Math.atan2(dy, dx);
        const alignment = (dx * ux + dy * uy) / travel;
        if (alignment < .4 || !canAim(side, angle) || ghost.x < s.r || ghost.x > SIZE - s.r || ghost.y < s.r || ghost.y > SIZE - s.r ||
          !clearLine(rings, s, ghost, s.r, target.id) || !clearLine(rings, target, { x: px, y: py }, target.r, target.id)) continue;
        const speedAtRing = (distance * .8 + Math.sqrt(70 * distance) + 35) / alignment;
        const speed = speedAtRing / 1.19 + travel * .8 + Math.sqrt(70 * travel);
        candidates.push({ side, position, angle, power: Math.max(.12, Math.min(1, (speed - 90) / 510)),
          merit: alignment * 3 - (distance + travel) / 600,
          difficulty: 1 + (1 - alignment) + (distance + travel) / 640 });
      }
    }
    candidates.sort((a, b) => b.merit - a.merit);
    // Casual play has limited lookahead and imperfect execution. Expert keeps the
    // exact planner for calibration. Identical positions/turns stay reproducible
    // for asynchronous play; scores always come from the actual shot simulation.
    let best = null, bestValue = -Infinity;
    for (const c of candidates.slice(0, skill.search)) {
      const simulation = startShot(rings, c.side, c.position, c.angle, c.power);
      while (!simulation.settled && simulation.elapsed < 8) step(simulation, 1 / 30);
      const value = simulation.pocketed.reduce((v, r) => v + (r.color === color ? 3 : -3), 0) - (simulation.strikerPocketed ? 4 : 0) + c.merit * .01;
      if (value > bestValue) { bestValue = value; best = c; }
    }
    if (best) return executeAI(best, turn, skill);
    // A congested rack needs a positional/break shot rather than a direct pot.
    for (const side of sides) for (const position of [160, 80, 240, 48, 272]) {
      const s = striker(side, position);
      if (!canPlace(rings, s)) continue;
      const targets = rings.filter(r => r.color === color);
      const target = targets[(turn * 7) % Math.max(1, targets.length)] || { x: 160, y: 160 };
      let angle = Math.atan2(target.y - s.y, target.x - s.x);
      if (!canAim(side, angle)) angle = Math.atan2(160 - s.y, 160 - s.x);
      return executeAI({ side, position, angle, power: .7 }, turn, skill);
    }
    return null;
  }
  global.BobPhysics = { SIZE, RING_R, STRIKER_R, POCKET_R, POCKETS, rack, striker, canPlace, startShot, step, applyRules, winnerAfterShot, chooseShot };
})(window);
