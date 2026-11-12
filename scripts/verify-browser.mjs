import { root, launchBrowser, routeApp } from './lib/browser.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
await mkdir(path.join(root, '.build', 'qa', 'browser'), { recursive: true });
const browser = await launchBrowser();
const context = await browser.newContext({
  viewport: { width: 1180, height: 830 },
  deviceScaleFactor: 2
});
await routeApp(context, 'http://luma.local');
await context.addInitScript(() => {
  window.webkit = { messageHandlers: { diagnostics: { postMessage() {} } } };
});
const page = await context.newPage(),
  errors = [];
page.on('pageerror', (e) => errors.push(e.message));
try {
  await page.goto('http://luma.local/');
  await page.waitForFunction(() => !!window.__luma);
  await page.screenshot({
    path: path.join(root, '.build', 'qa', 'browser', 'menu.png')
  });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1250);
  assert.equal(await page.evaluate(() => __luma.game.status), 'playing');
  const original = await page.evaluate(() => __luma.game.active.type);
  await page.keyboard.press('c');
  assert.equal(await page.evaluate(() => __luma.game.held), original);
  const replacement = await page.evaluate(() => __luma.game.active.type);
  await page.keyboard.press('c');
  assert.equal(await page.evaluate(() => __luma.game.active.type), replacement);
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowUp');
  assert.equal(await page.evaluate(() => __luma.game.piecesPlaced), 1);
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => __luma.game.status), 'paused');
  const paused = await page.evaluate(() => __luma.game.elapsed);
  await page.waitForTimeout(350);
  assert.equal(await page.evaluate(() => __luma.game.elapsed), paused);
  await page.locator('#pause-settings').click();
  await page.locator('#arr').fill('0');
  assert.equal(await page.evaluate(() => __luma.settings.arr), 0);
  await page.locator('#reduced-motion').check();
  assert.equal(await page.evaluate(() => __luma.settings.reducedMotion), true);
  await page.screenshot({
    path: path.join(root, '.build', 'qa', 'browser', 'settings.png')
  });
  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('button', { name: 'Resume' }).click();
  assert.equal(await page.evaluate(() => __luma.game.status), 'playing');
  await page.evaluate(() => {
    const g = __luma.game;
    g.board = Array.from({ length: 20 }, () => Array(10).fill(null));
    for (let y = 16; y < 20; y++)
      for (let x = 0; x < 10; x++)
        if (x !== 4)
          g.board[y][x] = ['J', 'L', 'S', 'T', 'Z', 'O'][(x + y) % 6];
    g.active = { type: 'I', rotation: 1, x: 2, y: 0 };
    g._lastRotation = null;
  });
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(() => __luma.game.lines), 4);
  assert.ok((await page.evaluate(() => __luma.game.score)) >= 2800);
  assert.match(
    await page.locator('#announcement').innerText(),
    /PERFECT CLEAR/
  );
  // A deterministic, live engine fixture for visual inspection, isolated to this browser context.
  await page.evaluate(() => {
    const g = __luma.game;
    g.board = Array.from({ length: 20 }, () => Array(10).fill(null));
    const rows = [
      'JJJ  SS OO',
      'J TTSS ZZ ',
      'LLTT ZZ OO',
      'LTTTJJJOOO',
      'LSSJJJZLLL',
      'SSIIIZZLLL'
    ];
    rows.forEach((row, i) => {
      for (let x = 0; x < 10; x++)
        g.board[14 + i][x] = row[x] && row[x] !== ' ' ? row[x] : null;
    });
    g.active = { type: 'T', rotation: 0, x: 3, y: 6 };
    g.held = 'I';
    g.canHold = true;
    g.queue = ['L', 'S', 'I', 'J', 'O', 'Z', 'T'];
    g.score = 12480;
    g.lines = 36;
    g.level = 4;
    g.elapsed = 192.45;
  });
  await page.waitForTimeout(1650);
  await page.screenshot({
    path: path.join(root, '.build', 'qa', 'browser', 'gameplay.png')
  });
  for (const [w, h] of [
    [900, 678],
    [1440, 900],
    [1920, 1080]
  ]) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(150);
    const bounds = await page.evaluate(() => {
      const r = document.querySelector('footer').getBoundingClientRect();
      return {
        bottom: r.bottom,
        scroll: document.documentElement.scrollWidth,
        width: innerWidth,
        canvas: document.querySelector('#game-canvas').getBoundingClientRect()
          .height
      };
    });
    assert.ok(bounds.bottom <= h + 1);
    assert.ok(bounds.scroll <= bounds.width);
    assert.ok(bounds.canvas > 400);
    await page.screenshot({
      path: path.join(root, '.build', 'qa', 'browser', `gameplay-${w}.png`)
    });
  }
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  assert.equal(await page.evaluate(() => __luma.game.status), 'paused');
  await page.getByRole('button', { name: 'Main menu' }).click();
  await page.getByRole('button', { name: 'Main menu' }).click();
  await page.locator('[data-mode="sprint"]').click();
  await page.locator('#start-button').click();
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    const g = __luma.game;
    g.lines = 36;
    for (let y = 16; y < 20; y++)
      for (let x = 0; x < 10; x++) if (x !== 4) g.board[y][x] = 'J';
    g.active = { type: 'I', rotation: 1, x: 2, y: 0 };
  });
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(80);
  assert.equal(await page.evaluate(() => __luma.game.status), 'won');
  assert.equal(await page.evaluate(() => __luma.game.level), 1);
  assert.ok(await page.locator('#dialog-title').isVisible());
  await page.getByRole('button', { name: 'Play again' }).click();
  await page.waitForTimeout(1200);
  assert.equal(await page.evaluate(() => __luma.game.lines), 0);
  await page.evaluate(() => {
    __luma.game.board[0] = Array(10).fill('Z');
    __luma.game.hold();
  });
  await page.waitForTimeout(80);
  assert.equal(await page.evaluate(() => __luma.game.status), 'over');
  await page.reload();
  await page.waitForFunction(() => !!window.__luma);
  assert.equal(await page.evaluate(() => __luma.settings.arr), 0);
  assert.equal(await page.evaluate(() => __luma.settings.reducedMotion), true);
  assert.deepEqual(errors, []);
  const report = {
    passed: true,
    checks: [
      'start/countdown',
      'hold once per piece',
      'rotation and hard drop',
      'pause freezes time',
      'settings persist',
      'perfect clear scoring and announcement',
      'retina screenshots',
      '900/1440/1920 responsive layouts',
      'focus loss auto-pause',
      '40-line sprint win',
      'restart resets game',
      'spawn top-out',
      'no browser runtime errors'
    ],
    errors
  };
  await writeFile(
    path.join(root, '.build', 'qa', 'browser', 'browser-verification.json'),
    JSON.stringify(report, null, 2)
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
