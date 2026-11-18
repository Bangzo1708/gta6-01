// entities.js — the small stuff that flies around Palmera Bay: bullets, muzzle
// flashes, smoke, sparks, explosions, blood puffs and cash pickups. Everything
// here is visual or a simple pickup; combat rules live in player.js and
// vehicles.js.

import { clamp } from './util.js';

// --- Bullets ---------------------------------------------------------------
export function spawnBullet(state, x, y, angle, fromPlayer, damage) {
  state.bullets.push({
    x, y,
    vx: Math.cos(angle) * 900,
    vy: Math.sin(angle) * 900,
    life: 0.9,
    fromPlayer,
    damage: damage || 34,
  });
  spawnMuzzle(state, x, y, angle);
}

export function updateBullets(state, dt) {
  const city = state.city;
  for (let i = state.bullets.length - 1; i >= 0; i--) {
    const b = state.bullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    let dead = b.life <= 0;
    // A bullet dies on a building wall, with a spark.
    if (!dead) {
      for (const building of city.buildings) {
        if (b.x >= building.x && b.x <= building.x + building.w &&
            b.y >= building.y && b.y <= building.y + building.h) {
          spawnSparks(state, b.x, b.y, 5);
          dead = true;
          break;
        }
      }
    }
    if (dead) state.bullets.splice(i, 1);
  }
}

// --- Particles -------------------------------------------------------------
export function spawnParticle(state, x, y, vx, vy, life, size, color, kind) {
  if (state.particles.length > 420) return;
  state.particles.push({ x, y, vx, vy, life, maxLife: life, size, color, kind: kind || 'dot' });
}

export function spawnMuzzle(state, x, y, angle) {
  spawnParticle(state, x + Math.cos(angle) * 14, y + Math.sin(angle) * 14,
    Math.cos(angle) * 60, Math.sin(angle) * 60, 0.07, 9, '#ffd76a', 'flash');
}

export function spawnSparks(state, x, y, n) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = 60 + Math.random() * 160;
    spawnParticle(state, x, y, Math.cos(a) * s, Math.sin(a) * s,
      0.25 + Math.random() * 0.25, 2 + Math.random() * 2, '#ffcf4d', 'dot');
  }
}

export function spawnSmoke(state, x, y, n) {
  for (let i = 0; i < n; i++) {
    spawnParticle(state, x + (Math.random() - 0.5) * 10, y + (Math.random() - 0.5) * 10,
      (Math.random() - 0.5) * 30, -30 - Math.random() * 30,
      0.7 + Math.random() * 0.6, 7 + Math.random() * 8, '#9a9a9a', 'smoke');
  }
}

export function spawnBlood(state, x, y) {
  for (let i = 0; i < 8; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = 40 + Math.random() * 120;
    spawnParticle(state, x, y, Math.cos(a) * s, Math.sin(a) * s,
      0.3 + Math.random() * 0.3, 2 + Math.random() * 3, '#c0392b', 'dot');
  }
}

export function spawnExplosion(state, x, y) {
  for (let i = 0; i < 26; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = 60 + Math.random() * 320;
    const colors = ['#ff9d00', '#ff5e00', '#ffd76a', '#8a8a8a'];
    spawnParticle(state, x, y, Math.cos(a) * s, Math.sin(a) * s,
      0.4 + Math.random() * 0.7, 4 + Math.random() * 8,
      colors[Math.floor(Math.random() * colors.length)], 'fire');
  }
  spawnSmoke(state, x, y, 10);
}

export function updateParticles(state, dt) {
  for (let i = state.particles.length - 1; i >= 0; i--) {
    const p = state.particles[i];
    p.life -= dt;
    if (p.life <= 0) {
      state.particles.splice(i, 1);
      continue;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= (1 - 2.2 * dt);
    p.vy *= (1 - 2.2 * dt);
    if (p.kind === 'smoke') p.size += 14 * dt;
  }
}

// --- Pickups ---------------------------------------------------------------
export function spawnCashPickup(state, x, y, amount) {
  state.pickups.push({ x, y, amount, kind: 'cash', bob: Math.random() * Math.PI * 2 });
}

export function spawnHealthPickup(state, x, y) {
  state.pickups.push({ x, y, amount: 35, kind: 'health', bob: Math.random() * Math.PI * 2 });
}

export function updatePickups(state, dt, onCollect) {
  const player = state.player;
  for (let i = state.pickups.length - 1; i >= 0; i--) {
    const p = state.pickups[i];
    p.bob += dt * 3;
    const d = Math.hypot(player.x - p.x, player.y - p.y);
    if (d < 30) {
      onCollect(p);
      state.pickups.splice(i, 1);
    }
  }
}

export function particleAlpha(p) {
  return clamp(p.life / p.maxLife, 0, 1);
}
