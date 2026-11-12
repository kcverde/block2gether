// Original, procedurally composed audio. No recordings, downloads or dependencies.
export class Soundscape {
  constructor(settings) {
    this.settings = settings;
    this.context = null;
    this.step = 0;
    this.nextNote = 0;
    this.playing = false;
  }
  unlock() {
    if (!this.context) {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return;
      this.context = new Audio();
      this.master = this.context.createGain();
      this.master.gain.value = 0;
      this.master.connect(this.context.destination);
      this.effects = this.context.createGain();
      this.effects.gain.value = 0.65;
      this.effects.connect(this.master);
      this.music = this.context.createGain();
      this.music.gain.value = 0.23;
      this.music.connect(this.master);
      this.delay = this.context.createDelay(1);
      this.delay.delayTime.value = 0.375;
      this.feedback = this.context.createGain();
      this.feedback.gain.value = 0.24;
      this.wet = this.context.createGain();
      this.wet.gain.value = 0.16;
      this.music.connect(this.delay);
      this.delay.connect(this.feedback);
      this.feedback.connect(this.delay);
      this.delay.connect(this.wet);
      this.wet.connect(this.master);
    }
    if (this.context.state === 'suspended')
      this.context.resume().catch(() => {});
    this.apply();
  }
  apply() {
    if (!this.context) return;
    const t = this.context.currentTime;
    this.master.gain.setTargetAtTime(
      this.settings.muted ? 0 : this.settings.volume,
      t,
      0.06
    );
    this.music.gain.setTargetAtTime(
      this.settings.music && this.playing ? 0.23 : 0,
      t,
      0.3
    );
  }
  tone(
    frequency,
    duration = 0.12,
    gain = 0.1,
    type = 'sine',
    when = 0,
    bus = this.effects,
    slide = 0
  ) {
    if (!this.context) return;
    const t = when || this.context.currentTime,
      osc = this.context.createOscillator(),
      amp = this.context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(slide, t + duration);
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(gain, t + 0.007);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(amp);
    amp.connect(bus);
    osc.start(t);
    osc.stop(t + duration + 0.03);
    osc.onended = () => {
      osc.disconnect();
      amp.disconnect();
    };
  }
  play(event) {
    if (!this.context || this.settings.muted) return;
    const t = this.context.currentTime;
    switch (event.type) {
      case 'move':
        this.tone(190, 0.035, 0.025, 'sine');
        break;
      case 'rotate':
        this.tone(
          event.direction < 0 ? 410 : 490,
          0.07,
          0.045,
          'sine',
          0,
          this.effects,
          650
        );
        break;
      case 'hold':
        this.tone(330, 0.13, 0.08);
        this.tone(495, 0.19, 0.055, 'sine', t + 0.055);
        break;
      case 'hardDrop':
        this.tone(160, 0.16, 0.2, 'sine', 0, this.effects, 42);
        this.tone(730, 0.045, 0.035, 'triangle');
        break;
      case 'lock':
        this.tone(100, 0.055, 0.045, 'sine');
        break;
      case 'clear': {
        const notes =
          event.count === 4 || event.allClear
            ? [523.25, 659.25, 783.99, 1046.5, 1318.51]
            : [440, 554.37, 659.25];
        notes.forEach((n, i) =>
          this.tone(n, 0.55, 0.085, 'sine', t + i * 0.045)
        );
        break;
      }
      case 'level':
        [392, 493.88, 587.33, 783.99].forEach((n, i) =>
          this.tone(n, 0.55, 0.08, 'triangle', t + i * 0.1)
        );
        break;
      case 'start':
        [261.63, 392, 523.25].forEach((n, i) =>
          this.tone(n, 0.3, 0.075, 'sine', t + i * 0.08)
        );
        break;
      case 'over':
        [329.63, 293.66, 220].forEach((n, i) =>
          this.tone(n, 0.7, 0.07, 'sine', t + i * 0.17)
        );
        break;
      case 'win':
        [523.25, 659.25, 783.99, 1046.5].forEach((n, i) =>
          this.tone(n, 1.1, 0.1, 'sine', t + i * 0.15)
        );
        break;
    }
  }
  tick(playing, level = 1) {
    if (!this.context) return;
    if (this.playing !== playing) {
      this.playing = playing;
      this.apply();
    }
    if (!playing || !this.settings.music || this.settings.muted) {
      this.nextNote = this.context.currentTime;
      return;
    }
    const t = this.context.currentTime;
    if (this.nextNote < t - 0.1) this.nextNote = t;
    const sequence = [0, 7, 12, 16, 19, 12, 7, 16, 0, 7, 14, 19, 21, 14, 7, 19];
    while (this.nextNote < t + 0.1) {
      const bar = Math.floor(this.step / 16) % 4,
        roots = [130.81, 110, 174.61, 146.83];
      const root = roots[bar],
        note = sequence[this.step % sequence.length];
      this.tone(
        root * Math.pow(2, note / 12),
        1.6,
        0.08,
        'sine',
        this.nextNote,
        this.music
      );
      if (this.step % 8 === 0) {
        this.tone(root / 2, 3.7, 0.16, 'sine', this.nextNote, this.music);
        this.tone(root * 1.5, 3, 0.045, 'sine', this.nextNote, this.music);
      }
      this.step++;
      this.nextNote += 0.34 - Math.min(level - 1, 12) * 0.003;
    }
  }
}
