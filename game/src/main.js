// Palmera Bay — entry point and game loop.
// Builds the world, runs the state machine (title / playing / paused / busted / wasted /
// story-complete), updates bullets and gang shooters, drives the day/night clock and the
// camera, and stages scripted demo scenes (?shot=...) so screenshots show real gameplay.
import { mulberry32, clamp, dist, angleTo, TAU, fmtMoney } from './util.js';
import { generateCity, CITY_SIZE, ROAD_X, ROAD_Y, pointInBuilding, randomRoadPoint } from './city.js';
import { Input } from './input.js';
import { SoundBank } from './audio.js';
import { spawnTraffic, spawnPeds, spawnPickup, updateTrafficCar, updatePed, updateParticles, makeCar, makePoliceCar, burst, CAR_MODELS } from './entities.js';
import { createPlayer, updatePlayer, damagePlayer, damagePed, fireBullet, enterCar } from './player.js';
import { MissionEngine, MISSIONS, missionStartPoint } from './missions.js';
import { renderWorld } from './render.js';
import { drawHUD, drawTitle, drawOverlay, drawPause, drawHelp, drawMissionList } from './hud.js';
import { loadSave, writeSave, clearSave } from './save.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');
const params = new URLSearchParams(location.search);
const SHOT = params.get('shot') || '';

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

function buildWorld(save) {
  const rng = mulberry32(20261117);
  const city = generateCity(20261117);
  const world = {
    rng, city,
    cars: [], peds: [], particles: [], pickups: [], bullets: [],
    player: null,
    money: save ? save.money : 250,
    wanted: 0, wantedHeat: 0, wantedTimer: 0, policeSpawnT: 0,
    time: 0, clock: save ? save.clock : 9 * 3600, dayTime: 0.25,
    mode: 'title', menuSel: 0,
    cam: { x: CITY_SIZE / 2, y: CITY_SIZE / 2 },
    view: { cw: canvas.width, ch: canvas.height, cam: null },
    shake: 0, hint: '', hintT: 0,
    missionsDone: save ? save.missionsDone : 0,
    storyComplete: false,
    saveSlot: save,
    input: new Input(canvas),
    sounds: new SoundBank(),
    freeRoam: false,
  };
  world.view.cam = world.cam;
  world.player = createPlayer(save ? save.x : 1400, save ? save.y : 600);
  if (save) {
    world.player.health = save.health;
    world.player.ammo = save.ammo;
  }
  world.missions = new MissionEngine(world);
  world.missions.index = save ? save.missionIndex : 0;
  world.missionsDone = save ? save.missionsDone : 0;
  // World methods the other modules call.
  world.setWanted = (n) => {
    world.wanted = clamp(n, 0, 5);
    world.wantedHeat = world.wanted > 0 ? 100 : 0;
    world.wantedTimer = 0;
  };
  world.addWanted = (n) => {
    if (world.wanted >= 5) return;
    world.setWanted(world.wanted + n);
    if (world.sounds) world.sounds.blip(980, 0.15, 'square', 0.12);
  };
  world.saveGame = () => {
    const s = writeSave(world);
    if (s) world.saveSlot = s;
    return s;
  };
  world.bustPlayer = () => {
    if (world.mode !== 'playing') return;
    const fine = Math.min(world.money, 500);
    world.money -= fine;
    world.mode = 'busted';
    world.bustedFine = fine;
    world.setWanted(0);
    if (world.sounds) world.sounds.busted();
  };
  world.wastePlayer = () => {
    if (world.mode !== 'playing') return;
    const lost = Math.floor(world.money * 0.1);
    world.money -= lost;
    world.mode = 'wasted';
    world.wastedLost = lost;
    world.setWanted(0);
    burst(world, world.player.x, world.player.y, '#c0392b', 24, 200);
    if (world.sounds) world.sounds.busted();
  };
  world.respawn = () => {
    const h = world.city.landmarks.hospital;
    world.player.health = 100;
    world.player.armour = 0;
    if (world.player.car) { world.player.car.driver = 'ai'; world.player.car = null; }
    world.player.x = h.x + 40; world.player.y = h.y + 40;
    world.player.invuln = 3;
    world.cam.x = world.player.x; world.cam.y = world.player.y;
    world.bullets = [];
    world.mode = 'playing';
  };
  // Populate the city.
  spawnTraffic(world, 46);
  spawnPeds(world, 70);
  // A starter car near the spawn, plus scattered pickups.
  const starter = makeCar(1460, 620, Math.PI / 2, { color: '#0e8a7d', model: CAR_MODELS[7], parked: true, driver: 'none' });
  world.cars.push(starter);
  for (let i = 0; i < 8; i++) {
    const p = randomRoadPoint(rng);
    spawnPickup(world, p.x, p.y, i % 3 === 0 ? 'health' : i % 3 === 1 ? 'ammo' : 'cashbag');
  }
  return world;
}

const world = buildWorld(loadSave());
window.__palmera = world; // test hook for play-testing

function startGame(freeRoam) {
  world.freeRoam = !!freeRoam;
  world.mode = 'playing';
  world.sounds.ensure();
  if (!freeRoam && world.missions.index < MISSIONS.length && !world.missions.active) {
    world.hint = 'Follow the yellow M — press E at the marker to start: ' + MISSIONS[world.missions.index].title;
    world.hintT = 5;
  }
  statusEl.textContent = 'Playing Palmera Bay.';
}

function updatePlaying(dt) {
  const w = world;
  w.time += dt;
  w.clock = (w.clock + dt * 60) % 86400;
  w.dayTime = w.clock / 86400;
  if (w.hintT > 0) { w.hintT -= dt; if (w.hintT <= 0) w.hint = ''; }
  // Dialogue pauses the action but not the clock.
  if (w.missions.dialogue) {
    if (w.input.justPressed('KeyE') || w.input.mouseClicked) w.missions.advanceDialogue();
    if (w.input.justPressed('Enter')) w.missions.advanceDialogue();
  } else {
    updatePlayer(w, dt);
  }
  // Traffic + pedestrians.
  for (const car of w.cars) updateTrafficCar(w, car, dt);
  for (const ped of w.peds) updatePed(w, ped, dt);
  updateParticles(w, dt);
  updateBullets(w, dt);
  updateGang(w, dt);
  w.missions.update(dt);
  // Respawn street pickups over time so the city keeps paying.
  w.pickupT = (w.pickupT || 0) + dt;
  if (w.pickupT > 40) {
    w.pickupT = 0;
    const p = randomRoadPoint(w.rng);
    spawnPickup(w, p.x, p.y, ['cashbag', 'health', 'ammo', 'armour'][Math.floor(Math.random() * 4)]);
  }
  // Camera follows the player (or the car) with a little shake.
  const p = w.player;
  const tx = p.car ? p.car.x : p.x;
  const ty = p.car ? p.car.y : p.y;
  w.cam.x += (tx - w.cam.x) * Math.min(1, dt * 5);
  w.cam.y += (ty - w.cam.y) * Math.min(1, dt * 5);
  w.shake = Math.max(0, w.shake - dt * 22);
  // Sounds follow the action.
  if (w.sounds.ctx) {
    w.sounds.musicTick(w.time, w.wanted);
    w.sounds.setSiren(w.wanted, w.time);
    if (!p.car) w.sounds.setEngine(0, false);
  }
  // Pause / help / mission list.
  if (w.input.justPressed('KeyP') || w.input.justPressed('Escape')) w.mode = 'paused';
  if (w.input.justPressed('KeyH')) { w._returnMode = 'playing'; w.mode = 'help'; }
  if (w.input.justPressed('KeyM')) w.mode = 'missionlist';
  if (w.input.justPressed('KeyS')) { w.saveGame(); w.hint = 'Game saved.'; w.hintT = 2; }
  if (w.input.justPressed('KeyR') && w.missions.active) {
    // Restart the current mission step from its marker (a mercy rule).
    w.player.health = 100;
    const mm = w.missions.missionMarker();
    if (mm) { w.player.x = mm.x; w.player.y = mm.y; }
  }
}

function updateBullets(w, dt) {
  for (const b of w.bullets) {
    b.life -= dt;
    b.x += Math.cos(b.angle) * b.speed * dt;
    b.y += Math.sin(b.angle) * b.speed * dt;
    if (b.life <= 0) continue;
    if (pointInBuilding(w.city, b.x, b.y)) { b.life = 0; burst(w, b.x, b.y, '#aaa', 3, 60); continue; }
    if (b.from === 'player') {
      for (const ped of w.peds) {
        if (!ped.dead && dist(b.x, b.y, ped.x, ped.y) < 15) {
          damagePed(w, ped, 34, 'player');
          b.life = 0;
          break;
        }
      }
      if (b.life > 0) {
        for (const car of w.cars) {
          if (car.dead || car === w.player.car) continue;
          if (dist(b.x, b.y, car.x, car.y) < 24) {
            car.health -= 12;
            burst(w, b.x, b.y, '#f1c40f', 4, 80);
            b.life = 0;
            if (car.health <= 0 && !car.dead) {
              car.dead = true;
              burst(w, car.x, car.y, '#e67e22', 20, 200);
            }
            break;
          }
        }
      }
    } else if (b.from === 'gang' || b.from === 'police') {
      const p = w.player;
      const px = p.car ? p.car.x : p.x, py = p.car ? p.car.y : p.y;
      if (dist(b.x, b.y, px, py) < (p.car ? 26 : 15)) {
        if (p.car) { p.car.health -= 6; if (p.car.health <= 0) p.car.health = 1; }
        else damagePlayer(w, 8);
        b.life = 0;
      }
    }
  }
  w.bullets = w.bullets.filter((b) => b.life > 0);
}

function updateGang(w, dt) {
  const p = w.player;
  const px = p.car ? p.car.x : p.x, py = p.car ? p.car.y : p.y;
  for (const ped of w.peds) {
    if (!ped.gang || ped.dead) continue;
    const d = dist(ped.x, ped.y, px, py);
    if (d < 520) {
      ped._shootT = (ped._shootT || 0) - dt;
      ped.angle = angleTo(ped.x, ped.y, px, py);
      if (d > 130) {
        ped.x += Math.cos(ped.angle) * 95 * dt;
        ped.y += Math.sin(ped.angle) * 95 * dt;
      }
      if (ped._shootT <= 0 && d < 460) {
        ped._shootT = 1.1 + Math.random() * 0.9;
        const a = ped.angle + (Math.random() - 0.5) * 0.16;
        fireBullet(w, ped.x + Math.cos(a) * 18, ped.y + Math.sin(a) * 18, a, 720, 'gang');
        if (w.sounds) w.sounds.shoot();
      }
    }
  }
}

// --- demo staging for screenshots: real game state, driven by ?shot= ---
function stageShot(kind) {
  const w = world;
  w.sounds.ensure();
  if (kind === 'title') { w.mode = 'title'; return; }
  w.mode = 'playing';
  const p = w.player;
  if (kind === 'foot') {
    // On foot by Club Eclipse, the first mission marker — pedestrians and traffic in frame.
    p.x = 1560; p.y = 2300; p.car = null;
    p.health = 100;
    w.cam.x = p.x; w.cam.y = p.y;
    w.missions.index = 0;
    w.money = 1250;
  } else if (kind === 'drive') {
    const car = makeCar(1400, 600, 0, { color: '#c0392b', model: CAR_MODELS[5] });
    car.speed = 420;
    w.cars.push(car);
    enterCar(w, car);
    w.cam.x = car.x; w.cam.y = car.y;
    w.money = 3250;
    w.missions.index = 1;
  } else if (kind === 'chase') {
    // On the road heading south down x=1800, police in pursuit right behind.
    const car = makeCar(1800, 1000, Math.PI / 2, { color: '#f39c12', model: CAR_MODELS[0] });
    car.speed = 480;
    w.cars.push(car);
    enterCar(w, car);
    w.setWanted(3);
    for (let i = 0; i < 3; i++) {
      const pc = makePoliceCar(1800 + (i - 1) * 36, 1000 - 190 - i * 120, Math.PI / 2);
      pc.speed = 500;
      w.cars.push(pc);
    }
    w.cam.x = car.x; w.cam.y = car.y;
    w.money = 5400;
    w.missions.index = 3;
    w.missions.active = true;
    w.missions.step = 0;
    w.missions.setupStep();
  } else if (kind === 'mission') {
    p.x = 2560; p.y = 1120; p.car = null;
    p.health = 100;
    p.invuln = 60; // staged scene: the gang cannot chew the player up before the shot
    w.cam.x = p.x; w.cam.y = p.y;
    w.money = 4100;
    w.missions.startMission(2);
    // Jump straight to the kill step so the gang is visible.
    w.missions.dialogue = null;
    w.missions.step = 1;
    w.missions.setupStep();
    w.setWanted(1);
  }
  if (kind === 'drive' || kind === 'chase') {
    // Let the car roll a moment before the screenshot lands.
    w._shotWarmup = 1.2;
  }
}

if (SHOT) stageShot(SHOT);

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const w = world;
  w.view.cw = canvas.width; w.view.ch = canvas.height;
  const input = w.input;

  // --- state machine input ---
  if (w.mode === 'title') {
    if (input.justPressed('ArrowUp') || input.justPressed('KeyW')) w.menuSel = (w.menuSel + 2) % 3;
    if (input.justPressed('ArrowDown') || input.justPressed('KeyS')) w.menuSel = (w.menuSel + 1) % 3;
    if (input.justPressed('Enter')) {
      if (w.menuSel === 0) startGame(false);
      else if (w.menuSel === 1) { w._returnMode = 'title'; w.mode = 'help'; }
      else startGame(true);
    }
    if (input.mouseClicked) {
      const y = input.mouseY;
      const base = canvas.height * 0.50;
      if (Math.abs(y - base) < 24) startGame(false);
      else if (Math.abs(y - (base + 48)) < 24) { w._returnMode = 'title'; w.mode = 'help'; }
      else if (Math.abs(y - (base + 96)) < 24) startGame(true);
    }
  } else if (w.mode === 'paused') {
    if (input.justPressed('KeyP') || input.justPressed('Escape') || input.justPressed('Enter')) w.mode = 'playing';
    if (input.justPressed('KeyH')) { w._returnMode = 'paused'; w.mode = 'help'; }
    if (input.justPressed('KeyS')) { w.saveGame(); w.hint = 'Game saved.'; w.hintT = 2; }
  } else if (w.mode === 'help') {
    if (input.justPressed('KeyH') || input.justPressed('Escape') || input.justPressed('Enter')) w.mode = w._returnMode || 'playing';
  } else if (w.mode === 'missionlist') {
    if (input.justPressed('KeyM') || input.justPressed('Escape')) w.mode = 'playing';
  } else if (w.mode === 'busted' || w.mode === 'wasted') {
    if (input.justPressed('Enter')) w.respawn();
  } else if (w.mode === 'complete') {
    if (input.justPressed('Enter')) { w.mode = 'playing'; w.freeRoam = true; }
  } else if (w.mode === 'playing') {
    if (w._shotWarmup) {
      // In screenshot mode, drive forward hands-free for a beat so the scene is alive.
      w._shotWarmup -= dt;
      w.input.keys['KeyW'] = true;
      if (w._shotWarmup <= 0) { w._shotWarmup = 0; w.input.keys['KeyW'] = false; }
    }
    updatePlaying(dt);
  }

  // --- render ---
  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (w.mode === 'title') {
    drawTitle(ctx, w, w.view);
  } else {
    const shx = (Math.random() - 0.5) * w.shake;
    const shy = (Math.random() - 0.5) * w.shake;
    ctx.translate(-w.cam.x + canvas.width / 2 + shx, -w.cam.y + canvas.height / 2 + shy);
    renderWorld(ctx, w, w.view);
    ctx.restore();
    ctx.save();
    drawHUD(ctx, w, w.view);
    if (w.mode === 'paused') drawPause(ctx, w, w.view);
    else if (w.mode === 'help') drawHelp(ctx, w, w.view);
    else if (w.mode === 'missionlist') drawMissionList(ctx, w, w.view);
    else if (w.mode === 'busted') drawOverlay(ctx, w, w.view, 'BUSTED!', [
      'Bay PD impounded your ride and fined you ' + fmtMoney(w.bustedFine || 0) + '.',
      'You wake up at Palmera General. The Crew still wants its money.',
    ], '#7ee7ff');
    else if (w.mode === 'wasted') drawOverlay(ctx, w, w.view, 'WASTED', [
      'The Bay chewed you up. You lost ' + fmtMoney(w.wastedLost || 0) + ' in the chaos.',
      'Palmera General patched you up. Get back out there, Rico.',
    ], '#ff6b6b');
    else if (w.mode === 'complete') drawOverlay(ctx, w, w.view, 'KING OF THE BAY', [
      'All six missions complete. The Marlin Crew is paid. The city is yours.',
      'Free roam continues — keep driving, keep earning.',
    ], '#ffd76e');
  }
  ctx.restore();
  input.endFrame();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
