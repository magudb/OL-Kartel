const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { test } = require("node:test");
const vm = require("node:vm");

// Drive the registered games through their real update and draw callbacks.
function startGame(id) {
  const sandbox = { window: {} };
  const context = vm.createContext(sandbox);
  const root = join(__dirname, "..");
  for (const file of ["retro", "events", "scoring", "physics", "bob-physics"]) {
    vm.runInContext(readFileSync(join(root, "js", file + ".js"), "utf8"), context);
  }
  const retro = sandbox.window.Retro;
  const held = new Set();
  let previousHeld = new Set();
  let update, draw, disposed = false, rendering = [], result, finishes = 0;
  for (const name of ["pixelText", "rect", "strokeRect", "circle", "line"]) {
    retro[name] = (_, ...args) => rendering.push({ name, args });
  }
  retro.createGameShell = () => ({
    ctx: { save() {}, restore() {}, translate(...args) { rendering.push({ name: "translate", args }); }, rotate() {}, beginPath() {}, ellipse() {},
      stroke() {}, fill() {}, moveTo() {}, lineTo() {}, closePath() {} },
    PAL: retro.PAL,
    kb: { down: (key) => held.has(key), pressed: (key) => held.has(key) && !previousHeld.has(key) },
    start(step, paint) { update = step; draw = paint; },
    dispose() { disposed = true; },
  });
  sandbox.Events = sandbox.window.Events;
  vm.runInContext(readFileSync(join(root, "js/events", id + ".js"), "utf8"), context);
  const definition = sandbox.Events.get(id);
  definition.start({
    canvas: {}, player: { name: "TEST" }, setHint() {},
    finish(score, detail) { result = { score, detail }; finishes++; },
  });
  function stepFrame(dt) {
    if (!disposed) { update(dt); previousHeld = new Set(held); }
  }
  return {
    definition, scoring: sandbox.window.Scoring, physics: sandbox.window.GamePhysics, pal: retro.PAL, held,
    get result() { return result; },
    get finishes() { return finishes; },
    tick(dt = 1 / 60) { stepFrame(dt); },
    advance(seconds, frame = 1 / 60) {
      while (seconds > 1e-9 && !disposed) {
        const step = Math.min(frame, seconds);
        stepFrame(step);
        seconds -= step;
      }
    },
    render() { rendering = []; draw(); return rendering; },
  };
}

function text(game) {
  return game.render().filter((item) => item.name === "pixelText").map((item) => item.args[0]);
}

function ball(game) {
  const item = game.render().find((item) => item.name === "circle" &&
    item.args[2] === 4 && item.args[3] === game.pal.white);
  return { x: item.args[0], y: item.args[1] };
}

function aimAt(game, point) {
  const aim = game.render().find((item) => item.name === "line" && item.args[4] === game.pal.yellow);
  assert.ok(aim, "ball should be ready to putt");
  const [x, y, endX, endY] = aim.args;
  let turn = Math.atan2(point.y - y, point.x - x) - Math.atan2(endY - y, endX - x);
  turn = Math.atan2(Math.sin(turn), Math.cos(turn));
  const key = turn < 0 ? "Left" : "Right";
  game.held.add(key);
  game.advance(Math.abs(turn) / 1.9);
  game.held.delete(key);
}

function puttTo(game, point, frame = 1 / 60) {
  aimAt(game, point);
  const origin = ball(game);
  const distance = Math.hypot(point.x - origin.x, point.y - origin.y);
  // Choose an input charge that stops on this waypoint on grass.
  const speed = 0.75 * distance + 8;
  assert.ok(speed <= 860, "waypoint must be reachable in one putt");
  const charge = Math.log1p((speed - 8) / (860 - 8) * Math.expm1(3)) / 3;
  game.held.add("Space");
  game.advance(charge / 1.15, frame);
  game.held.delete("Space");
  game.tick(frame);
  for (let i = 0; i < 6 / frame; i++) {
    game.tick(frame);
    const labels = text(game);
    if (labels.includes("KRAFT") || labels.includes("MAX SLAG") || labels.some((label) => /^\d+ SLAG$/.test(label))) return;
  }
  assert.fail("putt did not settle");
}

// Safe routes stay inside the courses and avoid sand and water.
const routes = [
  [[320, 200], [540, 200]],
  [[300, 197], [520, 320]],
  [[320, 203], [100, 320]],
  [[260, 120], [380, 120], [550, 200]],
  [[210, 132], [440, 132], [560, 200]],
  [[100, 272], [340, 272], [480, 272], [520, 320]],
  [[260, 280], [280, 140], [440, 140], [540, 80]],
  [[212, 240], [212, 112], [320, 100]],
  [[240, 280], [280, 112], [400, 112], [420, 280], [520, 280], [560, 80]],
  [[260, 112], [424, 112], [424, 200], [520, 200]],
  [[320, 200], [560, 200]],
  [[180, 280], [180, 112], [320, 80]],
];

test("every minigolf hole can be sunk within eight strokes at 60 and 20 fps", () => {
  for (const frame of [1 / 60, 1 / 20]) {
    const game = startGame("minigolf");
    let expectedScore = 0;
    routes.forEach((route, hole) => {
      assert.ok(text(game).includes("HUL " + (hole + 1) + "/12"));
      for (const [x, y] of route) puttTo(game, { x, y }, frame);
      assert.ok(text(game).includes(route.length + " SLAG"), "hole " + (hole + 1) + " must be sunk");
      expectedScore += route.length;
      game.advance(1.5, frame);
    });
    assert.equal(game.result.score, expectedScore);
    assert.equal(game.finishes, 1);
  }
});

test("water adds one penalty and restores the previous putting position", () => {
  const game = startGame("minigolf");
  for (const route of routes.slice(0, 4)) {
    for (const [x, y] of route) puttTo(game, { x, y });
    game.advance(1.5);
  }
  puttTo(game, { x: 160, y: 200 });
  const origin = ball(game);
  aimAt(game, { x: 560, y: 200 });
  game.held.add("Space");
  game.advance(1);
  game.held.delete("Space");
  game.tick();
  for (let i = 0; i < 60 && !text(game).includes("VAND!"); i++) game.tick();
  assert.ok(text(game).includes("VAND!"));
  game.advance(1);
  assert.deepEqual(ball(game), origin);
  assert.ok(text(game).includes("SLAG 3"));
});

test("a quick minigolf tap allows a putt shorter than ten pixels", () => {
  const game = startGame("minigolf");
  const origin = ball(game);
  game.held.add("Space");
  game.tick();
  game.held.delete("Space");
  game.tick();
  game.advance(1);
  const end = ball(game);
  assert.ok(end.x > origin.x && end.x < origin.x + 10);
  assert.ok(text(game).includes("KRAFT"));
});

test("minigolf strength grows exponentially with charge at 60 and 20 fps", () => {
  for (const frame of [1 / 60, 1 / 20]) {
    const distances = [0.25, 0.5, 0.75, 1].map((charge) => {
      const game = startGame("minigolf");
      game.held.add("Space");
      game.advance(charge / 1.15, frame);
      game.held.delete("Space");
      game.tick(frame);
      const origin = ball(game);
      game.tick(frame);
      return ball(game).x - origin.x;
    });
    assert.ok(distances[0] > 0);
    for (let i = 1; i < distances.length; i++) {
      assert.ok(distances[i] > distances[i - 1] * 2,
        "each extra quarter of charge should more than double the launch strength");
    }
  }
});

test("65% strength reaches the first cup at 60 and 20 fps", () => {
  for (const frame of [1 / 60, 1 / 20]) {
    const game = startGame("minigolf");
    game.held.add("Space");
    const charge = Math.log1p(0.65 * Math.expm1(3)) / 3;
    game.advance(charge / 1.15, frame);
    assert.ok(text(game).includes("65%"));
    game.held.delete("Space");
    game.tick(frame);
    let sunk = false;
    for (let i = 0; i < 3 / frame; i++) {
      game.tick(frame);
      if (text(game).includes("HOLE IN ONE!")) {
        sunk = true;
        assert.deepEqual(ball(game), { x: 540, y: 200 });
        break;
      }
    }
    assert.ok(sunk, "65% strength must cover the 460-pixel fairway in one shot");
  }
});

test("100% strength overshoots the opening cup and rolls over 900 pixels", () => {
  for (const frame of [1 / 60, 1 / 20]) {
    const game = startGame("minigolf");
    game.held.add("Space");
    game.advance(1, frame);
    game.held.delete("Space");
    game.tick(frame);
    let previous = ball(game), distance = 0;
    for (let i = 0; i < 7 / frame; i++) {
      game.tick(frame);
      const position = ball(game);
      distance += Math.hypot(position.x - previous.x, position.y - previous.y);
      previous = position;
      assert.ok(!text(game).includes("HOLE IN ONE!"));
      if (text(game).includes("KRAFT")) break;
    }
    assert.ok(distance > 900, "full strength must carry across the fairway and back");
    assert.ok(text(game).includes("HUL 1/12"));
  }
});

test("full-power minigolf shots bounce off walls at 20 fps", () => {
  const game = startGame("minigolf");
  aimAt(game, { x: 80, y: 0 });
  game.held.add("Space");
  game.advance(1, 0.05);
  game.held.delete("Space");
  game.tick(0.05);
  let bounced = false, previousY = ball(game).y;
  for (let i = 0; i < 80; i++) {
    game.tick(0.05);
    const position = ball(game);
    assert.ok(position.y >= 140 && position.y <= 260, "ball must remain inside the lane");
    if (position.y > previousY) bounced = true;
    previousY = position.y;
  }
  assert.ok(bounced);
});

test("minigolf advances after eight strokes and finishes the whole game", () => {
  const game = startGame("minigolf");
  for (let hole = 0; hole < 12; hole++) {
    for (let shot = 0; shot < 8; shot++) {
      game.held.add("Space");
      game.tick();
      game.held.delete("Space");
      game.tick();
      game.advance(0.6);
    }
    assert.ok(text(game).includes("MAX SLAG"));
    game.advance(1.5);
  }
  assert.equal(game.result.score, 96);
  assert.equal(game.finishes, 1);
});

function hold(game, key, seconds, frame = 1 / 60) {
  game.held.add(key); game.advance(seconds, frame); game.held.delete(key);
}
function shootHoops(game, power, round, frame = 1 / 60) {
  hold(game, "Space", power / [.85, 1, 1.15][round], frame);
  game.tick(frame); game.advance(3, frame);
}
function hoopsPower(game) {
  // Ballistic speed needed to arrive at the centre of the rim, descending.
  const elevation = Math.PI * .27;
  const speed = Math.sqrt(600 * 380 * 380 / (2 * Math.cos(elevation) ** 2 * (90 + Math.tan(elevation) * 380 - 170)));
  return (speed - 360) / 300;
}
function aimHoops(game, from = .08) {
  hold(game, from > 0 ? "Left" : "Right", Math.abs(from) / .5);
}

test("hoops has three rounds of two throws, with six earned baskets at 60 and 20 fps", () => {
  for (const frame of [1 / 60, 1 / 20]) {
    const game = startGame("freethrows");
    for (let round = 0; round < 3; round++) {
      aimHoops(game);
      for (let shot = 0; shot < 2; shot++) {
        assert.ok(text(game).includes("RUNDE " + (round + 1) + "/3 · KAST " + (shot + 1) + "/2"));
        assert.ok(text(game).includes("MIDTEN"));
        const release = game.render().find(item => item.name === "translate");
        assert.equal(release.args[0], 320, "every ball must start in the centre");
        shootHoops(game, hoopsPower(game), round, frame);
        if (round < 2 || shot < 1) assert.equal(game.result, undefined);
      }
    }
    assert.equal(game.result.score, 6);
    assert.match(game.result.detail, /3 RUNDER × 2 KAST/);
    assert.equal(game.finishes, 1);
  }
});

test("hoops requires both correct aim and power, and full power overshoots", () => {
  const game = startGame("freethrows");
  shootHoops(game, hoopsPower(game), 0); // Correct height, wrong direction.
  aimHoops(game); shootHoops(game, 1, 0);
  aimHoops(game); shootHoops(game, .01, 1); shootHoops(game, 1, 1);
  aimHoops(game); shootHoops(game, .01, 2); shootHoops(game, 1, 2);
  assert.equal(game.result.score, 0);
});

test("basketball aim and power markings appear only for one second after each of the six releases", () => {
  for (const frame of [1 / 60, 1 / 20]) {
    const game = startGame("freethrows");
    const zones = () => game.render().filter(item => item.name === "rect" && item.args[1] === 350 && item.args[4] === game.pal.green);
    const crosshair = () => game.render().some(item => item.name === "line" && item.args[4] === game.pal.yellow && Math.abs(item.args[1] - 117.26) < .01);
    for (let shot = 0; shot < 6; shot++) {
      if (shot % 2 === 0) aimHoops(game);
      assert.equal(zones().length, 0); assert.equal(crosshair(), false);
      hold(game, "Space", hoopsPower(game) / [.85, 1, 1.15][Math.floor(shot / 2)], frame);
      assert.equal(zones().length, 0, "charging cannot reveal the target power");
      game.tick(frame);
      assert.equal(zones().length, 2); assert.equal(crosshair(), true);
      game.advance(.95, frame); assert.equal(zones().length, 2);
      game.advance(.06, frame); assert.equal(zones().length, 0); assert.equal(crosshair(), false);
      game.advance(2, frame);
    }
    assert.equal(game.result.score, 6);
  }
});

const discTargets = [{ x: 260, y: 268 }, { x: 400, y: 194 }, { x: 550, y: 105 }];
function aimedFrisbee(game, shot, bank = 0, compensate = true, frame = 1 / 60) {
  const target = discTargets[Math.floor(shot / 3)];
  if (bank) hold(game, bank > 0 ? "Up" : "Down", Math.abs(bank) / 35, frame);
  const solution = game.physics.discSolution(target, bank, game.physics.WINDS[shot]);
  const initial = Math.atan2(target.y - 296, target.x - 80) + (shot % 2 ? -.09 : .09);
  const desired = compensate ? solution.aim : Math.atan2(target.y - 296, target.x - 80);
  hold(game, desired < initial ? "Left" : "Right", Math.abs(desired - initial) / .8, frame);
  hold(game, "Space", solution.power / .85, frame);
  game.tick(frame);
  return solution;
}

test("frisbee awards 1, 3 and 5 for three hits per range with wind and bank at 60 and 20 fps", () => {
  for (const frame of [1 / 60, 1 / 20]) {
    const game = startGame("frisbee");
    for (let shot = 0; shot < 9; shot++) {
      assert.ok(text(game).includes(["KORT", "MELLEM", "LANG"][Math.floor(shot / 3)] + " · KAST " + (shot % 3 + 1) + "/3"));
      aimedFrisbee(game, shot, [20, -15, 0][shot % 3], true, frame);
      game.advance(3, frame);
      if (shot < 8) assert.equal(game.result, undefined);
    }
    assert.equal(game.result.score, 27);
    assert.match(game.result.detail, /9 KAST · 9 TRÆF/);
    assert.equal(game.finishes, 1);
  }
});

test("frisbee sweet spot is hidden before release, visible for one second, then hidden again", () => {
  const game = startGame("frisbee");
  const guidance = () => game.render().some(item => item.name === "rect" && item.args[1] === 373 && item.args[4] === game.pal.green);
  assert.equal(guidance(), false);
  aimedFrisbee(game, 0);
  assert.equal(guidance(), true);
  game.advance(.95); assert.equal(guidance(), true);
  game.advance(.06); assert.equal(guidance(), false);
  game.advance(2); assert.equal(guidance(), false);
  assert.ok(text(game).includes("KORT · KAST 2/3"));
});

test("frisbee wind and bank change the landing; aiming at the target without compensation misses", () => {
  const game = startGame("frisbee");
  for (let shot = 0; shot < 9; shot++) { aimedFrisbee(game, shot, 30, false); game.advance(3); }
  assert.ok(game.result.score < 27);
  const p = game.physics, straight = p.discFlight(-.4, 0, .8, { x: 0, y: 0 }).landing;
  const windy = p.discFlight(-.4, 0, .8, { x: 0, y: 30 }).landing;
  const curved = p.discFlight(-.4, 30, .8, { x: 0, y: 0 }).landing;
  assert.ok(windy.y - straight.y > 20);
  assert.ok(Math.hypot(curved.x - straight.x, curved.y - straight.y) > 30);
});

function chooseStone(game, id, from) {
  const delta = (id - from + 15) % 15;
  for (let i = 0; i < delta; i++) { hold(game, "Right", 1 / 60); game.tick(); }
  hold(game, "Space", 1 / 60); game.tick();
}

test("stone selection requires three distinct stones and plays each exactly once", () => {
  const game = startGame("stones");
  assert.ok(text(game).includes("FIND DINE TRE STEN"));
  chooseStone(game, 0, 0); chooseStone(game, 0, 0);
  assert.ok(text(game).includes("VALGT 1/3 · PILE VÆLGER · SPACE BEKRÆFTER"));
  chooseStone(game, 9, 0); chooseStone(game, 5, 9);
  const expected = [0, 9, 5].map(id => game.physics.skipStone(game.physics.STONES[id], 20, .85).hops);
  for (let shot = 0; shot < 3; shot++) {
    assert.ok(text(game).some(label => label.startsWith("KAST " + (shot + 1) + "/3")));
    hold(game, "Right", 10 / 22); hold(game, "Space", .85); game.tick(); game.advance(10);
    if (shot < 2) assert.equal(game.result, undefined);
  }
  assert.equal(game.result.score, Math.max(...expected));
  assert.match(game.result.detail, new RegExp(expected.join(" / ")));
  assert.equal(game.finishes, 1);
});

test("stone skips depend on physical stone properties, angle and power without random scores", () => {
  const game = startGame("stones"), p = game.physics;
  const flat = p.STONES[0], rounded = p.STONES[9];
  assert.equal(p.STONES.length, 15);
  assert.ok(p.skipStone(flat, 20, .85).hops > p.skipStone(rounded, 20, .85).hops);
  assert.ok(p.skipStone(flat, 20, .85).hops > p.skipStone(flat, 5, .85).hops);
  assert.ok(p.skipStone(flat, 20, .85).hops > p.skipStone(flat, 20, .1).hops);
  const first = p.skipStone(flat, 20, .85), repeat = p.skipStone(flat, 20, .85);
  assert.equal(JSON.stringify(first), JSON.stringify(repeat));
  assert.ok(first.splashes.every((s, i) => s.hops === i + 1));
  assert.ok(first.path.every(point => Number.isFinite(point.x) && Number.isFinite(point.z)));
});

test("Bob draws a real board, accepts an opening shot and can finish as a conceded game", () => {
  const game = startGame("bob");
  assert.ok(text(game).includes("BOBSPIL"));
  assert.ok(text(game).includes("DU ER GUL"));
  hold(game, "Space", .85); game.tick(); game.advance(12);
  assert.ok(text(game).includes("DIN TUR"));
  hold(game, "F", 1 / 60); game.tick();
  assert.ok(text(game).includes("AFSLUT SOM TABT SPIL?"));
  hold(game, "Enter", 1 / 60);
  assert.ok(game.result.score >= -15 && game.result.score <= 15);
  assert.match(game.result.detail, /RØD VANDT/);
  assert.equal(game.finishes, 1);
});

function bocciaPosition(game) {
  const shadow = game.render().find(item => item.name === "circle" && item.args[2] === 9 && item.args[3] === "#997b48");
  return shadow ? { x: shadow.args[0], y: shadow.args[1] - 3 } : null;
}
function bocciaThrow(game, strength, elevation = 15, frame = 1 / 60) {
  hold(game, elevation < 15 ? "Down" : "Up", Math.abs(elevation - 15) * Math.PI / 180 / .6, frame);
  const charge = Math.log1p(strength * Math.expm1(3)) / 3;
  hold(game, "Space", charge / 1.15, frame); game.tick(frame);
}

test("boccia strength grows exponentially, and 100% travels over 900 pixels at 60 and 20 fps", () => {
  for (const frame of [1 / 60, 1 / 20]) {
    const launches = [.25, .5, .75, 1].map(charge => {
      const game = startGame("boccia");
      hold(game, "Space", charge / 1.15, frame); game.tick(frame);
      const from = bocciaPosition(game); game.tick(frame);
      const to = bocciaPosition(game);
      return Math.hypot(to.x - from.x, to.y - from.y);
    });
    for (let i = 1; i < launches.length; i++) assert.ok(launches[i] > launches[i - 1] * 2);
    const game = startGame("boccia");
    // Throw horizontally at the lowest elevation, tracking the entire rolling path.
    hold(game, "Right", Math.abs(Math.atan2(-116, 400)) / 1.4, frame);
    bocciaThrow(game, 1, 5, frame);
    let previous = bocciaPosition(game), distance = 0;
    for (let i = 0; i < 10 / frame; i++) {
      game.tick(frame); const point = bocciaPosition(game);
      if (!point) break;
      distance += Math.hypot(point.x - previous.x, point.y - previous.y); previous = point;
      assert.ok(point.x >= 28 && point.x <= 612 && point.y >= 48 && point.y <= 317);
    }
    assert.ok(distance > 900, "full power must travel across the court and roll back");
  }
});

test("boccia elevation changes the actual flight height, landing distance and rolling distance", () => {
  const { bocciaLaunch, bocciaStep } = startGame("boccia").physics;
  const charge = Math.log1p(.55 * Math.expm1(3)) / 3;
  const simulate = degrees => {
    const ball = bocciaLaunch(0, 0, 0, degrees * Math.PI / 180, charge);
    let peak = 0, landing = null;
    for (let i = 0; i < 1200; i++) {
      bocciaStep(ball, 1 / 120); peak = Math.max(peak, ball.height);
      if (landing === null && ball.height === 0) landing = ball.x;
      if (ball.height === 0 && ball.vx === 0) return { peak, landing, stop: ball.x };
    }
    assert.fail("boccia throw must settle");
  };
  const low = simulate(5), high = simulate(55);
  assert.ok(high.peak > low.peak * 10);
  assert.ok(high.landing > low.landing * 2.5);
  assert.ok(low.stop - low.landing > (high.stop - high.landing) * 2);
  const game = startGame("boccia");
  hold(game, "Up", 10); assert.ok(text(game).includes("KASTEVINKEL ↑/↓ 55°"));
  hold(game, "Down", 10); assert.ok(text(game).includes("KASTEVINKEL ↑/↓ 5°"));
});

test("boccia completes four adjustable throws and reports the sum of their final distances", () => {
  const totals = [];
  for (const frame of [1 / 60, 1 / 20]) {
    const game = startGame("boccia");
    const strengths = [.35, .55, .8, 1], elevations = [5, 25, 45, 55];
    const distances = [];
    for (let shot = 0; shot < 4; shot++) {
      assert.ok(text(game).includes("KUGLE " + (shot + 1) + "/4"));
      bocciaThrow(game, strengths[shot], elevations[shot], frame);
      for (let i = 0; i < 12 / frame; i++) {
        game.tick(frame);
        const result = text(game).find(label => /^\d+ PX$/.test(label));
        if (result) { distances.push(Number.parseInt(result, 10)); break; }
      }
      assert.equal(distances.length, shot + 1, "each throw must settle and show its distance");
      game.advance(1.1, frame);
      if (shot < 3) assert.equal(game.result, undefined);
    }
    assert.equal(game.finishes, 1);
    assert.match(game.result.detail, /4 KUGLER · SUM/);
    assert.ok(Math.abs(game.result.score - distances.reduce((a, b) => a + b, 0)) <= 2);
    assert.ok(game.result.score >= 0 && game.result.score <= 3200);
    totals.push(game.result.score);
  }
  assert.ok(Math.abs(totals[0] - totals[1]) <= 2, "scores must stay consistent at different frame rates");
});

function swimRhythm(game, cadence, frame, limit = 40) {
  let left = true, elapsed = 0;
  while (!game.result && elapsed < limit) {
    const key = left ? "Left" : "Right";
    game.held.add(key); game.tick(frame);
    game.held.delete(key); game.advance(cadence - frame, frame);
    left = !left; elapsed += cadence;
  }
}

test("water takes 20–30 seconds with fast and moderate alternating rhythms at 60 and 20 fps", () => {
  for (const cadence of [.125, .25, .5]) {
    const scores = [];
    for (const frame of [1 / 60, 1 / 20]) {
      const game = startGame("water");
      swimRhythm(game, cadence, frame);
      assert.ok(game.result, "a sustained alternating rhythm must finish");
      assert.ok(game.result.score >= 20 && game.result.score <= 30, "cadence " + cadence + ": " + game.result.score);
      assert.match(game.result.detail, /SEK · 200 M/);
      assert.ok(text(game).includes("200M"));
      assert.equal(game.finishes, 1);
      scores.push(game.result.score);
    }
    assert.ok(Math.abs(scores[0] - scores[1]) < .25, "race time must stay consistent across frame rates");
  }
});

test("water waits for the first stroke and holding or repeating one key cannot propel the full race", () => {
  const game = startGame("water");
  game.advance(30);
  assert.ok(text(game).includes("0.00 S"));
  assert.ok(text(game).includes("0.0 M"));
  hold(game, "Left", 30); game.tick();
  for (let stroke = 0; stroke < 100; stroke++) { hold(game, "Left", 1 / 60); game.tick(); }
  assert.equal(game.result, undefined);
  const progress = Number.parseFloat(text(game).find(label => /^\d+\.\d M$/.test(label)));
  assert.ok(progress < 1, "the same hand cannot repeatedly build speed");
  swimRhythm(game, .25, 1 / 60);
  assert.ok(game.result, "alternating again must still complete the race");
  assert.ok(game.result.score > 30, "the race clock includes pauses after the start");
});

test("even the fastest possible water inputs cannot finish before the new distance allows", () => {
  for (const frame of [1 / 60, 1 / 20]) {
    const game = startGame("water");
    swimRhythm(game, frame * 2, frame);
    assert.ok(game.result.score >= 200 / 8.5);
    assert.ok(game.result.score <= 30);
  }
});
