import { Game } from './engine.js';
import { Match } from './match.js';
import { Renderer, drawMini } from './renderer.js';
import { Soundscape } from './audio.js';
import { InputController } from './input.js';
import { ControlRouter } from './devices.js';
import { ProfileStore, photoFromFile } from './profiles.js';

const $ = (id) => document.getElementById(id);
const escapeHTML = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]
  );
const load = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
};
const save = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Gameplay remains available without record storage. */
  }
};
const defaults = {
  volume: 0.5,
  music: true,
  muted: false,
  reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
  das: 140,
  arr: 35
};
const stored = load('luma.settings.v1', {}),
  settings = { ...defaults };
for (const k of ['music', 'muted', 'reducedMotion'])
  if (typeof stored?.[k] === 'boolean') settings[k] = stored[k];
for (const [k, min, max] of [
  ['volume', 0, 1],
  ['das', 70, 250],
  ['arr', 0, 80]
])
  if (Number.isFinite(stored?.[k]))
    settings[k] = Math.min(max, Math.max(min, stored[k]));
const records = load('luma.records.v1', {});
let bestScore = Number.isFinite(records?.score)
  ? Math.max(0, records.score)
  : 0;
let bestSprint =
  Number.isFinite(records?.sprint) && records.sprint > 0
    ? records.sprint
    : null;
let profiles;
try {
  profiles = new ProfileStore();
} catch (error) {
  const memory = new Map();
  profiles = new ProfileStore({
    getItem: (k) => memory.get(k) ?? null,
    setItem: (k, v) => memory.set(k, v)
  });
  $('storage-note').hidden = false;
  $('storage-note').textContent =
    'Player profiles cannot be saved on this device right now.';
}
if (Array.isArray(window.__block2getherImportProfiles)) {
  try {
    if (!load('block2gether.personalized.v1', false)) {
      profiles.importProfiles(window.__block2getherImportProfiles);
      save('block2gether.personalized.v1', true);
    }
  } catch (error) {
    $('storage-note').hidden = false;
    $('storage-note').textContent = error.message;
  }
  delete window.__block2getherImportProfiles;
}

const elapsedNow = () => performance.now() / 1000;
let game = new Game({ now: elapsedNow }),
  games = [game],
  match = null,
  mode = 'marathon',
  playType = 'solo';
let dialogKind = null,
  settingsReturn = 'menu',
  deviceReturn = 'menu',
  focusBeforeDialog = null;
let lastTime = performance.now(),
  countdownUntil = 0,
  recorded = false,
  resultRecord = false;
let activePlayers = profiles.selected(),
  controllers = [],
  profileSlot = 0;
const audio = new Soundscape(settings);
let inputs = [new InputController(game, settings)];
const router = new ControlRouter(inputs);

for (let lane = 0; lane < 2; lane++) {
  const section = document.createElement('section');
  section.className = 'duo-lane';
  section.innerHTML = `<div class="duo-player-heading" id="duo-player-${lane}"></div><div class="duo-body">
    <aside class="duo-side"><div class="section-label">HOLD</div><canvas id="duo-hold-${lane}" class="duo-hold" aria-label="Player ${lane + 1} held piece"></canvas><div class="section-label">SCORE</div><div class="duo-score" id="duo-score-${lane}">0</div><div class="small-stat"><span class="section-label">LEVEL</span><strong id="duo-level-${lane}">01</strong></div><div class="small-stat"><span class="section-label">LINES</span><strong id="duo-lines-${lane}">0</strong></div><div class="small-stat"><span class="section-label">TIME</span><strong id="duo-time-${lane}" class="time-value">00:00</strong></div></aside>
    <div class="duo-board-wrap"><canvas class="duo-canvas" id="duo-canvas-${lane}" aria-label="Player ${lane + 1} playfield"></canvas><div id="duo-announcement-${lane}" class="announcement" aria-live="polite"></div><div id="duo-countdown-${lane}" class="countdown" hidden></div><div id="duo-ended-${lane}" class="lane-ended" hidden></div></div>
    <aside class="duo-side duo-next"><div class="section-label">NEXT</div>${Array.from({ length: 5 }, (_, i) => `<canvas id="duo-next-${lane}-${i}" aria-label="Player ${lane + 1} next piece ${i + 1}"></canvas>`).join('')}</aside></div>`;
  $('duo-boards').appendChild(section);
}
const soloView = {
  renderer: new Renderer($('game-canvas')),
  hold: $('hold-canvas'),
  next: [...document.querySelectorAll('.next-canvas')],
  announcement: $('announcement'),
  countdown: $('countdown'),
  preview: '',
  until: 0
};
const duoViews = [0, 1].map((i) => ({
  renderer: new Renderer($(`duo-canvas-${i}`)),
  hold: $(`duo-hold-${i}`),
  next: Array.from({ length: 5 }, (_, n) => $(`duo-next-${i}-${n}`)),
  announcement: $(`duo-announcement-${i}`),
  countdown: $(`duo-countdown-${i}`),
  preview: '',
  until: 0
}));
const views = () => (playType === 'duo' ? duoViews : [soloView]);
const status = () => (match ? match.status : game.status);
const playing = () => status() === 'playing';
const setPaused = (value) =>
  match ? match.setPaused(value) : game.setPaused(value);
function formatTime(t, precise = false) {
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}${precise ? '.' + String(Math.floor((t % 1) * 100)).padStart(2, '0') : ''}`;
}
function avatar(profile) {
  return `<span class="avatar">${profile.photo ? `<img src="${escapeHTML(profile.photo)}" alt="${escapeHTML(profile.name)}">` : escapeHTML([...profile.name.trim()].slice(0, 1).join('').toUpperCase())}</span>`;
}
function deviceName(slot) {
  const assigned = controllers.find((c) =>
    playType === 'solo' ? c.slot >= 0 : c.slot === slot
  );
  return assigned ? assigned.name : slot === 0 ? 'ARROW KEYS' : 'W A S D';
}
function applySettings() {
  document.body.classList.toggle('reduce-motion', settings.reducedMotion);
  $('sound-button').classList.toggle('muted', settings.muted);
  $('sound-button').setAttribute(
    'aria-label',
    settings.muted ? 'Unmute audio' : 'Mute audio'
  );
  audio.apply();
  save('luma.settings.v1', settings);
}
function renderPlayers() {
  const selected = profiles.selected();
  $('menu-players').innerHTML = selected
    .map(
      (p, i) =>
        `<button class="player-chip${playType === 'solo' && i === 1 ? ' solo-inactive' : ''}" data-player-slot="${i}" aria-label="Choose ${i === 0 ? 'player one' : 'player two'}: ${escapeHTML(p.name)}">${avatar(p)}<span><strong>${escapeHTML(p.name)}</strong><small>${playType === 'solo' ? (i === 0 ? 'SOLO PLAYER' : 'READY FOR TWO') : i === 0 ? 'PLAYER ONE' : 'PLAYER TWO'}</small></span><span class="chip-edit">↗</span></button>`
    )
    .join('');
  document
    .querySelectorAll('[data-player-slot]')
    .forEach(
      (b) => (b.onclick = () => openPlayers(Number(b.dataset.playerSlot)))
    );
  const players = $('menu-screen').hidden ? activePlayers : selected;
  $('solo-player').innerHTML =
    `${avatar(players[0])}<span><strong>${escapeHTML(players[0].name)}</strong><small>${escapeHTML(deviceName(0))}</small></span>`;
  players.forEach((p, i) => {
    $(`duo-player-${i}`).innerHTML =
      `${avatar(p)}<span><strong>${escapeHTML(p.name)}</strong><small>${escapeHTML(deviceName(i))}</small></span>`;
  });
}
function setPlayType(type) {
  if (type !== 'solo' && type !== 'duo') return;
  playType = type;
  $('solo-option').classList.toggle('selected', type === 'solo');
  $('solo-option').setAttribute('aria-pressed', String(type === 'solo'));
  $('duo-option').classList.toggle('selected', type === 'duo');
  $('duo-option').setAttribute('aria-pressed', String(type === 'duo'));
  $('solo-modes').hidden = type === 'duo';
  $('duo-rules').hidden = type !== 'duo';
  $('start-button').innerHTML =
    type === 'duo' ? 'Start match <span>↗</span>' : 'Play <span>↗</span>';
  renderPlayers();
}
function setMode(value) {
  mode = value === 'sprint' ? 'sprint' : 'marathon';
  document.querySelectorAll('.mode-card').forEach((b) => {
    const selected = b.dataset.mode === mode;
    b.classList.toggle('selected', selected);
    b.setAttribute('aria-pressed', String(selected));
  });
}
function closeDialog() {
  const open = !$('dialog-screen').hidden;
  $('dialog-screen').hidden = true;
  dialogKind = null;
  $('dialog').classList.remove('wide-dialog');
  $('app').inert = false;
  $('menu-screen').inert = false;
  if (open && focusBeforeDialog?.isConnected)
    focusBeforeDialog.focus({ preventScroll: true });
}
function showDialog(kind, html, wide = false) {
  if ($('dialog-screen').hidden) focusBeforeDialog = document.activeElement;
  dialogKind = kind;
  $('dialog').classList.toggle('wide-dialog', wide);
  $('dialog').innerHTML = html;
  $('dialog-screen').hidden = false;
  $('app').inert = true;
  $('menu-screen').inert = true;
  requestAnimationFrame(() =>
    $('dialog')
      .querySelector('button,input,select')
      ?.focus({ preventScroll: true })
  );
}
function announce(view, title, subtitle = '') {
  view.announcement.replaceChildren(document.createTextNode(title));
  if (subtitle) {
    const small = document.createElement('small');
    small.textContent = subtitle;
    view.announcement.appendChild(small);
  }
  view.announcement.classList.add('show');
  view.until = performance.now() + 1500;
}
function begin() {
  closeDialog();
  $('menu-screen').hidden = true;
  $('app').classList.remove('is-menu');
  if (playType === 'duo') {
    match = new Match({ now: elapsedNow }).start();
    games = match.games;
    game = games[0];
  } else {
    match = null;
    game = new Game({ mode, now: elapsedNow }).start();
    games = [game];
  }
  setPaused(true);
  inputs = games.map((g) => new InputController(g, settings));
  router.configure(inputs, playType === 'duo');
  activePlayers = profiles.selected();
  recorded = false;
  $('solo-layout').hidden = playType === 'duo';
  $('solo-controls').hidden = playType === 'duo';
  $('duo-layout').hidden = playType !== 'duo';
  $('duo-controls').hidden = playType !== 'duo';
  views().forEach((view, i) => {
    view.renderer.resize();
    view.renderer.handleEvents(games[i].drainEvents(), games[i]);
    view.preview = '';
    view.announcement.classList.remove('show');
    view.countdown.hidden = false;
    view.countdown.textContent = '3';
  });
  duoViews.forEach((_, i) => ($(`duo-ended-${i}`).hidden = true));
  audio.unlock();
  audio.play({ type: 'start' });
  countdownUntil = performance.now() + 1100;
  $('pause-button').disabled = false;
  $('board-mode').textContent =
    mode === 'sprint' ? '40-LINE SPRINT' : 'MARATHON';
  $('chain-label').textContent = '';
  renderPlayers();
  document.activeElement?.blur();
  updateHUD();
}
function stopCountdown() {
  countdownUntil = 0;
  [soloView, ...duoViews].forEach((v) => (v.countdown.hidden = true));
}
function pause() {
  if (!playing() && !countdownUntil) return;
  stopCountdown();
  setPaused(true);
  router.clear();
  audio.tick(false);
  showPause();
}
function showPause() {
  showDialog(
    'pause',
    `<h2 id="dialog-title" class="sr-only">Paused</h2><button id="resume" class="primary-button">Resume <span>↗</span></button><button id="pause-settings" class="secondary-button">Settings</button><button id="pause-controllers" class="secondary-button">Controllers</button><button id="restart" class="secondary-button">Restart</button><button id="exit-menu" class="text-button">Main menu</button>`
  );
  $('resume').onclick = resume;
  $('pause-settings').onclick = openSettings;
  $('pause-controllers').onclick = openDevices;
  $('restart').onclick = () => confirmLeave('restart');
  $('exit-menu').onclick = () => confirmLeave('menu');
}
function resume() {
  closeDialog();
  router.clear();
  setPaused(false);
  audio.unlock();
  document.activeElement?.blur();
  lastTime = performance.now();
}
function confirmLeave(destination) {
  showDialog(
    'confirm',
    `<h2 id="dialog-title">Leave this ${playType === 'duo' ? 'match' : 'game'}?</h2><p>Your current progress will be lost.</p><button id="confirm-leave" class="primary-button">${destination === 'restart' ? 'Start again' : 'Main menu'}</button><button id="cancel-leave" class="secondary-button">Keep playing</button>`
  );
  $('confirm-leave').onclick = destination === 'restart' ? begin : goHome;
  $('cancel-leave').onclick = showPause;
}
function goHome() {
  closeDialog();
  router.clear();
  match = null;
  game = new Game({ now: elapsedNow });
  games = [game];
  inputs = [new InputController(game, settings)];
  router.configure(inputs, false);
  stopCountdown();
  $('menu-screen').hidden = false;
  $('app').classList.add('is-menu');
  $('pause-button').disabled = true;
  audio.tick(false);
  renderPlayers();
  $('start-button').focus({ preventScroll: true });
}
function openSettings() {
  if (dialogKind === 'settings') return;
  settingsReturn =
    status() === 'playing' || status() === 'paused'
      ? 'pause'
      : $('menu-screen').hidden
        ? 'result'
        : 'menu';
  if (playing() || countdownUntil) {
    setPaused(true);
    router.clear();
    stopCountdown();
  }
  audio.tick(false);
  showDialog(
    'settings',
    `<div class="settings-title-row"><h2 id="dialog-title">Settings</h2><button id="close-settings" aria-label="Close settings">×</button></div>
  <div class="setting"><label for="volume">Sound level <output id="volume-output">${Math.round(settings.volume * 100)}%</output></label><input id="volume" type="range" min="0" max="100" value="${Math.round(settings.volume * 100)}"></div>
  <div class="setting"><label for="music">Ambient soundtrack <input id="music" type="checkbox" ${settings.music ? 'checked' : ''}></label></div>
  <div class="setting"><label for="reduced-motion">Reduced motion <input id="reduced-motion" type="checkbox" ${settings.reducedMotion ? 'checked' : ''}></label><small>Less movement and fewer effects.</small></div>
  <div class="setting"><label for="das">Movement delay <output id="das-output">${settings.das} ms</output></label><input id="das" type="range" min="70" max="250" step="10" value="${settings.das}"><small>Delay before a held key repeats (DAS).</small></div>
  <div class="setting"><label for="arr">Repeat speed <output id="arr-output">${settings.arr === 0 ? 'Instant' : settings.arr + ' ms'}</output></label><input id="arr" type="range" min="0" max="80" step="5" value="${settings.arr}"><small>Repeat interval (ARR). Zero moves straight to the wall.</small></div>
  <details class="control-details"><summary>Keyboard shortcuts</summary><p>Space / X: rotate · Z: reverse · C / Shift: hold<br>↑: drop · Esc: pause · M: mute</p></details><button id="done-settings" class="primary-button">Done</button>`
  );
  $('volume').oninput = (e) => {
    settings.volume = Number(e.target.value) / 100;
    $('volume-output').textContent = Math.round(settings.volume * 100) + '%';
    audio.unlock();
    applySettings();
  };
  $('music').onchange = (e) => {
    settings.music = e.target.checked;
    applySettings();
  };
  $('reduced-motion').onchange = (e) => {
    settings.reducedMotion = e.target.checked;
    applySettings();
  };
  for (const key of ['das', 'arr'])
    $(key).oninput = (e) => {
      settings[key] = Number(e.target.value);
      $(key + '-output').textContent =
        key === 'arr' && settings[key] === 0
          ? 'Instant'
          : settings[key] + ' ms';
      applySettings();
    };
  $('close-settings').onclick = finishSettings;
  $('done-settings').onclick = finishSettings;
}
function finishSettings() {
  if (settingsReturn === 'pause') showPause();
  else if (settingsReturn === 'result') showResult();
  else closeDialog();
}
function openPlayers(slot = 0) {
  profileSlot = slot;
  const chosen = profiles.selected()[slot];
  showDialog(
    'players',
    `<h2 id="dialog-title">${slot === 0 ? 'Player one' : 'Player two'}</h2><div class="profile-list">${profiles
      .list()
      .map(
        (p) =>
          `<div class="profile-row${chosen.id === p.id ? ' selected' : ''}"><button class="choose-profile" data-select-profile="${escapeHTML(p.id)}">${avatar(p)}<strong>${escapeHTML(p.name)}</strong></button><button class="edit-profile" data-edit-profile="${escapeHTML(p.id)}" aria-label="Edit ${escapeHTML(p.name)}">Edit</button></div>`
      )
      .join(
        ''
      )}</div><div id="profile-error" class="form-error" role="alert"></div><button id="add-player" class="secondary-button">Add a player</button><button id="profiles-done" class="primary-button">Done</button>`,
    true
  );
  document.querySelectorAll('[data-select-profile]').forEach(
    (b) =>
      (b.onclick = () => {
        try {
          profiles.select(slot, b.dataset.selectProfile);
          renderPlayers();
          openPlayers(slot);
        } catch (e) {
          $('profile-error').textContent = e.message;
        }
      })
  );
  document
    .querySelectorAll('[data-edit-profile]')
    .forEach(
      (b) => (b.onclick = () => editPlayer(b.dataset.editProfile, slot))
    );
  $('add-player').onclick = () => editPlayer(null, slot);
  $('profiles-done').onclick = closeDialog;
}
function editPlayer(id, slot) {
  const original = id ? profiles.get(id) : null;
  let draftPhoto = original?.photo ?? null,
    photoRequest = 0;
  showDialog(
    'edit-player',
    `<h2 id="dialog-title">${original ? 'Edit player' : 'New player'}</h2><label class="profile-form-label" for="player-name">Name<input id="player-name" class="profile-name-input" maxlength="48" autocomplete="off" value="${escapeHTML(original?.name ?? '')}"></label><div class="photo-editor"><div id="photo-preview">${avatar(original ?? { name: '?', photo: null })}</div><div class="photo-actions"><label class="upload-label">Choose a photo<input id="player-photo" type="file" accept="image/png,image/jpeg,image/webp" aria-label="Choose a player photo"></label><button id="remove-photo">Remove photo</button><small>Optional · JPG, PNG or WebP</small></div></div><div id="profile-error" class="form-error" role="alert"></div><button id="save-player" class="primary-button">Save player</button><button id="cancel-player" class="secondary-button">Cancel</button>${original ? '<button id="delete-player" class="text-button danger-button">Remove player</button>' : ''}`,
    true
  );
  const errorEl = $('profile-error'),
    saveButton = $('save-player'),
    nameInput = $('player-name'),
    preview = $('photo-preview');
  const updatePreview = () =>
    (preview.innerHTML = avatar({
      name: nameInput.value || '?',
      photo: draftPhoto
    }));
  nameInput.oninput = updatePreview;
  $('player-photo').onchange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const request = ++photoRequest;
    saveButton.disabled = true;
    errorEl.textContent = 'Preparing photo…';
    try {
      const photo = await photoFromFile(file);
      if (request !== photoRequest || !preview.isConnected) return;
      draftPhoto = photo;
      updatePreview();
      errorEl.textContent = '';
    } catch (error) {
      if (request === photoRequest && errorEl.isConnected)
        errorEl.textContent = error.message;
    } finally {
      if (request === photoRequest) saveButton.disabled = false;
    }
  };
  $('remove-photo').onclick = () => {
    photoRequest++;
    draftPhoto = null;
    saveButton.disabled = false;
    errorEl.textContent = '';
    $('player-photo').value = '';
    updatePreview();
  };
  saveButton.onclick = () => {
    try {
      const saved = profiles.upsert({
        ...(id ? { id } : {}),
        name: nameInput.value,
        photo: draftPhoto
      });
      if (!id) profiles.select(slot, saved.id);
      renderPlayers();
      openPlayers(slot);
    } catch (error) {
      errorEl.textContent = error.message;
    }
  };
  $('cancel-player').onclick = () => openPlayers(slot);
  if (original)
    $('delete-player').onclick = () => {
      showDialog(
        'delete-player',
        `<h2 id="dialog-title">Remove ${escapeHTML(original.name)}?</h2><p>This removes their saved name and photo from this Mac.</p><div id="profile-error" class="form-error" role="alert"></div><button id="confirm-delete-player" class="primary-button">Remove player</button><button id="cancel-delete-player" class="secondary-button">Keep player</button>`
      );
      $('confirm-delete-player').onclick = () => {
        try {
          profiles.remove(id);
          renderPlayers();
          openPlayers(slot);
        } catch (error) {
          $('profile-error').textContent = error.message;
        }
      };
      $('cancel-delete-player').onclick = () => editPlayer(id, slot);
    };
}
function requestControllers() {
  window.webkit?.messageHandlers?.controllers?.postMessage({ type: 'request' });
}
function openDevices() {
  if (dialogKind !== 'controllers')
    deviceReturn =
      playing() || status() === 'paused'
        ? 'pause'
        : $('menu-screen').hidden
          ? 'result'
          : 'menu';
  if (playing() || countdownUntil) {
    setPaused(true);
    router.clear();
    stopCountdown();
    audio.tick(false);
  }
  showDevices();
  requestControllers();
}
function showDevices() {
  const players = $('menu-screen').hidden ? activePlayers : profiles.selected();
  showDialog(
    'controllers',
    `<h2 id="dialog-title">Controllers</h2><p>Connect by Bluetooth or USB, then choose a player.</p><div class="device-list">${controllers.length ? controllers.map((c) => `<div class="device-row"><strong>${escapeHTML(c.name)}</strong><label class="section-label" for="device-${escapeHTML(c.id)}">ASSIGNED TO</label><select id="device-${escapeHTML(c.id)}" data-controller-id="${escapeHTML(c.id)}"><option value="0" ${c.slot === 0 ? 'selected' : ''}>Player 1 · ${escapeHTML(players[0].name)}</option><option value="1" ${c.slot === 1 ? 'selected' : ''}>Player 2 · ${escapeHTML(players[1].name)}</option>${c.slot < 0 ? '<option value="-1" selected>Not assigned</option>' : ''}</select></div>`).join('') : '<div class="controller-empty">No controllers connected.</div>'}</div><details class="control-details"><summary>Controller buttons</summary><div class="controller-guide">D-pad / left stick: move · Down: soft drop<br>Bottom button (A): rotate ↻ · Right (B): rotate ↺<br>D-pad Up: hard drop · Y / X / shoulders: hold<br>Menu / Start: pause · A: choose · B: back</div></details><button id="devices-done" class="primary-button">Done</button>`,
    true
  );
  document.querySelectorAll('[data-controller-id]').forEach(
    (el) =>
      (el.onchange = () => {
        router.clear();
        window.webkit?.messageHandlers?.controllers?.postMessage({
          type: 'assign',
          id: el.dataset.controllerId,
          slot: Number(el.value)
        });
      })
  );
  $('devices-done').onclick = finishDevices;
}
function finishDevices() {
  if (deviceReturn === 'pause') showPause();
  else if (deviceReturn === 'result') showResult();
  else closeDialog();
}
function finishGame() {
  if (!recorded) {
    if (!match) {
      resultRecord =
        game.mode === 'sprint'
          ? game.status === 'won' && (!bestSprint || game.elapsed < bestSprint)
          : game.score > bestScore;
      if (game.mode === 'marathon') bestScore = Math.max(bestScore, game.score);
      if (game.mode === 'sprint' && game.status === 'won')
        bestSprint = bestSprint
          ? Math.min(bestSprint, game.elapsed)
          : game.elapsed;
      save('luma.records.v1', { score: bestScore, sprint: bestSprint });
    }
    recorded = true;
  }
  router.clear();
  $('pause-button').disabled = true;
  showResult();
}
function showResult() {
  if (match) {
    const result = match.result;
    if (!result) return;
    const title = result.tie
      ? 'Draw'
      : `${escapeHTML(activePlayers[result.winner].name)} wins!`;
    showDialog(
      'result',
      `<h2 id="dialog-title">${title}</h2><div class="duo-result-players">${activePlayers.map((p, i) => `<div class="duo-result-player${result.winner === i ? ' winner' : ''}">${avatar(p)}<strong>${escapeHTML(p.name)}</strong><b>${result.scores[i].toLocaleString()}</b><small>${games[i].lines} LINES · ${formatTime(games[i].elapsed)}</small></div>`).join('')}</div><button id="play-again" class="primary-button">Play again <span>↗</span></button><button id="result-home" class="secondary-button">Main menu</button>`,
      true
    );
  } else {
    const won = game.status === 'won';
    showDialog(
      'result',
      `<h2 id="dialog-title">${won ? 'Sprint complete' : 'Game over'}</h2><p class="record-note" ${resultRecord ? '' : 'hidden'}>New personal best</p><div class="result-stats"><div><span>SCORE</span><strong>${game.score.toLocaleString()}</strong></div><div><span>${won ? 'FINISH TIME' : 'TIME'}</span><strong>${formatTime(game.elapsed, won)}</strong></div><div><span>LINES</span><strong>${game.lines}</strong></div><div><span>LEVEL</span><strong>${game.level}</strong></div></div><button id="play-again" class="primary-button">Play again <span>↗</span></button><button id="result-home" class="secondary-button">Main menu</button>`
    );
  }
  $('play-again').onclick = begin;
  $('result-home').onclick = goHome;
}
function updatePreview(view, g) {
  const key = g.queue.slice(0, 5).join('') + g.held + g.canHold;
  if (key === view.preview) return;
  view.next.forEach((canvas, i) => {
    drawMini(canvas, g.queue[i]);
    canvas.setAttribute('aria-label', `Next piece ${i + 1}: ${g.queue[i]}`);
  });
  drawMini(view.hold, g.held);
  view.hold.style.opacity = g.canHold ? '1' : '.35';
  view.hold.setAttribute(
    'aria-label',
    g.held ? `Held piece: ${g.held}` : 'No held piece'
  );
  view.preview = key;
}
function updateHUD() {
  if (match) {
    games.forEach((g, i) => {
      $(`duo-score-${i}`).textContent = g.score.toLocaleString();
      $(`duo-level-${i}`).textContent = String(g.level).padStart(2, '0');
      $(`duo-lines-${i}`).textContent = g.lines;
      $(`duo-time-${i}`).textContent = formatTime(g.elapsed);
      updatePreview(duoViews[i], g);
      const ended = $(`duo-ended-${i}`);
      if (g.status === 'over' && ended.hidden) {
        ended.hidden = false;
        ended.innerHTML = `<strong>Finished</strong><span>Final score: ${g.score.toLocaleString()}</span><small>${escapeHTML(activePlayers[1 - i].name.toUpperCase())} IS PLAYING</small>`;
      }
    });
    const diff = games[0].score - games[1].score;
    $('duo-standing').textContent =
      diff === 0
        ? 'Tied'
        : `${activePlayers[diff > 0 ? 0 : 1].name} +${Math.abs(diff).toLocaleString()}`;
  } else {
    $('score').textContent = game.score.toLocaleString();
    $('level').textContent = String(game.level).padStart(2, '0');
    $('lines').textContent =
      mode === 'sprint' ? `${game.lines} / 40` : game.lines;
    $('time').textContent = formatTime(game.elapsed);
    $('best').textContent =
      mode === 'sprint'
        ? bestSprint
          ? formatTime(bestSprint, true)
          : '—'
        : bestScore.toLocaleString();
    $('progress').style.width =
      (mode === 'sprint'
        ? Math.min(100, (game.lines / 40) * 100)
        : ((game.lines % 10) / 10) * 100) + '%';
    $('progress-label').textContent =
      mode === 'sprint'
        ? `${Math.max(0, 40 - game.lines)} LINES TO FINISH`
        : `${10 - (game.lines % 10)} LINES TO LEVEL ${game.level + 1}`;
    updatePreview(soloView, game);
    $('hold-hint').textContent =
      game.held && !game.canHold ? 'Available after placement' : '';
  }
}
function back() {
  if (dialogKind === 'settings') finishSettings();
  else if (dialogKind === 'controllers') finishDevices();
  else if (dialogKind === 'pause') resume();
  else if (dialogKind === 'confirm') showPause();
  else if (['edit-player', 'delete-player'].includes(dialogKind))
    openPlayers(profileSlot);
  else if (dialogKind === 'players') closeDialog();
}
function focusable() {
  const root = dialogKind ? $('dialog') : $('menu-screen');
  return [...root.querySelectorAll('button,input,select,summary')].filter(
    (el) =>
      !el.disabled && el.getClientRects().length && !el.closest('[hidden]')
  );
}
window.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (dialogKind) {
    if (e.code === 'Escape') {
      e.preventDefault();
      if (!e.repeat) back();
    }
    if (e.code === 'Tab') {
      const els = focusable(),
        first = els[0],
        last = els.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    }
    return;
  }
  if (e.code === 'KeyM') {
    if (!e.repeat) {
      settings.muted = !settings.muted;
      audio.unlock();
      applySettings();
    }
    return;
  }
  if (!$('menu-screen').hidden) {
    if (
      e.code === 'Enter' &&
      !(document.activeElement instanceof HTMLButtonElement)
    ) {
      e.preventDefault();
      begin();
    }
    return;
  }
  if (e.code === 'Escape' || e.code === 'KeyP') {
    e.preventDefault();
    if (!e.repeat) pause();
    return;
  }
  if (router.binding(e.code)) {
    e.preventDefault();
    if (!e.repeat && !countdownUntil && playing()) {
      audio.unlock();
      router.keyboard(e.code, true);
    }
  }
});
window.addEventListener('keyup', (e) => router.keyboard(e.code, false));
window.addEventListener('blur', () => {
  router.clear();
  pause();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    router.clear();
    pause();
  }
});
window.addEventListener('resize', () => {
  [soloView, ...duoViews].forEach((v) => {
    v.preview = '';
    v.renderer.resize();
  });
  updateHUD();
});
window.addEventListener('block2gether-controllers', (e) => {
  const detail = e.detail;
  if (!Array.isArray(detail?.controllers)) return;
  controllers = detail.controllers.filter(
    (c) =>
      typeof c.id === 'string' &&
      typeof c.name === 'string' &&
      Number.isInteger(c.slot)
  );
  $('controller-count').textContent = `${controllers.length} connected`;
  if (detail.reason === 'disconnected') {
    router.forgetController(detail.disconnectedId);
    pause();
  }
  if (detail.reason === 'assigned') router.clear();
  renderPlayers();
  if (dialogKind === 'controllers') showDevices();
});
window.addEventListener('block2gether-controller', (e) => {
  const data = e.detail;
  if (!data || typeof data.id !== 'string') return;
  if (!data.pressed) {
    router.controller(data);
    return;
  }
  if (dialogKind || !$('menu-screen').hidden) {
    if (data.action === 'pause') {
      if (dialogKind === 'pause') resume();
      else if (!dialogKind) begin();
      return;
    }
    if (data.action === 'ccw') {
      back();
      return;
    }
    const els = focusable(),
      focused = document.activeElement;
    if (
      els.includes(focused) &&
      focused instanceof HTMLInputElement &&
      focused.type === 'range' &&
      ['left', 'right'].includes(data.action)
    ) {
      const before = focused.value;
      if (data.action === 'left') focused.stepDown();
      else focused.stepUp();
      if (focused.value !== before)
        focused.dispatchEvent(new Event('input', { bubbles: true }));
    } else if (['left', 'right', 'down'].includes(data.action)) {
      let index = els.indexOf(focused);
      const delta = data.action === 'left' ? -1 : 1;
      index = (index + delta + els.length) % els.length;
      els[index]?.focus();
    } else if (data.action === 'cw') {
      const focused = document.activeElement;
      if (els.includes(focused)) {
        if (focused instanceof HTMLSelectElement) {
          focused.selectedIndex =
            (focused.selectedIndex + 1) % focused.options.length;
          focused.dispatchEvent(new Event('change'));
        } else focused.click();
      } else if (!dialogKind) begin();
      else els[0]?.click();
    }
    return;
  }
  if (data.action === 'pause') {
    pause();
    return;
  }
  if (playing() && !countdownUntil) {
    audio.unlock();
    router.controller(data);
  }
});
$('start-button').onclick = begin;
$('pause-button').onclick = pause;
$('settings-button').onclick = openSettings;
$('sound-button').onclick = () => {
  settings.muted = !settings.muted;
  audio.unlock();
  applySettings();
};
$('home-button').onclick = (e) => {
  e.preventDefault();
  if (playing() || status() === 'paused') {
    pause();
    confirmLeave('menu');
  } else goHome();
};
$('solo-option').onclick = () => setPlayType('solo');
$('duo-option').onclick = () => setPlayType('duo');
$('players-button').onclick = () => openPlayers(0);
$('controllers-button').onclick = openDevices;
document
  .querySelectorAll('.mode-card')
  .forEach((b) => (b.onclick = () => setMode(b.dataset.mode)));
function frame(now) {
  const dt = Math.min(Math.max((now - lastTime) / 1000, 0), 0.1);
  lastTime = now;
  if (countdownUntil) {
    const left = countdownUntil - now;
    if (left <= 0) {
      stopCountdown();
      setPaused(false);
    } else
      views().forEach(
        (v) => (v.countdown.textContent = Math.min(3, Math.ceil(left / 367)))
      );
  }
  if (playing()) {
    inputs.forEach((input) => input.update(dt));
    if (match) match.update(dt);
    else game.update(dt);
  }
  games.forEach((g, i) => {
    const view = views()[i];
    if (!view) return;
    const events = g.drainEvents();
    if (events.length) {
      view.renderer.handleEvents(events, g);
      for (const e of events) {
        audio.play(e);
        if (e.type === 'clear') {
          announce(
            view,
            e.label,
            `${e.backToBack ? 'BACK TO BACK · ' : ''}+${e.points.toLocaleString()}`
          );
          if (!match)
            $('chain-label').textContent =
              e.combo > 0 ? `${e.combo + 1} CLEAR COMBO` : '';
        }
        if (e.type === 'level') announce(view, `LEVEL ${e.level}`);
      }
    }
    if (now > view.until) view.announcement.classList.remove('show');
  });
  if (match) match.sync();
  if (!recorded && (status() === 'over' || status() === 'won')) finishGame();
  if (!$('menu-screen').hidden) audio.tick(false);
  else {
    views().forEach((v, i) => v.renderer.render(games[i], dt, settings));
    audio.tick(playing(), Math.max(...games.map((g) => g.level)));
    updateHUD();
  }
  requestAnimationFrame(frame);
}
applySettings();
renderPlayers();
updateHUD();
requestControllers();
requestAnimationFrame(frame);
if (window.webkit?.messageHandlers?.diagnostics) {
  const bridge = {
    get game() {
      return game;
    },
    get games() {
      return games;
    },
    get match() {
      return match;
    },
    get inputs() {
      return inputs;
    },
    get input() {
      return inputs[0];
    },
    get playType() {
      return playType;
    },
    get controllers() {
      return controllers;
    },
    renderer: soloView.renderer,
    duoViews,
    profiles,
    router,
    settings,
    audio,
    begin,
    pause,
    goHome,
    setPlayType,
    setMode
  };
  window.__block2gether = bridge;
  window.__luma = bridge;
}
