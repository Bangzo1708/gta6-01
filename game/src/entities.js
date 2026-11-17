// The living city: traffic cars, pedestrians, police units, pickups and particles.
// Traffic follows the road grid; pedestrians stroll the sidewalks and flee gunfire;
// police chase, ram and try to bust the player. All of it is original code.
import { mulberry32, pick, clamp, dist, angleTo, turnToward, TAU, hash2 } from './util.js';
import { CITY_SIZE, ROAD_X, ROAD_Y, ROAD_W, isOnRoad, nearestRoadPoint, randomRoadPoint, collideBuildings, pointInBuilding } from './city.js';

export const CAR_COLORS = ['#c0392b', '#2980b9', '#f39c12', '#27ae60', '#8e44ad', '#e67e22', '#ecf0f1', '#2c3e50', '#16a085', '#d35400', '#b03a6e', '#f1c40f'];
export const CAR_MODELS = [
  { name: 'Comet GT', top: 520, accel: 300, len: 46, w: 22 },
  { name: 'Palmera Taxi', top: 430, accel: 260, len: 46, w: 22 },
  { name: 'Dune Buggy', top: 460, accel: 320, len: 42, w: 22 },
  { name: 'Bay Van', top: 380, accel: 210, len: 56, w: 24 },
  { name: 'Sunset Cruiser', top: 470, accel: 250, len: 50, w: 23 },
  { name: 'Street Hawk', top: 560, accel: 340, len: 44, w: 21 },
  { name: 'Harbor Truck', top: 360, accel: 190, len: 60, w: 26 },
  { name: 'City Sedan', top: 450, accel: 250, len: 46, w: 22 },
];
export const PED_SHIRTS = ['#e74c3c', '#3498db', '#f1c40f', '#2ecc71', '#9b59b6', '#e67e22', '#ecf0f1', '#1abc9c', '#fd79a8', '#74b9ff'];
export const PED_NAMES = ['Marta', 'Dee', 'Carlos', 'Ana', 'Jules', 'Tito', 'Rosa', 'Kenny', 'Luz', 'Marco', 'Ivy', 'Sam', 'Nia', 'Pete', 'Gus', 'Lena'];

let nextCarId = 1;
let nextPedId = 1;

export function makeCar(x, y, angle, opts = {}) {
  const model = opts.model || pick(opts.rng || Math.random, CAR_MODELS);
  return {
    id: nextCarId++, x, y, angle, speed: 0,
    color: opts.color || pick(opts.rng || Math.random, CAR_COLORS),
    model, len: model.len, w: model.w,
    traffic: !!opts.traffic, police: !!opts.police, parked: !!opts.parked,
    driver: opts.driver || 'ai', // 'ai' | 'player' | 'none'
    health: 100, targetSpeed: opts.targetSpeed || (90 + Math.random() * 60),
    lane: 0, stuck: 0, sirenPhase: Math.random() * TAU,
    dead: false, smoke: 0,
  };
}

export function makePed(x, y, rng) {
  return {
    id: nextPedId++, x, y,
    angle: rng() * TAU, speed: 22 + rng() * 26,
    shirt: pick(rng, PED_SHIRTS), skin: pick(rng, ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac']),
    name: pick(rng, PED_NAMES),
    state: 'walk', // walk | flee | down | scared
    tx: x, ty: y, wait: 0, panic: 0,
    gang: false, health: 100, dead: false,
  };
}

export function makePoliceCar(x, y, angle) {
  const c = makeCar(x, y, angle, { color: '#1c2733', model: CAR_MODELS[5], police: true, driver: 'ai' });
  c.targetSpeed = 520;
  return c;
}

export function spawnTraffic(world, n) {
  const rng = world.rng;
  for (let i = 0; i < n; i++) {
    const p = randomRoadPoint(rng);
    const angle = p.horizontal ? (rng() < 0.5 ? 0 : Math.PI) : (rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
    const parked = rng() < 0.22;
    const c = makeCar(p.x + (rng() - 0.5) * 20, p.y + (rng() - 0.5) * 20, angle, { rng, parked, driver: parked ? 'none' : 'ai' });
    if (parked) c.speed = 0;
    world.cars.push(c);
  }
}

export function spawnPeds(world, n) {
  const rng = world.rng;
  for (let i = 0; i < n; i++) {
    const p = randomRoadPoint(rng);
    const off = (rng() < 0.5 ? -1 : 1) * (ROAD_W / 2 + 14 + rng() * 26);
    const x = p.horizontal ? p.x + (rng() - 0.5) * 300 : p.x + off;
    const y = p.horizontal ? p.y + off : p.y + (rng() - 0.5) * 300;
    if (pointInBuilding(world.city, x, y)) continue;
    world.peds.push(makePed(clamp(x, 60, CITY_SIZE - 60), clamp(y, 60, CITY_SIZE - 60), rng));
  }
}

export function spawnPickup(world, x, y, kind) {
  world.pickups.push({ x, y, kind, bob: Math.random() * TAU, taken: false });
}

export function burst(world, x, y, color, n, speed) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU;
    const s = (speed || 120) * (0.3 + Math.random() * 0.7);
    world.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.4 + Math.random() * 0.5, max: 0.9, color, size: 2 + Math.random() * 3 });
  }
}

// --- traffic AI: follow the road, slow for the car ahead, turn at intersections ---
export function updateTrafficCar(world, car, dt) {
  if (car.driver === 'player' || car.parked) return;
  const ahead = carAhead(world, car);
  let want = car.targetSpeed;
  if (ahead && ahead < 70) want = 0;
  if (car.police) { updatePoliceCar(world, car, dt); return; }
  car.speed += clamp(want - car.speed, -260 * dt, 180 * dt);
  // At an intersection, sometimes turn.
  const onV = Math.abs(Math.sin(car.angle)) < 0.3;
  const nearX = nearestRoadCoord(car.x, ROAD_X);
  const nearY = nearestRoadCoord(car.y, ROAD_Y);
  const atCross = Math.abs(car.x - nearX) < 14 && Math.abs(car.y - nearY) < 14;
  if (atCross && Math.random() < dt * 0.5) {
    const dirs = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
    car.angle = dirs[Math.floor(Math.random() * dirs.length)];
  }
  // Keep on the road: nudge back toward the nearest road centre line.
  const p = nearestRoadPoint(car.x, car.y);
  const laneOff = 18;
  if (!p.horizontal) {
    const targetX = p.x + (Math.cos(car.angle) > 0 ? laneOff : -laneOff) * 0.4;
    car.x += clamp(targetX - car.x, -60 * dt, 60 * dt);
  } else {
    const targetY = p.y + (Math.sin(car.angle) > 0 ? laneOff : -laneOff) * 0.4;
    car.y += clamp(targetY - car.y, -60 * dt, 60 * dt);
  }
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  car.x = clamp(car.x, 40, CITY_SIZE - 40);
  car.y = clamp(car.y, 40, CITY_SIZE - 40);
  const hit = collideBuildings(world.city, car.x, car.y, 16);
  if (hit.hit) { car.x = hit.x; car.y = hit.y; car.speed *= 0.5; }
}

function nearestRoadCoord(v, roads) {
  let best = roads[0], bd = Infinity;
  for (const r of roads) { const d = Math.abs(v - r); if (d < bd) { bd = d; best = r; } }
  return best;
}

function carAhead(world, car) {
  let best = Infinity;
  for (const o of world.cars) {
    if (o === car || o.dead) continue;
    const d = dist(car.x, car.y, o.x, o.y);
    if (d < 120) {
      const a = angleTo(car.x, car.y, o.x, o.y);
      if (Math.abs(((a - car.angle + Math.PI * 3) % TAU) - Math.PI) < 0.6 && d < best) best = d;
    }
  }
  return best === Infinity ? null : best;
}

// --- police AI: chase the player, ram, and bust on foot at close range ---
export function updatePoliceCar(world, car, dt) {
  const p = world.player;
  const px = p.car ? p.car.x : p.x;
  const py = p.car ? p.car.y : p.y;
  const d = dist(car.x, car.y, px, py);
  const wantAngle = angleTo(car.x, car.y, px, py);
  car.angle = turnToward(car.angle, wantAngle, 2.6 * dt);
  const target = d > 260 ? 540 : 430;
  car.speed += clamp(target - car.speed, -420 * dt, 320 * dt);
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  car.sirenPhase += dt * 6;
  const hit = collideBuildings(world.city, car.x, car.y, 16);
  if (hit.hit) { car.x = hit.x; car.y = hit.y; car.speed *= 0.4; car.angle += 0.6 * dt * 10; }
  // Ram the player's car.
  if (p.car && d < 46) {
    p.car.speed *= 0.94;
    burst(world, car.x, car.y, '#f1c40f', 3, 90);
    world.shake = Math.max(world.shake, 4);
    if (world.sounds) world.sounds.noise(0.08, 0.15, 700);
  }
}

export function updatePed(world, ped, dt) {
  if (ped.dead) return;
  const p = world.player;
  const px = p.car ? p.car.x : p.x;
  const py = p.car ? p.car.y : p.y;
  const d = dist(ped.x, ped.y, px, py);
  if (ped.state === 'down') return;
  if (ped.panic > 0) ped.panic -= dt;
  if (ped.state === 'flee') {
    const a = angleTo(px, py, ped.x, ped.y);
    ped.angle = turnToward(ped.angle, a, 6 * dt);
    ped.x += Math.cos(ped.angle) * 150 * dt;
    ped.y += Math.sin(ped.angle) * 150 * dt;
    if (ped.panic <= 0 && d > 320) ped.state = 'walk';
  } else {
    if (d < 60 && p.car && Math.abs(p.car.speed) > 120) { ped.state = 'flee'; ped.panic = 2.5; return; }
    if (ped.wait > 0) { ped.wait -= dt; return; }
    const td = dist(ped.x, ped.y, ped.tx, ped.ty);
    if (td < 12) {
      if (Math.random() < dt * 0.3) {
        ped.wait = 1 + Math.random() * 4;
        return;
      }
      const np = randomRoadPoint(world.rng);
      ped.tx = clamp(np.x, 80, CITY_SIZE - 80);
      ped.ty = clamp(np.y, 80, CITY_SIZE - 80);
      return;
    }
    ped.angle = turnToward(ped.angle, angleTo(ped.x, ped.y, ped.tx, ped.ty), 5 * dt);
    ped.x += Math.cos(ped.angle) * ped.speed * dt;
    ped.y += Math.sin(ped.angle) * ped.speed * dt;
  }
  ped.x = clamp(ped.x, 40, CITY_SIZE - 40);
  ped.y = clamp(ped.y, 40, CITY_SIZE - 40);
  const hit = collideBuildings(world.city, ped.x, ped.y, 10);
  if (hit.hit) { ped.x = hit.x; ped.y = hit.y; ped.tx = ped.x + (Math.random() - 0.5) * 400; ped.ty = ped.y + (Math.random() - 0.5) * 400; }
}

export function scareNearbyPeds(world, x, y, radius) {
  for (const ped of world.peds) {
    if (!ped.dead && dist(ped.x, ped.y, x, y) < radius) { ped.state = 'flee'; ped.panic = 3; }
  }
}

export function updateParticles(world, dt) {
  for (const pt of world.particles) {
    pt.life -= dt;
    pt.x += pt.vx * dt; pt.y += pt.vy * dt;
    pt.vx *= 0.94; pt.vy *= 0.94;
  }
  world.particles = world.particles.filter((pt) => pt.life > 0);
}
