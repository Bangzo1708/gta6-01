// util.js — small math and random helpers shared by every Palmera Bay module.
// Everything here is pure and deterministic: the same seed always gives the same city.

export function clamp(value, min, max) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function dist(ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  return Math.sqrt(dx * dx + dy * dy);
}

export function angleTo(ax, ay, bx, by) {
  return Math.atan2(by - ay, bx - ax);
}

// Shortest signed difference between two angles, in (-PI, PI].
export function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

// Turn `angle` toward `target` by at most `step` radians.
export function turnToward(angle, target, step) {
  const d = angleDiff(angle, target);
  if (Math.abs(d) <= step) return target;
  return angle + Math.sign(d) * step;
}

// Seeded PRNG (mulberry32). Used for the city layout and screenshot scenes so a
// given seed always builds the same Palmera Bay.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randRange(rng, min, max) {
  return min + rng() * (max - min);
}

export function randInt(rng, min, max) {
  return Math.floor(randRange(rng, min, max + 1));
}

export function pickOne(rng, list) {
  return list[Math.floor(rng() * list.length)];
}

export function chance(rng, p) {
  return rng() < p;
}

// Format a money amount as $1,234.
export function moneyString(amount) {
  const n = Math.floor(amount);
  return '$' + n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// Format seconds of play as H:MM:SS.
export function clockString(totalSeconds) {
  const s = Math.floor(totalSeconds % 60);
  const m = Math.floor(totalSeconds / 60) % 60;
  const h = Math.floor(totalSeconds / 3600);
  const pad = (v) => (v < 10 ? '0' + v : '' + v);
  return h + ':' + pad(m) + ':' + pad(s);
}

// Circle vs axis-aligned rectangle collision test.
export function circleHitsRect(cx, cy, r, rect) {
  const nx = clamp(cx, rect.x, rect.x + rect.w);
  const ny = clamp(cy, rect.y, rect.y + rect.h);
  const dx = cx - nx;
  const dy = cy - ny;
  return dx * dx + dy * dy < r * r;
}

// Push a circle out of a rectangle; returns true when a push happened.
export function resolveCircleRect(circle, rect) {
  const nx = clamp(circle.x, rect.x, rect.x + rect.w);
  const ny = clamp(circle.y, rect.y, rect.y + rect.h);
  let dx = circle.x - nx;
  let dy = circle.y - ny;
  let d2 = dx * dx + dy * dy;
  if (d2 >= circle.r * circle.r) return false;
  if (d2 < 0.0001) {
    // Centre is inside the rectangle: push out along the smallest penetration.
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
