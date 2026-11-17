// Palmera Bay: the city itself. A seeded grid city, 3200x3200 world units, with named
// districts, roads, blocks, buildings, parks, a beach and a marina — all generated from a
// fixed seed so every player explores the same city. Nothing here copies any real map.
import { mulberry32, pick, hash2, clamp } from './util.js';

export const CITY_SIZE = 3200;
export const ROAD_W = 92;
export const BLOCK = 400;

// Road centre lines (x for vertical roads, y for horizontal ones).
export const ROAD_X = [200, 600, 1000, 1400, 1800, 2200, 2600, 3000];
export const ROAD_Y = [200, 600, 1000, 1400, 1800, 2200, 2600, 3000];

export const DISTRICTS = [
  { name: 'Old Marina', x0: 0, y0: 0, x1: 1000, y1: 1000, color: '#3f7d8c', desc: 'fishing boats and faded neon' },
  { name: 'Downtown', x0: 1000, y0: 0, x1: 2200, y1: 1400, color: '#8c7a3f', desc: 'glass towers and fast money' },
  { name: 'Little Havana Row', x0: 2200, y0: 0, x1: 3200, y1: 1000, color: '#c96a3b', desc: 'cafes, dominoes and salsa' },
  { name: 'Coral Heights', x0: 0, y0: 1000, x1: 1000, y1: 2200, color: '#5a8c4a', desc: 'quiet streets, loud secrets' },
  { name: 'The Strip', x0: 1000, y0: 1400, x1: 2200, y1: 3200, color: '#b03a6e', desc: 'clubs that never close' },
  { name: 'Sunset Docks', x0: 2200, y0: 1000, x1: 3200, y1: 2200, color: '#4a6a8c', desc: 'crates, cranes and contraband' },
  { name: 'Palm Beach', x0: 0, y0: 2200, x1: 1000, y1: 3200, color: '#d9b36a', desc: 'sand, surf and sunburn' },
  { name: 'Airport Flats', x0: 2200, y0: 2200, x1: 3200, y1: 3200, color: '#7a7a8c', desc: 'runways and cheap motels' },
];

const BUILDING_NAMES = [
  'Hotel Miramar', 'Torre Azul', 'Bayview Plaza', 'Casa del Sol', 'The Pelican Arms',
  'Neon Palms Motel', 'Café Brisa', 'Mercado Central', 'Galeria Luna', 'The Rusty Anchor',
  'Palm Court Apts', 'Studio Mar', 'Club Eclipse', 'La Bodega', 'Sunset Records',
  'Harbor Lights Inn', 'Taco Fuego', 'The Brass Palm', 'Oceanic Bank', 'Villa Coral',
  'Palm Plaza Mall', 'The Driftwood', 'Cine Paraíso', 'Sabor Grill', 'Wave Rider Surf',
  'The Copper Kettle', 'Marina Offices', 'Hotel Estrella', 'The Gilded Gull', 'Palm Court',
];
const PALETTES = {
  Downtown: ['#9aa8bd', '#7d90a8', '#b3bfd0', '#8ba0b5', '#c2cdd9'],
  'Old Marina': ['#93b3a6', '#7a9a90', '#a8c0b2', '#86a893'],
  'Little Havana Row': ['#e8a878', '#d98a5f', '#f0c090', '#d07a4a'],
  'Coral Heights': ['#a3bd85', '#8aa878', '#b5c99a', '#86a86e'],
  'The Strip': ['#bd7d9c', '#a86a8a', '#cc92ab', '#9c5a7d'],
  'Sunset Docks': ['#8a99ac', '#77879c', '#9dabbd', '#6b7d90'],
  'Palm Beach': ['#ecd6a3', '#ddc491', '#f2e2b8', '#d2b47e'],
  'Airport Flats': ['#a8a8b2', '#9696a2', '#b8b8c2', '#868694'],
};

export function districtAt(x, y) {
  for (const d of DISTRICTS) if (x >= d.x0 && x < d.x1 && y >= d.y0 && y < d.y1) return d;
  return DISTRICTS[1];
}

export function isOnRoad(x, y) {
  for (const rx of ROAD_X) if (Math.abs(x - rx) < ROAD_W / 2) return true;
  for (const ry of ROAD_Y) if (Math.abs(y - ry) < ROAD_W / 2) return true;
  return false;
}

export function generateCity(seed = 20261117) {
  const rng = mulberry32(seed);
  const buildings = [];
  const trees = [];
  const parks = [];
  let bi = 0;
  // One building (or park) per block cell between roads.
  for (let gx = 0; gx < ROAD_X.length - 1; gx++) {
    for (let gy = 0; gy < ROAD_Y.length - 1; gy++) {
      const x0 = ROAD_X[gx] + ROAD_W / 2 + 14;
      const x1 = ROAD_X[gx + 1] - ROAD_W / 2 - 14;
      const y0 = ROAD_Y[gy] + ROAD_W / 2 + 14;
      const y1 = ROAD_Y[gy + 1] - ROAD_W / 2 - 14;
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      const d = districtAt(cx, cy);
      const roll = rng();
      if (roll < 0.14) { // park with palms
        parks.push({ x0, y0, x1, y1, name: pick(rng, ['Palm Square', 'Coral Park', 'Plaza del Mar', 'Sunset Green']) });
        const n = 5 + Math.floor(rng() * 5);
        for (let i = 0; i < n; i++) {
          trees.push({ x: x0 + 20 + rng() * (x1 - x0 - 40), y: y0 + 20 + rng() * (y1 - y0 - 40), s: 0.8 + rng() * 0.7 });
        }
        continue;
      }
      const w = (x1 - x0) * (0.55 + rng() * 0.35);
      const h = (y1 - y0) * (0.55 + rng() * 0.35);
      const bx = cx - w / 2, by = cy - h / 2;
      const tall = d.name === 'Downtown' && rng() < 0.5;
      const floors = tall ? 6 + Math.floor(rng() * 10) : 1 + Math.floor(rng() * 3);
      const pal = PALETTES[d.name] || PALETTES.Downtown;
      buildings.push({
        x: bx, y: by, w, h, floors,
        color: pick(rng, pal),
        name: BUILDING_NAMES[bi % BUILDING_NAMES.length] + (bi >= BUILDING_NAMES.length ? ' ' + (Math.floor(bi / BUILDING_NAMES.length) + 1) : ''),
        district: d.name,
        roof: hash2(gx, gy) > 0.5,
      });
      bi++;
      if (rng() < 0.7) trees.push({ x: bx - 16, y: by + h / 2, s: 0.9 + rng() * 0.5 });
      if (rng() < 0.5) trees.push({ x: bx + w + 16, y: by + h / 2, s: 0.9 + rng() * 0.5 });
    }
  }
  // Beach strip along the south-west edge and a marina on the north-west corner.
  const beach = { x0: 0, y0: 3040, x1: 1000, y1: 3200 };
  const marina = { x0: 0, y0: 0, x1: 320, y1: 320 };
  // Landmarks: safehouse, garage, club, warehouse, hospital, police HQ.
  const landmarks = {
    safehouse: { x: 520, y: 1520, name: "Rico's Safehouse", label: 'SAFEHOUSE' },
    garage: { x: 2380, y: 1620, name: "Manny's Chop Shop", label: 'GARAGE' },
    club: { x: 1620, y: 2380, name: 'Club Eclipse', label: 'CLUB' },
    warehouse: { x: 2620, y: 1180, name: 'Dock 9 Warehouse', label: 'WAREHOUSE' },
    hospital: { x: 1180, y: 620, name: 'Palmera General', label: 'HOSPITAL' },
    policeHQ: { x: 1980, y: 420, name: 'Bay PD Headquarters', label: 'POLICE HQ' },
    airport: { x: 2820, y: 2820, name: 'Palmera Airfield', label: 'AIRFIELD' },
    beachBar: { x: 420, y: 3120, name: 'The Driftwood Bar', label: 'BAR' },
  };
  return { buildings, trees, parks, beach, marina, landmarks };
}

// Push a circle out of every building rect it overlaps. Returns true if it hit anything.
export function collideBuildings(city, x, y, r) {
  let hit = false;
  for (const b of city.buildings) {
    const nx = clamp(x, b.x, b.x + b.w);
    const ny = clamp(y, b.y, b.y + b.h);
    const dx = x - nx, dy = y - ny;
    const d2 = dx * dx + dy * dy;
    if (d2 < r * r) {
      hit = true;
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        x += (dx / d) * (r - d);
        y += (dy / d) * (r - d);
      } else {
        y = b.y - r; // dead centre: shove up
      }
    }
  }
  return { x, y, hit };
}

export function pointInBuilding(city, x, y) {
  for (const b of city.buildings) if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b;
  return null;
}

// Nearest road centre point to (x, y) — used to snap spawns onto streets.
export function nearestRoadPoint(x, y) {
  let bestX = ROAD_X[0], bd = Infinity;
  for (const rx of ROAD_X) { const d = Math.abs(x - rx); if (d < bd) { bd = d; bestX = rx; } }
  let bestY = ROAD_Y[0]; bd = Infinity;
  for (const ry of ROAD_Y) { const d = Math.abs(y - ry); if (d < bd) { bd = d; bestY = ry; } }
  if (Math.abs(x - bestX) < Math.abs(y - bestY)) return { x: bestX, y, horizontal: false };
  return { x, y: bestY, horizontal: true };
}

export function randomRoadPoint(rng) {
  if (rng() < 0.5) return { x: pick(rng, ROAD_X), y: 120 + rng() * (CITY_SIZE - 240), horizontal: false };
  return { x: 120 + rng() * (CITY_SIZE - 240), y: pick(rng, ROAD_Y), horizontal: true };
}
