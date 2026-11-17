// All sound and music is synthesized live with WebAudio — no audio files, no network.
// A tiny synth: engine hum, two-tone police siren, gunshots, pickups, and a looping
// bass-driven street groove that changes intensity with the wanted level.
export class SoundBank {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.enabled = true;
    this.musicOn = true;
    this.step = 0;
    this.nextNoteTime = 0;
    this.tempo = 96;
  }
  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.16;
      this.musicGain.connect(this.master);
      // Engine: a low sawtooth whose pitch follows speed, always running once started.
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineOsc.frequency.value = 40;
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0.0;
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 320;
      this.engineOsc.connect(lp); lp.connect(this.engineGain); this.engineGain.connect(this.master);
      this.engineOsc.start();
      // Siren: two alternating tones, gain gated by wanted level.
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenOsc.type = 'triangle';
      this.sirenOsc.frequency.value = 700;
      this.sirenGain = this.ctx.createGain();
      this.sirenGain.gain.value = 0.0;
      this.sirenOsc.connect(this.sirenGain); this.sirenGain.connect(this.master);
      this.sirenOsc.start();
      this.nextNoteTime = this.ctx.currentTime + 0.1;
    } catch (e) { this.ctx = null; }
  }
  setEngine(speed01, driving) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.engineOsc.frequency.setTargetAtTime(38 + speed01 * 140, t, 0.08);
    this.engineGain.gain.setTargetAtTime(driving ? 0.05 + speed01 * 0.06 : 0.0, t, 0.1);
  }
  setSiren(wanted, now) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (wanted > 0) {
      const tone = Math.floor(now * 2.2) % 2 === 0 ? 660 : 880;
      this.sirenOsc.frequency.setTargetAtTime(tone, t, 0.05);
      this.sirenGain.gain.setTargetAtTime(0.035, t, 0.2);
    } else {
      this.sirenGain.gain.setTargetAtTime(0.0, t, 0.2);
    }
  }
  blip(freq, dur, type, vol, when = 0) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(vol || 0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }
  noise(dur, vol, filterFreq) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = filterFreq || 1200;
    const g = this.ctx.createGain();
    g.gain.value = vol || 0.25;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t);
  }
  shoot() { this.noise(0.14, 0.3, 2400); this.blip(180, 0.08, 'square', 0.1); }
  punch() { this.noise(0.08, 0.2, 500); }
  pickup() { this.blip(660, 0.09, 'sine', 0.16); this.blip(990, 0.14, 'sine', 0.16, 0.08); }
  cash() { this.blip(880, 0.08, 'sine', 0.16); this.blip(1174, 0.08, 'sine', 0.16, 0.07); this.blip(1568, 0.16, 'sine', 0.16, 0.14); }
  denied() { this.blip(160, 0.18, 'sawtooth', 0.14); }
  busted() { this.blip(220, 0.3, 'sawtooth', 0.18); this.blip(174, 0.5, 'sawtooth', 0.18, 0.25); }
  missionDone() {
    [523, 659, 784, 1046].forEach((f, i) => this.blip(f, 0.16, 'triangle', 0.18, i * 0.09));
  }
  // Looping street groove: A-minor bass riff + hats, intensity follows wanted level.
  musicTick(now, wanted) {
    if (!this.ctx || !this.musicOn) return;
    const spb = 60 / this.tempo / 2; // eighth notes
    while (this.nextNoteTime < this.ctx.currentTime + 0.15) {
      const s = this.step % 16;
      const bass = [55, 0, 55, 0, 65.4, 0, 55, 0, 49, 0, 49, 0, 58.3, 0, 73.4, 0][s];
      if (bass) {
        const t = this.nextNoteTime;
        const o = this.ctx.createOscillator();
        o.type = 'triangle'; o.frequency.value = bass;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.5, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + spb * 0.95);
        o.connect(g); g.connect(this.musicGain);
        o.start(t); o.stop(t + spb);
      }
      if (s % 2 === 0) { // hat tick
        const t = this.nextNoteTime;
        const len = Math.floor(this.ctx.sampleRate * 0.03);
        const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) * 0.5;
        const src = this.ctx.createBufferSource(); src.buffer = buf;
        const f = this.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 6000;
        const g = this.ctx.createGain(); g.gain.value = wanted > 0 ? 0.35 : 0.18;
        src.connect(f); f.connect(g); g.connect(this.musicGain);
        src.start(t);
      }
      if (wanted >= 3 && s % 4 === 0) { // tense extra kick when the heat is on
        const t = this.nextNoteTime;
        const o = this.ctx.createOscillator();
        o.type = 'sine'; o.frequency.setValueAtTime(120, t);
        o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.6, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
        o.connect(g); g.connect(this.musicGain);
        o.start(t); o.stop(t + 0.16);
      }
      this.step++;
      this.nextNoteTime += spb;
    }
    void now;
  }
}
