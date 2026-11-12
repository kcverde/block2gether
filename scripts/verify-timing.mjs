import { root, launchBrowser, routeApp } from './lib/browser.mjs';
import assert from 'node:assert/strict';
import path from 'node:path';

const browser = await launchBrowser();
const context = await browser.newContext();
await routeApp(context, 'http://block2gether.test');
await context.addInitScript(() => {
  window.webkit = { messageHandlers: { diagnostics: { postMessage() {} } } };
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));

try {
  await page.goto('http://block2gether.test/');
  await page.waitForFunction(() => window.__block2gether);
  await page.locator('[data-mode="sprint"]').click();
  await page.locator('#start-button').click();
  const countdownTime = await page.evaluate(() => __block2gether.game.elapsed);
  await page.waitForTimeout(250);
  assert.equal(
    await page.evaluate(() => __block2gether.game.elapsed),
    countdownTime
  );
  await page.waitForFunction(() => __block2gether.game.status === 'playing');

  const stall = await page.evaluate(async () => {
    const before = __block2gether.game.elapsed;
    const started = performance.now();
    while (performance.now() - started < 500) {}
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve))
    );
    return {
      wall: (performance.now() - started) / 1000,
      elapsed: __block2gether.game.elapsed - before
    };
  });
  assert.ok(stall.elapsed >= 0.49, JSON.stringify(stall));
  assert.ok(Math.abs(stall.elapsed - stall.wall) < 0.05, JSON.stringify(stall));

  await page.keyboard.press('Escape');
  const paused = await page.evaluate(() => __block2gether.game.elapsed);
  await page.waitForTimeout(250);
  assert.equal(await page.evaluate(() => __block2gether.game.elapsed), paused);
  await page.locator('#resume').click();
  await page.waitForFunction(
    (value) => __block2gether.game.elapsed > value + 0.1,
    paused
  );

  // Finish through the real keyboard handler between animation frames, after a stall.
  const finish = await page.evaluate(() => {
    const game = __block2gether.game;
    game.lines = 36;
    for (let y = 16; y < 20; y++)
      game.board[y] = Array.from({ length: 10 }, (_, x) =>
        x === 4 ? null : 'J'
      );
    game.active = { type: 'I', rotation: 1, x: 2, y: 0 };
    const before = game.elapsed;
    const started = performance.now();
    while (performance.now() - started < 250) {}
    window.dispatchEvent(
      new KeyboardEvent('keydown', { code: 'ArrowUp', bubbles: true })
    );
    window.dispatchEvent(
      new KeyboardEvent('keyup', { code: 'ArrowUp', bubbles: true })
    );
    return { before, elapsed: game.elapsed, status: game.status };
  });
  assert.equal(finish.status, 'won');
  assert.ok(finish.elapsed - finish.before >= 0.24, JSON.stringify(finish));
  await page.locator('#play-again').waitFor();
  assert.equal(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('luma.records.v1')).sprint
    ),
    finish.elapsed
  );
  await page.waitForTimeout(200);
  assert.equal(
    await page.evaluate(() => __block2gether.game.elapsed),
    finish.elapsed
  );

  await page.locator('#result-home').click();
  await page.locator('#duo-option').click();
  await page.locator('#start-button').click();
  await page.waitForFunction(() => __block2gether.match.status === 'playing');
  await page.evaluate(() => {
    __block2gether.games[0].board[0] = Array(10).fill('Z');
    __block2gether.games[0].queue[0] = 'T';
  });
  await page.keyboard.press('c');
  const firstEnded = await page.evaluate(() =>
    __block2gether.games.map((game) => ({
      status: game.status,
      elapsed: game.elapsed
    }))
  );
  assert.equal(firstEnded[0].status, 'over');
  await page.waitForFunction(
    (value) => __block2gether.games[1].elapsed > value + 0.2,
    firstEnded[1].elapsed
  );
  assert.equal(
    await page.evaluate(() => __block2gether.games[0].elapsed),
    firstEnded[0].elapsed
  );
  await page.keyboard.press('Escape');
  const duoPaused = await page.evaluate(() =>
    __block2gether.games.map((game) => game.elapsed)
  );
  await page.waitForTimeout(200);
  assert.deepEqual(
    await page.evaluate(() => __block2gether.games.map((game) => game.elapsed)),
    duoPaused
  );
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify(
      {
        passed: true,
        stall,
        checks: [
          'countdown excluded',
          'foreground stall counted',
          'pause excluded',
          'input-time Sprint record',
          'completed clock frozen',
          'independent duo clocks'
        ],
        errors
      },
      null,
      2
    )
  );
} finally {
  await context.close();
  await browser.close();
}
