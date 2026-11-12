import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../app/engine.js';
import { Match } from '../app/match.js';

const near = (actual, expected) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

function timedGame(mode = 'marathon') {
  let time = 0;
  const game = new Game({ mode, seed: 7, now: () => time }).start();
  return {
    game,
    at(value) {
      time = value;
    }
  };
}

function finalSprintClear(game) {
  game.lines = 36;
  for (let y = 16; y < 20; y++) {
    game.board[y] = Array.from({ length: 10 }, (_, x) =>
      x === 4 ? null : 'J'
    );
  }
  game.active = { type: 'I', rotation: 1, x: 2, y: 0 };
}

test('foreground stalls count fully without increasing bounded physics time', () => {
  const { game, at } = timedGame('sprint');
  const initialY = game.active.y;
  at(0.5);
  game.update(0.1);
  near(game.elapsed, 0.5);
  assert.equal(game.active.y, initialY);
  near(game._gravityTime, 0.1);
});

test('clock counts up to pause, excludes countdown and pauses, then resumes', () => {
  const { game, at } = timedGame();
  game.setPaused(true);
  at(1.1);
  game.update(0.1);
  near(game.elapsed, 0);
  game.setPaused(false);
  at(1.35);
  game.setPaused(true);
  near(game.elapsed, 0.25);
  at(20);
  game.update(0.1);
  game.setPaused(false);
  at(20.2);
  game.update(0.016);
  near(game.elapsed, 0.45);
});

test('input-driven sprint completion records the finish between frames and freezes it', () => {
  const { game, at } = timedGame('sprint');
  finalSprintClear(game);
  at(0.125);
  game.update(0.016);
  at(0.625);
  game.hardDrop();
  assert.equal(game.status, 'won');
  near(game.elapsed, 0.625);
  at(10);
  game.update(0.1);
  game.setPaused(true);
  near(game.elapsed, 0.625);
});

test('hold-induced topout records the immediate input time', () => {
  const { game, at } = timedGame();
  game.board[0] = Array(10).fill('Z');
  at(0.375);
  game.hold();
  assert.equal(game.status, 'over');
  near(game.elapsed, 0.375);
  at(2);
  game.update(0.1);
  near(game.elapsed, 0.375);
});

test('duo clocks stop independently and paused time is excluded for the survivor', () => {
  let time = 0;
  const match = new Match({ seed: 4, now: () => time }).start();
  const [first, second] = match.games;
  time = 0.5;
  match.update(0.1);
  time = 0.75;
  first.board[0] = Array(10).fill('Z');
  first.hold();
  match.sync();
  assert.equal(match.status, 'playing');
  near(first.elapsed, 0.75);
  time = 1;
  match.setPaused(true);
  near(second.elapsed, 1);
  time = 10;
  match.setPaused(false);
  time = 10.25;
  match.update(0.1);
  near(first.elapsed, 0.75);
  near(second.elapsed, 1.25);
});

test('restart discards the previous elapsed clock and starts at the new time', () => {
  const { game, at } = timedGame();
  at(5);
  game.update(0.1);
  game.start();
  near(game.elapsed, 0);
  at(5.3);
  game.update(0.016);
  near(game.elapsed, 0.3);
});
