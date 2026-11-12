import { root, launchBrowser, routeApp } from './lib/browser.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

// Disposable Chromium storage only. Never reads or writes the installed app's store.
// Screenshots containing the selected test photograph stay in ignored .build/qa.
const output = path.join(root, '.build', 'qa', 'profiles');
const sourcePhoto =
  process.env.PROFILE_TEST_PHOTO ||
  path.join(root, 'tests', 'fixtures', 'avatar.png');
await mkdir(output, { recursive: true });
const browser = await launchBrowser();
const context = await browser.newContext({
  viewport: { width: 1180, height: 830 },
  deviceScaleFactor: 2
});
await routeApp(context, 'http://block2gether.local');
await context.addInitScript(() => {
  window.webkit = { messageHandlers: { diagnostics: { postMessage() {} } } };
});
const page = await context.newPage(),
  errors = [],
  checks = [];
page.on('pageerror', (error) => errors.push(error.message));
const store = async () =>
  page.evaluate(() => window.__block2gether.profiles.list());
const selected = async () =>
  page.evaluate(() =>
    window.__block2gether.profiles.selected().map((profile) => profile.id)
  );
async function boot() {
  await page.goto('http://block2gether.local/');
  await page.waitForFunction(() => !!window.__block2gether?.profiles);
}
async function reload() {
  await page.reload();
  await page.waitForFunction(() => !!window.__block2gether?.profiles);
}
async function openList() {
  if (await page.locator('#add-player').isVisible()) return;
  if (await page.locator('#players-button').isVisible())
    await page.locator('#players-button').click();
  await page.locator('#add-player').waitFor({ state: 'visible' });
}
async function edit(id) {
  await openList();
  await page.locator(`[data-edit-profile="${id}"]`).click();
  await page.locator('#player-name').waitFor({ state: 'visible' });
}
async function waitForPhoto() {
  await page.waitForFunction(() =>
    [...document.querySelectorAll('#dialog img')].some(
      (image) =>
        image.src.startsWith('data:image/jpeg;base64,') &&
        image.complete &&
        image.naturalWidth > 0
    )
  );
}
async function save() {
  await page.locator('#save-player').click();
  await page.locator('#add-player').waitFor({ state: 'visible' });
}
async function closeProfiles() {
  if (await page.locator('#profiles-done').isVisible())
    await page.locator('#profiles-done').click();
}
try {
  await boot();
  assert.deepEqual(
    (await store()).map((profile) => profile.name),
    ['Player 1', 'Player 2']
  );
  assert.ok((await store()).every((profile) => !profile.photo));
  const originals = await selected();
  checks.push('clean distributed defaults contain no personal names or photos');
  await page.screenshot({ path: path.join(output, 'title-1180.png') });

  await openList();
  await page.locator('#add-player').click();
  await page.locator('#player-name').fill('QA Aurora');
  await page.locator('#player-photo').setInputFiles(sourcePhoto);
  await waitForPhoto();
  await page.screenshot({ path: path.join(output, 'photo-editor.png') });
  await save();
  const created = (await store()).find(
    (profile) => profile.name === 'QA Aurora'
  );
  assert.ok(created?.photo?.startsWith('data:image/jpeg;base64,'));
  const dimensions = await page.evaluate(async (photo) => {
    const image = new Image();
    image.src = photo;
    await image.decode();
    return [image.naturalWidth, image.naturalHeight];
  }, created.photo);
  assert.ok(Math.max(...dimensions) <= 512 && Math.min(...dimensions) > 0);
  checks.push('actual PNG upload decodes and normalizes to <=512px JPEG');

  // Exercise a real JPEG decode too, using the normalized photo as a file upload.
  await edit(created.id);
  await page.locator('#remove-photo').click();
  await page.locator('#player-photo').setInputFiles({
    name: 'qa-avatar.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from(created.photo.split(',')[1], 'base64')
  });
  await waitForPhoto();
  await page.locator('#player-name').fill('QA Aurora Edited');
  await save();
  await closeProfiles();
  await page.locator('[data-player-slot="1"]').click();
  await page.locator(`[data-select-profile="${created.id}"]`).click();
  assert.equal((await selected())[1], created.id);
  await closeProfiles();
  await page.locator('[data-player-slot="0"]').click();
  await page.locator(`[data-select-profile="${created.id}"]`).click();
  const chosen = await selected();
  assert.equal(chosen[0], created.id);
  assert.notEqual(chosen[0], chosen[1]);
  await reload();
  assert.deepEqual(await selected(), chosen);
  let saved = (await store()).find((profile) => profile.id === created.id);
  assert.equal(saved.name, 'QA Aurora Edited');
  assert.ok(saved.photo?.startsWith('data:image/jpeg;base64,'));
  checks.push(
    'JPEG upload, edited name, stable profile ID, photograph, and selection survive reload'
  );

  await edit(created.id);
  await page.locator('#remove-photo').click();
  await save();
  await reload();
  assert.equal(
    (await store()).find((profile) => profile.id === created.id).photo,
    null
  );
  checks.push('explicit photo removal remains cleared after reload');

  await edit(created.id);
  await page.locator('#player-name').fill('Must Not Save');
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    window.__restoreProfileStorage = () => {
      Storage.prototype.setItem = original;
    };
    Storage.prototype.setItem = function (key, value) {
      if (key === 'block2gether.profiles.v1')
        throw new DOMException('QA quota limit', 'QuotaExceededError');
      return original.call(this, key, value);
    };
  });
  await page.locator('#save-player').click();
  await page.waitForFunction(() =>
    /not enough space/i.test(
      document.querySelector('#dialog')?.textContent || ''
    )
  );
  assert.equal(
    (await store()).find((profile) => profile.id === created.id).name,
    'QA Aurora Edited'
  );
  await page.evaluate(() => {
    window.__restoreProfileStorage();
    delete window.__restoreProfileStorage;
  });
  checks.push(
    'quota failure is visible and does not claim or retain an unsaved edit'
  );
  await reload();
  assert.equal(
    (await store()).find((profile) => profile.id === created.id).name,
    'QA Aurora Edited'
  );

  await edit(created.id);
  await page.locator('#delete-player').click();
  await page.locator('#confirm-delete-player').click();
  await page.waitForFunction(
    (id) => !window.__block2gether.profiles.get(id),
    created.id
  );
  await reload();
  assert.ok(!(await store()).some((profile) => profile.id === created.id));
  const afterDelete = await selected();
  assert.notEqual(afterDelete[0], afterDelete[1]);
  assert.ok(afterDelete.every((id) => originals.includes(id)));
  checks.push(
    'deleting the selected custom player persists and restores distinct usable selections'
  );

  for (const [width, height] of [
    [1180, 830],
    [900, 678]
  ]) {
    await page.setViewportSize({ width, height });
    await closeProfiles();
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(output, `title-${width}.png`) });
    const bounds = await page.evaluate(() => ({
      width: innerWidth,
      scroll: document.documentElement.scrollWidth
    }));
    assert.ok(bounds.scroll <= bounds.width, `Title overflows at ${width}px`);
  }
  await page.locator('#duo-option').click();
  await page.locator('#start-button').click();
  await page.waitForFunction(
    () =>
      window.__block2gether.games.length === 2 &&
      window.__block2gether.games.every((game) => game.status === 'playing')
  );
  await page.evaluate(() => {
    window.__block2gether.games.forEach((game, index) => {
      game.setPaused(true);
      const rows = [
        'JJJ  SS OO',
        'J TTSS ZZ ',
        'LLTT ZZ OO',
        'LTTTJJJOOO',
        'LSSJJJZLLL',
        'SSIIIZZLLL'
      ];
      game.board = Array.from({ length: 20 }, () => Array(10).fill(null));
      rows.forEach((row, i) => {
        for (let x = 0; x < 10; x++)
          game.board[14 + i][x] = row[x] && row[x] !== ' ' ? row[x] : null;
      });
      game.active = { type: index === 0 ? 'T' : 'L', rotation: 0, x: 3, y: 6 };
      game.held = index === 0 ? 'I' : 'S';
      game.queue = ['L', 'S', 'I', 'J', 'O', 'Z', 'T'];
      game.score = index === 0 ? 12480 : 10820;
      game.lines = 36;
      game.level = 4;
    });
  });
  for (const [width, height] of [
    [1180, 830],
    [900, 678]
  ]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(100);
    const bounds = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      width: innerWidth,
      canvases: [...document.querySelectorAll('.duo-canvas')].map((canvas) => {
        const rect = canvas.getBoundingClientRect();
        return {
          width: rect.width,
          height: rect.height,
          left: rect.left,
          right: rect.right,
          bottom: rect.bottom
        };
      })
    }));
    assert.ok(bounds.scroll <= width, `Duo layout overflows at ${width}px`);
    assert.equal(bounds.canvases.length, 2);
    for (const canvas of bounds.canvases) {
      assert.ok(canvas.width > 150 && canvas.height > 350);
      assert.ok(
        canvas.left >= 0 && canvas.right <= width && canvas.bottom <= height
      );
    }
    await page.screenshot({ path: path.join(output, `duo-${width}.png`) });
  }
  checks.push(
    'title and populated duo layouts fit 1180x830 and 900x678 viewports'
  );
  assert.deepEqual(errors, []);
  const report = {
    passed: true,
    checks,
    photoDimensions: dimensions,
    screenshots: output,
    runtimeErrors: errors
  };
  await writeFile(
    path.join(output, 'verification.json'),
    JSON.stringify(report, null, 2)
  );
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  await page
    .screenshot({ path: path.join(output, 'failure.png') })
    .catch(() => {});
  console.error(
    `Profile verification failed; screenshot: ${path.join(output, 'failure.png')}`
  );
  throw error;
} finally {
  await context.close();
  await browser.close();
}
