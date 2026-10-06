const assert = require('node:assert/strict');
const { test } = require('node:test');
const vm = require('node:vm');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const context = vm.createContext({ window: {} });
vm.runInContext(readFileSync(join(__dirname, '../js/bob-physics.js'), 'utf8'), context);
const B = context.window.BobPhysics;
const ring = (id, color, x, y) => ({ id, color, x, y, r: B.RING_R, mass: 1, vx: 0, vy: 0 });
const finish = shot => { while (!shot.settled && shot.elapsed < 15) B.step(shot, 1 / 60); assert.ok(shot.settled); return shot; };

test('Bob starts with fifteen rings per colour, without overlaps or invalid striker placement', () => {
  const rings = B.rack();
  assert.equal(rings.filter(r => r.color === 'yellow').length, 15);
  assert.equal(rings.filter(r => r.color === 'red').length, 15);
  assert.ok(rings.every((r, i) => rings.slice(i + 1).every(other => Math.hypot(r.x - other.x, r.y - other.y) >= r.r + other.r)));
  assert.equal(B.startShot([ring(0, 'yellow', 160, 289)], 'bottom', 160, -Math.PI / 2, .5), null);
});

test('ring collisions pocket a ring identically at 60 and 20 fps', () => {
  for (const dt of [1 / 60, 1 / 20]) {
    const target = ring(0, 'yellow', 100, 100);
    const s = B.striker('bottom', 160), pocket = { x: 12, y: 12 };
    const dx = target.x - pocket.x, dy = target.y - pocket.y, length = Math.hypot(dx, dy);
    const ghost = { x: target.x + dx / length * (s.r + target.r), y: target.y + dy / length * (s.r + target.r) };
    const shot = B.startShot([target], 'bottom', 160, Math.atan2(ghost.y - s.y, ghost.x - s.x), .75);
    while (!shot.settled && shot.elapsed < 15) B.step(shot, dt);
    assert.ok(shot.settled);
    assert.equal(shot.pocketed.length, 1);
    assert.equal(shot.pocketed[0].id, 0);
    assert.ok(!shot.strikerPocketed);
  }
});

test('own rings grant extra turns, opposing rings pass the turn and striker fouls return one own ring', () => {
  const own = ring(0, 'yellow', 12, 12), other = ring(1, 'red', 12, 12);
  const make = (pocketed, strikerPocketed = false) => ({ bodies: [], pocketed, strikerPocketed });
  const empty = () => ({ yellow: [], red: [] });
  assert.equal(B.applyRules(make([own]), 'yellow', empty()).extraTurn, true);
  assert.equal(B.applyRules(make([other]), 'yellow', empty()).extraTurn, false);
  assert.equal(B.applyRules(make([own, other]), 'yellow', empty()).extraTurn, false);
  const stored = { yellow: [own], red: [] };
  const result = B.applyRules({ bodies: [ring(2, 'red', 160, 160)], pocketed: [], strikerPocketed: true }, 'yellow', stored);
  assert.equal(result.returned, true); assert.equal(result.extraTurn, false);
  assert.equal(stored.yellow.length, 0);
  const restored = result.rings.find(r => r.color === 'yellow');
  assert.ok(Math.hypot(restored.x - 160, restored.y - 160) > 13);
});

test('all four Bob corner pockets accept rings and cushion rebounds retain rings on the board', () => {
  for (const [x, y] of B.POCKETS) {
    const shot = { bodies: [ring(0, 'yellow', x, y)], pocketed: [], strikerPocketed: false, elapsed: 0 };
    B.step(shot, 1 / 60); assert.equal(shot.pocketed.length, 1);
  }
  const target = ring(0, 'yellow', 160, 9); target.vy = -200;
  const shot = finish({ bodies: [target], pocketed: [], strikerPocketed: false, elapsed: 0 });
  assert.equal(shot.pocketed.length, 0);
  assert.ok(shot.bodies[0].y >= B.RING_R && shot.bodies[0].y <= B.SIZE - B.RING_R);
});

test('AI chooses a real shot that pockets its ring without awarding synthetic points', () => {
  const rings = [ring(0, 'red', 100, 100), ring(1, 'yellow', 220, 180)];
  const spec = B.chooseShot(rings, 'red', ['top', 'right'], 1, 'expert');
  const shot = finish(B.startShot(rings, spec.side, spec.position, spec.angle, spec.power));
  assert.ok(shot.pocketed.some(r => r.color === 'red'));
  assert.equal(shot.pocketed.some(r => r.color === 'yellow'), false);
});

test('yellow clearing its rings gives red one final shot, and red clearing first wins', () => {
  const stored = (yellow, red) => ({ yellow: Array(yellow), red: Array(red) });
  let outcome = B.winnerAfterShot(stored(15, 14), 'yellow', false);
  assert.equal(outcome.winner, null); assert.equal(outcome.lastRedShot, true);
  outcome = B.winnerAfterShot(stored(15, 14), 'red', true);
  assert.equal(outcome.winner, 'yellow');
  assert.equal(B.winnerAfterShot(stored(15, 15), 'red', true).winner, 'draw');
  assert.equal(B.winnerAfterShot(stored(14, 15), 'red', false).winner, 'red');
});

test('casual Bob AI makes real mistakes while expert consistently pots straightforward shots', () => {
  let casualHits = 0, expertHits = 0, trials = 0;
  for (const x of [65, 160, 255]) for (const y of [65, 160, 255]) {
    const rings = [ring(0, 'red', x, y)];
    const expert = B.chooseShot(rings, 'red', ['top', 'right'], 0, 'expert');
    const expertMade = finish(B.startShot(rings, expert.side, expert.position, expert.angle, expert.power)).pocketed.length > 0;
    for (let turn = 0; turn < 20; turn++) {
      const spec = B.chooseShot(rings, 'red', ['top', 'right'], turn);
      const shot = finish(B.startShot(rings, spec.side, spec.position, spec.angle, spec.power));
      if (shot.pocketed.some(r => r.color === 'red')) casualHits++;
      if (expertMade) expertHits++;
      trials++;
    }
  }
  assert.equal(expertHits, trials);
  assert.ok(casualHits > trials * .25 && casualHits < trials * .7,
    'casual AI should win some shots and miss many of the same straightforward shots');
});

test('casual AI execution is reproducible, legal and varies its aim and power across turns', () => {
  const rings = [ring(0, 'red', 100, 100), ring(1, 'yellow', 220, 180)];
  const before = JSON.stringify(rings), specs = [];
  for (let turn = 0; turn < 20; turn++) {
    const spec = B.chooseShot(rings, 'red', ['top', 'right'], turn);
    assert.equal(JSON.stringify(spec), JSON.stringify(B.chooseShot(rings, 'red', ['top', 'right'], turn)));
    assert.ok(spec.power >= .05 && spec.power <= 1);
    assert.ok(B.canPlace(rings, B.striker(spec.side, spec.position)));
    const inward = spec.side === 'top' ? Math.PI / 2 : Math.PI;
    assert.ok(Math.abs(Math.atan2(Math.sin(spec.angle - inward), Math.cos(spec.angle - inward))) <= 1.4 + 1e-9);
    specs.push(spec);
  }
  assert.ok(new Set(specs.map(s => s.angle)).size > 10);
  assert.ok(new Set(specs.map(s => s.power)).size > 10);
  assert.equal(JSON.stringify(rings), before, 'planning must not mutate the board');
});
