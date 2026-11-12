import { COLORS } from './engine.js';

const FALLBACK = {
  I: '#6de3f3',
  O: '#f5d375',
  T: '#b492ff',
  S: '#80e2ad',
  Z: '#ff7f98',
  J: '#779dff',
  L: '#ffb573'
};
const MINI = {
  I: [
    [0, 0],
    [1, 0],
    [2, 0],
    [3, 0]
  ],
  O: [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1]
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
const color = (type) => COLORS?.[type] || FALLBACK[type] || '#b492ff';
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

function rounded(ctx, x, y, w, h, radius = 4) {
  const r = Math.min(radius, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function block(ctx, x, y, size, type, alpha = 1) {
  const gap = Math.max(1.3, size * 0.055),
    s = size - gap * 2,
    r = size * 0.12;
  x += gap;
  y += gap;
  ctx.save();
  ctx.globalAlpha *= alpha;
  rounded(ctx, x, y, s, s, r);
  ctx.fillStyle = color(type);
  ctx.fill();
  const body = ctx.createLinearGradient(x, y, x + s, y + s);
  body.addColorStop(0, 'rgba(255,255,255,.21)');
  body.addColorStop(0.42, 'rgba(255,255,255,.025)');
  body.addColorStop(1, 'rgba(8,9,28,.33)');
  ctx.fillStyle = body;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.29)';
  ctx.lineWidth = 0.65;
  ctx.stroke();
  rounded(ctx, x + 2, y + 2, s - 4, s - 4, Math.max(1, r - 1));
  ctx.strokeStyle = 'rgba(255,255,255,.12)';
  ctx.stroke();
  const cap = ctx.createLinearGradient(0, y, 0, y + s * 0.45);
  cap.addColorStop(0, 'rgba(255,255,255,.32)');
  cap.addColorStop(1, 'rgba(255,255,255,0)');
  rounded(ctx, x + 2, y + 2, s - 4, s * 0.42, Math.max(1, r - 1));
  ctx.fillStyle = cap;
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x + r, y + 1);
  ctx.lineTo(x + s - r, y + 1);
  ctx.strokeStyle = 'rgba(255,255,255,.65)';
  ctx.lineWidth = 0.8;
  ctx.stroke();
  ctx.restore();
}

export function drawMini(canvas, type) {
  if (!canvas) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 3),
    w = canvas.clientWidth || 120,
    h = canvas.clientHeight || 66;
  if (
    canvas.width !== Math.round(w * dpr) ||
    canvas.height !== Math.round(h * dpr)
  ) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  if (!MINI[type]) return;
  const cells = MINI[type],
    cols = Math.max(...cells.map((c) => c[0])) + 1,
    rows = Math.max(...cells.map((c) => c[1])) + 1;
  const s = Math.min((w - 12) / 4, (h - 8) / 2, 27),
    x = (w - cols * s) / 2,
    y = (h - rows * s) / 2;
  for (const [cx, cy] of cells) block(ctx, x + cx * s, y + cy * s, s, type);
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: true });
    this.width = 0;
    this.height = 0;
    this.dpr = 1;
    this.time = 0;
    this.effects = [];
    this.particles = [];
    this.sprites = new Map();
    this.boardRect = { x: 0, y: 0, w: 0, h: 0, cell: 0 };
    this.reducedMotion = false;
    this.shake = 0;
    this.resize();
  }
  resize() {
    const w = this.canvas.clientWidth || 440,
      h = this.canvas.clientHeight || 690,
      dpr = Math.min(window.devicePixelRatio || 1, 3);
    if (w === this.width && h === this.height && dpr === this.dpr) return;
    this.width = w;
    this.height = h;
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    const cell = Math.max(1, Math.min((w - 34) / 10, (h - 34) / 20));
    this.boardRect = {
      x: (w - cell * 10) / 2,
      y: (h - cell * 20) / 2,
      w: cell * 10,
      h: cell * 20,
      cell
    };
    this.sprites.clear();
    this.makeBackground();
  }
  makeBackground() {
    const bg = document.createElement('canvas');
    bg.width = this.canvas.width;
    bg.height = this.canvas.height;
    const ctx = bg.getContext('2d');
    ctx.scale(this.dpr, this.dpr);
    const { x, y, w, h, cell } = this.boardRect;
    // A deep optical well, edged in lavender and ice blue.
    ctx.shadowColor = 'rgba(118,94,225,.19)';
    ctx.shadowBlur = 28;
    rounded(ctx, x - 7, y - 7, w + 14, h + 14, 10);
    ctx.fillStyle = '#111323';
    ctx.fill();
    ctx.shadowBlur = 0;
    const rim = ctx.createLinearGradient(x, y, x + w, y + h);
    rim.addColorStop(0, 'rgba(184,166,255,.44)');
    rim.addColorStop(0.45, 'rgba(131,147,202,.09)');
    rim.addColorStop(1, 'rgba(121,206,235,.27)');
    ctx.strokeStyle = rim;
    ctx.lineWidth = 1;
    ctx.stroke();
    const well = ctx.createLinearGradient(x, y, x + w, y + h);
    well.addColorStop(0, '#101322');
    well.addColorStop(0.6, '#0c101c');
    well.addColorStop(1, '#0c1220');
    ctx.fillStyle = well;
    ctx.fillRect(x, y, w, h);
    const light = ctx.createRadialGradient(
      x + w * 0.45,
      y - 40,
      0,
      x + w * 0.45,
      y - 40,
      h * 0.75
    );
    light.addColorStop(0, 'rgba(116,88,180,.08)');
    light.addColorStop(1, 'rgba(116,88,180,0)');
    ctx.fillStyle = light;
    ctx.fillRect(x, y, w, h);
    ctx.lineWidth = 0.5;
    ctx.strokeStyle = 'rgba(166,184,229,.075)';
    ctx.beginPath();
    for (let i = 1; i < 10; i++) {
      ctx.moveTo(x + i * cell, y);
      ctx.lineTo(x + i * cell, y + h);
    }
    for (let i = 1; i < 20; i++) {
      ctx.moveTo(x, y + i * cell);
      ctx.lineTo(x + w, y + i * cell);
    }
    ctx.stroke();
    ctx.fillStyle = 'rgba(189,201,241,.13)';
    for (let row = 2; row < 20; row += 2)
      for (let col = 2; col < 10; col += 2)
        ctx.fillRect(x + col * cell - 0.65, y + row * cell - 0.65, 1.3, 1.3);
    // Tiny precision corner marks are visible without competing with blocks.
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(215,219,255,.45)';
    ctx.beginPath();
    for (const [cx, cy, sx, sy] of [
      [x, y, 1, 1],
      [x + w, y, -1, 1],
      [x, y + h, 1, -1],
      [x + w, y + h, -1, -1]
    ]) {
      ctx.moveTo(cx + sx * 9, cy);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx, cy + sy * 9);
    }
    ctx.stroke();
    this.background = bg;
  }
  sprite(type) {
    if (this.sprites.has(type)) return this.sprites.get(type);
    const s = this.boardRect.cell,
      canvas = document.createElement('canvas');
    canvas.width = Math.ceil(s * this.dpr);
    canvas.height = Math.ceil(s * this.dpr);
    const ctx = canvas.getContext('2d');
    ctx.scale(this.dpr, this.dpr);
    block(ctx, 0, 0, s, type);
    this.sprites.set(type, canvas);
    return canvas;
  }
  tile(x, y, type, alpha = 1) {
    if (y < 0 || y >= 20 || x < 0 || x >= 10) return;
    const { x: bx, y: by, cell } = this.boardRect,
      ctx = this.ctx;
    ctx.globalAlpha = alpha;
    ctx.drawImage(this.sprite(type), bx + x * cell, by + y * cell, cell, cell);
    ctx.globalAlpha = 1;
  }
  handleEvents(events, game) {
    for (const e of events) {
      if (e.type === 'start') {
        this.effects = [];
        this.particles = [];
        this.shake = 0;
      }
      if (e.type === 'hardDrop' && e.distance > 0) {
        this.effects.push({
          kind: 'drop',
          age: 0,
          life: 0.32,
          cells: e.cells || game.cells(),
          distance: e.distance,
          color: color(e.piece?.type || e.piece || game.active?.type)
        });
        if (!this.reducedMotion)
          this.shake = Math.min(3.4, 1 + e.distance * 0.1);
      }
      if (e.type === 'lock') {
        this.effects.push({
          kind: 'lock',
          age: 0,
          life: 0.25,
          cells: e.cells || [],
          color: color(e.piece?.type || e.piece)
        });
      }
      if (e.type === 'clear') {
        this.effects.push({
          kind: 'clear',
          age: 0,
          life: 0.55,
          rows: e.rows || [],
          count: e.count
        });
        if (!this.reducedMotion) {
          for (const row of e.rows || [])
            for (let i = 0; i < 22; i++)
              this.particles.push({
                x: Math.random() * 10,
                y: row + 0.5,
                vx: (Math.random() - 0.5) * 4,
                vy: (Math.random() - 0.75) * 4,
                age: 0,
                life: 0.35 + Math.random() * 0.45,
                size: 0.025 + Math.random() * 0.04,
                color: e.count === 4 ? '#c4b6ff' : '#c3f4ff'
              });
          this.shake = e.count === 4 ? 4 : 1.8;
        }
      }
      if (e.type === 'win') this.effects.push({ kind: 'win', age: 0, life: 2 });
    }
    if (this.effects.length > 32)
      this.effects.splice(0, this.effects.length - 32);
    if (this.particles.length > 240)
      this.particles.splice(0, this.particles.length - 240);
  }
  render(game, dt, settings = {}) {
    this.resize();
    this.reducedMotion = !!settings.reducedMotion;
    dt = clamp(Number.isFinite(dt) ? dt : 0, 0, 0.06);
    this.time += dt;
    const ctx = this.ctx,
      { x, y, w, h, cell } = this.boardRect;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.save();
    if (this.shake > 0.02 && !this.reducedMotion)
      ctx.translate(0, Math.sin(this.time * 90) * this.shake);
    this.shake *= Math.exp(-dt * 22);
    ctx.drawImage(this.background, 0, 0, this.width, this.height);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    for (let row = 0; row < 20; row++)
      for (let col = 0; col < 10; col++) {
        const type = game.board?.[row]?.[col];
        if (type) this.tile(col, row, type, 0.88);
      }
    if (
      game.active &&
      (game.status === 'playing' ||
        game.status === 'paused' ||
        game.status === 'ready')
    ) {
      const cells = game.cells(),
        ghostY = game.ghostY(),
        offset = ghostY - game.active.y;
      // Projection stays wireframe, so an occupied cell is never ambiguous.
      if (offset > 0) {
        ctx.fillStyle = color(game.active.type);
        ctx.strokeStyle = color(game.active.type);
        ctx.lineWidth = 1;
        for (const c of cells) {
          if (c.y + offset < 0) continue;
          const px = x + c.x * cell + cell * 0.11,
            py = y + (c.y + offset) * cell + cell * 0.11,
            s = cell * 0.78;
          rounded(ctx, px, py, s, s, cell * 0.09);
          ctx.globalAlpha = 0.055;
          ctx.fill();
          ctx.globalAlpha = 0.35;
          ctx.stroke();
          ctx.globalAlpha = 0.22;
          ctx.fillRect(px + s * 0.3, py + s * 0.48, s * 0.4, 0.8);
        }
        ctx.globalAlpha = 1;
      }
      for (const c of cells) this.tile(c.x, c.y, game.active.type);
      ctx.strokeStyle = color(game.active.type);
      ctx.lineWidth = 1;
      ctx.globalAlpha = this.reducedMotion
        ? 0.3
        : 0.25 + Math.sin(this.time * 3) * 0.055;
      for (const c of cells) {
        if (c.y < 0) continue;
        rounded(
          ctx,
          x + c.x * cell + 1,
          y + c.y * cell + 1,
          cell - 2,
          cell - 2,
          cell * 0.13
        );
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    this.drawEffects(dt);
    ctx.restore();
    // A very fine luminous baseline anchors the playfield.
    const edge = ctx.createLinearGradient(x, y, x + w, y);
    edge.addColorStop(0, 'rgba(120,180,255,0)');
    edge.addColorStop(0.5, 'rgba(163,173,255,.5)');
    edge.addColorStop(1, 'rgba(120,180,255,0)');
    ctx.fillStyle = edge;
    ctx.fillRect(x, y + h + 4, w, 1);
    ctx.restore();
  }
  drawEffects(dt) {
    const ctx = this.ctx,
      { x, y, w, h, cell } = this.boardRect;
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i];
      e.age += dt;
      const p = e.age / e.life;
      if (p >= 1) {
        this.effects.splice(i, 1);
        continue;
      }
      ctx.save();
      if (e.kind === 'lock') {
        ctx.globalAlpha = (1 - p) * 0.42;
        ctx.fillStyle = '#ffffff';
        for (const c of e.cells) {
          if (c.y >= 0) {
            rounded(
              ctx,
              x + c.x * cell + 2,
              y + c.y * cell + 2,
              cell - 4,
              cell - 4,
              cell * 0.1
            );
            ctx.fill();
          }
        }
      }
      if (e.kind === 'drop' && !this.reducedMotion) {
        const columns = new Map();
        for (const c of e.cells)
          columns.set(c.x, Math.max(columns.get(c.x) ?? -Infinity, c.y));
        ctx.globalAlpha = (1 - p) * 0.2;
        for (const [col, row] of columns) {
          const end = y + (row + 1) * cell,
            start = Math.max(y, end - Math.min(e.distance, 10) * cell);
          const gradient = ctx.createLinearGradient(0, start, 0, end);
          gradient.addColorStop(0, 'rgba(145,180,255,0)');
          gradient.addColorStop(1, e.color);
          ctx.fillStyle = gradient;
          ctx.fillRect(x + col * cell + 2, start, cell - 4, end - start);
        }
      }
      if (e.kind === 'clear') {
        for (const row of e.rows) {
          const py = y + row * cell;
          ctx.globalAlpha = (1 - p) * 0.75;
          ctx.fillStyle = e.count === 4 ? '#d9d0ff' : '#d4f7ff';
          const thickness = this.reducedMotion
            ? 2
            : Math.max(1, cell * (1 - p) ** 3);
          ctx.fillRect(x, py + (cell - thickness) / 2, w, thickness);
          if (!this.reducedMotion) {
            const gradient = ctx.createLinearGradient(x, 0, x + w, 0);
            gradient.addColorStop(0, 'rgba(180,170,255,0)');
            gradient.addColorStop(0.5, 'rgba(215,231,255,.55)');
            gradient.addColorStop(1, 'rgba(180,170,255,0)');
            ctx.globalAlpha = (1 - p) * 0.5;
            ctx.fillStyle = gradient;
            ctx.fillRect(x, py - cell * 0.2, w, cell * 1.4);
          }
        }
      }
      if (e.kind === 'win') {
        ctx.globalAlpha = (1 - p) * 0.2;
        const g = ctx.createLinearGradient(0, y + h, 0, y);
        g.addColorStop(0, '#b9a0ff');
        g.addColorStop(1, 'rgba(185,160,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x, y, w, h);
      }
      ctx.restore();
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.age += dt;
      if (p.age >= p.life || this.reducedMotion) {
        this.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 3 * dt;
      ctx.globalAlpha = (1 - p.age / p.life) * 0.8;
      ctx.fillStyle = p.color;
      const size = Math.max(0.7, p.size * cell);
      ctx.fillRect(
        x + p.x * cell - size / 2,
        y + p.y * cell - size / 2,
        size,
        size
      );
    }
    ctx.globalAlpha = 1;
  }
}
