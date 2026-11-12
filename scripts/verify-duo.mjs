import { root, launchBrowser, routeApp } from './lib/browser.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
await mkdir(path.join(root, '.build', 'qa', 'duo'), { recursive: true });
const browser = await launchBrowser();
const context = await browser.newContext({
  viewport: { width: 1180, height: 830 },
  deviceScaleFactor: 2
});
await routeApp(context, 'http://block2gether.test');
await context.addInitScript(() => {
  window.__controllerRequests = [];
  window.webkit = {
    messageHandlers: {
      diagnostics: { postMessage() {} },
      controllers: {
        postMessage(message) {
          window.__controllerRequests.push(message);
        }
      }
    }
  };
  if (!localStorage.getItem('block2gether.profiles.v1'))
    localStorage.setItem(
      'block2gether.profiles.v1',
      JSON.stringify({
        profiles: [
          { id: 'river-test', name: 'River Test', photo: null },
          { id: 'sky-test', name: 'Sky Test', photo: null }
        ],
        slots: ['river-test', 'sky-test']
      })
    );
});
const page = await context.newPage(),
  errors = [],
  checks = [],
  layouts = [];
page.on('pageerror', (error) => errors.push(error.message));
const waitPlaying = () =>
  page.waitForFunction(() =>
    window.__block2gether.match
      ? __block2gether.match.status === 'playing'
      : __block2gether.game.status === 'playing'
  );
const snapshot = (detail) =>
  page.evaluate(
    (detail) =>
      window.dispatchEvent(
        new CustomEvent('block2gether-controllers', { detail })
      ),
    detail
  );
const controller = (slot, action, pressed) =>
  page.evaluate(
    (detail) =>
      window.dispatchEvent(
        new CustomEvent('block2gether-controller', { detail })
      ),
    { id: `test-pad-${slot}`, slot, action, pressed }
  );
const pulse = async (slot, action) => {
  await controller(slot, action, true);
  await controller(slot, action, false);
};
const topOut = (lane, score) =>
  page.evaluate(
    ({ lane, score }) => {
      const g = __block2gether.games[lane];
      g.score = score;
      g.board[0] = Array(10).fill('Z');
      g._spawn('T');
    },
    { lane, score }
  );
try {
  await page.goto('http://block2gether.test/');
  await page.waitForFunction(() => !!window.__block2gether);
  assert.match(await page.title(), /block2gether/);
  assert.match(await page.locator('#menu-players').innerText(), /River Test/);
  assert.match(await page.locator('#menu-players').innerText(), /Sky Test/);
  assert.ok(
    await page.evaluate(() =>
      window.__controllerRequests.some((r) => r.type === 'request')
    )
  );
  await page.locator('#duo-option').click();
  await snapshot({
    controllers: [
      { id: 'test-pad-0', name: 'Test Pad One', slot: 0 },
      { id: 'test-pad-1', name: 'Test Pad Two', slot: 1 }
    ],
    reason: 'connected'
  });
  assert.equal(
    await page.locator('#controller-count').innerText(),
    '2 connected'
  );
  await page.screenshot({
    path: path.join(root, '.build', 'qa', 'duo', 'duo-menu.png')
  });
  await page.locator('#start-button').click();
  assert.equal(
    await page.evaluate(() => __block2gether.match.status),
    'paused'
  );
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#duo-countdown-0').isVisible(), false);
  const stopped = await page.evaluate(() =>
    __block2gether.games.map((g) => g.elapsed)
  );
  await page.waitForTimeout(140);
  assert.deepEqual(
    await page.evaluate(() => __block2gether.games.map((g) => g.elapsed)),
    stopped
  );
  await page.locator('#pause-settings').click();
  await page.locator('#arr').fill('25');
  await page.locator('#done-settings').click();
  await page.locator('#resume').click();
  await waitPlaying();
  assert.equal(await page.evaluate(() => __block2gether.settings.arr), 25);
  assert.match(
    await page.locator('#duo-player-0').innerText(),
    /River Test.*Test Pad One/s
  );
  assert.match(
    await page.locator('#duo-player-1').innerText(),
    /Sky Test.*Test Pad Two/s
  );
  checks.push(
    'personalized names and assigned-controller labels',
    'countdown interruption and pause/settings/resume'
  );
  const first = await page.evaluate(() =>
    __block2gether.games.map((g) => g.active.type)
  );
  assert.equal(first[0], first[1]);
  assert.deepEqual(
    await page.evaluate(() => __block2gether.games.map((g) => g.queue)),
    await page.evaluate(() => [
      __block2gether.games[0].queue,
      __block2gether.games[0].queue
    ])
  );
  await page.keyboard.press('c');
  assert.equal(
    await page.evaluate(() => __block2gether.games[0].held),
    first[0]
  );
  assert.equal(await page.evaluate(() => __block2gether.games[1].held), null);
  await page.keyboard.press('e');
  assert.equal(
    await page.evaluate(() => __block2gether.games[1].held),
    first[1]
  );
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('f');
  assert.deepEqual(
    await page.evaluate(() => __block2gether.games.map((g) => g.piecesPlaced)),
    [1, 1]
  );
  const before = await page.evaluate(() =>
    __block2gether.games.map((g) => g.active.x)
  );
  await pulse(1, 'left');
  assert.deepEqual(
    await page.evaluate(() => __block2gether.games.map((g) => g.active.x)),
    [before[0], before[1] - 1]
  );
  await pulse(0, 'right');
  assert.deepEqual(
    await page.evaluate(() => __block2gether.games.map((g) => g.active.x)),
    [before[0] + 1, before[1] - 1]
  );
  checks.push(
    'same seeded queues',
    'independent dual keyboard controls',
    'native-controller event routing to both slots'
  );
  await controller(1, 'left', true);
  await snapshot({
    controllers: [{ id: 'test-pad-0', name: 'Test Pad One', slot: 0 }],
    reason: 'disconnected',
    disconnectedId: 'test-pad-1'
  });
  assert.equal(
    await page.evaluate(() => __block2gether.match.status),
    'paused'
  );
  assert.equal(
    await page.evaluate(() => __block2gether.router.sources.size),
    0
  );
  await page.locator('#resume').click();
  await waitPlaying();
  checks.push('controller disconnect pauses match and clears held sources');
  for (const [width, height] of [
    [900, 678],
    [1180, 830],
    [1440, 900],
    [1920, 1080]
  ]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(90);
    const bounds = await page.evaluate(() => ({
      width: innerWidth,
      height: innerHeight,
      scroll: document.documentElement.scrollWidth,
      footer: document.querySelector('#duo-controls').getBoundingClientRect()
        .bottom,
      boards: __block2gether.duoViews.map((view) => {
        const c = view.renderer.canvas.getBoundingClientRect(),
          r = view.renderer.boardRect;
        return {
          x: c.x,
          y: c.y,
          width: c.width,
          height: c.height,
          boardWidth: r.w,
          boardHeight: r.h,
          cell: r.cell
        };
      }),
      previews: [...document.querySelectorAll('.duo-next canvas')].every(
        (c) => c.getBoundingClientRect().width > 0
      )
    }));
    assert.ok(bounds.scroll <= width, `horizontal overflow ${width}`);
    assert.ok(bounds.footer <= height + 1, `footer clipping ${width}`);
    assert.equal(bounds.boards.length, 2);
    for (const board of bounds.boards) {
      assert.ok(board.cell >= 18, `small board at ${width}: ${board.cell}`);
      assert.ok(Math.abs(board.boardHeight / board.boardWidth - 2) < 1e-8);
      assert.ok(board.y + board.height <= height);
    }
    assert.ok(
      bounds.boards[0].x + bounds.boards[0].width <= bounds.boards[1].x
    );
    assert.equal(bounds.previews, true);
    layouts.push(bounds);
    await page.screenshot({
      path: path.join(root, '.build', 'qa', 'duo', `duo-gameplay-${width}.png`)
    });
  }
  checks.push(
    'two square-cell 10x20 boards and five-piece previews at 900/1180/1440/1920 widths'
  );
  await topOut(0, 111);
  await page.waitForTimeout(75);
  assert.equal(
    await page.evaluate(() => __block2gether.match.status),
    'playing'
  );
  assert.equal(await page.locator('#dialog-screen').isVisible(), false);
  assert.match(
    await page.locator('#duo-ended-0').innerText(),
    /SKY TEST IS PLAYING/
  );
  const frozen = await page.evaluate(() =>
    JSON.stringify(__block2gether.games[0].board)
  );
  const liveBefore = await page.evaluate(() => __block2gether.games[1].elapsed);
  await page.waitForFunction(
    (before) => __block2gether.games[1].elapsed > before,
    liveBefore
  );
  await page.keyboard.press('f');
  assert.ok(
    (await page.evaluate(() => __block2gether.games[1].elapsed)) > liveBefore,
    JSON.stringify({
      liveBefore,
      state: await page.evaluate(() => ({
        match: __block2gether.match.status,
        games: __block2gether.games.map((g) => ({
          status: g.status,
          elapsed: g.elapsed,
          score: g.score
        })),
        dialog: document.querySelector('#dialog-title')?.textContent
      })),
      errors
    })
  );
  assert.equal(
    await page.evaluate(() => JSON.stringify(__block2gether.games[0].board)),
    frozen
  );
  await page.keyboard.press('Escape');
  await page.locator('#pause-settings').click();
  await page.locator('#done-settings').click();
  await page.locator('#resume').click();
  assert.deepEqual(
    await page.evaluate(() => __block2gether.games.map((g) => g.status)),
    ['over', 'playing']
  );
  await topOut(1, 222);
  await page.waitForFunction(() => __block2gether.match.status === 'over');
  assert.deepEqual(await page.evaluate(() => __block2gether.match.result), {
    winner: 1,
    scores: [111, 222],
    tie: false
  });
  await page.waitForSelector('#play-again');
  assert.equal(
    await page.locator('#dialog-title').innerText(),
    'Sky Test wins!'
  );
  await page.screenshot({
    path: path.join(root, '.build', 'qa', 'duo', 'duo-result.png')
  });
  checks.push(
    'lower scorer finishes first; survivor continues on frozen-opponent board',
    'survivor pause/settings/resume preserves top-out',
    'result waits for both top-outs and names highest scorer'
  );
  await page.locator('#play-again').click();
  await waitPlaying();
  assert.deepEqual(
    await page.evaluate(() => __block2gether.games.map((g) => g.score)),
    [0, 0]
  );
  await topOut(0, 999);
  await topOut(1, 333);
  await page.waitForSelector('#play-again');
  assert.deepEqual(await page.evaluate(() => __block2gether.match.result), {
    winner: 0,
    scores: [999, 333],
    tie: false
  });
  await page.locator('#play-again').click();
  await waitPlaying();
  await topOut(0, 444);
  await topOut(1, 444);
  await page.waitForSelector('#play-again');
  assert.deepEqual(await page.evaluate(() => __block2gether.match.result), {
    winner: null,
    scores: [444, 444],
    tie: true
  });
  assert.equal(await page.locator('#dialog-title').innerText(), 'Draw');
  checks.push(
    'rematch resets both players',
    'first player to top out can still win',
    'equal scores show explicit tie'
  );
  await page.locator('#result-home').click();
  await page.locator('#solo-option').click();
  await page.locator('[data-mode="sprint"]').click();
  await page.locator('#start-button').click();
  await waitPlaying();
  assert.equal(await page.evaluate(() => __block2gether.match), null);
  assert.equal(await page.locator('#solo-layout').isVisible(), true);
  assert.equal(await page.locator('#duo-layout').isVisible(), false);
  await page.keyboard.press('ShiftLeft');
  assert.notEqual(await page.evaluate(() => __block2gether.game.held), null);
  await page.evaluate(() => {
    const g = __block2gether.game;
    g.lines = 36;
    g.board = Array.from({ length: 20 }, () => Array(10).fill(null));
    for (let y = 16; y < 20; y++)
      for (let x = 0; x < 10; x++) if (x !== 4) g.board[y][x] = 'J';
    g.active = { type: 'I', rotation: 1, x: 2, y: 0 };
  });
  await page.keyboard.press('ArrowUp');
  await page.waitForSelector('#play-again');
  assert.equal(await page.evaluate(() => __block2gether.game.status), 'won');
  assert.equal(await page.evaluate(() => __block2gether.game.level), 1);
  await page.locator('#result-home').click();
  await page.locator('[data-mode="marathon"]').click();
  await page.locator('#start-button').click();
  await waitPlaying();
  assert.equal(await page.evaluate(() => __block2gether.game.mode), 'marathon');
  await page.keyboard.press('ArrowUp');
  assert.equal(await page.evaluate(() => __block2gether.game.piecesPlaced), 1);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  assert.equal(await page.evaluate(() => __block2gether.game.status), 'paused');
  checks.push(
    'return to solo restores single board and either-Shift hold',
    'solo sprint and marathon regression',
    'solo focus-loss pause'
  );
  await page.reload();
  await page.waitForFunction(() => !!window.__block2gether);
  assert.equal(await page.evaluate(() => __block2gether.settings.arr), 25);
  assert.deepEqual(
    await page.evaluate(() =>
      __block2gether.profiles.selected().map((p) => p.name)
    ),
    ['River Test', 'Sky Test']
  );
  await page.locator('[data-player-slot="1"]').click();
  assert.equal(await page.locator('#dialog-title').innerText(), 'Player two');
  await page.locator('[data-edit-profile="sky-test"]').click();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#dialog-title').innerText(), 'Player two');
  await page.locator('[data-select-profile="river-test"]').click();
  assert.deepEqual(
    await page.evaluate(() =>
      __block2gether.profiles.selected().map((p) => p.name)
    ),
    ['Sky Test', 'River Test']
  );
  await page.locator('[data-select-profile="sky-test"]').click();
  assert.deepEqual(
    await page.evaluate(() =>
      __block2gether.profiles.selected().map((p) => p.name)
    ),
    ['River Test', 'Sky Test']
  );
  await page.locator('#profiles-done').click();
  checks.push(
    'Escape from player-two editor preserves chooser slot and subsequent selection'
  );
  assert.deepEqual(errors, []);
  checks.push(
    'profiles and settings persist in isolated context',
    'no browser runtime errors'
  );
  const report = { passed: true, checks, layouts, errors };
  await writeFile(
    path.join(root, '.build', 'qa', 'duo', 'duo-browser-verification.json'),
    JSON.stringify(report, null, 2)
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
