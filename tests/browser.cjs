const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { join } = require('node:path');
const { mkdirSync } = require('node:fs');
const root = join(__dirname, '..');
mkdirSync(join(root, 'output/playwright'), { recursive: true });
const firstScores = { minigolf: 24, freethrows: 4, stones: 12, water: 24.1234, frisbee: 27, boccia: 200, bob: 35 };
const secondScores = { minigolf: 40, freethrows: 5, stones: 8, water: 26.4, frisbee: 20, boccia: 400, bob: -5 };
const thirdScores = { minigolf: 30, freethrows: 3, stones: 9, water: 29, frisbee: 15, boccia: 500, bob: 0 };
const click = (page, action) => page.locator('.screen.active [data-action="' + action + '"]').dispatchEvent('click');
async function fixtureGames(page, scores) {
  await page.evaluate(scores => {
    Events.all().forEach(event => {
      event.start = api => {
        queueMicrotask(() => api.finish(scores[event.id], 'Browser flow fixture'));
        return { dispose() {} };
      };
    });
  }, scores);
}
async function completeSolo(page, name, tournament, scores, resume = false) {
  await click(page, 'solo-setup');
  await page.locator('#solo-name').fill(name);
  await page.locator('#solo-tournament').fill(tournament);
  await page.locator('#solo-form').evaluate(form => form.requestSubmit());
  await fixtureGames(page, scores);
  for (let event = 0; event < 7; event++) {
    assert.match(await page.locator('#intro-kicker').textContent(), new RegExp('DISCIPLIN ' + (event + 1) + ' / 7'));
    await click(page, 'begin-event');
    await click(page, 'start-turn');
    await page.waitForFunction(() => !document.querySelector('#game-done-overlay').classList.contains('hidden'));
    assert.equal(await page.locator('#play-round').textContent(), 'MIT SPIL');
    if (resume && event === 0) {
      const savedRun = await page.evaluate(() => localStorage.getItem('ol2026.solo.v1'));
      const normalUrl = page.url();
      const testUrl = new URL(normalUrl);
      testUrl.searchParams.set('test', 'true');
      await page.goto(testUrl.href);
      await fixtureGames(page, scores);
      await click(page, 'open-practice');
      for (const id of Object.keys(scores)) {
        await page.locator('#practice-games [data-event-id="' + id + '"]').dispatchEvent('click');
        await page.waitForFunction(() => !document.querySelector('#game-done-overlay').classList.contains('hidden'));
        assert.equal(await page.locator('#play-round').textContent(), 'ØVELSE');
        assert.equal(await page.locator('[data-action="continue-game"]').isVisible(), false);
        await click(page, 'practice-choose-result');
        assert.equal(await page.evaluate(() => localStorage.getItem('ol2026.solo.v1')), savedRun,
          'practice must preserve the entire unfinished tournament save');
      }
      await click(page, 'to-title');
      await page.goto(normalUrl);
      assert.equal(await page.locator('#practice-entry').isVisible(), false);
      await click(page, 'resume-solo');
      await fixtureGames(page, scores);
    } else {
      await click(page, 'continue-game');
    }
  }
  await page.waitForFunction(() => document.querySelector('#result-code').value.length > 0);
  assert.equal(await page.locator('#screen-share').getAttribute('class'), 'screen active');
  const token = await page.locator('#result-code').inputValue();
  const payload = await page.evaluate(token => ResultCodes.verifyToken(token), token);
  assert.equal(payload.name, name.toUpperCase());
  assert.deepEqual(payload.scores, scores);
  assert.equal(await page.locator('#solo-results-table tr').count(), 8);
  return token;
}
async function importCodes(page, tokens) {
  await page.locator('#import-codes').fill(tokens.join('\n'));
  await page.locator('#collect-form').evaluate(form => form.requestSubmit());
  await page.waitForFunction(() => !document.querySelector('#import-results').disabled);
}
(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}) });
  try {
    const firstContext = await browser.newContext({viewport: {width: 1050, height: 850}});
    const page = await firstContext.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await checkPractice(browser, errors);
    await page.goto('file://' + root + '/index.html');
    await page.screenshot({path: root + '/output/playwright/async-title.png'});
    await click(page, 'solo-setup');
    await page.screenshot({path: root + '/output/playwright/async-setup.png'});
    await click(page, 'to-title');
    const first = await completeSolo(page, 'ÅSE', 'ASYNC-TEST', firstScores, true);
    await page.screenshot({path: root + '/output/playwright/async-shared-result.png'});
    await page.reload();
    await click(page, 'resume-solo');
    await page.waitForFunction(() => document.querySelector('#result-code').value.length > 0);
    assert.equal(await page.locator('#result-code').inputValue(), first, 'refresh must preserve the exact shared code');
    const download = page.waitForEvent('download');
    await click(page, 'download-result');
    assert.match((await download).suggestedFilename(), /ASYNC-TEST-resultat.txt/);
    const secondContext = await browser.newContext({viewport: {width: 1050, height: 850}});
    const secondPage = await secondContext.newPage();
    secondPage.on('pageerror', error => errors.push(error.message));
    await secondPage.goto('file://' + root + '/index.html');
    const second = await completeSolo(secondPage, 'BO', 'ASYNC-TEST', secondScores);
    await click(page, 'open-collector');
    await click(page, 'add-own-result');
    await page.waitForFunction(() => document.querySelectorAll('#collected-players li').length === 1);
    await importCodes(page, [second, first]);
    assert.equal(await page.locator('#collected-players li').count(), 2, 'duplicate codes must not add a third player');
    await page.screenshot({path: root + '/output/playwright/async-collected.png'});
    await click(page, 'show-collected');
    const standings = await page.locator('#final-table tr').allTextContents();
    assert.match(standings[1], /ÅSE13/);
    assert.match(standings[2], /BO8/);
    await page.screenshot({path: root + '/output/playwright/async-standings.png'});
    await click(page, 'open-collector');
    const parts = second.split('.');
    const badPayload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    badPayload.scores.frisbee = 27;
    const tampered = parts[0] + '.' + Buffer.from(JSON.stringify(badPayload)).toString('base64url') + '.' + parts[2];
    await importCodes(page, [tampered]);
    assert.equal(await page.locator('#collected-players li').count(), 2);
    assert.match(await page.locator('#collect-status').textContent(), /SIGNATUR/);
    const wrongTournament = await secondPage.evaluate(async scores => {
      const run = ResultCodes.createRun('CAMILLA', 'WRONG'); run.scores = scores;
      return ResultCodes.signRun(run);
    }, thirdScores);
    await importCodes(page, [wrongTournament]);
    assert.equal(await page.locator('#collected-players li').count(), 2);
    assert.match(await page.locator('#collect-status').textContent(), /FORSKELLIGE TURNERINGER/);
    await page.reload();
    await click(page, 'open-collector');
    await page.waitForFunction(() => document.querySelectorAll('#collected-players li').length === 2);
    const third = await secondPage.evaluate(async scores => {
      const run = ResultCodes.createRun('<IMG SRC=X>', 'ASYNC-TEST'); run.scores = scores;
      return ResultCodes.signRun(run);
    }, thirdScores);
    await importCodes(page, [third]);
    assert.equal(await page.locator('#collected-players li').count(), 3);
    await click(page, 'show-collected');
    assert.equal(await page.locator('#final-table img').count(), 0, 'imported names must be treated as text');
    await click(page, 'open-collector');
    await page.locator('#collected-players li').last().locator('button').dispatchEvent('click');
    await page.waitForFunction(() => document.querySelectorAll('#collected-players li').length === 2);
    await page.setViewportSize({width: 430, height: 700});
    await page.screenshot({path: root + '/output/playwright/async-mobile-collector.png'});
    await click(page, 'to-title');
    assert.equal(await page.locator('[data-action="new-game"]').count(), 0);
    assert.equal(await page.locator('#screen-players').count(), 0);
    assert.equal(await page.locator('#screen-results').count(), 0);
    await playRealGames(browser, errors);
    assert.deepEqual(errors, []);
    console.log('Browser checks passed: practice is available only with ?test=true, all seven games launch directly in practice, mid-game restart/switch, practice result/replay, stale callback rejection, keyboard and mobile navigation, saved tournament isolation, independent seven-event runs, resume after reload, portable signed codes, downloads, cross-browser imports, duplicate/tamper/tournament rejection, saved collector, safe names, removal, single-player presentation, and genuine hoops/stone/water/frisbee/boccia/Bob keyboard gameplay.');
  } finally {
    await browser.close();
  }
})().catch(error => {console.error(error); process.exitCode = 1;});

async function checkPractice(browser, errors) {
  const context = await browser.newContext({ viewport: { width: 1050, height: 850 } });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    window.__practiceDraws = 0;
    const draw = CanvasRenderingContext2D.prototype.fillRect;
    CanvasRenderingContext2D.prototype.fillRect = function (...args) {
      window.__practiceDraws += 1;
      return draw.apply(this, args);
    };
  });
  const baseUrl = 'file://' + root + '/index.html';
  for (const suffix of ['', '?test=false', '?test=', '?test=1', '#test=true']) {
    await page.goto(baseUrl + suffix);
    assert.equal(await page.locator('#practice-entry').isVisible(), false, 'test menu must stay hidden for ' + (suffix || 'a normal URL'));
    assert.equal(await page.locator('#practice-games button').count(), 0);
    await click(page, 'open-practice');
    assert.equal(await page.locator('#screen-title').getAttribute('class'), 'screen active', 'hidden test entry must not open practice');
  }
  await page.goto(baseUrl + '?test=true');
  assert.equal(await page.locator('#practice-entry').isVisible(), true);
  await click(page, 'open-practice');
  assert.equal(await page.locator('#practice-games button').count(), 7);
  await page.screenshot({ path: root + '/output/playwright/practice-menu.png' });
  for (const id of Object.keys(firstScores)) {
    const drawn = await page.evaluate(() => __practiceDraws);
    await page.locator('#practice-games [data-event-id="' + id + '"]').click();
    await page.waitForFunction(previous => __practiceDraws > previous, drawn);
    assert.equal(await page.locator('#screen-play').getAttribute('class'), 'screen active');
    assert.equal(await page.locator('#play-event').textContent(), await page.evaluate(id => Events.get(id).name, id));
    assert.equal(await page.locator('#turn-overlay').isVisible(), false, 'practice skips the ready screen');
    assert.equal(await page.locator('#game-done-overlay').isVisible(), false);
    assert.equal(await page.locator('#practice-controls').isVisible(), true);
    assert.ok((await page.locator('#game-hint').textContent()).trim().length > 0);
    if (id === 'freethrows') await page.screenshot({ path: root + '/output/playwright/practice-hoops.png' });
    await page.locator('[data-action="practice-replay"]').click();
    assert.equal(await page.locator('#play-event').textContent(), await page.evaluate(id => Events.get(id).name, id));
    await click(page, 'open-practice');
    assert.equal(await page.evaluate(id => document.activeElement.dataset.eventId === id, id), true);
    assert.equal(await page.evaluate(() => localStorage.getItem('ol2026.solo.v1')), null,
      'testing a game must not require or create a tournament');
  }

  // Delayed callbacks from a stopped game must not finish or alter its replacement.
  await page.evaluate(() => {
    window.__practiceAPIs = [];
    Events.get('freethrows').start = api => {
      const record = { api, disposed: 0 }; __practiceAPIs.push(record);
      return { dispose() { record.disposed += 1; } };
    };
  });
  await page.locator('#practice-games [data-event-id="freethrows"]').click();
  await click(page, 'practice-replay');
  await page.evaluate(() => {
    __practiceAPIs[0].api.finish(-100, 'stale invalid score');
    __practiceAPIs[0].api.setHint('STALE HINT');
  });
  assert.equal(await page.evaluate(() => __practiceAPIs[0].disposed), 1);
  assert.equal(await page.locator('#game-done-overlay').isVisible(), false);
  assert.notEqual(await page.locator('#game-hint').textContent(), 'STALE HINT');
  await page.evaluate(() => __practiceAPIs[1].api.finish(6, 'Practice fixture'));
  assert.equal(await page.locator('#game-done-overlay').isVisible(), true);
  assert.equal(await page.locator('#done-result').textContent(), '6 TRÆF');
  assert.equal(await page.evaluate(() => __practiceAPIs[1].disposed), 1);
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('#game-done-overlay').isVisible(), false, 'Enter replays a completed practice game');
  assert.equal(await page.evaluate(() => __practiceAPIs.length), 3);
  await page.evaluate(() => __practiceAPIs[2].api.finish(4, 'Practice fixture'));
  await page.locator('[data-action="practice-choose-result"]').focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('#screen-practice').getAttribute('class'), 'screen active', 'Enter on Choose Game must open the menu');
  assert.equal(await page.evaluate(() => localStorage.getItem('ol2026.solo.v1')), null);

  await page.setViewportSize({ width: 430, height: 700 });
  await page.screenshot({ path: root + '/output/playwright/practice-mobile-menu.png' });
  await page.locator('#practice-games [data-event-id="bob"]').click();
  const controls = await page.locator('#practice-controls').boundingBox();
  assert.ok(controls.x >= 0 && controls.x + controls.width <= 430 && controls.y >= 0 && controls.y + controls.height <= 700);
  await page.screenshot({ path: root + '/output/playwright/practice-mobile-bob.png' });
  await click(page, 'open-practice');
  await page.locator('#screen-practice [data-action="to-title"]').click();
  assert.equal(await page.locator('#screen-title').getAttribute('class'), 'screen active');

  // Starting a new tournament after practice must restore the normal turn controls.
  await click(page, 'solo-setup');
  await page.locator('#solo-name').fill('TEST');
  await page.locator('#solo-form').evaluate(form => form.requestSubmit());
  await click(page, 'begin-event');
  assert.equal(await page.locator('#turn-overlay').isVisible(), true);
  assert.equal(await page.locator('#practice-controls').isVisible(), false);
  assert.equal(await page.locator('#play-round').textContent(), 'MIT SPIL');
  await context.close();
}

async function playRealGames(browser, errors) {
  const context = await browser.newContext({ viewport: { width: 1050, height: 850 } });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    let callback, now = performance.now();
    // The game loop and manual frames must use the same monotonically increasing clock.
    Object.defineProperty(performance, 'now', { configurable: true, value: () => now });
    window.requestAnimationFrame = fn => { callback = fn; return 1; };
    window.__advance = seconds => {
      while (seconds > 1e-8) {
        const dt = Math.min(1 / 60, seconds); now += dt * 1000; seconds -= dt;
        const fn = callback; callback = null; window.__texts = []; window.__fills = [];
        if (fn) fn(now);
      }
    };
    const fillRect = CanvasRenderingContext2D.prototype.fillRect;
    CanvasRenderingContext2D.prototype.fillRect = function(x, y, w, h) {
      window.__fills = window.__fills || []; window.__fills.push({ x, y, w, h, color: this.fillStyle });
      return fillRect.call(this, x, y, w, h);
    };
    const fillText = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function(value, ...args) {
      window.__texts = window.__texts || []; window.__texts.push(value);
      return fillText.call(this, value, ...args);
    };
  });
  const advance = seconds => page.evaluate(s => window.__advance(s), seconds);
  const held = async (key, seconds) => { await page.keyboard.down(key); await advance(seconds); await page.keyboard.up(key); };
  const tap = async key => { await held(key, 1 / 60); await advance(1 / 60); };
  const screenshot = async name => page.screenshot({path: root + '/output/playwright/' + name + '.png'});
  await page.goto('file://' + root + '/index.html');
  await screenshot('single-player-title');
  await click(page, 'solo-setup');
  await page.locator('#solo-name').fill('TEST');
  await page.locator('#solo-form').evaluate(form => form.requestSubmit());
  await page.evaluate(() => {
    for (const id of ['minigolf']) {
      Events.get(id).start = api => { queueMicrotask(() => api.finish(24, 'Unchanged game flow fixture')); return {dispose() {}}; };
    }
  });
  const start = async id => {
    assert.equal(await page.locator('#intro-name').textContent(), await page.evaluate(id => Events.get(id).name, id));
    await click(page, 'begin-event'); await click(page, 'start-turn'); await advance(1 / 60);
  };
  const next = async () => {
    assert.equal(await page.locator('#game-done-overlay').getAttribute('class'), 'turn-overlay');
    await click(page, 'continue-game');
  };
  await start('minigolf'); await next(); await start('freethrows');
  const hoopGuides = () => page.evaluate(() => __fills.filter(r => r.y === 350 && r.color === '#6de66d').length);
  assert.equal(await hoopGuides(), 0);
  await screenshot('hoops-ready');
  const launchElevation = Math.PI * .27;
  const rimSpeed = Math.sqrt(600 * 380 ** 2 / (2 * Math.cos(launchElevation) ** 2 * (90 + Math.tan(launchElevation) * 380 - 170)));
  const hoopPower = (rimSpeed - 360) / 300;
  for (let round = 0; round < 3; round++) {
    await held('ArrowLeft', .08 / .5);
    for (let shot = 0; shot < 2; shot++) {
      assert.equal(await hoopGuides(), 0);
      assert.equal(await page.evaluate(() => __texts.includes('MIDTEN')), true);
      await held('Space', hoopPower / [.85, 1, 1.15][round]);
      assert.equal(await hoopGuides(), 0, 'charging must not reveal the ideal strength');
      await advance(1 / 60); assert.equal(await hoopGuides(), 2);
      if (!round && !shot) await screenshot('hoops-review');
      await advance(.95); assert.equal(await hoopGuides(), 2);
      await advance(.06); assert.equal(await hoopGuides(), 0);
      if (!round && !shot) await screenshot('hoops-flight');
      await advance(2);
    }
  }
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('ol2026.solo.v1')).scores.freethrows), 6);
  await screenshot('hoops-complete'); await next(); await start('stones');
  await screenshot('stones-selection');
  await tap('Space');
  for (let i = 0; i < 5; i++) await tap('ArrowRight'); await tap('Space');
  for (let i = 0; i < 4; i++) await tap('ArrowRight'); await tap('Space');
  await screenshot('stones-ready');
  for (let shot = 0; shot < 3; shot++) {
    await held('ArrowRight', 10 / 22); await held('Space', .85); await advance(1 / 60);
    if (!shot) { await advance(.8); await screenshot('stones-skipping'); }
    await advance(10);
  }
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('ol2026.solo.v1')).scores.stones), 17);
  await next(); await start('water');
  await advance(5);
  assert.equal(await page.evaluate(() => __texts.includes('0.00 S')), true);
  await screenshot('water-ready');
  for (let stroke = 0; stroke < 150; stroke++) {
    await held(stroke % 2 ? 'ArrowRight' : 'ArrowLeft', 1 / 60);
    await advance(.25 - 1 / 60);
    if (stroke === 40) await screenshot('water-progress');
    if (!(await page.locator('#game-done-overlay').getAttribute('class')).includes('hidden')) break;
  }
  const waterScore = await page.evaluate(() => JSON.parse(localStorage.getItem('ol2026.solo.v1')).scores.water);
  assert.ok(waterScore >= 200 / 8.5 && waterScore <= 30);
  assert.match(await page.locator('#done-detail').textContent(), /200 M/);
  await screenshot('water-complete');
  console.log('200m water race completed in ' + waterScore.toFixed(2) + ' seconds.');
  await next(); await start('frisbee');
  await screenshot('frisbee-ready');
  const targets = [{x:260,y:268},{x:400,y:194},{x:550,y:105}];
  for (let shot = 0; shot < 9; shot++) {
    assert.equal(await page.evaluate(() => __texts.some(t => t.startsWith('SWEET SPOT'))), false);
    const target = targets[Math.floor(shot / 3)], bank = [20, -15, 0][shot % 3];
    if (bank) await held(bank > 0 ? 'ArrowUp' : 'ArrowDown', Math.abs(bank) / 35);
    const solution = await page.evaluate(({target, bank, shot}) => GamePhysics.discSolution(target, bank, GamePhysics.WINDS[shot]), {target, bank, shot});
    const initial = Math.atan2(target.y - 296, target.x - 80) + (shot % 2 ? -.09 : .09);
    await held(solution.aim < initial ? 'ArrowLeft' : 'ArrowRight', Math.abs(solution.aim - initial) / .8);
    await held('Space', solution.power / .85); await advance(1 / 60);
    assert.equal(await page.evaluate(() => __texts.some(t => t.startsWith('SWEET SPOT'))), true);
    if (!shot) { await advance(.3); await screenshot('frisbee-review'); await advance(.75); await screenshot('frisbee-flight'); }
    await advance(3);
  }
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('ol2026.solo.v1')).scores.frisbee), 27);
  await next(); await start('boccia');
  await screenshot('boccia-ready');
  for (let shot = 0; shot < 4; shot++) {
    const degrees = [5, 25, 45, 55][shot], strength = [.35, .55, .8, 1][shot];
    await held(degrees < 15 ? 'ArrowDown' : 'ArrowUp', Math.abs(degrees - 15) * Math.PI / 180 / .6);
    assert.equal(await page.evaluate(degrees => __texts.includes('KASTEVINKEL ↑/↓ ' + degrees + '°'), degrees), true);
    const charge = Math.log1p(strength * Math.expm1(3)) / 3;
    await held('Space', charge / 1.15);
    if (shot === 3) await screenshot('boccia-full-power');
    await advance(1 / 60);
    if (shot === 3) { await advance(.65); await screenshot('boccia-lob'); }
    await advance(12);
  }
  const bocciaScore = await page.evaluate(() => JSON.parse(localStorage.getItem('ol2026.solo.v1')).scores.boccia);
  assert.ok(Number.isInteger(bocciaScore) && bocciaScore >= 0 && bocciaScore <= 3200);
  assert.match(await page.locator('#done-detail').textContent(), /4 KUGLER/);
  await screenshot('boccia-complete');
  await next(); await start('bob');
  assert.equal(await page.evaluate(() => __texts.includes('RØD · LET')), true);
  await screenshot('bob-board');
  await held('Space', .85); await advance(1 / 60); await advance(12);
  assert.equal(await page.evaluate(() => __texts.includes('DIN TUR')), true);
  await screenshot('bob-after-break');
  await tap('F'); await tap('Enter');
  await next();
  await page.waitForFunction(() => document.querySelector('#result-code').value.length > 0, null, {polling: 10});
  const payload = await page.evaluate(() => ResultCodes.verifyToken(document.querySelector('#result-code').value));
  assert.equal(payload.scores.freethrows, 6); assert.equal(payload.scores.stones, 17); assert.equal(payload.scores.frisbee, 27);
  assert.equal(payload.scores.boccia, bocciaScore);
  assert.equal(payload.scores.water, waterScore);
  assert.ok(payload.scores.bob >= -15 && payload.scores.bob <= 15);
  console.log('Actual keyboard play-through produced and verified a signed result containing the new game scores.');
  await context.close();
}
