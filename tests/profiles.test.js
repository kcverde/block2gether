import test from 'node:test';
import assert from 'node:assert/strict';
import { ProfileStore, photoFromFile } from '../app/profiles.js';
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jU1sAAAAASUVORK5CYII=';
function storage() {
  const map = new Map();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => map.set(key, value),
    map
  };
}

test('fresh profiles are generic, distinct, and isolated copies', () => {
  const store = new ProfileStore(storage());
  assert.deepEqual(
    store.selected().map((p) => p.name),
    ['Player 1', 'Player 2']
  );
  assert.ok(store.list().every((p) => p.photo === null));
  const profiles = store.list();
  profiles[0].name = 'Changed';
  assert.equal(store.get(profiles[0].id).name, 'Player 1');
});
test('edits, photos, clear, slots, and stable IDs survive reload', () => {
  const memory = storage(),
    store = new ProfileStore(memory);
  const profile = store.upsert({ name: '  Ada   Lovelace  ', photo: PNG });
  assert.equal(profile.name, 'Ada Lovelace');
  store.select(0, profile.id);
  store.upsert({ id: profile.id, name: 'Ada' });
  assert.equal(new ProfileStore(memory).selected()[0].photo, PNG);
  assert.equal(new ProfileStore(memory).selected()[0].id, profile.id);
  store.clearPhoto(profile.id);
  assert.equal(new ProfileStore(memory).get(profile.id).photo, null);
});
test('selecting the other player swaps slots and never duplicates', () => {
  const store = new ProfileStore(storage()),
    [a, b] = store.selected();
  store.select(0, b.id);
  assert.deepEqual(
    store.selected().map((p) => p.id),
    [b.id, a.id]
  );
  store.select(1, b.id);
  assert.deepEqual(
    store.selected().map((p) => p.id),
    [a.id, b.id]
  );
  assert.throws(() => store.select(2, a.id), /player one/);
  assert.throws(() => store.select(0, 'missing'), /no longer/);
});
test('removing selected profiles preserves two usable distinct slots', () => {
  const memory = storage(),
    store = new ProfileStore(memory);
  for (let i = 0; i < 12; i++) {
    const id = store.selected()[i % 2].id;
    assert.equal(store.remove(id), true);
    const selected = new ProfileStore(memory).selected();
    assert.ok(selected.every(Boolean));
    assert.notEqual(selected[0].id, selected[1].id);
    assert.equal(store.get(id), null);
  }
  assert.equal(store.remove('missing'), false);
});
test('eight-player cap, blank names, unicode length, unsafe photo input', () => {
  const store = new ProfileStore(storage());
  const profile = store.upsert({ name: '😀'.repeat(30) });
  assert.equal([...profile.name].length, 24);
  assert.throws(() => store.upsert({ name: ' \n ' }), /name/);
  for (const photo of [
    'https://example.com/a.png',
    'data:image/svg+xml;base64,PHN2Zz4=',
    'data:image/png;base64,PHN2Zz4=',
    'data:image/jpeg;base64,!!!!'
  ])
    assert.throws(() => store.upsert({ name: 'Test', photo }), /photo|PNG/);
  while (store.list().length < 8) store.upsert({ name: 'Player' });
  assert.throws(() => store.upsert({ name: 'Ninth' }), /eight/);
  store.upsert({ id: profile.id, name: 'Updated' });
  assert.equal(store.list().length, 8);
});
test('quota failure is explicit and leaves in-memory and stored state unchanged', () => {
  const memory = storage(),
    store = new ProfileStore(memory);
  store.upsert({ name: 'Saved' });
  const before = store.list(),
    stored = [...memory.map.values()];
  memory.setItem = () => {
    const error = new Error('quota');
    error.name = 'QuotaExceededError';
    throw error;
  };
  for (const change of [
    () => store.upsert({ name: 'Unsaved' }),
    () => store.remove(before[0].id),
    () => store.select(0, before[1].id),
    () => store.importProfiles([{ id: 'imported', name: 'Import' }])
  ]) {
    assert.throws(change, /not enough space/);
    assert.deepEqual(store.list(), before);
    assert.deepEqual([...memory.map.values()], stored);
  }
});
test('imports are atomic, deterministic and preserve order and IDs', () => {
  const memory = storage(),
    store = new ProfileStore(memory),
    imported = [
      { id: 'person-a', name: 'Person A', photo: PNG },
      { id: 'person-b', name: 'Person B' }
    ];
  store.importProfiles(imported);
  store.importProfiles(imported);
  assert.equal(store.list().length, 4);
  assert.deepEqual(
    new ProfileStore(memory).selected().map((p) => p.id),
    ['person-a', 'person-b']
  );
  const before = store.list();
  assert.throws(
    () => store.importProfiles([imported[0], imported[0]]),
    /different/
  );
  assert.deepEqual(store.list(), before);
  assert.throws(
    () => store.importProfiles([{ id: 'bad id', name: 'No' }]),
    /invalid/
  );
});
test('corrupt persisted values recover to generic safe defaults', () => {
  for (const raw of [
    '{oops',
    'null',
    JSON.stringify({
      profiles: [{ id: 'x', name: 'X', photo: 'javascript:alert(1)' }],
      slots: ['x', 'x']
    })
  ]) {
    const memory = storage();
    memory.setItem('block2gether.profiles.v1', raw);
    assert.deepEqual(
      new ProfileStore(memory).selected().map((p) => p.name),
      ['Player 1', 'Player 2']
    );
  }
});
test('file validation rejects unsupported types and files above 10 MB before decoding', async () => {
  await assert.rejects(
    photoFromFile({ type: 'image/svg+xml', size: 100 }),
    /PNG/
  );
  await assert.rejects(
    photoFromFile({ type: 'image/png', size: 10 * 1024 * 1024 + 1 }),
    /10 MB/
  );
  await assert.rejects(photoFromFile({ type: 'image/png', size: 0 }), /10 MB/);
});

test('photo normalization preserves aspect ratio, caps at 512px and releases its object URL', async (t) => {
  const originalImage = globalThis.Image,
    originalDocument = globalThis.document;
  const draws = [],
    fills = [],
    revoked = [];
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({
      fillRect: (...args) => fills.push(args),
      drawImage: (...args) => draws.push(args)
    }),
    toDataURL: (type, quality) => {
      assert.equal(type, 'image/jpeg');
      assert.equal(quality, 0.86);
      return 'data:image/jpeg;base64,/9j/AAAA';
    }
  };
  globalThis.Image = class {
    naturalWidth = 2000;
    naturalHeight = 1000;
    set src(value) {
      queueMicrotask(() => this.onload());
    }
  };
  globalThis.document = { createElement: () => canvas };
  t.mock.method(URL, 'createObjectURL', () => 'blob:test-photo');
  t.mock.method(URL, 'revokeObjectURL', (value) => revoked.push(value));
  try {
    await photoFromFile({ type: 'image/png', size: 1000 });
    assert.deepEqual([canvas.width, canvas.height], [512, 256]);
    assert.deepEqual(fills[0], [0, 0, 512, 256]);
    assert.deepEqual(draws[0].slice(1), [0, 0, 512, 256]);
    assert.deepEqual(revoked, ['blob:test-photo']);
  } finally {
    globalThis.Image = originalImage;
    globalThis.document = originalDocument;
  }
});
test('decode failure returns a readable error and releases its object URL', async (t) => {
  const originalImage = globalThis.Image,
    revoked = [];
  globalThis.Image = class {
    set src(value) {
      queueMicrotask(() => this.onerror());
    }
  };
  t.mock.method(URL, 'createObjectURL', () => 'blob:broken-photo');
  t.mock.method(URL, 'revokeObjectURL', (value) => revoked.push(value));
  try {
    await assert.rejects(
      photoFromFile({ type: 'image/jpeg', size: 1000 }),
      /could not be opened/
    );
    assert.deepEqual(revoked, ['blob:broken-photo']);
  } finally {
    globalThis.Image = originalImage;
  }
});
