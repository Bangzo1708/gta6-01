// peds.js — the people of Palmera Bay: pedestrians strolling the sidewalks,
// fleeing gunfire, and the thugs and cops-on-foot the missions throw at you.
// Peds walk along road edges, avoid buildings, and panic when they hear shots.

import { clamp, dist, angleTo, turnToward, pickOne, randRange, chance } from './util.js';
import { collideBuildings, nearestRoadLine, pointOnRoad, randomRoadPoint, WORLD_SIZE, PITCH, ROAD_W } from './city.js';
import { spawnBlood, spawnCashPickup } from './entities.js';
import { playPunch } from './audio.js';

const PED_COLORS = ['#e74c3c', '#3498db', '#f1c40f', '#9b59b6', '#1abc9c', '#e67e22', '#ecf0f1', '#fd79a8', '#00cec9', '#6c5ce7'];
const PED_SHIRTS = ['#e74c3c', '#3498db', '#f1c40f', '#9b59b6', '#1abc9c', '#e67e22', '#fd79a8', '#00cec9', '#6c5ce7', '#2d3436', '#dfe6e9', '#ff7675'];

let nextPedId = 1;

export function makePed(x, y, opts) {
  const o = opts || {};
  return {
    id: nextPedId++,
    x, y,
    angle: randRange(Math.random, 0, Math.PI * 2),
    speed: 0,
    walkSpeed: randRange(Math.random, 42, 68),
    shirt: o.shirt || pickOne(Math.random, PED_SHIRTS),
    skin: pickOne(Math.random, ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac']),
    hair: pickOne(Math.random, ['#2d3436', '#6c5ce7', '#e17055', '#dfe6e9', '#fdcb6e']),
    dead: false,
    health: o.health || 100,
    hostile: !!o.hostile,
    thug: !!o.thug,
    panic: 0,
    targetX: x,
    targetY: y,
    retargetTimer: 0,
    attackCooldown: 0,
    r: 13,
    dropCash: o.dropCash || 0,
  };
}

// Spawn a strolling pedestrian near the player, on a sidewalk.
export function spawnPed(state, rng) {
  const p = state.player;
  const spot = randomRoadPoint(rng, p.x, p.y, 350);
  // Sidewalk: just off the road edge.
  const onV = Math.abs(spot.x - nearestRoadLine(spot.x)) < Math.abs(spot.y - nearestRoadLine(spot.y));
  const x = onV ? spot.x + (chance(rng, 0.5) ? ROAD_W / 2 + 16 : -ROAD_W / 2 - 16) : spot.x;
  const y = onV ? spot.y : spot.y + (chance(rng, 0.5) ? ROAD_W / 2 + 16 : -ROAD_W / 2 - 16);
  const ped = makePed(clamp(x, 40, WORLD_SIZE - 40), clamp(y, 40, WORLD_SIZE - 40));
  state.peds.push(ped);
  return ped;
}

// Spawn a hostile thug at a spot (mission use).
export function spawnThug(state, x, y, dropCash) {
  const ped = makePed(x, y, { hostile: true, thug: true, health: 100, shirt: '#2d3436', dropCash: dropCash || 120 });
  state.peds.push(ped);
  return ped;
}

function pickStrollTarget(ped, rng) {
  // Walk along the sidewalk: pick a point down the current road.
  const vertical = Math.abs(Math.sin(ped.angle)) > 0.7;
  const line = vertical ? nearestRoadLine(ped.x) : nearestRoadLine(ped.y);
  const along = randRange(rng, 120, WORLD_SIZE - 120);
  const side = chance(rng, 0.5) ? 1 : -1;
  if (vertical) {
    ped.targetX = line + side * (ROAD_W / 2 + 16);
    ped.targetY = along;
  } else {
    ped.targetX = along;
    ped.targetY = line + side * (ROAD_W / 2 + 16);
  }
}

export function updatePeds(state, dt) {
  const player = state.player;
  for (let i = state.peds.length - 1; i >= 0; i--) {
    const ped = state.peds[i];
    if (ped.dead) {
      ped.deadTimer = (ped.deadTimer || 0) + dt;
      if (ped.deadTimer > 20) state.peds.splice(i, 1);
      continue;
    }
    ped.attackCooldown -= dt;
    ped.panic = Math.max(0, ped.panic - dt * 0.5);

    if (ped.hostile) {
      // Thugs chase the player on foot and swing when close.
      const d = dist(ped.x, ped.y, player.x, player.y);
      if (player.onFoot && d < 420) {
        ped.targetX = player.x;
        ped.targetY = player.y;
        ped.speed = 118;
        if (d < 34 && ped.attackCooldown <= 0) {
          ped.attackCooldown = 0.9;
          player.health -= 9;
          playPunch(state.audio);
          spawnBlood(state, player.x, player.y);
        }
      } else {
        ped.speed = 60;
        ped.retargetTimer -= dt;
        if (ped.retargetTimer <= 0) {
          ped.retargetTimer = randRange(Math.random, 2, 5);
          pickStrollTarget(ped, Math.random);
        }
      }
    } else {
      // Civilians: panic and run from gunfire or a speeding car.
      const gunNear = state.lastShotAt && dist(ped.x, ped.y, state.lastShotAt.x, state.lastShotAt.y) < 320 &&
        state.time - state.lastShotAt.t < 1.2;
      if (gunNear) ped.panic = 1;
      if (ped.panic > 0) {
        const away = angleTo(player.x, player.y, ped.x, ped.y);
        ped.targetX = ped.x + Math.cos(away) * 300;
        ped.targetY = ped.y + Math.sin(away) * 300;
        ped.speed = 150;
      } else {
        ped.speed = ped.walkSpeed;
        ped.retargetTimer -= dt;
        if (ped.retargetTimer <= 0 || dist(ped.x, ped.y, ped.targetX, ped.targetY) < 24) {
          ped.retargetTimer = randRange(Math.random, 3, 7);
          pickStrollTarget(ped, Math.random);
        }
      }
    }

    // Walk toward the target.
    const want = angleTo(ped.x, ped.y, ped.targetX, ped.targetY);
    ped.angle = turnToward(ped.angle, want, 6 * dt);
    const nx = ped.x + Math.cos(ped.angle) * ped.speed * dt;
    const ny = ped.y + Math.sin(ped.angle) * ped.speed * dt;
    const probe = { x: nx, y: ny, r: ped.r };
    if (!collideBuildings(state.city, probe)) {
      ped.x = nx;
      ped.y = ny;
    } else {
      ped.retargetTimer = 0; // blocked: pick a new direction
    }
    ped.x = clamp(ped.x, 30, WORLD_SIZE - 30);
    ped.y = clamp(ped.y, 30, WORLD_SIZE - 30);

    // Run over by a car: fatal, and the driver earns a star.
    for (const car of state.cars) {
      if (car.health <= 0) continue;
      if (Math.abs(car.speed) < 60) continue;
      if (dist(car.x, car.y, ped.x, ped.y) < car.r + ped.r - 4) {
        killPed(state, ped, car === player.car);
        break;
      }
    }
  }

  // Keep the sidewalks busy near the player.
  const alive = state.peds.filter((p) => !p.dead && !p.hostile).length;
  if (alive < 12 && Math.random() < dt * 1.2) spawnPed(state, Math.random);
  // Despawn far-away civilians.
  for (let i = state.peds.length - 1; i >= 0; i--) {
    const ped = state.peds[i];
    if (!ped.hostile && !ped.dead && dist(ped.x, ped.y, player.x, player.y) > 1400) {
      state.peds.splice(i, 1);
    }
  }
}

export function killPed(state, ped, byPlayer) {
  if (ped.dead) return;
  ped.dead = true;
  ped.deadTimer = 0;
  spawnBlood(state, ped.x, ped.y);
  if (ped.dropCash > 0) spawnCashPickup(state, ped.x, ped.y, ped.dropCash);
  if (byPlayer) {
    state.stats.kills = (state.stats.kills || 0) + 1;
    if (!ped.hostile) {
      addWanted(state, 1);
      state.stats.civiliansHit = (state.stats.civiliansHit || 0) + 1;
    }
  }
}

// Raise the wanted level, capped at 5, and reset the decay clock.
export function addWanted(state, stars) {
  const before = state.wanted;
  state.wanted = clamp(state.wanted + stars, 0, 5);
  state.wantedTimer = 0;
  if (state.wanted > before) {
    state.banner = { text: 'WANTED LEVEL ' + state.wanted, sub: 'The Palmera Bay PD is on you', t: 2.2, kind: 'wanted' };
  }
}
