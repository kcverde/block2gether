// Deterministic, DOM-free modern falling-block rules. Coordinates use positive y down.
export const COLORS = Object.freeze({
  I: '#66e5f5',
  O: '#f4d477',
  T: '#bd95fb',
  S: '#85dfb0',
  Z: '#fa879c',
  J: '#81aaff',
  L: '#f7b278'
});
const initial = {
  I: [
    [0, 1],
    [1, 1],
    [2, 1],
    [3, 1]
  ],
  O: [
    [1, 0],
    [2, 0],
    [1, 1],
    [2, 1]
  ],
  T: [
    [1, 0],
    [0, 1],
    [1, 1],
    [2, 1]
  ],
  S: [
    [1, 0],
    [2, 0],
    [0, 1],
    [1, 1]
  ],
  Z: [
    [0, 0],
    [1, 0],
    [1, 1],
    [2, 1]
  ],
  J: [
    [0, 0],
    [0, 1],
    [1, 1],
    [2, 1]
  ],
  L: [
    [2, 0],
    [0, 1],
    [1, 1],
    [2, 1]
  ]
};
export const PIECES = Object.fromEntries(
  Object.entries(initial).map(([type, cells]) => {
    const states = [cells];
    for (let i = 1; i < 4; i++)
      states.push(
        type === 'O'
          ? cells
          : states[i - 1].map(([x, y]) => [(type === 'I' ? 3 : 2) - y, x])
      );
    return [type, states];
  })
);
// SRS tables expressed in their published upward-positive coordinate system.
const NORMAL_KICKS = {
  '0>1': [
    [0, 0],
    [-1, 0],
    [-1, 1],
    [0, -2],
    [-1, -2]
  ],
  '1>0': [
    [0, 0],
    [1, 0],
    [1, -1],
    [0, 2],
    [1, 2]
  ],
  '1>2': [
    [0, 0],
    [1, 0],
    [1, -1],
    [0, 2],
    [1, 2]
  ],
  '2>1': [
    [0, 0],
    [-1, 0],
    [-1, 1],
    [0, -2],
    [-1, -2]
  ],
  '2>3': [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, -2],
    [1, -2]
  ],
  '3>2': [
    [0, 0],
    [-1, 0],
    [-1, -1],
    [0, 2],
    [-1, 2]
  ],
  '3>0': [
    [0, 0],
    [-1, 0],
    [-1, -1],
    [0, 2],
    [-1, 2]
  ],
  '0>3': [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, -2],
    [1, -2]
  ]
};
const I_KICKS = {
  '0>1': [
    [0, 0],
    [-2, 0],
    [1, 0],
    [-2, -1],
    [1, 2]
  ],
  '1>0': [
    [0, 0],
    [2, 0],
    [-1, 0],
    [2, 1],
    [-1, -2]
  ],
  '1>2': [
    [0, 0],
    [-1, 0],
    [2, 0],
    [-1, 2],
    [2, -1]
  ],
  '2>1': [
    [0, 0],
    [1, 0],
    [-2, 0],
    [1, -2],
    [-2, 1]
  ],
  '2>3': [
    [0, 0],
    [2, 0],
    [-1, 0],
    [2, 1],
    [-1, -2]
  ],
  '3>2': [
    [0, 0],
    [-2, 0],
    [1, 0],
    [-2, -1],
    [1, 2]
  ],
  '3>0': [
    [0, 0],
    [1, 0],
    [-2, 0],
    [1, -2],
    [-2, 1]
  ],
  '0>3': [
    [0, 0],
    [-1, 0],
    [2, 0],
    [-1, 2],
    [2, -1]
  ]
};
const emptyRow = () => Array(10).fill(null);
function randomSource(seed) {
  if (seed === undefined) return Math.random;
  let state =
    typeof seed === 'number'
      ? seed >>> 0
      : [...String(seed)].reduce(
          (h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0,
          0
        );
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export class Game {
  constructor({ mode = 'marathon', seed, now } = {}) {
    this.mode = mode;
    this.seed = seed;
    // The app supplies a monotonic clock in seconds; simulations keep deterministic dt timing.
    this._now = now;
    this._reset();
  }
  _reset() {
    this._random = randomSource(this.seed);
    this.board = Array.from({ length: 20 }, emptyRow);
    this._hidden = Array.from({ length: 20 }, emptyRow);
    this.active = null;
    this.queue = [];
    this.held = null;
    this.canHold = true;
    this.score = 0;
    this.lines = 0;
    this.level = 1;
    this.elapsed = 0;
    this._clockTime = null;
    this.status = 'ready';
    this.combo = -1;
    this.backToBack = false;
    this.events = [];
    this.piecesPlaced = 0;
    this._fillQueue();
  }
  start() {
    this._reset();
    this._syncElapsed();
    this.status = 'playing';
    this.events.push({ type: 'start' });
    this._spawn();
    return this;
  }
  _fillQueue() {
    while (this.queue.length < 7) {
      const bag = Object.keys(PIECES);
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(this._random() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
      this.queue.push(...bag);
    }
  }
  _spawn(type) {
    if (!type) {
      type = this.queue.shift();
      this._fillQueue();
    }
    this.active = { type, rotation: 0, x: 3, y: -1 };
    this._gravityTime = 0;
    this._lockTime = 0;
    this._lockResets = 0;
    this._lowestY = -1;
    this._lastRotation = null;
    if (!this._fits(this.active)) this._end();
  }
  cells(piece = this.active) {
    return piece
      ? PIECES[piece.type][piece.rotation].map(([x, y]) => ({
          x: x + piece.x,
          y: y + piece.y
        }))
      : [];
  }
  _occupied(x, y) {
    return (
      x < 0 ||
      x >= 10 ||
      y >= 20 ||
      y < -20 ||
      !!(y < 0 ? this._hidden[y + 20][x] : this.board[y][x])
    );
  }
  _fits(piece) {
    return this.cells(piece).every(({ x, y }) => !this._occupied(x, y));
  }
  _grounded() {
    return this.active && !this._fits({ ...this.active, y: this.active.y + 1 });
  }
  ghostY() {
    if (!this.active) return 0;
    let y = this.active.y;
    while (this._fits({ ...this.active, y: y + 1 })) y++;
    return y;
  }
  _resetLock(wasGrounded) {
    if (wasGrounded && this._lockResets < 15) {
      this._lockTime = 0;
      this._lockResets++;
    }
  }
  move(dx) {
    if (
      this.status !== 'playing' ||
      !this.active ||
      !Number.isFinite(dx) ||
      dx === 0
    )
      return false;
    dx = Math.sign(dx);
    const target = { ...this.active, x: this.active.x + dx };
    if (!this._fits(target)) return false;
    const grounded = this._grounded();
    this.active = target;
    this._lastRotation = null;
    this._resetLock(grounded);
    this.events.push({ type: 'move', direction: dx });
    return true;
  }
  rotate(direction = 1) {
    if (this.status !== 'playing' || !this.active) return false;
    const from = this.active.rotation,
      to = (from + (direction < 0 ? 3 : 1)) % 4;
    const kicks =
      this.active.type === 'O'
        ? [[0, 0]]
        : (this.active.type === 'I' ? I_KICKS : NORMAL_KICKS)[`${from}>${to}`];
    for (let i = 0; i < kicks.length; i++) {
      const [dx, dy] = kicks[i],
        target = {
          ...this.active,
          rotation: to,
          x: this.active.x + dx,
          y: this.active.y - dy
        };
      if (!this._fits(target)) continue;
      const grounded = this._grounded();
      this.active = target;
      this._lastRotation = { kick: i };
      this._resetLock(grounded);
      this.events.push({
        type: 'rotate',
        direction: direction < 0 ? -1 : 1,
        kick: i
      });
      return true;
    }
    return false;
  }
  _down() {
    if (!this._fits({ ...this.active, y: this.active.y + 1 })) return false;
    this.active.y++;
    this._lastRotation = null;
    if (this.active.y > this._lowestY) {
      this._lowestY = this.active.y;
      this._lockTime = 0;
    }
    return true;
  }
  softDrop() {
    if (this.status !== 'playing' || !this.active || !this._down())
      return false;
    this.score++;
    this._gravityTime = 0;
    this.events.push({ type: 'softDrop' });
    return true;
  }
  hardDrop() {
    if (this.status !== 'playing' || !this.active) return false;
    const y = this.ghostY(),
      distance = y - this.active.y;
    if (distance > 0) this._lastRotation = null;
    this.active.y = y;
    this.score += distance * 2;
    this.events.push({
      type: 'hardDrop',
      distance,
      cells: this.cells(),
      piece: { ...this.active }
    });
    this._lock();
    return true;
  }
  hold() {
    if (this.status !== 'playing' || !this.active || !this.canHold)
      return false;
    const current = this.active.type,
      held = this.held;
    this.held = current;
    this._spawn(held);
    this.canHold = false;
    this.events.push({ type: 'hold' });
    return true;
  }
  _syncElapsed() {
    if (!this._now) return;
    const now = this._now();
    if (!Number.isFinite(now)) return;
    if (this.status === 'playing' && this._clockTime !== null) {
      this.elapsed += Math.max(0, now - this._clockTime);
    }
    this._clockTime = now;
  }
  setPaused(paused) {
    this._syncElapsed();
    if (paused && this.status === 'playing') this.status = 'paused';
    else if (!paused && this.status === 'paused') this.status = 'playing';
  }
  // Standard exponential acceleration, capped at 20 cells per 60 Hz frame (20G).
  // Each 120 Hz simulation slice therefore attempts at most ten gravity steps.
  get gravityInterval() {
    return Math.max(
      1 / 1200,
      Math.pow(Math.max(0.1, 0.8 - (this.level - 1) * 0.007), this.level - 1)
    );
  }
  update(dt) {
    if (
      this.status !== 'playing' ||
      !this.active ||
      !Number.isFinite(dt) ||
      dt <= 0
    )
      return;
    this._syncElapsed();
    // Slice simulation time so landing mid-frame cannot consume a whole frame of lock delay.
    let remaining = Math.min(dt, 1);
    while (remaining > 0 && this.status === 'playing') {
      const step = Math.min(remaining, 1 / 120);
      remaining -= step;
      if (!this._now) this.elapsed += step;
      this._gravityTime += step;
      while (this._gravityTime + 1e-10 >= this.gravityInterval) {
        this._gravityTime -= this.gravityInterval;
        if (!this._down()) {
          this._gravityTime = 0;
          break;
        }
      }
      if (this._grounded()) {
        this._lockTime += step;
        if (this._lockTime + 1e-10 >= 0.5) this._lock();
      }
    }
  }
  _spin() {
    if (this.active.type !== 'T' || !this._lastRotation) return null;
    const { x, y, rotation } = this.active;
    const occupied = (cx, cy) => this._occupied(cx, cy);
    const corners = [
      [x, y],
      [x + 2, y],
      [x + 2, y + 2],
      [x, y + 2]
    ].map(([cx, cy]) => occupied(cx, cy));
    if (corners.filter(Boolean).length < 3) return null;
    const front = [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 0]
    ][rotation];
    return (corners[front[0]] && corners[front[1]]) ||
      this._lastRotation.kick === 4
      ? 'full'
      : 'mini';
  }
  _lock() {
    const cells = this.cells(),
      piece = { ...this.active },
      spin = this._spin();
    // Full lock-out: partially visible pieces can survive, including clears that
    // pull cells out of the hidden spawn area into the visible playfield.
    if (cells.every(({ y }) => y < 0)) {
      this._end();
      return;
    }
    for (const { x, y } of cells)
      (y < 0 ? this._hidden[y + 20] : this.board[y])[x] = piece.type;
    this.piecesPlaced++;
    this.events.push({ type: 'lock', cells, piece });
    const rows = [];
    for (let y = 0; y < 20; y++) if (this.board[y].every(Boolean)) rows.push(y);
    const count = rows.length,
      difficult = count > 0 && (count === 4 || !!spin);
    const b2b = difficult && this.backToBack;
    let points =
      (spin === 'full'
        ? [400, 800, 1200, 1600][count]
        : spin === 'mini'
          ? [100, 200, 400][count]
          : [0, 100, 300, 500, 800][count]) || 0;
    points *= this.level;
    if (b2b) points = Math.floor(points * 1.5);
    if (count) {
      this.combo++;
      points += 50 * this.combo * this.level;
      this.backToBack = difficult;
      const field = [...this._hidden, ...this.board].filter(
        (_, y) => !rows.includes(y - 20)
      );
      while (field.length < 40) field.unshift(emptyRow());
      this._hidden = field.slice(0, 20);
      this.board = field.slice(20);
    } else this.combo = -1;
    const allClear =
      count > 0 &&
      this.board.every((row) => row.every((cell) => !cell)) &&
      this._hidden.every((row) => row.every((cell) => !cell));
    const perfectClearPoints = allClear
      ? (count === 4 && b2b ? 3200 : [0, 800, 1200, 1800, 2000][count]) *
        this.level
      : 0;
    points += perfectClearPoints;
    this.score += points;
    this.lines += count;
    if (count || spin) {
      const lineNames = ['', 'SINGLE', 'DOUBLE', 'TRIPLE', 'TETRIS'];
      const lineLabel = spin
        ? `T-SPIN${spin === 'mini' ? ' MINI' : ''}${count ? ' ' + lineNames[count] : ''}`
        : lineNames[count];
      const label = allClear ? 'PERFECT CLEAR' : lineLabel;
      this.events.push({
        type: 'clear',
        rows,
        count,
        points,
        label,
        lineLabel,
        allClear,
        perfectClearPoints,
        combo: this.combo,
        backToBack: b2b
      });
    }
    const nextLevel =
      this.mode === 'sprint' ? 1 : Math.floor(this.lines / 10) + 1;
    if (nextLevel !== this.level) {
      this.level = nextLevel;
      this.events.push({ type: 'level', level: this.level });
    }
    if (this.mode === 'sprint' && this.lines >= 40) {
      this._syncElapsed();
      this.active = null;
      this.status = 'won';
      this.events.push({ type: 'win' });
      return;
    }
    this.canHold = true;
    this._spawn();
  }
  _end() {
    this._syncElapsed();
    this.status = 'over';
    this.active = null;
    this.events.push({ type: 'over' });
  }
  drainEvents() {
    const events = this.events;
    this.events = [];
    return events;
  }
}
