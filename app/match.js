import { Game } from './engine.js';

// Independent marathon boards share only their initial bag seed and pause state.
// A match ends after both players top out; the survivor keeps their full run.
export class Match {
  constructor({ seed, now } = {}) {
    this.seed = seed;
    this.roundSeed = null;
    this.games = [0, 1].map(
      () => new Game({ mode: 'marathon', seed: seed ?? 0, now })
    );
    this.status = 'ready';
    this.result = null;
  }

  start() {
    // Draw once per new match, then let each Game advance its own seeded generator.
    this.roundSeed = this.seed ?? Math.floor(Math.random() * 0x100000000);
    this.result = null;
    for (const game of this.games) {
      game.seed = this.roundSeed;
      game.start();
    }
    this.status = 'playing';
    return this;
  }

  update(dt) {
    if (this.status === 'playing') {
      for (const game of this.games) game.update(dt);
    }
    this.sync();
  }

  setPaused(paused) {
    this.sync();
    if (this.status !== 'playing' && this.status !== 'paused') return;
    for (const game of this.games) game.setPaused(paused);
    this.status = paused ? 'paused' : 'playing';
  }

  // Call after input, since a hard drop or hold can top out between update calls.
  // Game events remain queued for the presentation layer to drain independently.
  sync() {
    if (this.status === 'ready' || this.status === 'over') return this.result;
    if (this.games.every((game) => game.status === 'over')) {
      const scores = this.games.map((game) => game.score);
      const tie = scores[0] === scores[1];
      this.result = {
        winner: tie ? null : scores[0] > scores[1] ? 0 : 1,
        scores,
        tie
      };
      this.status = 'over';
    }
    return this.result;
  }
}
