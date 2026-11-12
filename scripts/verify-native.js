const report = [];
const check = (ok, name) => {
  report.push({ name, ok: !!ok });
  if (!ok) throw Error(name);
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const key = (code) => {
  window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
  window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
};
// The native diagnostics bridge runs in an ephemeral WKWebsiteDataStore.
const saved = {};
for (const k of ['luma.settings.v1', 'luma.records.v1'])
  saved[k] = localStorage.getItem(k);
const app = window.__luma;
try {
  check(!!app, 'test bridge loaded');
  document.getElementById('start-button').click();
  await wait(1200);
  check(app.game.status === 'playing', 'start and countdown');
  let g = app.game,
    x = g.active.x;
  key('ArrowLeft');
  check(g.active.x === x - 1, 'keyboard left');
  key('ArrowRight');
  check(g.active.x === x, 'keyboard right');
  let rot = g.active.rotation;
  key('Space');
  check(g.active.rotation === (rot + 1) % 4, 'keyboard clockwise');
  key('KeyZ');
  check(g.active.rotation === rot, 'keyboard counterclockwise');
  let type = g.active.type;
  key('KeyC');
  check(g.held === type && !g.canHold, 'hold first');
  type = g.active.type;
  key('KeyC');
  check(g.active.type === type, 'hold limited once');
  let score = g.score;
  key('ArrowDown');
  check(g.score > score, 'soft drop scoring');
  key('ArrowUp');
  check(g.piecesPlaced === 1 && g.canHold, 'hard drop and hold reset');
  key('Escape');
  check(
    g.status === 'paused' && !document.getElementById('dialog-screen').hidden,
    'pause dialog'
  );
  let frozen = JSON.stringify(g.active);
  key('ArrowUp');
  check(JSON.stringify(g.active) === frozen, 'modal blocks gameplay');
  document.getElementById('pause-settings').click();
  let range = document.getElementById('das');
  range.value = '180';
  range.dispatchEvent(new Event('input'));
  check(app.settings.das === 180, 'settings DAS');
  let reduce = document.getElementById('reduced-motion');
  reduce.checked = true;
  reduce.dispatchEvent(new Event('change'));
  check(app.settings.reducedMotion, 'reduced motion setting');
  document.getElementById('done-settings').click();
  document.getElementById('resume').click();
  check(g.status === 'playing', 'resume after settings');
  window.dispatchEvent(new Event('blur'));
  check(g.status === 'paused', 'focus loss auto pause');
  document.getElementById('resume').click();
  g.board = Array.from({ length: 20 }, () => Array(10).fill('J'));
  g.active = { type: 'I', rotation: 0, x: 3, y: -2 };
  g.hardDrop();
  await wait(60);
  check(
    g.status === 'over' && !!document.getElementById('play-again'),
    'top-out result dialog'
  );
  document.getElementById('play-again').click();
  await wait(1200);
  check(
    app.game.status === 'playing' && app.game.score === 0,
    'result restart'
  );
  g = app.game;
  for (let i = 0; i < 8; i++) {
    g.move(i % 2 ? -1 : 1);
    g.rotate(1);
    g.hardDrop();
  }
  await wait(100);
  check(g.piecesPlaced === 8, 'eight placements render');
  const canvas = document.getElementById('game-canvas');
  check(canvas.width > canvas.clientWidth, 'retina backing resolution');
  check(
    document.documentElement.scrollWidth <= innerWidth,
    'no horizontal overflow'
  );
  check(
    document.documentElement.scrollHeight <= innerHeight,
    'no vertical overflow'
  );
  return JSON.stringify({
    report,
    viewport: [innerWidth, innerHeight],
    board: app.renderer.boardRect,
    canvas: [canvas.width, canvas.height],
    audioState: app.audio.context?.state
  });
} finally {
  app.pause();
  for (const [k, v] of Object.entries(saved))
    v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v);
}
