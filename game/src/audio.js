// audio.js — all sound in Palmera Bay is synthesized live with WebAudio.
// No audio files: a tiny synth for gunshots, sirens, horns, pickups, footsteps of
// the UI, plus a low-key bass-and-hats groove that loops while you play.
// Audio only starts after the first user gesture (the browser requires it).

export function createAudio() {
  const audio = {
    ctx: null,
    master: null,
    musicGain: null,
    engineOsc: null,
    engineGain: null,
    sirenOsc: null,
    sirenGain: null,
    muted: false,
    musicTimer: 0,
    musicStep: 0,
    started: false,
  };
  return audio;
}

// Call from a user gesture (click / keypress on the title screen).
export function ensureAudio(audio) {
  if (audio.started) {
    if (audio.ctx && audio.ctx.state === 'suspended') audio.ctx.resume();
    return;
  }
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    audio.ctx = new Ctx();
    audio.master = audio.ctx.createGain();
    audio.master.gain.value = audio.muted ? 0 : 0.5;
    audio.master.connect(audio.ctx.destination);
    audio.musicGain = audio.ctx.createGain();
    audio.musicGain.gain.value = 0.16;
    audio.musicGain.connect(audio.master);
    // Engine hum: a sawtooth whose pitch follows the car speed.
    audio.engineOsc = audio.ctx.createOscillator();
    audio.engineOsc.type = 'sawtooth';
    audio.engineOsc.frequency.value = 50;
    const engineFilter = audio.ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 320;
    audio.engineGain = audio.ctx.createGain();
    audio.engineGain.gain.value = 0;
    audio.engineOsc.connect(engineFilter);
    engineFilter.connect(audio.engineGain);
    audio.engineGain.connect(audio.master);
    audio.engineOsc.start();
    // Police siren: two-tone triangle that wails while wanted.
    audio.sirenOsc = audio.ctx.createOscillator();
    audio.sirenOsc.type = 'triangle';
    audio.sirenOsc.frequency.value = 700;
    audio.sirenGain = audio.ctx.createGain();
    audio.sirenGain.gain.value = 0;
    audio.sirenOsc.connect(audio.sirenGain);
    audio.sirenGain.connect(audio.master);
    audio.sirenOsc.start();
    audio.started = true;
  } catch (err) {
    // Audio is decoration; a browser without WebAudio still plays fine.
    audio.started = false;
  }
}

export function setMuted(audio, muted) {
  audio.muted = muted;
  if (audio.master && audio.ctx) {
    audio.master.gain.setTargetAtTime(muted ? 0 : 0.5, audio.ctx.currentTime, 0.05);
  }
}

function blip(audio, freq, dur, type, vol, slideTo) {
  if (!audio.ctx || audio.muted) return;
  const t = audio.ctx.currentTime;
  const osc = audio.ctx.createOscillator();
  const gain = audio.ctx.createGain();
  osc.type = type || 'square';
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
  gain.gain.setValueAtTime(vol || 0.2, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(gain);
  gain.connect(audio.master);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function noiseBurst(audio, dur, vol, lowpass) {
  if (!audio.ctx || audio.muted) return;
  const t = audio.ctx.currentTime;
  const len = Math.floor(audio.ctx.sampleRate * dur);
  const buffer = audio.ctx.createBuffer(1, len, audio.ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = audio.ctx.createBufferSource();
  src.buffer = buffer;
  const filter = audio.ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = lowpass || 3000;
  const gain = audio.ctx.createGain();
  gain.gain.setValueAtTime(vol || 0.3, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(audio.master);
  src.start(t);
}

export function playShoot(audio) {
  noiseBurst(audio, 0.12, 0.35, 2200);
  blip(audio, 180, 0.08, 'square', 0.12, 60);
}

export function playPunch(audio) {
  noiseBurst(audio, 0.08, 0.25, 900);
}

export function playPickup(audio) {
  blip(audio, 660, 0.09, 'sine', 0.22);
  setTimeout(() => blip(audio, 990, 0.12, 'sine', 0.22), 70);
}

export function playCash(audio) {
  blip(audio, 880, 0.07, 'sine', 0.2);
  setTimeout(() => blip(audio, 1174, 0.07, 'sine', 0.2), 60);
  setTimeout(() => blip(audio, 1568, 0.14, 'sine', 0.2), 120);
}

export function playHorn(audio) {
  blip(audio, 370, 0.25, 'square', 0.14, 370);
  blip(audio, 466, 0.25, 'square', 0.1, 466);
}

export function playCrash(audio) {
  noiseBurst(audio, 0.25, 0.4, 700);
}

export function playExplosion(audio) {
  noiseBurst(audio, 0.6, 0.5, 400);
  blip(audio, 90, 0.5, 'sine', 0.35, 30);
}

export function playClick(audio) {
  blip(audio, 520, 0.05, 'sine', 0.15);
}

export function playMission(audio) {
  blip(audio, 523, 0.12, 'sine', 0.22);
  setTimeout(() => blip(audio, 659, 0.12, 'sine', 0.22), 110);
  setTimeout(() => blip(audio, 784, 0.2, 'sine', 0.22), 220);
}

export function playFail(audio) {
  blip(audio, 330, 0.25, 'sawtooth', 0.16, 165);
}

export function playWasted(audio) {
  blip(audio, 392, 0.3, 'sawtooth', 0.18, 196);
  setTimeout(() => blip(audio, 311, 0.4, 'sawtooth', 0.18, 155), 260);
  setTimeout(() => blip(audio, 233, 0.7, 'sawtooth', 0.18, 110), 560);
}

// Called every frame: engine pitch follows speed, siren wails while wanted,
// and the groove steps forward.
export function updateAudio(audio, dt, speed, wanted) {
  if (!audio.ctx || !audio.started) return;
  const t = audio.ctx.currentTime;
  if (audio.engineGain) {
    const target = speed > 20 ? 0.05 + Math.min(0.1, speed / 4000) : 0;
    audio.engineGain.gain.setTargetAtTime(target, t, 0.1);
    audio.engineOsc.frequency.setTargetAtTime(48 + speed * 0.09, t, 0.08);
  }
  if (audio.sirenGain) {
    if (wanted > 0) {
      audio.sirenGain.gain.setTargetAtTime(0.045, t, 0.2);
      const wail = 650 + 260 * Math.sin(t * 2.4);
      audio.sirenOsc.frequency.setTargetAtTime(wail, t, 0.05);
    } else {
      audio.sirenGain.gain.setTargetAtTime(0, t, 0.2);
    }
  }
  // The groove: a 16-step loop, bass on the beat, hats off it, one chord stab.
  audio.musicTimer += dt;
  const stepDur = 0.21;
  while (audio.musicTimer >= stepDur) {
    audio.musicTimer -= stepDur;
    audio.musicStep = (audio.musicStep + 1) % 32;
    const step = audio.musicStep;
    const bassNotes = [55, 0, 55, 0, 65.4, 0, 55, 0, 49, 0, 49, 0, 58.3, 0, 73.4, 0];
    const bass = bassNotes[step % 16];
    if (bass) blip(audio, bass, 0.18, 'triangle', 0.5);
    if (step % 2 === 1) noiseBurst(audio, 0.03, 0.05, 8000);
    if (step === 0 || step === 10 || step === 20) {
      blip(audio, 220, 0.16, 'sine', 0.08);
      blip(audio, 277, 0.16, 'sine', 0.06);
    }
  }
}
