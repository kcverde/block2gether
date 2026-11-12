import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../app/engine.js';
import { InputController } from '../app/input.js';
const make = () => {
  const game = new Game({ seed: 7 });
  game.start();
  return { game, input: new InputController(game, { das: 140, arr: 35 }) };
};
test('horizontal movement responds immediately then observes DAS and ARR', () => {
  const { game, input } = make();
  const x = game.active.x;
  input.press('ArrowLeft');
  assert.equal(game.active.x, x - 1);
  input.update(0.139);
  assert.equal(game.active.x, x - 1);
  input.update(0.001);
  assert.equal(game.active.x, x - 2);
  input.update(0.035);
  assert.equal(game.active.x, x - 3);
});
test('repeated native keydown never repeats hard drop', () => {
  const { game, input } = make();
  input.press('ArrowUp');
  assert.equal(game.piecesPlaced, 1);
  input.press('ArrowUp');
  assert.equal(game.piecesPlaced, 1);
  input.release('ArrowUp');
  input.press('ArrowUp');
  assert.equal(game.piecesPlaced, 2);
});
test('zero ARR reaches wall after initial delay', () => {
  const { game, input } = make();
  input.settings.arr = 0;
  input.press('ArrowRight');
  input.update(0.14);
  assert.equal(Math.max(...game.cells().map((c) => c.x)), 9);
});
test('most recently pressed direction wins, releasing it restores other direction', () => {
  const { game, input } = make();
  input.press('ArrowLeft');
  input.press('ArrowRight');
  assert.equal(input.direction, 1);
  input.release('ArrowRight');
  assert.equal(input.direction, -1);
  input.release('ArrowLeft');
  assert.equal(input.direction, 0);
});
test('reset clears input so focus loss cannot leave movement held', () => {
  const { game, input } = make();
  input.press('ArrowLeft');
  const x = game.active.x;
  input.reset();
  input.update(1);
  assert.equal(game.active.x, x);
  assert.equal(input.keys.size, 0);
});
test('paused update releases held controls without affecting game', () => {
  const { game, input } = make();
  input.press('ArrowDown');
  const y = game.active.y;
  game.setPaused(true);
  input.update(1);
  assert.equal(game.active.y, y);
  assert.equal(input.keys.size, 0);
});
test('soft drop repeats at configured fixed fast rate and releases cleanly', () => {
  const { game, input } = make();
  const y = game.active.y;
  input.press('ArrowDown');
  input.update(0.044);
  assert.equal(game.active.y, y + 3);
  input.release('ArrowDown');
  input.update(0.044);
  assert.equal(game.active.y, y + 3);
});
test('releasing the inactive direction preserves active repeat timing', () => {
  const { game, input } = make();
  input.press('ArrowLeft');
  input.press('ArrowRight');
  input.update(0.17);
  assert.equal(input.repeating, true);
  const x = game.active.x;
  input.release('ArrowLeft');
  assert.equal(input.direction, 1);
  assert.equal(input.repeating, true);
  input.update(0.005);
  assert.equal(game.active.x, x + 1);
});
