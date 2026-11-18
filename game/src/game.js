// game.js — the heart of Palmera Bay: the game state, the mode machine (title,
// how-to, playing, paused, wasted, busted), and the per-frame update that wires
// every system together. main.js only boots the canvas and calls tick().

import { buildCity, landmarkById, randomRoadPoint } from './city.js';
import { createPlayer, updatePlayerOnFoot, updateCombat, updateWanted, exitCar, collectPickup } from './player.js';
import { drivePlayerCar, updateCars, spawnTrafficCar, spawnParkedCar, spawnPoliceCar } from './vehicles.js';
import { updatePeds, spawnPed } from './peds.js';
import { updateBullets, updateParticles, updatePickups } from './entities.js';
import { startMission, updateMission, advanceDialog, failMission, MISSION_DEFS } from './missions.js';
import { createAudio, ensureAudio, setMuted, updateAudio, playClick, playMission } from './audio.js';
import { hasSave, readSave, writeSave, clearSave } from './save.js';
import { createCamera, updateCamera, render } from './render.js';
import { drawHUD, drawTitle, drawHowTo, drawPause, drawEndScreen } from './hud.js';
import { createInput, keyDown, keyPressed, mouseClicked, endFrame, updateMouseWorld } from './input.js';
import { mulberry32, clamp } from './util.js';

export function createState(seed) {
  const city = buildCity(seed);
  const rng = mulberry32(seed);
  const state = {
    seed,
    city,
    rng,
    mode: 'title', // title | howto | playing | paused | dead | busted
    menuIndex: 0,
    hasSave: hasSave(),
    time: 0, // wall-clock seconds since boot (drives animations)
    timePlayed: 0, // seconds of actual play
    money: 250,
    wanted: 0,
    wantedTimer: 0,
    missionIndex: 0,
    mission: null,
    missionsDone: 0,
    nextMissionHint: false,
    failedMission: null,
    dialog: null,
    banner: null,
    lastShotAt: null,
    stats: { kills: 0, carsStolen: 0, policeSpawned: 0, missionsDone: 0 },
    deaths: 0,
    cars: [],
    peds: [],
    bullets: [],
    particles: [],
    pickups: [],
    player: null,
    camera: createCamera(),
    audio: createAudio(),
    input: null,
    shotMode: null,
  };
  state.player = createPlayer(620, 700);
  state.camera.x = state.player.x;
  state.camera.y = state.player.y;

  // Seed the streets: traffic and parked cars around the spawn.
  for (let i = 0; i < 10; i++) spawnTrafficCar(state, rng);
  for (let i = 0; i < 6; i++) spawnPed(state, rng);
  spawnParkedCar(state, rng, 700, 660, 0);
  spawnParkedCar(state, rng, 420, 1060, Math.PI / 2);
  spawnParkedCar(state, rng, 1060, 420, -Math.PI / 2);
  return state;
}

export function createGame(canvas) {
  const input = createInput(canvas);
  const state = createState(20261118);
  state.input = input;
  return { state, input };
}

export function applySave(state, save) {
  state.money = save.money;
  state.player.health = save.health;
  state.missionIndex = save.missionIndex;
  state.missionsDone = save.missionsDone;
  state.timePlayed = save.timePlayed;
  state.stats.kills = save.kills;
  state.stats.carsStolen = save.carsStolen;
  state.player.x = save.playerX;
  state.player.y = save.playerY;
  state.player.angle = save.playerAngle;
  state.wanted = 0; // a fresh start is never wanted
  if (save.car) {
    const car = spawnParkedCar(state, Math.random, save.playerX + 50, save.playerY, 0);
    car.model = save.car.model;
    car.color = save.car.color;
    car.health = save.car.health;
  }
  state.camera.x = state.player.x;
  state.camera.y = state.player.y;
}

export function startNewGame(state) {
  const fresh = createState(state.seed);
  // Keep the input, audio and canvas bindings of the running state.
  fresh.input = state.input;
  fresh.audio = state.audio;
  Object.keys(fresh).forEach((k) => { state[k] = fresh[k]; });
  state.mode = 'playing';
  state.hasSave = hasSave();
  startMission(state, 0);
}

export function continueGame(state) {
  const save = readSave();
  if (!save) return;
  const fresh = createState(state.seed);
  fresh.input = state.input;
  fresh.audio = state.audio;
  Object.keys(fresh).forEach((k) => { state[k] = fresh[k]; });
  applySave(state, save);
  state.mode = 'playing';
  state.banner = { text: 'WELCOME BACK, LEO', sub: 'Job ' + (state.missionIndex + 1) + ' of ' + MISSION_DEFS.length + ' — press M when ready', t: 3.0, kind: 'info' };
}

function respawn(state) {
  const hospital = landmarkById(state.city, 'hospital');
  state.player.health = state.player.maxHealth;
  state.player.x = hospital.x + 60;
  state.player.y = hospital.y + 40;
  state.player.car = null;
  state.player.onFoot = true;
  state.money = Math.floor(state.money * 0.8);
  state.wanted = 0;
  // Clear the police that killed him.
  state.cars = state.cars.filter((c) => !c.police);
  state.bullets = [];
  state.camera.x = state.player.x;
  state.camera.y = state.player.y;
  if (state.mission) {
    failMission(state, state.mode);
  }
  state.mode = 'playing';
  state.banner = { text: 'PATCHED UP AT ST. MARINA', sub: 'The hospital bill cost you 20% of your cash', t: 3.0, kind: 'info' };
}

// --- Per-frame update --------------------------------------------------------
export function tick(game, canvas, ctx, dt) {
  const { state, input } = game;
  dt = Math.min(dt, 0.05);
  state.time += dt;
  state.viewW = canvas.width;
  state.viewH = canvas.height;
  updateMouseWorld(input, state.camera, canvas);

  if (state.mode === 'title') {
    updateTitle(state, input);
  } else if (state.mode === 'howto') {
    if (keyPressed(input, 'escape') || keyPressed(input, 'enter') || mouseClicked(input)) {
      state.mode = 'title';
      playClick(state.audio);
    }
  } else if (state.mode === 'playing') {
    updatePlaying(state, input, dt);
  } else if (state.mode === 'paused') {
    updatePaused(state, input);
  } else if (state.mode === 'dead' || state.mode === 'busted') {
    if (keyPressed(input, 'enter')) {
      respawn(state);
      playClick(state.audio);
    } else if (keyPressed(input, 'q')) {
      state.mode = 'title';
      state.menuIndex = 0;
      state.hasSave = hasSave();
    }
  }

  // --- Draw ------------------------------------------------------------------
  if (state.mode === 'title') {
    drawTitle(ctx, state, canvas);
  } else if (state.mode === 'howto') {
    drawHowTo(ctx, canvas);
  } else {
    render(ctx, state, canvas);
    drawHUD(ctx, state, canvas);
    if (state.mode === 'paused') drawPause(ctx, canvas);
    if (state.mode === 'dead') drawEndScreen(ctx, state, canvas, 'dead');
    if (state.mode === 'busted') drawEndScreen(ctx, state, canvas, 'busted');
  }

  endFrame(input);
}

function updateTitle(state, input) {
  const items = state.hasSave ? ['CONTINUE', 'NEW GAME', 'HOW TO PLAY'] : ['NEW GAME', 'HOW TO PLAY'];
  if (keyPressed(input, 'w') || keyPressed(input, 'up')) {
    state.menuIndex = (state.menuIndex + items.length - 1) % items.length;
    playClick(state.audio);
  }
  if (keyPressed(input, 's') || keyPressed(input, 'down')) {
    state.menuIndex = (state.menuIndex + 1) % items.length;
    playClick(state.audio);
  }
  if (keyPressed(input, 'enter') || keyPressed(input, 'space')) {
    ensureAudio(state.audio);
    playClick(state.audio);
    const choice = items[state.menuIndex];
    if (choice === 'CONTINUE') continueGame(state);
    else if (choice === 'NEW GAME') startNewGame(state);
    else if (choice === 'HOW TO PLAY') state.mode = 'howto';
  }
  if (mouseClicked(input)) {
    // Clicking anywhere on the title starts a new game (mouse users welcome).
    ensureAudio(state.audio);
    if (state.hasSave) continueGame(state);
    else startNewGame(state);
  }
}

function updatePaused(state, input) {
  if (keyPressed(input, 'p') || keyPressed(input, 'escape')) {
    state.mode = 'playing';
    playClick(state.audio);
  } else if (keyPressed(input, 's')) {
    writeSave(state);
    state.banner = { text: 'GAME SAVED', sub: '', t: 1.5, kind: 'success' };
    state.mode = 'playing';
  } else if (keyPressed(input, 'h')) {
    setMuted(state.audio, !state.audio.muted);
  } else if (keyPressed(input, 'q')) {
    state.mode = 'title';
    state.menuIndex = 0;
    state.hasSave = hasSave();
  }
}

function updatePlaying(state, input, dt) {
  state.timePlayed += dt;
  const player = state.player;

  // Pause.
  if (keyPressed(input, 'p') || keyPressed(input, 'escape')) {
    state.mode = 'paused';
    playClick(state.audio);
    return;
  }
  // Mute.
  if (keyPressed(input, 'h')) setMuted(state.audio, !state.audio.muted);

  // Dialog takes over the frame: E or click advances it.
  if (state.dialog) {
    if (keyPressed(input, 'e') || mouseClicked(input) || keyPressed(input, 'enter')) {
      advanceDialog(state);
      playClick(state.audio);
    }
    updateCamera(state, dt);
    return;
  }

  // Start the next mission.
  if (keyPressed(input, 'm') && !state.mission && state.missionIndex < MISSION_DEFS.length) {
    startMission(state, state.missionIndex);
  }
  // Retry a failed mission.
  if (keyPressed(input, 'm') && state.failedMission) {
    state.failedMission = null;
    startMission(state, state.missionIndex);
  }

  // Missions first, so an E press at a mission spot talks instead of entering a car.
  updateMission(state, dt, input);

  if (player.onFoot) {
    updatePlayerOnFoot(state, dt, input);
  } else {
    drivePlayerCar(state, dt, input);
    if (keyPressed(input, 'e')) exitCar(state);
  }

  updateCars(state, dt);
  updatePeds(state, dt);
  updateBullets(state, dt);
  updateParticles(state, dt);
  updatePickups(state, dt, (pickup) => collectPickup(state, pickup));
  updateCombat(state, dt);
  updateWanted(state, dt);
  updateCamera(state, dt);

  // Banner countdown.
  if (state.banner) {
    state.banner.t -= dt;
    if (state.banner.t <= 0) state.banner = null;
  }
  // Hurt flash decay.
  if (player.health < 30) player.hurtTimer = 0.35;

  // Audio follows the action.
  const speed = player.car ? Math.abs(player.car.speed) : Math.abs(player.speed || 0);
  updateAudio(state.audio, dt, speed, state.wanted);
}
