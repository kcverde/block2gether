import { root, launchBrowser, routeApp } from './lib/browser.mjs';
import path from 'node:path';
import assert from 'node:assert/strict';

// Exercise the real UI with disposable browser storage; produce no repository artifacts.
const browser = await launchBrowser();
const context = await browser.newContext({
  viewport: { width: 1180, height: 830 }
});
await routeApp(context, 'http://block2gether.test');
await context.addInitScript(() => {
  window.webkit = { messageHandlers: { diagnostics: { postMessage() {} } } };
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const pulse = (action) =>
  page.evaluate((action) => {
    for (const pressed of [true, false]) {
      window.dispatchEvent(
        new CustomEvent('block2gether-controller', {
          detail: { id: 'settings-test-pad', slot: 0, action, pressed }
        })
      );
    }
  }, action);
const focus = () => page.evaluate(() => document.activeElement.id);
const setting = (key) =>
  page.evaluate((key) => window.__block2gether.settings[key], key);

try {
  await page.goto('http://block2gether.test/');
  await page.waitForFunction(() => !!window.__block2gether);
  await page.locator('#settings-button').click();
  await page.waitForFunction(
    () => document.activeElement.id === 'close-settings'
  );

  await pulse('down');
  assert.equal(await focus(), 'volume');
  await pulse('right');
  assert.equal(await page.locator('#volume').inputValue(), '51');
  assert.equal(await setting('volume'), 0.51);
  assert.equal(await page.locator('#volume-output').textContent(), '51%');
  await pulse('left');
  assert.equal(await setting('volume'), 0.5);
  assert.equal(await focus(), 'volume');

  // Down still leaves sliders, and confirm still operates checkboxes.
  await pulse('down');
  assert.equal(await focus(), 'music');
  await pulse('cw');
  assert.equal(await setting('music'), false);
  await pulse('down');
  assert.equal(await focus(), 'reduced-motion');
  await pulse('down');
  assert.equal(await focus(), 'das');
  await pulse('right');
  assert.equal(await setting('das'), 150);
  assert.equal(await page.locator('#das-output').textContent(), '150 ms');
  await pulse('down');
  assert.equal(await focus(), 'arr');
  await pulse('left');
  assert.equal(await setting('arr'), 30);
  assert.equal(await page.locator('#arr-output').textContent(), '30 ms');

  for (const [id, min, max, step] of [
    ['volume', 0, 100, 1],
    ['das', 70, 250, 10],
    ['arr', 0, 80, 5]
  ]) {
    const slider = page.locator('#' + id);
    await slider.fill(String(min));
    await slider.focus();
    await pulse('left');
    assert.equal(
      await slider.inputValue(),
      String(min),
      id + ' respects minimum'
    );
    await pulse('right');
    assert.equal(
      await slider.inputValue(),
      String(min + step),
      id + ' respects step'
    );
    await slider.fill(String(max));
    await pulse('right');
    assert.equal(
      await slider.inputValue(),
      String(max),
      id + ' respects maximum'
    );
    assert.equal(await focus(), id, 'focus remains on bounded slider');
  }
  await page.locator('#arr').fill('5');
  await pulse('left');
  assert.equal(await setting('arr'), 0);
  assert.equal(await page.locator('#arr-output').textContent(), 'Instant');
  await pulse('down');
  assert.equal(
    await page.evaluate(() => document.activeElement.tagName),
    'SUMMARY'
  );
  await pulse('cw');
  assert.equal(await page.locator('.control-details').getAttribute('open'), '');
  await pulse('down');
  assert.equal(await focus(), 'done-settings');
  await pulse('cw');
  assert.equal(await page.locator('#dialog-screen').isHidden(), true);

  await page.reload();
  await page.waitForFunction(() => !!window.__block2gether);
  assert.equal(await setting('volume'), 1);
  assert.equal(await setting('das'), 250);
  assert.equal(await setting('arr'), 0);
  assert.equal(await setting('music'), false);
  await page.locator('#settings-button').click();
  await page.waitForFunction(
    () => document.activeElement.id === 'close-settings'
  );
  await pulse('down');
  assert.equal(await focus(), 'volume');
  await pulse('ccw');
  assert.equal(await page.locator('#dialog-screen').isHidden(), true);
  assert.deepEqual(errors, []);
  console.log(
    'Controller settings passed: slider values, steps, bounds, outputs, focus navigation, checkbox/disclosure activation, back, and persistence.'
  );
} finally {
  await context.close();
  await browser.close();
}
