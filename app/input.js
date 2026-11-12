// Repeat timing is independent of macOS keyboard repeat preferences.
export class InputController {
  constructor(game, settings) {
    this.game = game;
    this.settings = settings;
    this.keys = new Set();
    this.direction = 0;
    this.moveTime = 0;
    this.repeating = false;
    this.dropTime = 0;
  }
  reset() {
    this.keys.clear();
    this.direction = 0;
    this.moveTime = 0;
    this.repeating = false;
    this.dropTime = 0;
  }
  press(code) {
    if (this.keys.has(code)) return false;
    this.keys.add(code);
    if (code === 'ArrowLeft' || code === 'ArrowRight') {
      this.direction = code === 'ArrowLeft' ? -1 : 1;
      this.moveTime = 0;
      this.repeating = false;
      this.game.move(this.direction);
    } else if (code === 'ArrowDown') {
      this.game.softDrop();
      this.dropTime = 0;
    } else if (code === 'Space' || code === 'KeyX') this.game.rotate(1);
    else if (code === 'KeyZ') this.game.rotate(-1);
    else if (code === 'ArrowUp') this.game.hardDrop();
    else if (code === 'KeyC' || code === 'ShiftLeft' || code === 'ShiftRight')
      this.game.hold();
    return true;
  }
  release(code) {
    this.keys.delete(code);
    if (
      (code === 'ArrowLeft' && this.direction === -1) ||
      (code === 'ArrowRight' && this.direction === 1)
    ) {
      const other = code === 'ArrowLeft' ? 'ArrowRight' : 'ArrowLeft';
      this.direction = this.keys.has(other)
        ? other === 'ArrowLeft'
          ? -1
          : 1
        : 0;
      this.moveTime = 0;
      this.repeating = false;
    }
  }
  update(dt) {
    if (this.game.status !== 'playing') {
      this.reset();
      return;
    }
    if (this.direction) {
      this.moveTime += dt * 1000;
      if (!this.repeating && this.moveTime >= this.settings.das) {
        this.moveTime -= this.settings.das;
        this.repeating = true;
        this.game.move(this.direction);
      }
      if (this.repeating) {
        if (this.settings.arr === 0) {
          for (let i = 0; i < 10; i++)
            if (!this.game.move(this.direction)) break;
          this.moveTime = 0;
        } else
          while (this.moveTime >= this.settings.arr) {
            this.game.move(this.direction);
            this.moveTime -= this.settings.arr;
          }
      }
    }
    if (this.keys.has('ArrowDown')) {
      this.dropTime += dt;
      while (this.dropTime >= 0.022) {
        this.game.softDrop();
        this.dropTime -= 0.022;
      }
    }
  }
}
