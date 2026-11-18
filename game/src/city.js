// city.js — builds Palmera Bay: a sun-soaked coastal city on a road grid.
// The city is fully procedural from a seed, so every player gets the same map and
// the screenshot scenes are reproducible. Roads run on a 400px grid; blocks hold
// buildings, parks, parking lots and palm rows; the south edge is a beach.

import { clamp, mulberry32, pickOne, randInt, randRange, chance } from './util.js';

export const WORLD_SIZE = 3600;
export const PITCH = 400; // distance between road centrelines
export const ROAD_W = 104; // road width
export const BEACH_Y = 3320; // sand starts here; water below it

const DISTRICTS = [
  { name: 'Downtown', x0: 1200, y0: 800, x1: 2400, y1: 2000, tall: true },
  { name: 'Marina', x0: 0, y0: 2800, x1: 1200, y1: 3320, tall: false },
  { name: 'Old Town', x0: 0, y0: 0, x1: 1200, y1: 1200, tall: false },
  { name: 'Northside', x0: 1200, y0: 0, x1: 3600, y1: 800, tall: false },
  { name: 'East Yards', x0: 2400, y0: 2000, x1: 3600, y1: 3320, tall: false },
];

const BUILDING_COLORS = [
  '#e8b48a', '#d9a06f', '#c98f5f', '#e6c9a0', '#b7c4cc', '#9fb3c8',
  '#d8c49a', '#c9b18c', '#a8b8a0', '#e0d6c8', '#c47f6a', '#8fa3b8',
];
const ROOF_COLORS = ['#7a6a5c', '#5f6b7a', '#8a7a68', '#6b5a4a', '#4f5d6b'];

export function buildCity(seed) {
  const rng = mulberry32(seed);
  const city = {
    seed,
    size: WORLD_SIZE,
    roads: [],
    buildings: [],
    palms: [],
    parks: [],
    parkingLots: [],
    landmarks: [],
    roadLines: [], // road centreline coordinates (multiples of PITCH)
  };

  for (let c = 0; c <= WORLD_SIZE / PITCH; c++) city.roadLines.push(c * PITCH);

  // Roads: one vertical and one horizontal strip per grid line.
  for (const c of city.roadLines) {
    city.roads.push({ x: c - ROAD_W / 2, y: 0, w: ROAD_W, h: WORLD_SIZE, horizontal: false });
    city.roads.push({ x: 0, y: c - ROAD_W / 2, w: WORLD_SIZE, h: ROAD_W, horizontal: true });
  }

  // Named places the missions and the HUD know about.
  city.landmarks = [
    { id: 'diner', name: "Rosa's Diner", x: 620, y: 620, kind: 'diner' },
    { id: 'garage', name: "Voss Auto Garage", x: 1780, y: 2180, kind: 'garage' },
    { id: 'pier', name: 'Palmera Pier', x: 300, y: 3200, kind: 'pier' },
    { id: 'bank', name: 'Bay Trust Bank', x: 1820, y: 1020, kind: 'bank' },
    { id: 'safehouse', name: 'Leo\'s Safehouse', x: 2980, y: 620, kind: 'safehouse' },
    { id: 'market', name: 'Mercado Square', x: 1020, y: 2580, kind: 'market' },
    { id: 'hospital', name: 'St. Marina Hospital', x: 2620, y: 2580, kind: 'hospital' },
    { id: 'airport', name: 'Bay Airfield', x: 2980, y: 1420, kind: 'airfield' },
  ];

  const landmarkBlock = new Set();
  for (const lm of city.landmarks) {
    landmarkBlock.add(Math.floor(lm.x / PITCH) + ':' + Math.floor(lm.y / PITCH));
  }

  // Blocks: everything between four roads. Each block becomes buildings, a park,
  // a parking lot, or a landmark lot.
  for (let bx = 0; bx < WORLD_SIZE / PITCH; bx++) {
    for (let by = 0; by < WORLD_SIZE / PITCH; by++) {
      const bx0 = bx * PITCH + ROAD_W / 2 + 14;
      const by0 = by * PITCH + ROAD_W / 2 + 14;
      const bw = PITCH - ROAD_W - 28;
      const bh = PITCH - ROAD_W - 28;
      if (by0 + bh > BEACH_Y - 40) continue; // beach blocks stay empty sand
      const key = bx + ':' + by;
      const district = DISTRICTS.find((d) => bx * PITCH >= d.x0 && bx * PITCH < d.x1 && by * PITCH >= d.y0 && by * PITCH < d.y1);
      const roll = rng();

      if (landmarkBlock.has(key)) {
        // Landmark lot: one low building with a sign colour, plus open forecourt.
        city.buildings.push({
          x: bx0 + 20, y: by0 + 20, w: 120, h: 90,
          color: '#e8d9b0', roof: '#7a5a3a', tall: false, floors: 1,
          landmark: true, label: city.landmarks.find((l) => Math.floor(l.x / PITCH) === bx && Math.floor(l.y / PITCH) === by)?.name ?? '',
        });
        continue;
      }
      if (roll < 0.14) {
        city.parks.push({ x: bx0, y: by0, w: bw, h: bh });
        for (let i = 0; i < 5; i++) {
          city.palms.push({ x: randRange(rng, bx0 + 20, bx0 + bw - 20), y: randRange(rng, by0 + 20, by0 + bh - 20), s: randRange(rng, 0.8, 1.3) });
        }
        continue;
      }
      if (roll < 0.24) {
        city.parkingLots.push({ x: bx0, y: by0, w: bw, h: bh });
        continue;
      }
      // Normal block: 1-4 buildings.
      const tall = district?.tall === true;
      const count = tall ? randInt(rng, 1, 2) : randInt(rng, 2, 4);
      const cols = count <= 2 ? 1 : 2;
      const rows = Math.ceil(count / cols);
      for (let i = 0; i < count; i++) {
        const cx = i % cols;
        const cy = Math.floor(i / cols);
        const w = bw / cols - 24;
        const h = bh / rows - 24;
        const floors = tall ? randInt(rng, 6, 14) : randInt(rng, 1, 3);
        city.buildings.push({
          x: bx0 + cx * (bw / cols) + 12,
          y: by0 + cy * (bh / rows) + 12,
          w, h,
          color: pickOne(rng, BUILDING_COLORS),
          roof: pickOne(rng, ROOF_COLORS),
          tall,
          floors,
          landmark: false,
          label: '',
        });
      }
      // Palm trees along the block edge.
      const palmCount = randInt(rng, 2, 5);
      for (let i = 0; i < palmCount; i++) {
        const edge = randInt(rng, 0, 3);
        let px, py;
        if (edge === 0) { px = randRange(rng, bx0, bx0 + bw); py = by0 + 6; }
        else if (edge === 1) { px = randRange(rng, bx0, bx0 + bw); py = by0 + bh - 6; }
        else if (edge === 2) { px = bx0 + 6; py = randRange(rng, by0, by0 + bh); }
        else { px = bx0 + bw - 6; py = randRange(rng, by0, by0 + bh); }
        city.palms.push({ x: px, y: py, s: randRange(rng, 0.8, 1.25) });
      }
    }
  }

  // A palm-lined boulevard along the beach.
  for (let x = 140; x < WORLD_SIZE - 100; x += 130) {
    city.palms.push({ x: x + randRange(rng, -20, 20), y: BEACH_Y - 46, s: randRange(rng, 0.9, 1.4) });
  }

  return city;
}

// Is a point on a road (within the asphalt)?
export function pointOnRoad(city, x, y) {
  const m = ((v) => {
    const r = v % PITCH;
    return Math.min(r, PITCH - r);
  });
  return m(x) <= ROAD_W / 2 + 2 || m(y) <= ROAD_W / 2 + 2;
}

// Nearest road centreline coordinate to a value.
export function nearestRoadLine(v) {
  return Math.round(v / PITCH) * PITCH;
}

// Snap a point to the nearest road centreline point (used by traffic spawns).
export function nearestRoadPoint(x, y) {
  const dx = Math.abs(x - nearestRoadLine(x));
  const dy = Math.abs(y - nearestRoadLine(y));
  if (dx <= dy) return { x: nearestRoadLine(x), y, vertical: true };
  return { x, y: nearestRoadLine(y), vertical: false };
}

// Find a random point on a road, at least `minDist` from (fx, fy).
export function randomRoadPoint(rng, fx, fy, minDist) {
  for (let tries = 0; tries < 40; tries++) {
    const vertical = chance(rng, 0.5);
    const line = pickOne(rng, [0, 400, 800, 1200, 1600, 2000, 2400, 2800, 3200, 3600]);
    const along = randRange(rng, 200, WORLD_SIZE - 200);
    const p = vertical ? { x: line, y: along } : { x: along, y: line };
    const d = Math.hypot(p.x - fx, p.y - fy);
    if (d >= minDist) return p;
  }
  return { x: 1600, y: 1600 };
}

// The landmark with this id, or null.
export function landmarkById(city, id) {
  return city.landmarks.find((l) => l.id === id) || null;
}

// Which district name contains a point (for the HUD location label).
export function districtAt(x, y) {
  if (y >= BEACH_Y) return 'Palmera Beach';
  for (const d of DISTRICTS) {
    if (x >= d.x0 && x < d.x1 && y >= d.y0 && y < d.y1) return d.name;
  }
  return 'Palmera Bay';
}

// Collision: push a circle out of every building it overlaps. Returns true on hit.
export function collideBuildings(city, circle) {
  let hit = false;
  for (const b of city.buildings) {
    // Cheap broad-phase reject before the precise test.
    if (circle.x + circle.r < b.x || circle.x - circle.r > b.x + b.w ||
        circle.y + circle.r < b.y || circle.y - circle.r > b.y + b.h) continue;
    if (resolveCircleRectLocal(circle, b)) hit = true;
  }
  return hit;
}

function resolveCircleRectLocal(circle, rect) {
  const nx = clamp(circle.x, rect.x, rect.x + rect.w);
  const ny = clamp(circle.y, rect.y, rect.y + rect.h);
  let dx = circle.x - nx;
  let dy = circle.y - ny;
  const d2 = dx * dx + dy * dy;
  if (d2 >= circle.r * circle.r) return false;
  if (d2 < 0.0001) {
    const left = circle.x - rect.x;
    const right = rect.x + rect.w - circle.x;
    const top = circle.y - rect.y;
    const bottom = rect.y + rect.h - circle.y;
    const min = Math.min(left, right, top, bottom);
    if (min === left) circle.x = rect.x - circle.r;
    else if (min === right) circle.x = rect.x + rect.w + circle.r;
    else if (min === top) circle.y = rect.y - circle.r;
    else circle.y = rect.y + rect.h + circle.r;
    return true;
  }
  const d = Math.sqrt(d2);
  const push = (circle.r - d) / d;
  circle.x += dx * push;
  circle.y += dy * push;
  return true;
}

// Keep a point inside the world (the sea blocks the south, the map edge the rest).
export function clampToWorld(p, margin) {
  p.x = clamp(p.x, margin, WORLD_SIZE - margin);
  p.y = clamp(p.y, margin, WORLD_SIZE - margin);
}
