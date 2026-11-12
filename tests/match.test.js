import test from 'node:test';
import assert from 'node:assert/strict';
import { Match } from '../app/match.js';

const make = () => new Match({ seed: 42 }).start();
const topOut = (game) => {
  for (let i = 0; i < 100 && game.status === 'playing'; i++) game.hardDrop();
  assert.equal(game.status, 'over');
};

test('match is ready with two separate marathon boards and no result', () => {
  const match = new Match({ seed: 7 });
  assert.equal(match.status, 'ready');
  assert.equal(match.result, null);
  assert.equal(match.games.length, 2);
  assert.notEqual(match.games[0], match.games[1]);
  assert.notEqual(match.games[0].board, match.games[1].board);
  assert.ok(
    match.games.every(
      (game) => game.status === 'ready' && game.mode === 'marathon'
    )
  );
  match.setPaused(true);
  match.update(1);
  assert.equal(match.status, 'ready');
});

test('same bag seed yields the same sequence despite independent consumption', () => {
  const match = make(),
    [a, b] = match.games;
  assert.equal(a.active.type, b.active.type);
  assert.deepEqual(a.queue, b.queue);
  const first = a.active.type;
  a.hold();
  assert.equal(a.held, first);
  assert.equal(b.held, null);
  assert.equal(b.active.type, first);
  assert.equal(a.active.type, b.queue[0]);
  assert.notDeepEqual(a.queue, b.queue);
  b.hold();
  assert.equal(a.active.type, b.active.type);
  assert.deepEqual(a.queue, b.queue);
});

test('default seed is sampled once for both boards and refreshed each start', (t) => {
  const random = t.mock.method(Math, 'random', () => 0.25);
  const match = new Match();
  assert.equal(random.mock.callCount(), 0);
  match.start();
  assert.equal(random.mock.callCount(), 1);
  assert.equal(match.roundSeed, 0x40000000);
  assert.equal(match.games[0].seed, match.games[1].seed);
  random.mock.mockImplementation(() => 0.75);
  match.start();
  assert.equal(random.mock.callCount(), 2);
  assert.equal(match.roundSeed, 0xc0000000);
});

test('explicit zero seed is retained and restart is deterministic', () => {
  const match = new Match({ seed: 0 }).start();
  const sequence = [match.games[0].active.type, ...match.games[0].queue];
  match.games[0].hold();
  match.games[1].hardDrop();
  match.start();
  assert.equal(match.roundSeed, 0);
  assert.deepEqual(
    [match.games[0].active.type, ...match.games[0].queue],
    sequence
  );
  assert.deepEqual(
    [match.games[1].active.type, ...match.games[1].queue],
    sequence
  );
});

test('gravity, score, hold and board state are independent without garbage', () => {
  const match = make(),
    [a, b] = match.games;
  a.level = 10;
  const by = b.active.y,
    board = JSON.stringify(b.board);
  match.update(0.2);
  assert.ok(a.active.y > b.active.y);
  assert.equal(b.active.y, by);
  a.hold();
  a.hardDrop();
  assert.ok(a.score > 0);
  assert.equal(b.score, 0);
  assert.equal(b.held, null);
  assert.equal(JSON.stringify(b.board), board);
});

test('first top-out does not finish the match and survivor continues', () => {
  const match = make(),
    [a, b] = match.games;
  topOut(a);
  const frozen = JSON.stringify(a);
  match.sync();
  assert.equal(match.status, 'playing');
  assert.equal(match.result, null);
  const y = b.active.y;
  match.update(1);
  assert.ok(b.active.y > y);
  assert.equal(JSON.stringify(a), frozen);
  b.hardDrop();
  assert.ok(b.score > 0);
  assert.equal(match.sync(), null);
});

test('global pause stops both clocks and controls, then resumes both live games', () => {
  const match = make();
  match.setPaused(true);
  assert.equal(match.status, 'paused');
  assert.ok(match.games.every((game) => game.status === 'paused'));
  match.update(1);
  for (const game of match.games) {
    assert.equal(game.elapsed, 0);
    assert.equal(game.hardDrop(), false);
  }
  match.setPaused(false);
  match.update(0.2);
  assert.equal(match.status, 'playing');
  assert.ok(
    match.games.every((game) => game.status === 'playing' && game.elapsed > 0)
  );
});

test('pause and resume never revive a topped-out board', () => {
  const match = make(),
    [a, b] = match.games;
  topOut(a);
  const frozen = JSON.stringify(a);
  match.setPaused(true);
  assert.equal(a.status, 'over');
  assert.equal(b.status, 'paused');
  match.update(1);
  match.setPaused(false);
  assert.equal(a.status, 'over');
  assert.equal(b.status, 'playing');
  assert.equal(JSON.stringify(a), frozen);
});

test('only after both top out does the highest score win, regardless of order', () => {
  for (const winner of [0, 1]) {
    const match = make();
    topOut(match.games[winner]);
    match.games[winner].score = 5000;
    match.sync();
    assert.equal(match.result, null);
    topOut(match.games[1 - winner]);
    match.games[1 - winner].score = 1000;
    match.sync();
    assert.equal(match.status, 'over');
    assert.deepEqual(match.result, {
      winner,
      scores: winner === 0 ? [5000, 1000] : [1000, 5000],
      tie: false
    });
  }
});

test('equal scores produce an explicit tie without an arbitrary winner', () => {
  const match = make();
  match.games.forEach(topOut);
  assert.deepEqual(match.sync(), {
    winner: null,
    scores: match.games.map((game) => game.score),
    tie: true
  });
  assert.equal(match.status, 'over');
});

test('update also discovers input-caused top-outs and preserves game events', () => {
  const match = make();
  match.games.forEach(topOut);
  const queued = match.games.map((game) => game.events.length);
  match.update(0.1);
  assert.equal(match.status, 'over');
  assert.deepEqual(
    match.games.map((game) => game.events.length),
    queued
  );
  for (const game of match.games) {
    const events = game.drainEvents();
    assert.ok(events.some((event) => event.type === 'start'));
    assert.ok(events.some((event) => event.type === 'over'));
  }
});

test('completed match remains frozen and restarting resets both existing game objects', () => {
  const match = make(),
    games = [...match.games];
  match.games.forEach(topOut);
  match.sync();
  const result = match.result,
    scores = [...result.scores];
  match.setPaused(true);
  match.setPaused(false);
  match.update(1);
  assert.equal(match.status, 'over');
  assert.equal(match.result, result);
  assert.deepEqual(match.result.scores, scores);
  match.start();
  assert.equal(match.status, 'playing');
  assert.equal(match.result, null);
  assert.ok(
    match.games.every(
      (game, i) =>
        game === games[i] &&
        game.score === 0 &&
        game.elapsed === 0 &&
        game.held === null
    )
  );
});
