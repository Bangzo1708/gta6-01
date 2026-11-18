// shots.js — deterministic scene setups for the entry's screenshots.
// The game reads ?shot=<name>&seed=<n> from the URL: each shot puts Leo in a
// fixed, lively situation (same seed, same city, same layout) so the screenshots
// are real renders of the game itself, reproducible on any machine.
//   start   — the title screen
//   drive   — Leo driving downtown with traffic and a 2-star chase
//   chase   — a 4-star police chase at speed, sirens on
//   mission  — the "Hot Wheels" steal in progress at the pier
//   foot    — Leo on foot in a shootout near Mercado Square
// Shots never affect normal play: with no ?shot= the game starts at the title.

import { createState, applySave } from './game.js';
import { landmarkById } from './city.js';
import { makeCar, spawnTrafficCar, spawnParkedCar, spawnPoliceCar } from './vehicles.js';
import { spawnThug, spawnPed } from './peds.js';
import { startMission } from './missions.js';
import { mulberry32 } from './util.js';

export function readShotParams() {
  const params = new URLSearchParams(window.location.search);
  const shot = params.get('shot');
  const seed = Number(params.get('seed') || '1');
  return { shot, seed: Number.isFinite(seed) ? seed : 1 };
}

export function setupShot(state, shot, seed) {
  if (!shot) return false;
  if (shot === 'start') {
    state.mode = 'title';
    state.menuIndex = 0;
    return true;
  }

  // Every gameplay shot starts from a fresh deterministic state.
  const fresh = createState(seed);
  fresh.input = state.input;
  fresh.audio = state.audio;
  Object.keys(fresh).forEach((k) => { state[k] = fresh[k]; });
  state.mode = 'playing';
  state.shotMode = shot;
  const rng = mulberry32(seed * 7919 + 13);

  if (shot === 'drive') {
    const downtown = { x: 1000, y: 1200 };
    const car = makeCar(downtown.x, downtown.y, 0, 'Sport', { color: '#c22ba8' });
    state.cars.push(car);
    state.player.car = car;
    state.player.onFoot = false;
    state.player.x = car.x;
    state.player.y = car.y;
    state.player.angle = 0;
    state.money = 1250;
    state.wanted = 2;
    for (let i = 0; i < 3; i++) spawnTrafficCar(state, rng);
    spawnPoliceCar(state, rng);
    spawnPoliceCar(state, rng);
    state.banner = { text: 'WANTED LEVEL 2', sub: 'The Palmera Bay PD is on you', t: 30, kind: 'wanted' };
  } else if (shot === 'chase') {
    const car = makeCar(1600, 1600, 0, 'Comet', { color: '#d94f3d' });
    car.speed = 520;
    state.cars.push(car);
    state.player.car = car;
    state.player.onFoot = false;
    state.player.x = car.x;
    state.player.y = car.y;
    state.money = 2430;
    state.wanted = 4;
    for (let i = 0; i < 4; i++) spawnTrafficCar(state, rng);
    // The cruisers start right behind Leo, so the chase is in frame.
    for (let i = 0; i < 3; i++) {
      const cop = spawnPoliceCar(state, rng);
      cop.x = state.player.x - 320 - i * 130;
      cop.y = state.player.y + (i % 2 === 0 ? 46 : -46);
      cop.angle = 0;
      cop.speed = 520;
    }
    startMission(state, 3);
    state.dialog = null;
    state.mission.stepIndex = 2;
    state.mission.robbed = true;
    state.banner = { text: 'WANTED LEVEL 4', sub: 'Lose the cops — reach the safehouse', t: 30, kind: 'wanted' };
  } else if (shot === 'mission') {
    const pier = landmarkById(state.city, 'pier');
    state.player.x = pier.x - 120;
    state.player.y = pier.y - 60;
    state.player.angle = 0.4;
    state.money = 540;
    startMission(state, 1);
    state.dialog = null;
    state.mission.stepIndex = 0;
    // The red Comet waits by the pier, as the mission says.
    const car = spawnParkedCar(state, rng, pier.x + 40, pier.y + 30, 0.4);
    car.model = 'Comet';
    car.color = '#d94f3d';
    state.mission.stepState.car = car;
    for (let i = 0; i < 3; i++) spawnPed(state, rng);
    state.banner = { text: 'MISSION: HOT WHEELS', sub: 'Steal the red Comet — the cops might disagree', t: 30, kind: 'mission' };
  } else if (shot === 'foot') {
    const market = landmarkById(state.city, 'market');
    state.player.x = market.x - 90;
    state.player.y = market.y - 40;
    state.player.angle = 0.6;
    state.player.aimAngle = 0.6;
    state.money = 890;
    state.player.health = 82;
    startMission(state, 2);
    state.dialog = null;
    state.mission.stepIndex = 1;
    const step = state.mission.def.steps[1];
    step.spawned = true;
    state.mission.thugsLeft = 3;
    for (let i = 0; i < 3; i++) {
      spawnThug(state, market.x + (i - 1) * 70, market.y + 60 + (i % 2) * 50, 120);
      state.peds[state.peds.length - 1].missionThug = true;
    }
    for (let i = 0; i < 4; i++) spawnPed(state, rng);
    state.banner = { text: 'MISSION: DEBT COLLECTION', sub: 'The Mercado crew owes Eddie — deal with them', t: 30, kind: 'mission' };
  } else {
    return false;
  }

  state.camera.x = state.player.x;
  state.camera.y = state.player.y;
  return true;
}
