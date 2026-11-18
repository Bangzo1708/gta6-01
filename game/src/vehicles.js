// vehicles.js — cars of Palmera Bay: the player's ride, traffic that follows the
// road grid, and police cruisers that chase the wanted. Car physics are simple
// arcade: speed along the heading, steering that bites harder at low speed,
// collisions as circles against buildings and other cars.

import { clamp, lerp, angleDiff, turnToward, angleTo, dist, pickOne, randRange, chance } from './util.js';
import { collideBuildings, nearestRoadLine, nearestRoadPoint, pointOnRoad, randomRoadPoint, WORLD_SIZE, PITCH, ROAD_W } from './city.js';
import { spawnSmoke, spawnExplosion, spawnSparks } from './entities.js';
import { playCrash, playExplosion, playHorn } from './audio.js';

export const CAR_MODELS = [
  { name: 'Comet', w: 46, h: 22, topSpeed: 560, accel: 420, color: '#d94f3d' },
  { name: 'Sedan', w: 48, h: 22, topSpeed: 480, accel: 340, color: '#3d6ed9' },
  { name: 'Taxi', w: 48, h: 22, topSpeed: 500, accel: 360, color: '#f2c200' },
  { name: 'Pickup', w: 52, h: 24, topSpeed: 460, accel: 320, color: '#5a8a4a' },
  { name: 'Van', w: 56, h: 26, topSpeed: 420, accel: 280, color: '#e8e8e8' },
  { name: 'Sport', w: 46, h: 21, topSpeed: 640, accel: 520, color: '#c22ba8' },
  { name: 'Cruiser', w: 50, h: 23, topSpeed: 600, accel: 480, color: '#1c2733' },
];

const TRAFFIC_COLORS = ['#d94f3d', '#3d6ed9', '#f2c200', '#5a8a4a', '#e8e8e8', '#c22ba8', '#e07b39', '#7a5fd0', '#2ba88a', '#b8b8b8'];

let nextCarId = 1;

export function makeCar(x, y, angle, modelName, opts) {
  const model = CAR_MODELS.find((m) => m.name === modelName) || CAR_MODELS[1];
  const o = opts || {};
  return {
    id: nextCarId++,
    x, y, angle,
    speed: 0,
    model: model.name,
    w: model.w,
    h: model.h,
    topSpeed: model.topSpeed,
    accel: model.accel,
    color: o.color || model.color,
    traffic: !!o.traffic,
    police: !!o.police,
    parked: !!o.parked,
    driver: o.driver !== undefined ? o.driver : true,
    health: 100,
    r: Math.max(model.w, model.h) * 0.52,
    // traffic AI
    cruiseSpeed: o.cruiseSpeed || randRange(Math.random, 120, 190),
    turnAt: null,
    stuckTimer: 0,
    honkTimer: 0,
    smokeTimer: 0,
    // police AI
    ramCooldown: 0,
    despawnTimer: 0,
  };
}

// Spawn a traffic car on a road near the player.
export function spawnTrafficCar(state, rng) {
  const p = state.player;
  const spot = randomRoadPoint(rng, p.x, p.y, 500);
  const road = nearestRoadPoint(spot.x, spot.y);
  const vertical = road.vertical;
  const angle = vertical ? (chance(rng, 0.5) ? Math.PI / 2 : -Math.PI / 2)
    : (chance(rng, 0.5) ? 0 : Math.PI);
  // Right-hand traffic: offset to the right of the direction of travel.
  const off = ROAD_W / 4;
  const x = vertical ? road.x + (angle === Math.PI / 2 ? -off : off) : spot.x;
  const y = vertical ? spot.y : road.y + (angle === 0 ? off : -off);
  const model = pickOne(rng, ['Comet', 'Sedan', 'Sedan', 'Taxi', 'Pickup', 'Van', 'Sport']);
  const car = makeCar(x, y, angle, model, {
    traffic: true,
    color: pickOne(rng, TRAFFIC_COLORS),
    cruiseSpeed: randRange(rng, 120, 200),
  });
  car.speed = car.cruiseSpeed;
  state.cars.push(car);
  return car;
}

// Spawn a parked car on a parking lot or roadside, ready to be stolen.
export function spawnParkedCar(state, rng, x, y, angle) {
  const model = pickOne(rng, ['Comet', 'Sedan', 'Pickup', 'Sport', 'Van']);
  const car = makeCar(x, y, angle, model, {
    parked: true,
    driver: false,
    color: pickOne(rng, TRAFFIC_COLORS),
  });
  state.cars.push(car);
  return car;
}

export function spawnPoliceCar(state, rng) {
  const p = state.player;
  const spot = randomRoadPoint(rng, p.x, p.y, 700);
  const road = nearestRoadPoint(spot.x, spot.y);
  const car = makeCar(road.x, road.y, angleTo(road.x, road.y, p.x, p.y), 'Cruiser', {
    police: true,
    color: '#1c2733',
  });
  car.speed = 200;
  state.cars.push(car);
  state.stats.policeSpawned = (state.stats.policeSpawned || 0) + 1;
  return car;
}

// --- Player driving --------------------------------------------------------
export function drivePlayerCar(state, dt, input) {
  const car = state.player.car;
  if (!car) return;
  const up = input.keys.has('w') || input.keys.has('up');
  const down = input.keys.has('s') || input.keys.has('down');
  const left = input.keys.has('a') || input.keys.has('left');
  const right = input.keys.has('d') || input.keys.has('right');
  const handbrake = input.keys.has('space');

  if (up) car.speed += car.accel * dt;
  if (down) {
    if (car.speed > 20) car.speed -= car.accel * 1.4 * dt;
    else car.speed -= car.accel * 0.6 * dt; // reverse
  }
  if (!up && !down) car.speed = lerp(car.speed, 0, 2.2 * dt);
  if (handbrake) car.speed = lerp(car.speed, 0, 6 * dt);
  car.speed = clamp(car.speed, -180, car.topSpeed);

  const steerPower = 2.6 * clamp(1 - Math.abs(car.speed) / (car.topSpeed * 1.4), 0.35, 1);
  const dir = car.speed >= 0 ? 1 : -1;
  if (left) car.angle -= steerPower * dir * dt;
  if (right) car.angle += steerPower * dir * dt;

  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  const probe = { x: nx, y: ny, r: car.r * 0.82 };
  const hitWall = collideBuildings(state.city, probe);
  if (hitWall) {
    if (Math.abs(car.speed) > 240) {
      spawnSparks(state, nx, ny, 8);
      playCrash(state.audio);
      car.health -= 6;
    }
    car.speed *= 0.45;
  } else {
    car.x = nx;
    car.y = ny;
  }
  // World edge.
  car.x = clamp(car.x, 30, WORLD_SIZE - 30);
  car.y = clamp(car.y, 30, WORLD_SIZE - 30);

  // Car-to-car bumps.
  for (const other of state.cars) {
    if (other === car || other.health <= 0) continue;
    const d = dist(car.x, car.y, other.x, other.y);
    const minD = car.r + other.r - 6;
    if (d < minD && d > 0.01) {
      const push = (minD - d) / 2;
      const ux = (car.x - other.x) / d;
      const uy = (car.y - other.y) / d;
      car.x += ux * push;
      car.y += uy * push;
      other.x -= ux * push;
      other.y -= uy * push;
      const impact = Math.abs(car.speed - other.speed);
      if (impact > 180) {
        car.speed *= 0.7;
        other.speed *= 0.7;
        car.health -= 3;
        spawnSparks(state, (car.x + other.x) / 2, (car.y + other.y) / 2, 6);
      }
    }
  }

  // Smoke when badly damaged, explosion at zero health.
  if (car.health < 40 && car.health > 0) {
    car.smokeTimer -= dt;
    if (car.smokeTimer <= 0) {
      car.smokeTimer = 0.12;
      spawnSmoke(state, car.x, car.y, 1);
    }
  }
  if (car.health <= 0) explodeCar(state, car);

  // Keep the player glued to the car.
  state.player.x = car.x;
  state.player.y = car.y;
  state.player.angle = car.angle;
}

export function explodeCar(state, car) {
  if (car.health === -999) return; // already exploded
  car.health = -999;
  spawnExplosion(state, car.x, car.y);
  playExplosion(state.audio);
  if (state.player.car === car) {
    state.player.car = null;
    state.player.onFoot = true;
    state.player.health -= 25;
    state.player.x = car.x + 40;
    state.player.y = car.y + 40;
  }
  // A burning wreck stays as an obstacle for a while, then is towed away.
  car.wreckTimer = 14;
  car.traffic = false;
  car.police = false;
}

// --- Traffic AI ------------------------------------------------------------
function trafficTargetAngle(car) {
  // Traffic follows the grid: at each intersection it may turn. The car keeps a
  // "next turn" plan so it does not jitter.
  const nearX = nearestRoadLine(car.x);
  const nearY = nearestRoadLine(car.y);
  const onV = Math.abs(car.x - nearX) < 6;
  const onH = Math.abs(car.y - nearY) < 6;
  if (onV && onH && !car.turnAt) {
    car.turnAt = { x: nearX, y: nearY, decided: false };
  }
  if (car.turnAt) {
    const d = dist(car.x, car.y, car.turnAt.x, car.turnAt.y);
    if (d > 60) car.turnAt = null;
    else if (!car.turnAt.decided && d < 26) {
      car.turnAt.decided = true;
      const r = Math.random();
      const heading = Math.round(car.angle / (Math.PI / 2)) % 4;
      // 0 = east, 1 = south, 2 = west, 3 = north
      let next = heading;
      if (r < 0.55) next = heading; // straight
      else if (r < 0.78) next = (heading + 1) % 4; // right
      else next = (heading + 3) % 4; // left
      car.targetAngle = next * Math.PI / 2;
    }
  }
  return car.targetAngle !== undefined ? car.targetAngle : car.angle;
}

export function updateTrafficCar(state, car, dt) {
  if (car.health <= 0) return;
  const player = state.player;
  // Stop for the player crossing right in front, and for cars ahead.
  let blocked = false;
  const aheadX = car.x + Math.cos(car.angle) * 70;
  const aheadY = car.y + Math.sin(car.angle) * 70;
  if (dist(aheadX, aheadY, player.x, player.y) < 42 && player.onFoot) blocked = true;
  for (const other of state.cars) {
    if (other === car || other.health <= 0) continue;
    if (dist(aheadX, aheadY, other.x, other.y) < other.r + 26) { blocked = true; break; }
  }
  // ...and for pedestrians on the road.
  for (const ped of state.peds) {
    if (ped.dead) continue;
    if (dist(aheadX, aheadY, ped.x, ped.y) < 30) { blocked = true; break; }
  }

  const targetSpeed = blocked ? 0 : car.cruiseSpeed;
  car.speed = lerp(car.speed, targetSpeed, 1.6 * dt);

  const target = trafficTargetAngle(car);
  car.angle = turnToward(car.angle, target, 2.4 * dt);
  // Snap to the lane when the turn finishes, so cars stay on the grid.
  const moving = Math.abs(car.speed) > 5;
  if (moving) {
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
  }
  // Gentle lane correction: drift back toward the road centreline.
  const vertical = Math.abs(Math.sin(car.angle)) > 0.7;
  if (vertical) {
    const line = nearestRoadLine(car.x);
    car.x = lerp(car.x, line + (Math.cos(car.angle) > 0 ? 0 : 0), 0.4 * dt);
  } else {
    const line = nearestRoadLine(car.y);
    car.y = lerp(car.y, line, 0.4 * dt);
  }
  car.x = clamp(car.x, 20, WORLD_SIZE - 20);
  car.y = clamp(car.y, 20, WORLD_SIZE - 20);

  // Occasional horn when stuck behind the player.
  if (blocked && player.onFoot) {
    car.honkTimer -= dt;
    if (car.honkTimer <= 0) {
      car.honkTimer = 2.5;
      playHorn(state.audio);
    }
  }
  if (car.health <= 0) explodeCar(state, car);
}

// --- Police AI -------------------------------------------------------------
export function updatePoliceCar(state, car, dt) {
  if (car.health <= 0) return;
  const player = state.player;
  car.ramCooldown -= dt;
  // Chase: steer toward the player, faster than traffic.
  const wantAngle = angleTo(car.x, car.y, player.x, player.y);
  const d = dist(car.x, car.y, player.x, player.y);
  const targetSpeed = d > 260 ? 560 : 470;
  car.speed = lerp(car.speed, targetSpeed, 1.8 * dt);
  car.angle = turnToward(car.angle, wantAngle, 3.4 * dt);
  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  const probe = { x: nx, y: ny, r: car.r * 0.82 };
  if (collideBuildings(state.city, probe)) {
    car.speed *= 0.5;
    car.angle += 0.9 * dt;
  } else {
    car.x = nx;
    car.y = ny;
  }
  car.x = clamp(car.x, 20, WORLD_SIZE - 20);
  car.y = clamp(car.y, 20, WORLD_SIZE - 20);

  // Ram the player: damage on contact, with a cooldown so it is not instant death.
  if (d < car.r + 26 && car.ramCooldown <= 0) {
    car.ramCooldown = 0.9;
    if (player.car) {
      player.car.health -= 12;
      player.health -= 4;
      spawnSparks(state, player.x, player.y, 8);
    } else {
      player.health -= 12;
      spawnSparks(state, player.x, player.y, 6);
    }
    state.audio && playCrash(state.audio);
    car.speed *= 0.55;
  }

  // Despawn far-away cruisers once the heat is off.
  if (state.wanted === 0) {
    car.despawnTimer += dt;
    if (car.despawnTimer > 6 || d > 1400) car.health = 0;
  } else {
    car.despawnTimer = 0;
  }
  if (car.health <= 0) explodeCar(state, car);
}

// --- Shared car updates ----------------------------------------------------
export function updateCars(state, dt) {
  const player = state.player;
  for (let i = state.cars.length - 1; i >= 0; i--) {
    const car = state.cars[i];
    if (car.health === -999) {
      // Wreck: count down, then tow it away.
      car.wreckTimer = (car.wreckTimer || 0) - dt;
      if (car.wreckTimer <= 0) state.cars.splice(i, 1);
      continue;
    }
    if (car === player.car) continue;
    if (car.police) updatePoliceCar(state, car, dt);
    else if (car.traffic) updateTrafficCar(state, car, dt);
    // Parked cars just sit there.
  }
  // Traffic density: keep the streets alive near the player.
  const trafficCount = state.cars.filter((c) => c.traffic && c.health > 0).length;
  if (trafficCount < 9 && Math.random() < dt * 0.8) {
    spawnTrafficCar(state, Math.random);
  }
  // Despawn traffic that wandered far away.
  for (let i = state.cars.length - 1; i >= 0; i--) {
    const car = state.cars[i];
    if (car.traffic && car.health > 0 && dist(car.x, car.y, player.x, player.y) > 1500) {
      state.cars.splice(i, 1);
    }
  }
}

// The nearest car the player could steal, within reach and not a wreck.
export function nearestStealableCar(state, maxDist) {
  const player = state.player;
  let best = null;
  let bestD = maxDist;
  for (const car of state.cars) {
    if (car.health <= 0 || car === player.car) continue;
    const d = dist(player.x, player.y, car.x, car.y);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  return best;
}
