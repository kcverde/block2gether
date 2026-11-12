import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { root, launchBrowser, routeApp } from './lib/browser.mjs';

// Explicit documentation task: ordinary tests never write these images.
const output = path.join(root, 'docs', 'screenshots');
await mkdir(output, { recursive: true });
const browser = await launchBrowser();
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  deviceScaleFactor: 1,
  reducedMotion: 'reduce'
});
await routeApp(context, 'http://block2gether.test');
await context.addInitScript(() => {
  window.webkit = { messageHandlers: { diagnostics: { postMessage() {} } } };
  localStorage.setItem(
    'luma.settings.v1',
    JSON.stringify({ muted: true, reducedMotion: true })
  );
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));

async function capture(name) {
  await page.evaluate(() => document.activeElement?.blur());
  await page.waitForTimeout(100);
  await page.screenshot({ path: path.join(output, `${name}.png`) });
}
async function stageBoards() {
  await page.evaluate(() => {
    const app = window.__block2gether;
    if (app.match) app.match.setPaused(true);
    else app.game.setPaused(true);
    app.games.forEach((game, index) => {
      const rows = [
        'JJJ  SS   ',
        'J TTSS ZZ ',
        'LLTT ZZOO ',
        'LTTTJJJOO ',
        'LSSJJJZLL ',
        'SSIIIZZLL '
      ];
      game.board = Array.from({ length: 20 }, () => Array(10).fill(null));
      rows.forEach((row, i) => {
        for (let x = 0; x < 10; x++) {
          const column = index ? 9 - x : x;
          game.board[14 + i][column] = row[x] && row[x] !== ' ' ? row[x] : null;
        }
      });
      game.active = { type: index ? 'L' : 'T', rotation: 0, x: 3, y: 6 };
      game.held = index ? 'S' : 'I';
      game.queue = index
        ? ['T', 'I', 'Z', 'O', 'J', 'L', 'S']
        : ['L', 'S', 'I', 'J', 'O', 'Z', 'T'];
      game.score = index ? 10820 : 12480;
      game.lines = index ? 32 : 36;
      game.level = 4;
      game.elapsed = 192.45;
      game.drainEvents();
    });
  });
}
try {
  await page.goto('http://block2gether.test/');
  await page.waitForFunction(() => !!window.__block2gether);
  await capture('title');
  await page.locator('#start-button').click();
  await page.waitForFunction(
    () => window.__block2gether.game.status === 'playing'
  );
  await stageBoards();
  await capture('solo');
  await page.evaluate(() => {
    const app = window.__block2gether;
    app.goHome();
    app.setPlayType('duo');
    app.begin();
  });
  await page.waitForFunction(
    () => window.__block2gether.match.status === 'playing'
  );
  await stageBoards();
  await capture('two-player');
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(
    'Updated title.png, solo.png, and two-player.png in docs/screenshots/.'
  );
} finally {
  await context.close();
  await browser.close();
}
