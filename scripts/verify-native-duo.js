// Evaluated by native LUMA_TEST_SCRIPT in an ephemeral diagnostics session.
// GameController events below are synthetic bridge fixtures, not physical hardware.
const app = window.__block2gether;
if (!window.webkit?.messageHandlers?.diagnostics || !app)
  throw Error('Run this script only through native diagnostics.');
const report = [];
const focusEvents = [];
const noteFocus = (event) =>
  focusEvents.push({
    type: event.type,
    at: Math.round(performance.now()),
    focused: document.hasFocus(),
    hidden: document.hidden
  });
window.addEventListener('blur', noteFocus);
window.addEventListener('focus', noteFocus);
document.addEventListener('visibilitychange', noteFocus);
const check = (ok, name) => {
  report.push({ name, ok: !!ok });
  if (!ok) {
    window.webkit.messageHandlers.diagnostics.postMessage({
      report,
      failure: name,
      focusEvents,
      state: {
        status: app.match?.status ?? app.game.status,
        games: app.games.map((g) => g.status),
        dialog: document.getElementById('dialog-title')?.textContent,
        dialogHidden: document.getElementById('dialog-screen').hidden,
        focused: document.hasFocus(),
        hidden: document.hidden
      }
    });
    throw Error(name);
  }
};
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const until = async (predicate, name, timeout = 5000) => {
  const deadline = performance.now() + timeout;
  while (!predicate() && performance.now() < deadline) await wait(25);
  check(predicate(), name);
};
const click = (selector) => {
  const element = document.querySelector(selector);
  if (!element) throw Error(`Missing ${selector}`);
  element.click();
};
const keyboard = (code, pressed) =>
  window.dispatchEvent(
    new KeyboardEvent(pressed ? 'keydown' : 'keyup', { code, bubbles: true })
  );
const key = (code) => {
  keyboard(code, true);
  keyboard(code, false);
};
const pad = (id, slot, action, pressed) =>
  window.dispatchEvent(
    new CustomEvent('block2gether-controller', {
      detail: { id, slot, action, pressed }
    })
  );
const snapshot = (controllers, reason = 'requested', disconnectedId) =>
  window.dispatchEvent(
    new CustomEvent('block2gether-controllers', {
      detail: {
        controllers,
        reason,
        ...(disconnectedId ? { disconnectedId } : {})
      }
    })
  );
const saved = Object.fromEntries(
  [
    'block2gether.profiles.v1',
    'block2gether.settings.v1',
    'block2gether.records.v1',
    'luma.settings.v1',
    'luma.records.v1'
  ].map((key) => [key, localStorage.getItem(key)])
);
const topOut = (game) => {
  game.board = Array.from({ length: 20 }, () => Array(10).fill('J'));
  game.active = { type: 'I', rotation: 0, x: 3, y: -2 };
  game.hardDrop();
};
try {
  // Allow native launch/tool-window activation to settle; never auto-resume a paused game.
  let foregroundSince = 0;
  const foregroundDeadline = performance.now() + 60000;
  while (performance.now() < foregroundDeadline) {
    if (document.hasFocus() && !document.hidden) {
      if (!foregroundSince) foregroundSince = performance.now();
      if (performance.now() - foregroundSince >= 2000) break;
    } else foregroundSince = 0;
    await wait(50);
  }
  check(
    document.hasFocus() && !document.hidden && foregroundSince > 0,
    'stable foreground before native QA'
  );
  app.goHome();
  app.setPlayType('duo');
  app.begin();
  await until(
    () =>
      app.match?.status === 'playing' &&
      app.games.every((game) => game.status === 'playing'),
    'duo countdown begins two boards'
  );
  let [one, two] = app.games;
  check(
    one !== two && one.board !== two.board && one.board[0] !== two.board[0],
    'boards have independent state'
  );
  check(
    one.active.type === two.active.type &&
      one.queue.join('') === two.queue.join(''),
    'both players receive matching opening bags'
  );
  let firstX = one.active.x,
    secondX = two.active.x;
  key('ArrowLeft');
  check(
    one.active.x === firstX - 1 && two.active.x === secondX,
    'arrow keyboard affects player one only'
  );
  key('KeyA');
  check(
    two.active.x === secondX - 1 && one.active.x === firstX - 1,
    'WASD keyboard affects player two only'
  );
  key('ArrowUp');
  check(
    one.piecesPlaced === 1 && two.piecesPlaced === 0,
    'player one hard drop is independent'
  );
  key('KeyF');
  check(two.piecesPlaced === 1, 'player two hard drop works');
  app.pause();
  check(
    one.status === 'paused' &&
      two.status === 'paused' &&
      app.match.status === 'paused',
    'global pause freezes both boards'
  );
  const beforePause = app.games.map((game) => JSON.stringify(game.active));
  key('ArrowUp');
  key('KeyF');
  check(
    app.games.every(
      (game, i) => JSON.stringify(game.active) === beforePause[i]
    ),
    'paused game rejects both players input'
  );
  click('#resume');
  check(
    app.games.every((game) => game.status === 'playing'),
    'resume restarts both boards'
  );
  const controllers = [
    { id: 'qa-pad-1', name: 'QA snapshot one', slot: 0 },
    { id: 'qa-pad-2', name: 'QA snapshot two', slot: 1 }
  ];
  snapshot(controllers);
  firstX = one.active.x;
  secondX = two.active.x;
  pad('qa-pad-2', 1, 'left', true);
  pad('qa-pad-2', 1, 'left', false);
  check(
    two.active.x === secondX - 1 && one.active.x === firstX,
    'controller lane two routes only to player two'
  );
  pad('qa-pad-1', 0, 'left', true);
  keyboard('ArrowLeft', true);
  keyboard('ArrowLeft', false);
  check(
    app.inputs[0].keys.has('ArrowLeft'),
    'keyboard release preserves controller-held action'
  );
  pad('qa-pad-1', 0, 'left', false);
  check(
    !app.inputs[0].keys.has('ArrowLeft'),
    'last physical source releases action'
  );
  pad('qa-pad-2', 1, 'down', true);
  snapshot([controllers[0]], 'disconnected', 'qa-pad-2');
  check(
    app.match.status === 'paused' && !app.inputs[1].keys.has('ArrowDown'),
    'controller disconnect clears inputs and pauses match'
  );
  click('#resume');
  one.score = 100;
  two.score = 200;
  topOut(one);
  await wait(60);
  check(
    one.status === 'over' &&
      two.status === 'playing' &&
      app.match.status === 'playing',
    'survivor continues after first topout'
  );
  check(
    !document.getElementById('play-again'),
    'first topout does not open final result'
  );
  check(
    !document.getElementById('duo-ended-0').hidden,
    'finished player sees board overlay'
  );
  const survivorPieces = two.piecesPlaced;
  key('KeyF');
  check(
    two.piecesPlaced === survivorPieces + 1,
    'survivor still accepts input'
  );
  topOut(two);
  await until(
    () =>
      app.match.status === 'over' && !!document.getElementById('play-again'),
    'both topouts open match result'
  );
  check(
    app.match.result.winner === 1 && !app.match.result.tie,
    'higher final score wins match'
  );
  click('#play-again');
  await until(() => app.match.status === 'playing', 'duo rematch starts');
  check(
    app.games.every((game) => game.score === 0 && game.piecesPlaced === 0),
    'rematch resets both boards'
  );
  for (let cycle = 1; cycle <= 3; cycle++) {
    app.games[0].score = cycle * 100;
    app.games[1].score = cycle * 100;
    topOut(app.games[0]);
    topOut(app.games[1]);
    await until(
      () =>
        app.match.status === 'over' && !!document.getElementById('play-again'),
      `rematch cycle ${cycle} result`
    );
    check(
      app.match.result.tie && app.match.result.winner === null,
      `rematch cycle ${cycle} tie`
    );
    click('#play-again');
    await until(
      () =>
        app.match.status === 'playing' &&
        app.games.every((game) => game.status === 'playing'),
      `rematch cycle ${cycle} countdown completes`
    );
    check(
      app.games.every((game) => game.score === 0 && game.piecesPlaced === 0),
      `rematch cycle ${cycle} clean boards`
    );
  }
  app.goHome();
  app.setPlayType('solo');
  app.begin();
  await until(() => app.game.status === 'playing', 'solo still starts');
  snapshot([{ id: 'qa-pad-2', name: 'QA snapshot two', slot: 1 }]);
  const soloX = app.game.active.x;
  pad('qa-pad-2', 1, 'left', true);
  pad('qa-pad-2', 1, 'left', false);
  check(
    app.game.active.x === soloX - 1,
    'solo controller routes to board zero regardless assigned slot'
  );
  app.goHome();
  click('[data-player-slot="0"]');
  const firstProfile = app.profiles.selected()[0];
  click(`[data-edit-profile="${firstProfile.id}"]`);
  const name = document.getElementById('player-name');
  name.value = 'QA Player';
  name.dispatchEvent(new Event('input', { bubbles: true }));
  click('#save-player');
  check(
    app.profiles.get(firstProfile.id).name === 'QA Player',
    'profile name saves through dialog'
  );
  click(`[data-edit-profile="${firstProfile.id}"]`);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 8;
  const context = canvas.getContext('2d');
  context.fillStyle = '#9c82ff';
  context.fillRect(0, 0, 8, 8);
  const blob = await new Promise((resolve) =>
    canvas.toBlob(resolve, 'image/png')
  );
  const transfer = new DataTransfer();
  transfer.items.add(new File([blob], 'qa-avatar.png', { type: 'image/png' }));
  const photo = document.getElementById('player-photo');
  photo.files = transfer.files;
  photo.dispatchEvent(new Event('change', { bubbles: true }));
  await wait(250);
  click('#save-player');
  await until(
    () => !!app.profiles.get(firstProfile.id).photo,
    'profile photo processes and saves locally'
  );
  click(`[data-edit-profile="${firstProfile.id}"]`);
  click('#remove-photo');
  click('#save-player');
  check(
    app.profiles.get(firstProfile.id).photo === null,
    'profile photo can be removed and saved'
  );
  click('#profiles-done');
  check(
    document.documentElement.scrollWidth <= innerWidth,
    'native layout has no horizontal overflow'
  );
  return JSON.stringify({
    report,
    focusEvents,
    viewport: [innerWidth, innerHeight],
    diagnosticsStorage: 'ephemeral native store',
    controllerInput: 'synthetic bridge fixtures; physical hardware not tested'
  });
} finally {
  app.goHome();
  snapshot([]);
  window.removeEventListener('blur', noteFocus);
  window.removeEventListener('focus', noteFocus);
  document.removeEventListener('visibilitychange', noteFocus);
  for (const [key, value] of Object.entries(saved))
    value === null
      ? localStorage.removeItem(key)
      : localStorage.setItem(key, value);
}
