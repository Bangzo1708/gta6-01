// player.js — Leo Marlow on foot and behind the wheel: walking, aiming with the
// mouse, shooting and punching, stealing cars, and the wanted clock that cools
// down when Leo keeps his nose clean.

import { clamp, dist, angleTo, angleDiff } from './util.js';
import { collideBuildings, clampToWorld } from './city.js';
import { spawnBullet, spawnBlood, spawnSparks } from './entities.js';
import { nearestStealableCar, explodeCar } from './vehicles.js';
import { addWanted, killPed, makePed } from './peds.js';
import { playShoot, playPunch, playPickup, playCash, playFail } from './audio.js';
import { keyPressed, mouseClicked } from './input.js';

export function createPlayer(x, y) {
  return {
    x, y,
    angle: -Math.PI / 2,
    aimAngle: -Math.PI / 2,
    speed: 0,
    onFoot: true,
    car: null,
    health: 100,
    maxHealth: 100,
    walkSpeed: 235,
    runSpeed: 330,
    weapon: 'pistol',
    ammo: Infinity,
    shootCooldown: 0,
    punchCooldown: 0,
    hurtTimer: 0,
    bustedTimer: 0,
    r: 14,
  };
}

export function updatePlayerOnFoot(state, dt, input) {
  const player = state.player;
  const up = input.keys.has('w') || input.keys.has('up');
  const down = input.keys.has('s') || input.keys.has('down');
  const left = input.keys.has('a') || input.keys.has('left');
  const right = input.keys.has('d') || input.keys.has('right');
  const sprint = input.keys.has('shift');

  let mx = 0;
  let my = 0;
  if (up) my -= 1;
  if (down) my += 1;
  if (left) mx -= 1;
  if (right) mx += 1;
  const len = Math.hypot(mx, my);
  if (len > 0) {
    mx /= len;
    my /= len;
  }
  const speed = sprint ? player.runSpeed : player.walkSpeed;
  const nx = player.x + mx * speed * dt;
  const ny = player.y + my * speed * dt;
  const probe = { x: nx, y: ny, r: player.r };
  if (!collideBuildings(state.city, probe)) {
    player.x = nx;
    player.y = ny;
  } else {
    // Slide along walls: try each axis alone.
    const probeX = { x: nx, y: player.y, r: player.r };
    const probeY = { x: player.x, y: ny, r: player.r };
    if (!collideBuildings(state.city, probeX)) player.x = nx;
    if (!collideBuildings(state.city, probeY)) player.y = ny;
  }
  clampToWorld(player, 24);

  // Face the mouse.
  player.aimAngle = angleTo(player.x, player.y, input.mouseWorldX, input.mouseWorldY);
  player.angle = player.aimAngle;
  player.speed = len * speed;

  // Shooting: left mouse, aimed at the cursor.
  player.shootCooldown -= dt;
  player.punchCooldown -= dt;
  if (input.mouseDown && player.shootCooldown <= 0) {
    player.shootCooldown = 0.24;
    const gx = player.x + Math.cos(player.aimAngle) * 20;
    const gy = player.y + Math.sin(player.aimAngle) * 20;
    const spread = (Math.random() - 0.5) * 0.08;
    spawnBullet(state, gx, gy, player.aimAngle + spread, true, 34);
    state.lastShotAt = { x: player.x, y: player.y, t: state.time };
    playShoot(state.audio);
    // A witness raises the heat: shooting in public is a crime.
    if (state.wanted < 2 && Math.random() < 0.4) addWanted(state, 1);
  }

  // Punch: F key, for when the fight is close.
  if (keyPressed(input, 'f') && player.punchCooldown <= 0) {
    player.punchCooldown = 0.45;
    playPunch(state.audio);
    const reach = 34;
    const px = player.x + Math.cos(player.aimAngle) * reach;
    const py = player.y + Math.sin(player.aimAngle) * reach;
    for (const ped of state.peds) {
      if (ped.dead) continue;
      if (dist(px, py, ped.x, ped.y) < 26) {
        ped.health -= 34;
        spawnBlood(state, ped.x, ped.y);
        if (ped.health <= 0) killPed(state, ped, true);
        else ped.panic = 1;
        break;
      }
    }
    // Punching a car door dents it (and annoys the driver).
    for (const car of state.cars) {
      if (car.health <= 0) continue;
      if (dist(px, py, car.x, car.y) < car.r + 8) {
        car.health -= 4;
        spawnSparks(state, px, py, 4);
        if (car.health <= 0) explodeCar(state, car);
        break;
      }
    }
  }

  // Enter / steal a car: E key near a car.
  if (keyPressed(input, 'e')) {
    const car = nearestStealableCar(state, 64);
    if (car) enterCar(state, car);
  }

  // Busted: a police cruiser sitting on Leo while he is on foot.
  let copNear = false;
  for (const car of state.cars) {
    if (car.police && car.health > 0 && dist(car.x, car.y, player.x, player.y) < 46) {
      copNear = true;
      break;
    }
  }
  if (copNear && state.wanted > 0) {
    player.bustedTimer += dt;
    if (player.bustedTimer > 1.6) {
      state.mode = 'busted';
      playFail(state.audio);
    }
  } else {
    player.bustedTimer = Math.max(0, player.bustedTimer - dt * 2);
  }
}

export function enterCar(state, car) {
  const player = state.player;
  // Yank the driver out if the car has one.
  if (car.driver) {
    car.driver = false;
    const driver = makePed(car.x + 30, car.y + 30, {});
    driver.panic = 1;
    state.peds.push(driver);
  }
  // Taking a car that is not yours is grand theft auto, parked or not — and
  // the cops hear about it. Your own car (marked when you first take it) is
  // free to re-enter.
  if (!car.playerOwned) {
    car.playerOwned = true;
    addWanted(state, 1);
    state.stats.carsStolen = (state.stats.carsStolen || 0) + 1;
    state.banner = { text: 'CAR STOLEN', sub: car.model + ' — the owner is calling the cops', t: 2.0, kind: 'info' };
  }
  car.traffic = false;
  car.parked = false;
  car.police = false;
  player.car = car;
  player.onFoot = false;
  player.x = car.x;
  player.y = car.y;
  player.angle = car.angle;
  playPickup(state.audio);
}

// The police factory is injected by game.js (vehicles.js owns spawning).
import { spawnPoliceCar } from './vehicles.js';

export function exitCar(state) {
  const player = state.player;
  const car = player.car;
  if (!car) return;
  player.car = null;
  player.onFoot = true;
  // Step out to the left of the car.
  const side = car.angle - Math.PI / 2;
  player.x = car.x + Math.cos(side) * (car.w / 2 + 20);
  player.y = car.y + Math.sin(side) * (car.w / 2 + 20);
  player.angle = car.angle;
  car.speed = 0;
  car.parked = true;
}

export function updateCombat(state, dt) {
  // Player bullets vs peds and cars.
  for (let i = state.bullets.length - 1; i >= 0; i--) {
    const b = state.bullets[i];
    if (!b.fromPlayer) continue;
    let hit = false;
    for (const ped of state.peds) {
      if (ped.dead) continue;
      if (dist(b.x, b.y, ped.x, ped.y) < ped.r + 4) {
        ped.health -= b.damage;
        spawnBlood(state, ped.x, ped.y);
        if (ped.health <= 0) killPed(state, ped, true);
        else ped.panic = 1;
        hit = true;
        break;
      }
    }
    if (!hit) {
      for (const car of state.cars) {
        if (car.health <= 0) continue;
        if (dist(b.x, b.y, car.x, car.y) < car.r) {
          car.health -= b.damage * 0.6;
          spawnSparks(state, b.x, b.y, 5);
          if (car.police && state.wanted < 5) addWanted(state, 1);
          if (car.health <= 0) explodeCar(state, car);
          hit = true;
          break;
        }
      }
    }
    if (hit) state.bullets.splice(i, 1);
  }

  // Hostile thugs' fists are handled in peds.js; the player's health regen is
  // slow, so fights have consequences. No regen at zero health: dead is dead.
  const player = state.player;
  if (player.health > 0 && player.health < player.maxHealth && state.wanted === 0) {
    player.health = Math.min(player.maxHealth, player.health + 1.5 * dt);
  }
  player.hurtTimer = Math.max(0, player.hurtTimer - dt);

  if (player.health <= 0 && state.mode === 'playing') {
    state.mode = 'dead';
    state.deaths = (state.deaths || 0) + 1;
  }
}

// The wanted clock: no new crimes for a while and the heat cools off.
export function updateWanted(state, dt) {
  if (state.wanted <= 0) return;
  state.wantedTimer += dt;
  const coolTime = 18 + state.wanted * 6;
  if (state.wantedTimer > coolTime) {
    state.wanted -= 1;
    state.wantedTimer = 0;
    if (state.wanted === 0) {
      state.banner = { text: 'HEAT IS OFF', sub: 'The cops lost your trail', t: 2.0, kind: 'info' };
    }
  }
  // Police presence matches the wanted level.
  const wantCops = Math.min(4, state.wanted);
  const cops = state.cars.filter((c) => c.police && c.health > 0).length;
  if (cops < wantCops && Math.random() < dt * 0.7) {
    spawnPoliceCar(state, Math.random);
  }
}

// Pickups: cash adds money, health kits heal.
export function collectPickup(state, pickup) {
  if (pickup.kind === 'cash') {
    state.money += pickup.amount;
    playCash(state.audio);
  } else if (pickup.kind === 'health') {
    state.player.health = Math.min(state.player.maxHealth, state.player.health + pickup.amount);
    playPickup(state.audio);
  }
}
