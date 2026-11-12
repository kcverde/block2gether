// Launch with LUMA_DIAGNOSTICS and LUMA_TEST_SCRIPT; press Return in the real app.
// No browser/server required. Native diagnostics use ephemeral storage.
const app = window.__luma;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const startDeadline = performance.now() + 60000;
while (app.game.status !== 'playing' && performance.now() < startDeadline)
  await wait(100);
if (app.game.status !== 'playing') throw Error('No real start input received');
const intervals = [],
  renderTimes = [];
const original = app.renderer.render.bind(app.renderer);
app.renderer.render = (...args) => {
  const t = performance.now();
  const result = original(...args);
  renderTimes.push(performance.now() - t);
  return result;
};
const start = performance.now();
let last = start,
  nextEffect = start;
await new Promise((resolve) => {
  function sample(now) {
    intervals.push(now - last);
    last = now;
    if (now >= nextEffect) {
      const g = app.game;
      g.board = Array.from({ length: 20 }, () => Array(10).fill(null));
      g.active = { type: 'I', rotation: 1, x: 3, y: 0 };
      for (let y = 16; y < 20; y++)
        g.board[y] = Array.from({ length: 10 }, (_, x) =>
          x === 5 ? null : ['J', 'S', 'T', 'L'][y - 16]
        );
      g.hardDrop();
      nextEffect = now + 900;
    }
    if (now - start < 10000) requestAnimationFrame(sample);
    else resolve();
  }
  requestAnimationFrame(sample);
});
app.renderer.render = original;
const summary = (a) => {
  a.sort((x, y) => x - y);
  return {
    samples: a.length,
    median: a[Math.floor(a.length * 0.5)],
    p95: a[Math.floor(a.length * 0.95)],
    max: Math.max(...a)
  };
};
const result = {
  intervals: summary(intervals.slice(1)),
  render: summary(renderTimes),
  status: app.game.status,
  viewport: [innerWidth, innerHeight],
  devicePixelRatio,
  audioState: app.audio.context?.state,
  audioTime: app.audio.context?.currentTime,
  soundEnabled: !app.settings.muted,
  lines: app.game.lines
};
app.pause();
return JSON.stringify(result);
