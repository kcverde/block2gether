const KEY = 'block2gether.profiles.v1';
const MAX_PROFILES = 8;
const MAX_PHOTO_LENGTH = 700_000;
const makeDefault = (number, id = `player-${number}`) => ({
  id,
  name: `Player ${number}`,
  photo: null
});
const copy = (profile) => ({ ...profile });
const initialState = () => ({
  profiles: [makeDefault(1), makeDefault(2)],
  slots: ['player-1', 'player-2']
});
const validId = (id) =>
  typeof id === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(id);
function newId() {
  return `player-${globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`;
}
function cleanName(value) {
  if (typeof value !== 'string') throw new Error('Enter a player name.');
  const name = [
    ...value
      .replace(/[\u0000-\u001f\u007f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  ]
    .slice(0, 24)
    .join('');
  if (!name) throw new Error('Enter a player name.');
  return name;
}
function cleanPhoto(value) {
  if (value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > MAX_PHOTO_LENGTH)
    throw new Error('That photo is too large. Choose it again to resize it.');
  const match =
    /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match || match[2].length % 4 !== 0)
    throw new Error('Choose a PNG, JPEG, or WebP photo.');
  let signature;
  try {
    signature = atob(match[2].slice(0, 32));
  } catch {
    throw new Error('That photo could not be read.');
  }
  const bytes = [...signature].map((c) => c.charCodeAt(0));
  const valid =
    match[1] === 'jpeg'
      ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
      : match[1] === 'png'
        ? bytes.slice(0, 8).join(',') === '137,80,78,71,13,10,26,10'
        : signature.startsWith('RIFF') && signature.slice(8, 12) === 'WEBP';
  if (!valid)
    throw new Error(
      'That photo could not be read. Choose another PNG, JPEG, or WebP image.'
    );
  return value;
}
function validatedProfile(profile) {
  if (!profile || !validId(profile.id))
    throw new Error('That player profile is invalid.');
  return {
    id: profile.id,
    name: cleanName(profile.name),
    photo: cleanPhoto(profile.photo ?? null)
  };
}

export class ProfileStore {
  constructor(storage = globalThis.localStorage) {
    if (
      !storage ||
      typeof storage.getItem !== 'function' ||
      typeof storage.setItem !== 'function'
    )
      throw new Error('Player storage is unavailable.');
    this.storage = storage;
    this.state = initialState();
    let raw;
    try {
      raw = storage.getItem(KEY);
    } catch {
      throw new Error(
        'Player storage is unavailable. Check this app’s storage permissions.'
      );
    }
    if (!raw) return;
    try {
      const saved = JSON.parse(raw);
      if (
        !Array.isArray(saved.profiles) ||
        saved.profiles.length < 2 ||
        saved.profiles.length > MAX_PROFILES
      )
        return;
      const profiles = saved.profiles.map(validatedProfile),
        ids = new Set(profiles.map((p) => p.id));
      if (
        ids.size !== profiles.length ||
        !Array.isArray(saved.slots) ||
        saved.slots.length !== 2 ||
        saved.slots[0] === saved.slots[1] ||
        !saved.slots.every((id) => ids.has(id))
      )
        return;
      this.state = { profiles, slots: [...saved.slots] };
    } catch {
      /* Malformed saved data cannot inject HTML or prevent a fresh game. */
    }
  }
  list() {
    return this.state.profiles.map(copy);
  }
  get(id) {
    const profile = this.state.profiles.find((p) => p.id === id);
    return profile ? copy(profile) : null;
  }
  selected() {
    return this.state.slots.map((id) => this.get(id));
  }
  _commit(state) {
    try {
      this.storage.setItem(KEY, JSON.stringify(state));
    } catch (error) {
      if (error?.name === 'QuotaExceededError' || error?.code === 22)
        throw new Error(
          'There is not enough space to save this player. Remove an unused photo and try again.'
        );
      throw new Error(
        'Player changes could not be saved. Check this app’s storage permissions and try again.'
      );
    }
    this.state = state;
  }
  upsert({ id, name, photo } = {}) {
    const existing = id ? this.get(id) : null;
    if (id !== undefined && !validId(id))
      throw new Error('That player profile is invalid.');
    if (!existing && this.state.profiles.length >= MAX_PROFILES)
      throw new Error(
        'You can save up to eight players. Remove an unused player first.'
      );
    const profile = validatedProfile({
      id: id || newId(),
      name,
      photo: photo === undefined ? (existing?.photo ?? null) : photo
    });
    const profiles = this.list(),
      index = profiles.findIndex((p) => p.id === profile.id);
    if (index === -1) profiles.push(profile);
    else profiles[index] = profile;
    this._commit({ profiles, slots: [...this.state.slots] });
    return copy(profile);
  }
  clearPhoto(id) {
    const profile = this.get(id);
    if (!profile) throw new Error('That player no longer exists.');
    return this.upsert({ ...profile, photo: null });
  }
  remove(id) {
    if (!this.get(id)) return false;
    const profiles = this.list().filter((p) => p.id !== id);
    while (profiles.length < 2) {
      const number = profiles.some((p) => p.name === 'Player 1') ? 2 : 1;
      profiles.push(makeDefault(number, newId()));
    }
    const ids = new Set(profiles.map((p) => p.id));
    const slots = this.state.slots.map((slot) => (ids.has(slot) ? slot : null));
    for (let slot = 0; slot < 2; slot++)
      if (!slots[slot])
        slots[slot] = profiles.find((p) => !slots.includes(p.id)).id;
    this._commit({ profiles, slots });
    return true;
  }
  select(slot, id) {
    if (slot !== 0 && slot !== 1)
      throw new Error('Choose player one or player two.');
    if (!this.get(id)) throw new Error('That player no longer exists.');
    const slots = [...this.state.slots],
      other = 1 - slot;
    if (slots[other] === id) slots[other] = slots[slot];
    slots[slot] = id;
    this._commit({ profiles: this.list(), slots });
    return this.selected();
  }
  importProfiles(values) {
    if (
      !Array.isArray(values) ||
      values.length < 1 ||
      values.length > MAX_PROFILES
    )
      throw new Error(
        'Choose between one and eight player profiles to import.'
      );
    const imported = values.map(validatedProfile);
    if (new Set(imported.map((p) => p.id)).size !== imported.length)
      throw new Error('Imported players must have different profile IDs.');
    const profiles = this.list();
    for (const profile of imported) {
      const index = profiles.findIndex((p) => p.id === profile.id);
      if (index === -1) profiles.push(profile);
      else profiles[index] = profile;
    }
    if (profiles.length > MAX_PROFILES)
      throw new Error(
        'There is room for eight players. Remove unused players before importing more.'
      );
    const slots = [
      imported[0].id,
      imported[1]?.id ||
        this.state.slots.find((id) => id !== imported[0].id) ||
        profiles.find((p) => p.id !== imported[0].id).id
    ];
    this._commit({ profiles, slots });
    return this.selected();
  }
}

export async function photoFromFile(file) {
  if (!file || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type))
    throw new Error('Choose a PNG, JPEG, or WebP photo.');
  if (
    !Number.isFinite(file.size) ||
    file.size <= 0 ||
    file.size > 10 * 1024 * 1024
  )
    throw new Error('Choose a photo smaller than 10 MB.');
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const picture = new Image();
      picture.onload = () => resolve(picture);
      picture.onerror = () =>
        reject(new Error('That photo could not be opened. Try another image.'));
      picture.src = url;
    });
    const width = image.naturalWidth,
      height = image.naturalHeight;
    if (!width || !height || width * height > 100_000_000)
      throw new Error(
        'That photo is too large to process. Choose a smaller image.'
      );
    const scale = Math.min(1, 512 / Math.max(width, height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext('2d');
    if (!context)
      throw new Error('Photos could not be processed on this device.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return cleanPhoto(canvas.toDataURL('image/jpeg', 0.86));
  } finally {
    URL.revokeObjectURL(url);
  }
}
