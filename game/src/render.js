// World rendering: the city from above — roads, sidewalks, buildings with lit windows,
// parks, palms, beach and marina, cars, pedestrians, particles and mission markers,
// plus a day/night tint and headlight glow after dark. All art is drawn in code.
import { clamp, lerp, TAU, hash2, shade } from './util.js';
import { CITY_SIZE, ROAD_X, ROAD_Y, ROAD_W, districtAt } from './city.js';

function drawCar(ctx, car, time) {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  const L = car.len, W = car.w;
  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.30)';
  ctx.fillRect(-L / 2 + 2, -W / 2 + 3, L, W);
  // body
  ctx.fillStyle = car.police ? '#202b38' : car.color;
  roundRect(ctx, -L / 2, -W / 2, L, W, 7); ctx.fill();
  if (car.police) {
    ctx.fillStyle = '#f5f6fa';
    ctx.fillRect(-L / 2 + 6, -W / 2 + 1, L - 12, W - 2);
    ctx.fillStyle = '#202b38';
    ctx.fillRect(-L / 2 + 10, -W / 2 + 1, 10, W - 2);
    // light bar flashing
    const on = Math.floor(time * 6 + car.sirenPhase) % 2 === 0;
    ctx.fillStyle = on ? '#ff2d2d' : '#2d7dff';
    ctx.fillRect(-4, -W / 2 + 2, 8, 6);
    ctx.fillStyle = on ? '#2d7dff' : '#ff2d2d';
    ctx.fillRect(-4, W / 2 - 8, 8, 6);
  }
  // cabin + windshield
  ctx.fillStyle = 'rgba(20,30,44,0.9)';
  roundRect(ctx, -L * 0.18, -W / 2 + 4, L * 0.36, W - 8, 4); ctx.fill();
  ctx.fillStyle = 'rgba(140,200,235,0.75)';
  ctx.fillRect(L * 0.18, -W / 2 + 5, 5, W - 10);
  // headlights
  ctx.fillStyle = '#ffe9a8';
  ctx.fillRect(L / 2 - 2, -W / 2 + 2, 3, 5);
  ctx.fillRect(L / 2 - 2, W / 2 - 7, 3, 5);
  // wheels
  ctx.fillStyle = '#14181d';
  const wy = W / 2 - 1;
  ctx.fillRect(-L / 2 + 6, -wy - 2, 9, 4); ctx.fillRect(-L / 2 + 6, wy - 2, 9, 4);
  ctx.fillRect(L / 2 - 15, -wy - 2, 9, 4); ctx.fillRect(L / 2 - 15, wy - 2, 9, 4);
  // smoke when damaged
  if (car.health < 55) {
    ctx.fillStyle = 'rgba(120,120,120,0.5)';
    ctx.beginPath(); ctx.arc(-L / 2 + 4, 0, 4 + Math.random() * 3, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawPed(ctx, ped, time) {
  if (ped.dead) {
    ctx.save();
    ctx.translate(ped.x, ped.y);
    ctx.rotate(ped.angle + 1.2);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(-9, -4, 18, 8);
    ctx.fillStyle = ped.shirt;
    ctx.fillRect(-9, -4, 18, 8);
    ctx.restore();
    return;
  }
  const bob = Math.sin(time * 10 + ped.id) * (ped.state === 'flee' ? 2.2 : 1.1);
  ctx.save();
  ctx.translate(ped.x, ped.y + bob * 0.4);
  ctx.rotate(ped.angle);
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath(); ctx.ellipse(0, 2, 8, 5, 0, 0, TAU); ctx.fill();
  // body
  ctx.fillStyle = ped.shirt;
  roundRect(ctx, -5, -5, 12, 10, 4); ctx.fill();
  // head
  ctx.fillStyle = ped.skin;
  ctx.beginPath(); ctx.arc(8, 0, 5, 0, TAU); ctx.fill();
  if (ped.gang) {
    ctx.fillStyle = '#8e44ad';
    ctx.fillRect(-5, -5, 12, 3);
    // gang member carries a pistol
    ctx.fillStyle = '#222';
    ctx.fillRect(10, -1, 7, 2);
  }
  ctx.restore();
}

export function renderWorld(ctx, world, view) {
  const { cam, cw, ch } = view;
  const time = world.time;
  const day = world.dayTime; // 0..1, 0 = dawn
  // Sky-tinted ground.
  const ground = day < 0.25 || day > 0.85 ? '#46543f' : day < 0.45 ? '#93b578' : day < 0.7 ? '#9cbd7f' : '#86995f';
  ctx.fillStyle = ground;
  ctx.fillRect(0, 0, cw, ch);
  const x0 = cam.x - cw / 2 - 60, x1 = cam.x + cw / 2 + 60;
  const y0 = cam.y - ch / 2 - 60, y1 = cam.y + ch / 2 + 60;

  // Beach + water on the south-west edge.
  ctx.fillStyle = '#e8d194';
  ctx.fillRect(Math.max(x0, 0), Math.max(y0, 3040), Math.min(x1, 1000) - Math.max(x0, 0), Math.min(y1, 3200) - Math.max(y0, 3040));
  ctx.fillStyle = '#2f7fa8';
  const wave = Math.sin(time * 1.4) * 6;
  ctx.fillRect(Math.max(x0, 0), Math.max(y0, 3150 + wave), Math.min(x1, 1000) - Math.max(x0, 0), Math.min(y1, 3200) - Math.max(y0, 3150 + wave));

  // Parks.
  for (const p of world.city.parks) {
    if (p.x1 < x0 || p.x0 > x1 || p.y1 < y0 || p.y0 > y1) continue;
    ctx.fillStyle = '#4e7a3f';
    ctx.fillRect(p.x0, p.y0, p.x1 - p.x0, p.y1 - p.y0);
    ctx.strokeStyle = '#3c5f31'; ctx.lineWidth = 3;
    ctx.strokeRect(p.x0, p.y0, p.x1 - p.x0, p.y1 - p.y0);
  }

  // Roads: asphalt + centre dashes + sidewalks.
  ctx.fillStyle = '#4a505a';
  for (const rx of ROAD_X) ctx.fillRect(rx - ROAD_W / 2, Math.max(y0, 0), ROAD_W, Math.min(y1, CITY_SIZE) - Math.max(y0, 0));
  for (const ry of ROAD_Y) ctx.fillRect(Math.max(x0, 0), ry - ROAD_W / 2, Math.min(x1, CITY_SIZE) - Math.max(x0, 0), ROAD_W);
  ctx.fillStyle = '#6a7078';
  for (const rx of ROAD_X) ctx.fillRect(rx - ROAD_W / 2 - 8, Math.max(y0, 0), 8, Math.min(y1, CITY_SIZE) - Math.max(y0, 0));
  for (const rx of ROAD_X) ctx.fillRect(rx + ROAD_W / 2, Math.max(y0, 0), 8, Math.min(y1, CITY_SIZE) - Math.max(y0, 0));
  for (const ry of ROAD_Y) ctx.fillRect(Math.max(x0, 0), ry - ROAD_W / 2 - 8, Math.min(x1, CITY_SIZE) - Math.max(x0, 0), 8);
  for (const ry of ROAD_Y) ctx.fillRect(Math.max(x0, 0), ry + ROAD_W / 2, Math.min(x1, CITY_SIZE) - Math.max(x0, 0), 8);
  // Centre dashes.
  ctx.fillStyle = '#f5d76e';
  for (const rx of ROAD_X) {
    for (let y = Math.floor(Math.max(y0, 0) / 48) * 48; y < Math.min(y1, CITY_SIZE); y += 48) {
      if (isCrossing(rx, y)) continue;
      ctx.fillRect(rx - 2, y, 4, 22);
    }
  }
  for (const ry of ROAD_Y) {
    for (let x = Math.floor(Math.max(x0, 0) / 48) * 48; x < Math.min(x1, CITY_SIZE); x += 48) {
      if (isCrossing(x, ry)) continue;
      ctx.fillRect(x, ry - 2, 22, 4);
    }
  }
  // Crosswalks at intersections.
  ctx.fillStyle = 'rgba(240,240,230,0.75)';
  for (const rx of ROAD_X) for (const ry of ROAD_Y) {
    if (rx < x0 || rx > x1 || ry < y0 || ry > y1) continue;
    for (let i = -3; i <= 3; i++) {
      ctx.fillRect(rx + i * 12 - 4, ry - ROAD_W / 2 + 4, 8, 10);
      ctx.fillRect(rx + i * 12 - 4, ry + ROAD_W / 2 - 14, 8, 10);
    }
  }

  // Buildings with lit windows.
  const night = day < 0.2 || day > 0.8;
  for (const b of world.city.buildings) {
    if (b.x + b.w < x0 || b.x > x1 || b.y + b.h < y0 || b.y > y1) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(b.x + 5, b.y + 6, b.w, b.h);
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = shade(b.color, 1.18);
    ctx.fillRect(b.x, b.y, b.w, 8);
    // windows
    const cols = Math.max(2, Math.floor(b.w / 26));
    const rows = Math.max(1, Math.floor(b.h / 26));
    for (let cx = 0; cx < cols; cx++) {
      for (let cy = 0; cy < rows; cy++) {
        const lit = hash2(Math.floor(b.x) + cx * 7, Math.floor(b.y) + cy * 13) > (night ? 0.45 : 0.82);
        ctx.fillStyle = lit ? '#ffe9a0' : 'rgba(40,58,78,0.38)';
        ctx.fillRect(b.x + 8 + cx * ((b.w - 16) / cols), b.y + 10 + cy * ((b.h - 20) / rows), 9, 11);
      }
    }
    if (b.floors >= 6) { // rooftop beacon on towers
      ctx.fillStyle = night && Math.floor(time * 2) % 2 === 0 ? '#ff4040' : '#883333';
      ctx.beginPath(); ctx.arc(b.x + b.w / 2, b.y + b.h / 2, 4, 0, TAU); ctx.fill();
    }
  }
  // Landmark labels on buildings.
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  for (const key of Object.keys(world.city.landmarks)) {
    const lm = world.city.landmarks[key];
    if (lm.x < x0 || lm.x > x1 || lm.y < y0 || lm.y > y1) continue;
    ctx.fillStyle = 'rgba(10,14,24,0.65)';
    const w = ctx.measureText(lm.label).width + 16;
    roundRect(ctx, lm.x - w / 2, lm.y - 34, w, 20, 5); ctx.fill();
    ctx.fillStyle = '#ffd76e';
    ctx.fillText(lm.label, lm.x, lm.y - 20);
  }

  // Palm trees.
  for (const t of world.city.trees) {
    if (t.x < x0 || t.x > x1 || t.y < y0 || t.y > y1) continue;
    ctx.strokeStyle = '#6b4a2f'; ctx.lineWidth = 3 * t.s;
    ctx.beginPath(); ctx.moveTo(t.x, t.y); ctx.lineTo(t.x + 3 * t.s, t.y - 14 * t.s); ctx.stroke();
    ctx.fillStyle = '#2f8f4e';
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU + 0.4;
      ctx.beginPath();
      ctx.ellipse(t.x + 3 * t.s + Math.cos(a) * 9 * t.s, t.y - 14 * t.s + Math.sin(a) * 6 * t.s, 9 * t.s, 3.5 * t.s, a, 0, TAU);
      ctx.fill();
    }
  }

  // Cash / health / armour pickups.
  for (const pk of world.pickups) {
    if (pk.taken || pk.x < x0 || pk.x > x1 || pk.y < y0 || pk.y > y1) continue;
    const bob = Math.sin(time * 4 + pk.bob) * 3;
    ctx.save();
    ctx.translate(pk.x, pk.y + bob);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(0, 8 - bob, 12, 5, 0, 0, TAU); ctx.fill();
    if (pk.kind === 'cashbag') {
      ctx.fillStyle = '#2ecc71';
      roundRect(ctx, -11, -9, 22, 18, 4); ctx.fill();
      ctx.fillStyle = '#f1c40f';
      ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.fillText('$', 0, 5);
    } else if (pk.kind === 'health') {
      ctx.fillStyle = '#e74c3c';
      roundRect(ctx, -11, -11, 22, 22, 5); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillRect(-2.5, -8, 5, 16); ctx.fillRect(-8, -2.5, 16, 5);
    } else {
      ctx.fillStyle = '#3498db';
      roundRect(ctx, -11, -11, 22, 22, 5); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 12px system-ui, sans-serif';
      ctx.fillText('A', 0, 4);
    }
    ctx.restore();
  }

  // Pedestrians, then cars (player's car last so it draws on top).
  for (const ped of world.peds) {
    if (ped.x < x0 - 30 || ped.x > x1 + 30 || ped.y < y0 - 30 || ped.y > y1 + 30) continue;
    drawPed(ctx, ped, time);
  }
  const cars = [...world.cars].sort((a, b) => (a === world.player.car ? 1 : b === world.player.car ? -1 : 0));
  for (const car of cars) {
    if (car.dead || car.x < x0 - 60 || car.x > x1 + 60 || car.y < y0 - 60 || car.y > y1 + 60) continue;
    drawCar(ctx, car, time);
  }

  // Player on foot.
  const p = world.player;
  if (!p.car) drawPlayerOnFoot(ctx, p, time);

  // Bullets / tracers.
  for (const b of world.bullets) {
    ctx.strokeStyle = '#ffe9a8'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(b.x - Math.cos(b.angle) * 14, b.y - Math.sin(b.angle) * 14);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  // Particles.
  for (const pt of world.particles) {
    ctx.globalAlpha = clamp(pt.life / pt.max, 0, 1);
    ctx.fillStyle = pt.color;
    ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.size, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Mission marker: bouncing diamond + ring on the ground.
  const mm = world.missions.missionMarker();
  if (mm && world.mode === 'playing') {
    const pulse = 1 + Math.sin(time * 4) * 0.12;
    ctx.save();
    ctx.translate(mm.x, mm.y);
    ctx.strokeStyle = mm.start ? '#ffd76e' : '#ff5d8f';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(0, 0, (mm.radius || 90) * 0.55 * pulse, 0, TAU); ctx.stroke();
    ctx.fillStyle = mm.start ? '#ffd76e' : '#ff5d8f';
    ctx.beginPath();
    ctx.moveTo(0, -34 - Math.sin(time * 5) * 6);
    ctx.lineTo(12, -18 - Math.sin(time * 5) * 6);
    ctx.lineTo(0, -6 - Math.sin(time * 5) * 6);
    ctx.lineTo(-12, -18 - Math.sin(time * 5) * 6);
    ctx.closePath(); ctx.fill();
    ctx.restore();
    // Off-screen direction arrow at the screen edge.
    drawOffscreenArrow(ctx, world, view, mm);
  }

  // Night tint + headlight glow.
  const nightAmt = day < 0.2 ? lerp(0.55, 0, day / 0.2) : day > 0.8 ? lerp(0, 0.55, (day - 0.8) / 0.2) : 0;
  if (nightAmt > 0.01) {
    ctx.fillStyle = `rgba(8,12,40,${nightAmt * 0.55})`;
    ctx.fillRect(0, 0, cw, ch);
    // warm glow around the player
    const px = (p.car ? p.car.x : p.x) - cam.x + cw / 2;
    const py = (p.car ? p.car.y : p.y) - cam.y + ch / 2;
    const g = ctx.createRadialGradient(px, py, 40, px, py, 260);
    g.addColorStop(0, 'rgba(255,220,140,0.20)');
    g.addColorStop(1, 'rgba(255,220,140,0)');
    ctx.fillStyle = g;
    ctx.fillRect(px - 260, py - 260, 520, 520);
  }
}

function isCrossing(x, y) {
  for (const ry of ROAD_Y) if (Math.abs(y - ry) < ROAD_W / 2 + 4) return true;
  for (const rx of ROAD_X) if (Math.abs(x - rx) < ROAD_W / 2 + 4) return true;
  return false;
}

function drawPlayerOnFoot(ctx, p, time) {
  const bob = Math.sin(time * 12) * (p.moving ? 1.4 : 0.3);
  ctx.save();
  ctx.translate(p.x, p.y + bob * 0.3);
  ctx.rotate(p.angle);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(0, 3, 9, 6, 0, 0, TAU); ctx.fill();
  // Rico: teal jacket, dark jeans.
  ctx.fillStyle = '#0e8a7d';
  roundRect(ctx, -6, -6, 13, 12, 5); ctx.fill();
  ctx.fillStyle = '#f1c27d';
  ctx.beginPath(); ctx.arc(9, 0, 5.5, 0, TAU); ctx.fill();
  ctx.fillStyle = '#222';
  ctx.beginPath(); ctx.arc(9, -1, 5.5, Math.PI * 0.9, Math.PI * 2.1); ctx.fill();
  // pistol in hand when armed
  if (p.weapon === 'pistol') {
    ctx.fillStyle = '#1c1c1c';
    ctx.fillRect(11, -1.5, 9, 3);
  }
  ctx.restore();
}

function drawOffscreenArrow(ctx, world, view, mm) {
  const { cam, cw, ch } = view;
  const sx = mm.x - cam.x + cw / 2;
  const sy = mm.y - cam.y + ch / 2;
  if (sx > 40 && sx < cw - 40 && sy > 40 && sy < ch - 40) return;
  const cx = clamp(sx, 50, cw - 50);
  const cy = clamp(sy, 50, ch - 50);
  const a = Math.atan2(sy - ch / 2, sx - cw / 2);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(a);
  ctx.fillStyle = '#ff5d8f';
  ctx.beginPath();
  ctx.moveTo(16, 0); ctx.lineTo(-8, -11); ctx.lineTo(-4, 0); ctx.lineTo(-8, 11);
  ctx.closePath(); ctx.fill();
  ctx.restore();
  const d = Math.round(Math.hypot(mm.x - world.player.x, mm.y - world.player.y));
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(d + 'm', cx, cy + 26);
}
