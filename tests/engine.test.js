import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, PIECES, COLORS } from '../app/engine.js';
const game = () => new Game({ seed: 42 }).start();
const piece = (g, type, x, y, rotation = 0) => {
  g.active = { type, x, y, rotation };
  g._gravityTime = 0;
  g._lockTime = 0;
  g._lockResets = 0;
  g._lowestY = y;
  g._lastRotation = null;
};
function tetrisWell(g, perfect = false) {
  g.board = Array.from({ length: 20 }, () => Array(10).fill(null));
  for (let y = 16; y < 20; y++)
    g.board[y] = Array.from({ length: 10 }, (_, x) => (x === 5 ? null : 'J'));
  if (!perfect) g.board[10][0] = 'Z';
  piece(g, 'I', 3, 16, 1);
}
function singleWell(g, perfect = false) {
  g.board = Array.from({ length: 20 }, () => Array(10).fill(null));
  g.board[19] = Array.from({ length: 10 }, (_, x) =>
    x >= 3 && x <= 6 ? null : 'J'
  );
  if (!perfect) g.board[10][0] = 'Z';
  piece(g, 'I', 3, 18);
}
test('ready game has empty independent rows, preview and no active piece', () => {
  const g = new Game();
  assert.equal(g.status, 'ready');
  assert.equal(g.active, null);
  assert.equal(g.board.length, 20);
  assert.notEqual(g.board[0], g.board[1]);
  assert.ok(g.queue.length >= 5);
});
test('all tetromino orientations consist of four unique cells and canonical colors', () => {
  assert.equal(Object.keys(PIECES).length, 7);
  for (const [type, states] of Object.entries(PIECES)) {
    assert.match(COLORS[type], /^#[0-9a-f]{6}$/i);
    assert.equal(states.length, 4);
    for (const cells of states) {
      assert.equal(cells.length, 4);
      assert.equal(new Set(cells.map(String)).size, 4);
    }
  }
});
test('seed produces identical sequences and each consecutive bag has seven pieces', () => {
  const a = game(),
    b = game(),
    sequence = [];
  for (let i = 0; i < 140; i++) {
    assert.equal(a.active.type, b.active.type);
    sequence.push(a.active.type);
    a._spawn();
    b._spawn();
    assert.ok(a.queue.length >= 5);
  }
  for (let i = 0; i < sequence.length; i += 7)
    assert.equal(new Set(sequence.slice(i, i + 7)).size, 7);
});
test('restart resets state, time, hold and deterministic sequence', () => {
  const g = game(),
    first = g.active.type;
  g.hold();
  g.hardDrop();
  g.update(0.4);
  g.start();
  assert.equal(g.active.type, first);
  assert.equal(g.score, 0);
  assert.equal(g.elapsed, 0);
  assert.equal(g.held, null);
  assert.equal(g.status, 'playing');
});
test('movement cannot cross walls or occupied cells', () => {
  const g = game();
  piece(g, 'O', -1, 5);
  assert.equal(g.move(-1), false);
  assert.equal(g.active.x, -1);
  assert.equal(g.move(1), true);
  g.board[5][3] = 'J';
  assert.equal(g.move(1), false);
});
test('SRS four rotations return to original geometry in open space', () => {
  for (const type of Object.keys(PIECES)) {
    const g = game();
    piece(g, type, 3, 5);
    const original = g.cells();
    for (let i = 0; i < 4; i++) assert.equal(g.rotate(1), true);
    assert.deepEqual(g.cells(), original);
    for (let i = 0; i < 4; i++) assert.equal(g.rotate(-1), true);
    assert.deepEqual(g.cells(), original);
  }
});
test('JLSTZ SRS kicks right from left wall', () => {
  const g = game();
  piece(g, 'T', -1, 5, 1);
  assert.ok(g._fits(g.active));
  assert.equal(g.rotate(-1), true);
  assert.equal(g.active.x, 0);
  assert.equal(g.active.rotation, 0);
});
test('I uses its distinct two-cell left-wall kick', () => {
  const g = game();
  piece(g, 'I', -2, 5, 1);
  assert.ok(g._fits(g.active));
  assert.equal(g.rotate(-1), true);
  assert.equal(g.active.x, 0);
  assert.equal(g.active.rotation, 0);
});
test('floor kick moves T upwards when rotated against floor', () => {
  const g = game();
  piece(g, 'T', 3, 18);
  assert.equal(g.rotate(1), true);
  assert.equal(g.active.y, 17);
  assert.equal(g.active.x, 2);
});
test('blocked rotation leaves piece and last action unchanged', () => {
  const g = game();
  piece(g, 'T', 3, 10);
  const cells = g.cells(),
    before = { ...g.active };
  g.board = Array.from({ length: 20 }, () => Array(10).fill('J'));
  for (const { x, y } of cells) g.board[y][x] = null;
  assert.equal(g.rotate(1), false);
  assert.deepEqual(g.active, before);
});
test('ghost accounts for board obstacles without mutating active', () => {
  const g = game();
  piece(g, 'O', 3, 0);
  g.board[12][4] = 'J';
  assert.equal(g.ghostY(), 10);
  assert.equal(g.active.y, 0);
});
test('hard drop is immediate and scores two points per traversed cell', () => {
  const g = game();
  piece(g, 'O', 3, 0);
  g.drainEvents();
  assert.equal(g.hardDrop(), true);
  assert.equal(g.score, 36);
  assert.equal(g.board[19][4], 'O');
  assert.equal(g.piecesPlaced, 1);
  const events = g.drainEvents();
  assert.equal(events[0].type, 'hardDrop');
  assert.equal(events[0].distance, 18);
  assert.equal(events[1].type, 'lock');
});
test('soft drop scores one point and never penetrates floor', () => {
  const g = game();
  piece(g, 'O', 3, 17);
  assert.equal(g.softDrop(), true);
  assert.equal(g.score, 1);
  assert.equal(g.softDrop(), false);
  assert.equal(g.score, 1);
  assert.equal(g.piecesPlaced, 0);
});
test('hold can only occur once per piece and swap resets orientation', () => {
  const g = game(),
    first = g.active.type,
    next = g.queue[0];
  assert.equal(g.hold(), true);
  assert.equal(g.held, first);
  assert.equal(g.active.type, next);
  assert.equal(g.hold(), false);
  g.hardDrop();
  const current = g.active.type;
  assert.equal(g.hold(), true);
  assert.equal(g.active.type, first);
  assert.equal(g.held, current);
  assert.equal(g.active.rotation, 0);
  assert.equal(g.active.x, 3);
});
test('gravity advances at level-one interval', () => {
  const g = game();
  piece(g, 'O', 3, 0);
  g.update(0.99);
  assert.equal(g.active.y, 0);
  g.update(0.02);
  assert.equal(g.active.y, 1);
});
test('landing has a half-second lock delay', () => {
  const g = game();
  piece(g, 'O', 3, 18);
  g.update(0.49);
  assert.equal(g.piecesPlaced, 0);
  g.update(0.02);
  assert.equal(g.piecesPlaced, 1);
});
test('ground movement resets lock delay but only fifteen times', () => {
  const g = game();
  piece(g, 'O', 3, 18);
  for (let i = 0; i < 15; i++) {
    g.update(0.2);
    g.move(i % 2 ? -1 : 1);
  }
  assert.equal(g._lockResets, 15);
  assert.equal(g.piecesPlaced, 0);
  g.update(0.3);
  g.move(-1);
  g.update(0.21);
  assert.equal(g.piecesPlaced, 1);
});
test('paused game accepts no controls, scoring or simulation', () => {
  const g = game(),
    before = { ...g.active };
  g.setPaused(true);
  g.update(1);
  assert.equal(g.move(1), false);
  assert.equal(g.rotate(), false);
  assert.equal(g.hardDrop(), false);
  assert.equal(g.softDrop(), false);
  assert.equal(g.hold(), false);
  assert.deepEqual(g.active, before);
  assert.equal(g.elapsed, 0);
  g.setPaused(false);
  assert.equal(g.status, 'playing');
});
test('single clears collapse above rows and awards 100', () => {
  const g = game();
  singleWell(g);
  g.board[10][0] = 'Z';
  g.hardDrop();
  assert.equal(g.lines, 1);
  assert.equal(g.score, 100);
  assert.equal(g.board[11][0], 'Z');
  assert.equal(g.board[10][0], null);
  assert.equal(g.drainEvents().find((e) => e.type === 'clear').label, 'SINGLE');
});
test('four-line clear awards 800 and starts B2B', () => {
  const g = game();
  tetrisWell(g);
  g.hardDrop();
  assert.equal(g.lines, 4);
  assert.equal(g.score, 800);
  assert.equal(g.backToBack, true);
  assert.equal(g.board.flat().filter(Boolean).length, 1);
});
test('back-to-back tetrises apply 1.5 multiplier and combo bonus', () => {
  const g = game();
  tetrisWell(g);
  g.hardDrop();
  tetrisWell(g);
  g.hardDrop();
  assert.equal(g.score, 2050);
  assert.equal(g.combo, 1);
  assert.equal(
    g.drainEvents().filter((e) => e.type === 'clear')[1].backToBack,
    true
  );
});
test('nonclearing lock preserves B2B but resets combo', () => {
  const g = game();
  tetrisWell(g);
  g.hardDrop();
  piece(g, 'O', 0, 18);
  g.hardDrop();
  assert.equal(g.backToBack, true);
  assert.equal(g.combo, -1);
  tetrisWell(g);
  g.hardDrop();
  assert.equal(g.score, 2000);
});
test('ordinary clear breaks B2B and level scales subsequent scoring', () => {
  const g = game();
  g.lines = 9;
  g.backToBack = true;
  singleWell(g);
  g.hardDrop();
  assert.equal(g.backToBack, false);
  assert.equal(g.level, 2);
  assert.equal(g.score, 100);
  singleWell(g);
  g.hardDrop();
  assert.equal(g.score, 400);
  assert.ok(g.gravityInterval < 1);
});
test('T-spin double recognizes front corners and scores 1200', () => {
  const g = game();
  piece(g, 'T', 3, 17, 0);
  g.board[17] = Array(10).fill('J');
  g.board[17][4] = null;
  g.board[18] = Array(10).fill('J');
  for (let x = 3; x <= 5; x++) g.board[18][x] = null;
  g.board[19][3] = 'J';
  g._lastRotation = { kick: 0 };
  g.hardDrop();
  assert.equal(g.lines, 2);
  assert.equal(g.score, 1200);
  assert.equal(
    g.drainEvents().find((e) => e.type === 'clear').label,
    'T-SPIN DOUBLE'
  );
});
test('T-spin mini recognizes rear corners and fifth kick upgrades it', () => {
  for (const kick of [0, 4]) {
    const g = game();
    piece(g, 'T', 3, 17, 0);
    g.board[17][3] = 'J';
    g.board[19][3] = 'J';
    g.board[19][5] = 'J';
    g._lastRotation = { kick };
    g.hardDrop();
    assert.equal(g.score, kick === 4 ? 400 : 100);
    assert.equal(
      g.drainEvents().find((e) => e.type === 'clear').label,
      kick === 4 ? 'T-SPIN' : 'T-SPIN MINI'
    );
  }
});
test('translation after rotation invalidates spin credit', () => {
  const g = game();
  piece(g, 'T', 3, 17, 0);
  g._lastRotation = { kick: 0 };
  assert.equal(g.move(1), true);
  assert.equal(g._lastRotation, null);
});
test('spawn collision ends game and disables further actions', () => {
  const g = game();
  g.board[0] = Array(10).fill('Z');
  g._spawn('T');
  assert.equal(g.status, 'over');
  assert.equal(g.active, null);
  assert.equal(g.hardDrop(), false);
  assert.equal(g.move(1), false);
});
test('full above-field lock-out ends game', () => {
  const g = game();
  piece(g, 'O', 0, -2);
  g.board[0][1] = 'Z';
  g.hardDrop();
  assert.equal(g.status, 'over');
  assert.equal(g.piecesPlaced, 0);
});
test('partial above-field lock preserves hidden cells and can continue', () => {
  const g = game();
  piece(g, 'O', 0, -1);
  g.board[1][1] = 'Z';
  g.hardDrop();
  assert.equal(g.status, 'playing');
  assert.equal(g.piecesPlaced, 1);
  assert.equal(g._hidden[19][1], 'O');
  assert.equal(g.board[0][1], 'O');
});
test('line clears pull hidden locked cells into the visible field', () => {
  const g = game();
  piece(g, 'O', 0, -1);
  g.board[0] = Array(10).fill('J');
  g.board[0][1] = null;
  g.board[0][2] = null;
  g.board[1][1] = 'Z';
  g.hardDrop();
  assert.equal(g.lines, 1);
  assert.equal(g.board[0][1], 'O');
  assert.equal(g.board[0][2], 'O');
  assert.equal(g._hidden[19][1], null);
});
test('sprint finishes at forty lines', () => {
  const g = new Game({ mode: 'sprint', seed: 1 }).start();
  g.lines = 36;
  tetrisWell(g);
  g.hardDrop();
  assert.equal(g.lines, 40);
  assert.equal(g.status, 'won');
  assert.equal(g.active, null);
  assert.ok(g.drainEvents().some((e) => e.type === 'win'));
});
test('marathon continues after forty lines', () => {
  const g = game();
  g.lines = 36;
  tetrisWell(g);
  g.hardDrop();
  assert.equal(g.status, 'playing');
  assert.equal(g.level, 5);
});
test('invalid delta time does not corrupt state', () => {
  const g = game();
  for (const dt of [NaN, Infinity, -1, 0]) g.update(dt);
  assert.equal(g.elapsed, 0);
  assert.equal(g.status, 'playing');
});
test('event drain empties queue without mutating previous batch', () => {
  const g = game();
  const events = g.drainEvents();
  assert.ok(events.length);
  assert.deepEqual(g.drainEvents(), []);
  g.move(1);
  assert.equal(events.length, 1);
});
test('randomized input simulation preserves field and active invariants', () => {
  let random = 7;
  const rand = () => {
    random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
    return random / 2 ** 32;
  };
  const g = game();
  let games = 0;
  for (let i = 0; i < 10000; i++) {
    if (g.status === 'over') {
      g.start();
      games++;
    }
    const action = Math.floor(rand() * 7);
    if (action === 0) g.move(-1);
    else if (action === 1) g.move(1);
    else if (action === 2) g.rotate(1);
    else if (action === 3) g.rotate(-1);
    else if (action === 4) g.softDrop();
    else if (action === 5) g.hardDrop();
    else g.hold();
    g.update(rand() * 0.05);
    assert.equal(g.board.length, 20);
    assert.ok(g.board.every((row) => row.length === 10));
    assert.ok(Number.isFinite(g.score));
    if (g.active) assert.ok(g._fits(g.active));
  }
  assert.ok(games > 20);
});

test('single perfect clear adds 800 and marks the event', () => {
  const g = game();
  singleWell(g, true);
  g.hardDrop();
  assert.equal(g.score, 900);
  const e = g.drainEvents().find((e) => e.type === 'clear');
  assert.equal(e.allClear, true);
  assert.equal(e.label, 'PERFECT CLEAR');
  assert.equal(e.lineLabel, 'SINGLE');
  assert.equal(e.perfectClearPoints, 800);
});
test('four-line perfect clears and B2B have distinct bonus values', () => {
  const g = game();
  tetrisWell(g, true);
  g.hardDrop();
  assert.equal(g.score, 2800);
  tetrisWell(g, true);
  g.hardDrop();
  assert.equal(g.score, 7250);
  const events = g.drainEvents().filter((e) => e.type === 'clear');
  assert.deepEqual(
    events.map((e) => e.perfectClearPoints),
    [2000, 3200]
  );
});
test('perfect-clear bonus scales using level before clear', () => {
  const g = game();
  g.level = 3;
  g.lines = 29;
  singleWell(g, true);
  g.hardDrop();
  assert.equal(g.score, 2700);
  assert.equal(g.level, 4);
});
test('hidden minos prevent false perfect-clear award', () => {
  const g = game();
  singleWell(g, true);
  g._hidden[0][0] = 'J';
  g.hardDrop();
  assert.equal(g.score, 100);
  assert.equal(g.drainEvents().find((e) => e.type === 'clear').allClear, false);
});
test('sprint remains at level one through each threshold', () => {
  const g = new Game({ mode: 'sprint', seed: 1 }).start();
  for (let i = 0; i < 10; i++) {
    tetrisWell(g);
    g.hardDrop();
    assert.equal(g.level, 1);
    assert.equal(g.gravityInterval, 1);
  }
  assert.equal(g.status, 'won');
  assert.equal(g.drainEvents().filter((e) => e.type === 'level').length, 0);
});
test('high marathon gravity stays positive, bounded and nonincreasing', () => {
  const g = game();
  let previous = Infinity;
  for (let level = 1; level <= 1000; level++) {
    g.level = level;
    assert.ok(Number.isFinite(g.gravityInterval));
    assert.ok(g.gravityInterval >= 1 / 1200);
    assert.ok(g.gravityInterval <= previous);
    previous = g.gravityInterval;
  }
  piece(g, 'O', 3, 0);
  g.update(0.4);
  assert.equal(g.active.y, 18);
  assert.equal(g.piecesPlaced, 0);
  g.update(0.5);
  assert.equal(g.piecesPlaced, 1);
});
test('failed lateral input and zero-distance drop preserve spin credit', () => {
  const g = game();
  piece(g, 'T', 3, 17, 0);
  g.board[17][3] = 'J';
  g.board[17][5] = 'J';
  g.board[19][3] = 'J';
  g._lastRotation = { kick: 0 };
  assert.equal(g.move(-1), false);
  assert.equal(g._spin(), 'full');
  assert.equal(g.ghostY(), 17);
  g.hardDrop();
  assert.equal(g.score, 400);
});
test('gravity timing is independent of display frame size', () => {
  const a = game(),
    b = game();
  for (const g of [a, b]) {
    piece(g, 'O', 3, 0);
    g.level = 10;
  }
  for (let i = 0; i < 240; i++) a.update(1 / 120);
  for (let i = 0; i < 60; i++) b.update(1 / 30);
  assert.deepEqual(a.board, b.board);
  assert.deepEqual(a.active, b.active);
  assert.equal(a.piecesPlaced, b.piecesPlaced);
  assert.ok(Math.abs(a.elapsed - b.elapsed) < 1e-10);
});
test('double and triple perfect-clear bonuses use their own tiers', () => {
  for (const [count, type, rotation, y, expected, bonus] of [
    [2, 'O', 0, 18, 1500, 1200],
    [3, 'T', 1, 17, 2300, 1800]
  ]) {
    const g = game();
    piece(g, type, 3, y, rotation);
    for (let row = 20 - count; row < 20; row++)
      g.board[row] = Array(10).fill('J');
    for (const { x, y: cy } of g.cells()) g.board[cy][x] = null;
    g.hardDrop();
    assert.equal(g.score, expected);
    assert.equal(
      g.drainEvents().find((e) => e.type === 'clear').perfectClearPoints,
      bonus
    );
  }
});
test('hold swap colliding with spawn ends run without overwriting stack', () => {
  const g = game();
  piece(g, 'O', 0, 10);
  g.held = 'I';
  g.board[0][4] = 'J';
  assert.equal(g.hold(), true);
  assert.equal(g.status, 'over');
  assert.equal(g.board[0][4], 'J');
});
test('new lower landing resets lock time after leaving a ledge', () => {
  const g = game();
  piece(g, 'O', 0, 8);
  g.board[10][1] = 'J';
  g.update(0.4);
  assert.equal(g.piecesPlaced, 0);
  g.move(1);
  g.move(1);
  assert.equal(g._grounded(), false);
  g.softDrop();
  assert.equal(g._lockTime, 0);
  assert.equal(g.active.y, 9);
});

test('20G reaches the floor in one 60Hz frame but preserves lock delay', () => {
  const g = game();
  g.level = 30;
  g.lines = 290;
  piece(g, 'O', 3, -1);
  assert.equal(g.gravityInterval, 1 / 1200);
  g.update(1 / 60);
  assert.equal(g.active.y, 18);
  assert.equal(g.piecesPlaced, 0);
  g.update(0.48);
  assert.equal(g.piecesPlaced, 0);
  g.update(0.03);
  assert.equal(g.piecesPlaced, 1);
});
test('20G stops at stack collision with bounded gravity work', () => {
  const g = game();
  g.level = 1000;
  g.lines = 9990;
  piece(g, 'O', 3, -1);
  g.board[8][4] = 'J';
  let attempts = 0;
  const down = g._down.bind(g);
  g._down = () => {
    attempts++;
    return down();
  };
  g.update(1 / 60);
  assert.equal(g.active.y, 6);
  assert.equal(g.piecesPlaced, 0);
  assert.ok(attempts <= 20);
  g.update(1);
  assert.ok(attempts <= 200);
  assert.ok(g.piecesPlaced <= 2);
  assert.equal(g.board[8][4], 'J');
});
test('20G grounded movement still receives the standard lock reset', () => {
  const g = game();
  g.level = 30;
  g.lines = 290;
  piece(g, 'O', 3, -1);
  g.update(0.4);
  assert.equal(g.piecesPlaced, 0);
  g.move(1);
  g.update(0.49);
  assert.equal(g.piecesPlaced, 0);
  g.update(0.02);
  assert.equal(g.piecesPlaced, 1);
});
