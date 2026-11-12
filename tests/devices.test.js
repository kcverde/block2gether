import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../app/engine.js';
import { InputController } from '../app/input.js';
import { ControlRouter } from '../app/devices.js';
function setup(dual = true) {
  const games = [new Game({ seed: 4 }).start(), new Game({ seed: 4 }).start()],
    inputs = games.map((g) => new InputController(g, { das: 140, arr: 35 }));
  return { games, inputs, router: new ControlRouter(inputs, dual) };
}
test('two keyboard layouts control independent boards', () => {
  const { games, router } = setup();
  router.keyboard('ArrowLeft', true);
  assert.equal(games[0].active.x, 2);
  assert.equal(games[1].active.x, 3);
  router.keyboard('KeyD', true);
  assert.equal(games[1].active.x, 4);
  router.keyboard('KeyF', true);
  assert.equal(games[1].piecesPlaced, 1);
  assert.equal(games[0].piecesPlaced, 0);
});
test('solo maps controller slot1 into the only gameplay board', () => {
  const { games, router } = setup(false);
  router.controller({ id: 'one', slot: 1, action: 'drop', pressed: true });
  assert.equal(games[0].piecesPlaced, 1);
  assert.equal(games[1].piecesPlaced, 0);
});
test('duo controller inputs honor their assigned slot', () => {
  const { games, router } = setup();
  router.controller({ id: 'two', slot: 1, action: 'hold', pressed: true });
  assert.ok(games[1].held);
  assert.equal(games[0].held, null);
});
test('keyboard release does not cancel the same action held on a controller', () => {
  const { inputs, router } = setup();
  router.keyboard('ArrowLeft', true);
  router.controller({ id: 'one', slot: 0, action: 'left', pressed: true });
  router.keyboard('ArrowLeft', false);
  assert.equal(inputs[0].direction, -1);
  router.controller({ id: 'one', slot: 0, action: 'left', pressed: false });
  assert.equal(inputs[0].direction, 0);
});
test('disconnect releases only that controller inputs', () => {
  const { inputs, router } = setup();
  router.controller({ id: 'one', slot: 0, action: 'left', pressed: true });
  router.keyboard('KeyS', true);
  router.forgetController('one');
  assert.equal(inputs[0].direction, 0);
  assert.ok(inputs[1].keys.has('ArrowDown'));
});
test('slot reassignment clears held controls before routing new input', () => {
  const { inputs, router } = setup();
  router.controller({ id: 'one', slot: 0, action: 'left', pressed: true });
  router.configure(inputs, true);
  assert.equal(inputs[0].direction, 0);
  router.controller({ id: 'one', slot: 1, action: 'left', pressed: true });
  assert.equal(inputs[1].direction, -1);
});
test('unassigned controller never controls a board', () => {
  const { games, router } = setup();
  router.controller({ id: 'third', slot: -1, action: 'drop', pressed: true });
  assert.equal(games[0].piecesPlaced + games[1].piecesPlaced, 0);
});
test('Shift sides hold for distinct players in duo; either holds solo', () => {
  let { games, router } = setup();
  router.keyboard('ShiftLeft', true);
  assert.ok(games[1].held);
  assert.equal(games[0].held, null);
  router.keyboard('ShiftRight', true);
  assert.ok(games[0].held);
  ({ games, router } = setup(false));
  router.keyboard('ShiftLeft', true);
  assert.ok(games[0].held);
});
test('Space rotates and Up drops in solo and duo without changing player two or controllers', () => {
  for (const dual of [false, true]) {
    const { games, router } = setup(dual);
    router.keyboard('Space', true);
    assert.equal(games[0].active.rotation, 1);
    assert.equal(games[0].piecesPlaced, 0);
    router.keyboard('Space', false);
    router.keyboard('ArrowUp', true);
    assert.equal(games[0].piecesPlaced, 1);
    router.keyboard('ArrowUp', true);
    assert.equal(games[0].piecesPlaced, 1);
    router.keyboard('ArrowUp', false);
    router.keyboard('KeyX', true);
    assert.equal(games[0].active.rotation, 1);
    router.keyboard('KeyX', false);
    router.controller({ id: 'one', slot: 0, action: 'cw', pressed: true });
    assert.equal(games[0].active.rotation, 2);
    router.controller({ id: 'one', slot: 0, action: 'drop', pressed: true });
    assert.equal(games[0].piecesPlaced, 2);
    if (dual) {
      router.keyboard('KeyW', true);
      assert.equal(games[1].active.rotation, 1);
      assert.equal(games[1].piecesPlaced, 0);
      router.keyboard('KeyF', true);
      assert.equal(games[1].piecesPlaced, 1);
    }
  }
});
