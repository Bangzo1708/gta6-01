// missions.js — the story of Palmera Bay: four jobs for Leo Marlow, from a
// welcome-home errand to a bank-van heist. Each mission is a list of steps; a
// step is a place to reach, a car to steal, thugs to deal with, or an escape.
// Dialog plays in the box at the bottom of the screen; the waypoint marker and
// the minimap always point at the current objective.

import { dist } from './util.js';
import { landmarkById } from './city.js';
import { spawnThug } from './peds.js';
import { spawnParkedCar, spawnPoliceCar } from './vehicles.js';
import { spawnHealthPickup, spawnCashPickup } from './entities.js';
import { playMission, playFail, playCash } from './audio.js';
import { addWanted } from './peds.js';
import { writeSave } from './save.js';

export const MISSION_DEFS = [
  {
    id: 'welcome-home',
    title: 'Welcome Home',
    giver: 'Rosa',
    reward: 150,
    briefing: [
      { who: 'Rosa', text: "Leo! You're back in Palmera Bay. Ten years away and the city still smells like salt and trouble." },
      { who: 'Leo', text: 'Good to see you, Rosa. I need work. Real work.' },
      { who: 'Rosa', text: "Then start simple. Drive to my diner and pick up the keys to your old place. Don't keep an old woman waiting." },
    ],
    steps: [
      { type: 'goto', place: 'diner', text: 'Drive to Rosa\'s Diner', radius: 90 },
      { type: 'talk', place: 'diner', text: 'Talk to Rosa (press E)', radius: 90,
        lines: [
          { who: 'Rosa', text: "Here's the safehouse key, mijo. Your uncle's old flat above the market. And Leo — stay out of the Yards after dark." },
          { who: 'Leo', text: "Thanks, Rosa. I owe you one." },
        ] },
    ],
  },
  {
    id: 'hot-wheels',
    title: 'Hot Wheels',
    giver: 'Eddie Voss',
    reward: 400,
    briefing: [
      { who: 'Eddie Voss', text: "Leo Marlow. Rosa says you're looking for work. I need a Comet, cherry red, parked by the pier. Bring it to my garage. No questions." },
      { who: 'Leo', text: 'Steal a car on my first day back? You drive a hard bargain, Eddie.' },
      { who: 'Eddie Voss', text: "It's not stealing. It's... relocating. The cops might disagree. Drive fast." },
    ],
    steps: [
      { type: 'steal', place: 'pier', text: 'Steal the red Comet at the pier', radius: 110, carModel: 'Comet', carColor: '#d94f3d' },
      { type: 'deliver', place: 'garage', text: 'Deliver the Comet to Voss Auto Garage', radius: 100, needCar: true },
    ],
  },
  {
    id: 'debt-collection',
    title: 'Debt Collection',
    giver: 'Eddie Voss',
    reward: 650,
    briefing: [
      { who: 'Eddie Voss', text: 'The Mercado crew owes me. Three of them hang around the square, collecting for someone else now.' },
      { who: 'Eddie Voss', text: 'Go remind them who they work for. Fists or the pistol, your call. Bring me the cash they owe.' },
      { who: 'Leo', text: 'Three against one. Fair odds.' },
    ],
    steps: [
      { type: 'goto', place: 'market', text: 'Go to Mercado Square', radius: 110 },
      { type: 'kill', place: 'market', text: 'Deal with the Mercado crew (0/3)', radius: 260, thugs: 3, spawned: false },
      { type: 'goto', place: 'garage', text: 'Return to Voss Auto Garage', radius: 100 },
    ],
  },
  {
    id: 'the-big-score',
    title: 'The Big Score',
    giver: 'Eddie Voss',
    reward: 1500,
    briefing: [
      { who: 'Eddie Voss', text: 'One last job, Leo. A Bay Trust van runs the downtown route at dusk. Hit it, take the cash, and vanish.' },
      { who: 'Eddie Voss', text: 'The whole PD will be on you. Lose them, get to your safehouse, and we are both rich men.' },
      { who: 'Leo', text: 'Then let\'s make Palmera Bay remember my name.' },
    ],
    steps: [
      { type: 'goto', place: 'bank', text: 'Reach Bay Trust Bank downtown', radius: 110 },
      { type: 'rob', place: 'bank', text: 'Grab the cash from the van (press E)', radius: 90 },
      { type: 'escape', place: 'safehouse', text: 'Lose the cops and reach the safehouse', radius: 110 },
    ],
  },
];

export function startMission(state, index) {
  const def = MISSION_DEFS[index];
  if (!def) return;
  state.missionIndex = index;
  state.mission = {
    def,
    stepIndex: 0,
    stepState: {},
    thugsLeft: 0,
    robbed: false,
    startedAt: state.time,
  };
  state.dialog = { lines: def.briefing, index: 0, missionStart: true };
  state.banner = { text: 'NEW MISSION: ' + def.title, sub: 'From ' + def.giver + ' — reward ' + def.reward, t: 3.2, kind: 'mission' };
  playMission(state.audio);
}

export function missionObjectiveText(state) {
  if (!state.mission) return ''; // no active mission: the "Press M" hint covers it
  const step = state.mission.def.steps[state.mission.stepIndex];
  if (!step) return '';
  if (step.type === 'kill') {
    const left = state.mission.thugsLeft;
    const total = step.thugs;
    return 'Deal with the Mercado crew (' + (total - left) + '/' + total + ')';
  }
  return step.text;
}

export function missionMarker(state) {
  if (!state.mission) return null;
  const step = state.mission.def.steps[state.mission.stepIndex];
  if (!step || !step.place) return null;
  const lm = landmarkById(state.city, step.place);
  if (!lm) return null;
  return { x: lm.x, y: lm.y, name: lm.name, radius: step.radius || 100 };
}

// Advance the dialog box; returns true when the dialog just finished.
export function advanceDialog(state) {
  if (!state.dialog) return false;
  state.dialog.index += 1;
  if (state.dialog.index >= state.dialog.lines.length) {
    const wasMissionStart = state.dialog.missionStart;
    state.dialog = null;
    return wasMissionStart;
  }
  return false;
}

function stepTarget(state, step) {
  const lm = landmarkById(state.city, step.place);
  return lm ? { x: lm.x, y: lm.y } : null;
}

export function updateMission(state, dt, input) {
  if (!state.mission) return;
  const mission = state.mission;
  const step = mission.def.steps[mission.stepIndex];
  if (!step) {
    completeMission(state);
    return;
  }
  const player = state.player;

  if (step.type === 'goto' || step.type === 'deliver' || step.type === 'escape') {
    const target = stepTarget(state, step);
    if (!target) return;
    const d = dist(player.x, player.y, target.x, target.y);
    if (step.type === 'deliver' && !player.car) {
      // Lost the car: fail the delivery step back to a steal.
      state.banner = { text: 'YOU LOST THE CAR', sub: 'Find another ride and come back', t: 2.5, kind: 'fail' };
      mission.stepIndex = 0;
      mission.stepState = {};
      return;
    }
    if (step.type === 'escape' && state.wanted > 0) {
      // The escape only counts once the heat is off.
      return;
    }
    if (d < step.radius) {
      advanceStep(state);
    }
  } else if (step.type === 'talk') {
    const target = stepTarget(state, step);
    if (!target) return;
    if (dist(player.x, player.y, target.x, target.y) < step.radius && input.pressed.has('e')) {
      input.pressed.delete('e');
      state.dialog = { lines: step.lines, index: 0, missionStart: false };
      advanceStep(state);
    }
  } else if (step.type === 'steal') {
    if (!mission.stepState.car) {
      const target = stepTarget(state, step);
      const car = spawnParkedCar(state, Math.random, target.x + 40, target.y + 30, 0.4);
      car.model = step.carModel || 'Comet';
      car.color = step.carColor || '#d94f3d';
      mission.stepState.car = car;
      mission.stepState.carId = car.id;
    }
    const car = mission.stepState.car;
    if (player.car === car) {
      advanceStep(state);
    }
  } else if (step.type === 'kill') {
    if (!step.spawned) {
      step.spawned = true;
      const target = stepTarget(state, step);
      mission.thugsLeft = step.thugs;
      for (let i = 0; i < step.thugs; i++) {
        const thug = spawnThug(state, target.x + (i - 1) * 70, target.y + 60 + (i % 2) * 50, 120);
        thug.missionThug = true;
      }
      spawnHealthPickup(state, target.x - 120, target.y - 40);
    }
    const left = state.peds.filter((p) => p.missionThug && !p.dead).length;
    mission.thugsLeft = left;
    if (left === 0) advanceStep(state);
  } else if (step.type === 'rob') {
    if (!mission.stepState.van) {
      const target = stepTarget(state, step);
      const van = spawnParkedCar(state, Math.random, target.x - 60, target.y + 40, Math.PI / 2);
      van.model = 'Van';
      van.color = '#2d3436';
      mission.stepState.van = van;
      state.banner = { text: 'THE VAN IS HERE', sub: 'Get close and press E to grab the cash', t: 3.0, kind: 'info' };
    }
    const van = mission.stepState.van;
    if (!mission.robbed && dist(player.x, player.y, van.x, van.y) < 80 && input.pressed.has('e')) {
      input.pressed.delete('e');
      mission.robbed = true;
      spawnCashPickup(state, van.x, van.y, 800);
      addWanted(state, 4);
      state.banner = { text: '$800 GRABBED', sub: 'Four stars — lose the cops!', t: 3.0, kind: 'wanted' };
      playCash(state.audio);
      advanceStep(state);
    }
  }
}

function advanceStep(state) {
  const mission = state.mission;
  mission.stepIndex += 1;
  mission.stepState = {};
  if (mission.stepIndex >= mission.def.steps.length) {
    completeMission(state);
  } else {
    playMission(state.audio);
  }
}

function completeMission(state) {
  const mission = state.mission;
  const def = mission.def;
  state.money += def.reward;
  state.missionsDone += 1;
  state.stats.missionsDone = state.missionsDone;
  state.mission = null;
  state.missionIndex += 1;
  state.banner = { text: 'MISSION PASSED: ' + def.title, sub: 'Earned $' + def.reward, t: 3.5, kind: 'success' };
  playCash(state.audio);
  writeSave(state);
  if (state.missionIndex < MISSION_DEFS.length) {
    state.nextMissionHint = true;
  } else {
    state.banner = { text: 'PALMERA BAY IS YOURS', sub: 'Every job done — $' + def.reward + ' for the last one', t: 4.0, kind: 'success' };
  }
}

// Fail the current mission (player wasted or busted mid-job).
export function failMission(state, reason) {
  if (!state.mission) return;
  const def = state.mission.def;
  state.mission = null;
  state.missionIndex = Math.max(0, state.missionIndex);
  playFail(state.audio);
  state.failedMission = { def, reason };
}
