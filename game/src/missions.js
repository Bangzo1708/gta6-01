// The story of Palmera Bay: six missions, told through dialogue and objectives.
// Rico Vane, a wheelman fresh out of the county lockup, owes $20,000 to the Marlin Crew
// and has one week to pay it back — or swim with the fishes. All characters are invented.
import { dist, clamp } from './util.js';
import { makePed, makeCar, burst, spawnPickup } from './entities.js';

export const MISSIONS = [
  {
    id: 'm1', title: 'Welcome Back', reward: 500,
    intro: [
      ['RICO', 'Three years inside. The Bay smells the same — salt, gasoline and bad decisions.'],
      ['MANNY', 'Rico! You look terrible. The Marlin Crew still wants their twenty grand, amigo.'],
      ['RICO', 'Then I better start driving. Point me at the first job.'],
    ],
    steps: [
      { type: 'goto', x: 1620, y: 2380, label: 'Meet Manny at Club Eclipse', radius: 90 },
      { type: 'talk', x: 1620, y: 2380, label: 'Talk to Manny', radius: 110,
        lines: [['MANNY', 'First job is easy: my cousin left a Comet GT by the marina. Bring it to my garage.'], ['RICO', 'Stealing already? I have not even had breakfast.']] },
      { type: 'steal', x: 420, y: 260, label: 'Steal the Comet GT at the marina', radius: 60 },
      { type: 'deliver', x: 2380, y: 1620, label: 'Deliver the car to the chop shop', radius: 110,
        outro: [['MANNY', 'Clean work. The Crew notices drivers like you. Here is your cut.']] },
    ],
  },
  {
    id: 'm2', title: 'Hot Wheels', reward: 1200,
    intro: [
      ['MANNY', 'A rich kid parks a Street Hawk by the beach every afternoon. Rich kids insure. We profit.'],
      ['RICO', 'One car. No witnesses, no cops. Got it.'],
    ],
    steps: [
      { type: 'steal', x: 420, y: 3120, label: 'Take the Street Hawk at the Driftwood Bar', radius: 60, quiet: true },
      { type: 'deliver', x: 2380, y: 1620, label: 'Bring it to the chop shop — stay cool', radius: 110,
        outro: [['MANNY', 'That Hawk will fund three more jobs. You drive like you were born in it.']] },
    ],
  },
  {
    id: 'm3', title: 'Payback at Dock 9', reward: 2500,
    intro: [
      ['RICO', 'The Vipers jumped Manny last night. They are holed up at Dock 9 with his money.'],
      ['MANNY', 'Take my pistol. Make them regret it. And Rico — come back alive.'],
    ],
    steps: [
      { type: 'goto', x: 2620, y: 1180, label: 'Reach the Dock 9 warehouse', radius: 130 },
      { type: 'kill', x: 2620, y: 1180, label: 'Deal with the Vipers (0/4)', radius: 260, count: 4,
        outro: [['RICO', 'Four down. Manny, your money is coming home.']] },
      { type: 'collect', x: 2620, y: 1180, label: 'Grab the cash bags (0/2)', radius: 200, count: 2 },
      { type: 'deliver', x: 520, y: 1520, label: 'Stash the cash at the safehouse', radius: 110,
        outro: [['MANNY', 'The Vipers will think twice now. The Bay is talking about you, Rico.']] },
    ],
  },
  {
    id: 'm4', title: 'The Getaway', reward: 3000,
    intro: [
      ['MANNY', 'Bad news — Bay PD raided the garage. They know your face now. Lose them and get to the safehouse.'],
      ['RICO', 'Three stars and a full tank. Let us see what this Comet can do.'],
    ],
    steps: [
      { type: 'escape', x: 520, y: 1520, label: 'Lose the cops, then reach the safehouse', radius: 110,
        outro: [['RICO', 'They lost me in the marina fog. The Crew owes me a drink.']] },
    ],
  },
  {
    id: 'm5', title: 'Bayfront Heist', reward: 6000,
    intro: [
      ['MANNY', 'The big one. A courier van carries the Crew\'s cut through Downtown at noon. Three stops. Grab the bags, vanish.'],
      ['RICO', 'Three bags, one city, zero room for mistakes. I am in.'],
    ],
    steps: [
      { type: 'collect', x: 1400, y: 600, label: 'Intercept the courier — grab bag 1 (0/3)', radius: 220, count: 3, spread: true },
      { type: 'deliver', x: 520, y: 1520, label: 'Deliver the bags to the safehouse', radius: 110,
        outro: [['MANNY', 'Six grand in one afternoon. The Marlin Crew is almost paid off, amigo.']] },
    ],
  },
  {
    id: 'm6', title: 'King of the Bay', reward: 12000,
    intro: [
      ['RICO', 'One last job. The Viper boss, Duke Marlowe, is at the airfield with the Crew\'s final payment — and a small army.'],
      ['MANNY', 'Finish this and you are free, Rico. The Bay is yours.'],
    ],
    steps: [
      { type: 'goto', x: 2820, y: 2820, label: 'Reach Palmera Airfield', radius: 160 },
      { type: 'kill', x: 2820, y: 2820, label: 'Take down Duke\'s crew (0/6)', radius: 320, count: 6,
        outro: [['DUKE', 'You... you actually did it. The Bay was never mine. It was always yours.']] },
      { type: 'deliver', x: 520, y: 1520, label: 'Bring the final payment home', radius: 110,
        outro: [['MANNY', 'Twenty grand. Paid in full. Rico Vane — King of the Bay.']] },
    ],
  },
];

export class MissionEngine {
  constructor(world) {
    this.world = world;
    this.index = 0; // which mission is active (-1 = story complete)
    this.step = 0;
    this.active = false;
    this.marker = null;
    this.dialogue = null; // {lines, i, t}
    this.stepState = {};
    this.escapeTimer = 0;
    this.banner = null; // {text, sub, t}
  }
  current() { return this.index >= 0 && this.index < MISSIONS.length ? MISSIONS[indexSafe(this.index)] : null; }
  startMission(i) {
    const m = MISSIONS[i];
    this.index = i; this.step = 0; this.active = true; this.stepState = {};
    this.showDialogue(m.intro);
    this.setupStep();
    this.banner = { text: 'MISSION: ' + m.title, sub: 'Reward ' + '$' + m.reward.toLocaleString('en-US'), t: 3.2 };
    if (this.world.sounds) this.world.sounds.missionDone();
  }
  setupStep() {
    const m = this.current();
    if (!m) return;
    const s = m.steps[this.step];
    if (!s) { this.completeMission(); return; }
    this.stepState = { kills: 0, bags: 0, spawned: false, targetCar: null, gang: [] };
    this.marker = { x: s.x, y: s.y, label: s.label, radius: s.radius || 90 };
    if (s.type === 'steal') {
      const car = makeCar(s.x, s.y, 0, { model: this.world.rng ? undefined : undefined, color: '#f1c40f', parked: true, driver: 'none' });
      // Force a flashy model for the target car.
      car.model = { name: s.quiet ? 'Street Hawk' : 'Comet GT', top: 560, accel: 340, len: 44, w: 21 };
      car.len = 44; car.w = 21;
      this.world.cars.push(car);
      this.stepState.targetCar = car;
      this.marker.x = car.x; this.marker.y = car.y;
    }
    if (s.type === 'kill') {
      const gang = [];
      for (let i = 0; i < s.count; i++) {
        const ped = makePed(s.x + (this.world.rng() - 0.5) * 260, s.y + (this.world.rng() - 0.5) * 260, this.world.rng);
        ped.gang = true; ped.state = 'walk';
        ped.shirt = '#8e44ad'; ped.health = 100;
        this.world.peds.push(ped);
        gang.push(ped);
      }
      this.stepState.gang = gang;
    }
    if (s.type === 'collect') {
      const n = s.count;
      for (let i = 0; i < n; i++) {
        const ox = s.spread ? (i - (n - 1) / 2) * 420 : (this.world.rng() - 0.5) * 220;
        const oy = s.spread ? (this.world.rng() - 0.5) * 120 : (this.world.rng() - 0.5) * 220;
        spawnPickup(this.world, s.x + ox, s.y + oy, 'cashbag');
      }
    }
    if (s.type === 'escape') {
      this.world.setWanted(3);
      this.escapeTimer = 0;
    }
  }
  showDialogue(lines) {
    this.dialogue = { lines, i: 0, t: 0 };
  }
  advanceDialogue() {
    if (!this.dialogue) return;
    this.dialogue.i++;
    this.dialogue.t = 0;
    if (this.dialogue.i >= this.dialogue.lines.length) this.dialogue = null;
  }
  completeStep() {
    const m = this.current();
    const s = m.steps[this.step];
    if (s && s.outro) this.showDialogue(s.outro);
    this.step++;
    if (this.step >= m.steps.length) this.completeMission();
    else this.setupStep();
  }
  completeMission() {
    const m = this.current();
    this.world.money += m.reward;
    this.world.missionsDone = (this.world.missionsDone || 0) + 1;
    this.active = false;
    this.marker = null;
    this.banner = { text: 'MISSION PASSED', sub: m.title + '  •  +$' + m.reward.toLocaleString('en-US'), t: 4 };
    if (this.world.sounds) { this.world.sounds.missionDone(); this.world.sounds.cash(); }
    this.world.saveGame();
    this.index++;
    this.step = 0;
    if (this.index >= MISSIONS.length) {
      this.world.storyComplete = true;
      this.world.mode = 'complete';
      this.banner = { text: 'KING OF THE BAY', sub: 'Story complete — free roam continues. Thanks for playing!', t: 6 };
    }
  }
  // Called every frame while playing. Returns the current objective text.
  update(dt) {
    if (this.banner) { this.banner.t -= dt; if (this.banner.t <= 0) this.banner = null; }
    if (this.dialogue) { this.dialogue.t += dt; return this.objectiveText(); }
    if (!this.active || this.index < 0 || this.index >= MISSIONS.length) return this.objectiveText();
    const m = MISSIONS[this.index];
    const s = m.steps[this.step];
    if (!s) return this.objectiveText();
    const w = this.world;
    const p = w.player;
    const px = p.car ? p.car.x : p.x;
    const py = p.car ? p.car.y : p.y;
    const d = dist(px, py, s.x, s.y);
    switch (s.type) {
      case 'goto':
      case 'talk':
        if (d < (s.radius || 90)) {
          if (s.type === 'goto' || w.input.justPressed('KeyE')) this.completeStep();
        }
        break;
      case 'steal':
        if (this.stepState.targetCar && p.car === this.stepState.targetCar) {
          if (!s.quiet) w.addWanted(1);
          this.completeStep();
        }
        break;
      case 'deliver': {
        const needCar = this.stepState.targetCar;
        const inCar = needCar ? p.car === needCar : !!p.car || true;
        if (d < (s.radius || 110) && inCar) this.completeStep();
        break;
      }
      case 'kill': {
        const alive = this.stepState.gang.filter((g) => !g.dead).length;
        const done = s.count - alive;
        this.marker.label = s.label.replace(/\(\d+\/\d+\)/, `(${done}/${s.count})`);
        if (alive <= 0) this.completeStep();
        break;
      }
      case 'collect': {
        const got = this.stepState.bags;
        this.marker.label = s.label.replace(/\(\d+\/\d+\)/, `(${got}/${s.count})`);
        if (got >= s.count) this.completeStep();
        break;
      }
      case 'escape': {
        this.escapeTimer += dt;
        if (w.wanted === 0 && this.escapeTimer > 4) {
          if (d < (s.radius || 110)) this.completeStep();
          else this.marker.label = 'Cops lost — reach the safehouse';
        } else {
          this.marker.label = 'Lose the cops! Wanted: ' + '★'.repeat(w.wanted);
        }
        break;
      }
    }
    return this.objectiveText();
  }
  objectiveText() {
    if (this.index >= MISSIONS.length) return 'Story complete — free roam. Press M for the mission list.';
    if (!this.active) return 'Go to the yellow M marker to start: ' + MISSIONS[this.index].title;
    const m = MISSIONS[this.index];
    const s = m.steps[this.step];
    return s ? s.label : '';
  }
  missionMarker() {
    if (this.active && this.marker) return this.marker;
    if (this.index < MISSIONS.length) {
      const start = missionStartPoint(this.index);
      return { x: start.x, y: start.y, label: 'Start: ' + MISSIONS[this.index].title, radius: 120, start: true };
    }
    return null;
  }
}

function indexSafe(i) { return clamp(i, 0, MISSIONS.length - 1); }

export function missionStartPoint(i) {
  const starts = [
    { x: 1620, y: 2380 }, { x: 420, y: 3120 }, { x: 2620, y: 1180 },
    { x: 2380, y: 1620 }, { x: 1400, y: 600 }, { x: 2820, y: 2820 },
  ];
  return starts[clamp(i, 0, starts.length - 1)];
}
