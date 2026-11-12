// Aggregate physical sources so releasing a keyboard key cannot cancel a held pad.
const ACTIONS = {
  left: 'ArrowLeft',
  right: 'ArrowRight',
  down: 'ArrowDown',
  cw: 'Space',
  ccw: 'KeyZ',
  drop: 'ArrowUp',
  hold: 'KeyC'
};
const SOLO = {
  ArrowLeft: 'ArrowLeft',
  ArrowRight: 'ArrowRight',
  ArrowDown: 'ArrowDown',
  ArrowUp: 'ArrowUp',
  KeyX: 'Space',
  KeyZ: 'KeyZ',
  Space: 'Space',
  KeyC: 'KeyC',
  ShiftLeft: 'KeyC',
  ShiftRight: 'KeyC'
};
const SECOND = {
  KeyA: 'ArrowLeft',
  KeyD: 'ArrowRight',
  KeyS: 'ArrowDown',
  KeyW: 'Space',
  KeyQ: 'KeyZ',
  KeyF: 'ArrowUp',
  KeyE: 'KeyC',
  ShiftLeft: 'KeyC'
};
export class ControlRouter {
  constructor(inputs = [], dual = false) {
    this.inputs = inputs;
    this.dual = dual;
    this.sources = new Map();
  }
  configure(inputs, dual) {
    this.clear();
    this.inputs = inputs;
    this.dual = dual;
  }
  binding(code) {
    if (this.dual && SECOND[code]) return [1, SECOND[code]];
    return SOLO[code] ? [0, SOLO[code]] : null;
  }
  keyboard(code, pressed) {
    const b = this.binding(code);
    if (!b) return false;
    this.set('key:' + code, b[0], b[1], pressed);
    return true;
  }
  controller({ id, slot, action, pressed }) {
    if (!ACTIONS[action] || !Number.isInteger(slot) || slot < 0 || slot > 1)
      return;
    this.set(
      'pad:' + id + ':' + action,
      this.dual ? slot : 0,
      ACTIONS[action],
      pressed
    );
  }
  set(source, lane, code, pressed) {
    if (!pressed) {
      this.release(source);
      return;
    }
    if (this.sources.has(source) || !this.inputs[lane]) return;
    const existing = [...this.sources.values()].some(
      (v) => v.lane === lane && v.code === code
    );
    this.sources.set(source, { lane, code });
    if (!existing) this.inputs[lane].press(code);
  }
  release(source) {
    const prior = this.sources.get(source);
    if (!prior) return;
    this.sources.delete(source);
    if (
      ![...this.sources.values()].some(
        (v) => v.lane === prior.lane && v.code === prior.code
      )
    )
      this.inputs[prior.lane]?.release(prior.code);
  }
  forgetController(id) {
    for (const key of [...this.sources.keys()])
      if (key.startsWith('pad:' + id + ':')) this.release(key);
  }
  clear() {
    this.sources.clear();
    for (const input of this.inputs) input.reset();
  }
}
