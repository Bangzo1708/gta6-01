// HUD, minimap and menus: money, health, wanted stars, weapon, speed, mission tracker,
// a live minimap of the whole city, dialogue boxes, banners, and the title / pause /
// busted / wasted / story-complete screens. All drawn on the same canvas.
import { clamp, fmtMoney, fmtTime, TAU } from './util.js';
import { CITY_SIZE, districtAt } from './city.js';
import { MISSIONS } from './missions.js';

export function drawHUD(ctx, world, view) {
  const { cw, ch } = view;
  const p = world.player;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  // Top-left: cash + district + clock.
  ctx.fillStyle = 'rgba(8,12,22,0.62)';
  roundRect(ctx, 12, 12, 218, 74, 10); ctx.fill();
  ctx.fillStyle = '#7ee787';
  ctx.font = 'bold 26px system-ui, sans-serif';
  ctx.fillText(fmtMoney(world.money), 24, 42);
  ctx.fillStyle = '#dfe6f2';
  ctx.font = '13px system-ui, sans-serif';
  const d = districtAt(p.x, p.y);
  ctx.fillText(d.name + '  •  ' + fmtTime(world.clock), 24, 64);
  ctx.fillStyle = '#9fb2cc';
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillText('Palmera Bay', 24, 80);

  // Top-right: wanted stars.
  ctx.fillStyle = 'rgba(8,12,22,0.62)';
  roundRect(ctx, cw - 212, 12, 200, 46, 10); ctx.fill();
  ctx.font = 'bold 24px system-ui, sans-serif';
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = i < world.wanted ? '#ffd21f' : 'rgba(255,255,255,0.22)';
    ctx.fillText('★', cw - 196 + i * 34, 38);
  }
  ctx.fillStyle = world.wanted > 0 ? '#ff6b6b' : '#9fb2cc';
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.fillText(world.wanted > 0 ? 'WANTED' : 'CLEAN', cw - 196, 54);

  // Bottom-left: health bar + weapon + armour.
  ctx.fillStyle = 'rgba(8,12,22,0.62)';
  roundRect(ctx, 12, ch - 78, 240, 66, 10); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.fillText('RICO VANE', 24, ch - 56);
  ctx.fillStyle = '#222';
  ctx.fillRect(24, ch - 48, 200, 12);
  ctx.fillStyle = p.health > 50 ? '#2ecc71' : p.health > 25 ? '#f39c12' : '#e74c3c';
  ctx.fillRect(24, ch - 48, 200 * clamp(p.health / 100, 0, 1), 12);
  ctx.fillStyle = '#fff';
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillText(Math.ceil(p.health) + ' HP', 228, ch - 38);
  ctx.fillStyle = '#dfe6f2';
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillText((p.weapon === 'pistol' ? 'Pistol' : 'Fists') + '  •  ' + (p.weapon === 'pistol' ? p.ammo + ' ammo' : 'melee') +
    (p.car ? '  •  ' + p.car.model.name : ''), 24, ch - 20);

  // Speedometer while driving.
  if (p.car) {
    const kmh = Math.round(Math.abs(p.car.speed) * 0.36);
    ctx.fillStyle = 'rgba(8,12,22,0.62)';
    roundRect(ctx, cw - 212, ch - 78, 200, 66, 10); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 30px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(kmh + '', cw - 40, ch - 40);
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText('km/h', cw - 24, ch - 40);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#9fb2cc';
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText(p.car.health < 55 ? 'ENGINE SMOKING — FIND A NEW RIDE' : 'E — exit car', cw - 200, ch - 20);
  }

  // Mission tracker, top centre.
  const obj = world.missions.objectiveText();
  ctx.fillStyle = 'rgba(8,12,22,0.62)';
  const ow = Math.min(cw - 480, 520);
  roundRect(ctx, (cw - ow) / 2, 12, ow, 46, 10); ctx.fill();
  ctx.fillStyle = '#ffd76e';
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  const missionTitle = world.missions.index < MISSIONS.length ? MISSIONS[world.missions.index].title : 'Free Roam';
  ctx.fillText('◆ ' + missionTitle.toUpperCase(), cw / 2, 30);
  ctx.fillStyle = '#fff';
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillText(obj.length > 72 ? obj.slice(0, 72) + '…' : obj, cw / 2, 48);
  ctx.textAlign = 'left';

  // Banner (mission passed / new mission).
  if (world.missions.banner) {
    const b = world.missions.banner;
    ctx.globalAlpha = clamp(b.t, 0, 1);
    ctx.fillStyle = 'rgba(8,12,22,0.72)';
    roundRect(ctx, cw / 2 - 260, ch * 0.24, 520, 74, 12); ctx.fill();
    ctx.fillStyle = '#ffd76e';
    ctx.font = 'bold 30px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(b.text, cw / 2, ch * 0.24 + 36);
    ctx.fillStyle = '#fff';
    ctx.font = '15px system-ui, sans-serif';
    ctx.fillText(b.sub, cw / 2, ch * 0.24 + 60);
    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;
  }

  // Dialogue box.
  if (world.missions.dialogue) {
    const dl = world.missions.dialogue;
    const [who, line] = dl.lines[dl.i];
    ctx.fillStyle = 'rgba(8,12,22,0.82)';
    roundRect(ctx, cw / 2 - 330, ch - 178, 660, 88, 12); ctx.fill();
    ctx.fillStyle = who === 'RICO' ? '#2ec4b6' : who === 'DUKE' ? '#e74c3c' : '#ffd76e';
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.fillText(who, cw / 2 - 312, ch - 150);
    ctx.fillStyle = '#fff';
    ctx.font = '15px system-ui, sans-serif';
    wrapText(ctx, line, cw / 2 - 312, ch - 126, 624, 20);
    ctx.fillStyle = '#9fb2cc';
    ctx.font = '12px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('E / click — continue', cw / 2 + 312, ch - 100);
    ctx.textAlign = 'left';
  }

  // Context hint.
  if (world.hint) {
    ctx.fillStyle = 'rgba(8,12,22,0.7)';
    const w = ctx.measureText(world.hint).width + 24;
    roundRect(ctx, cw / 2 - w / 2, ch - 226, w, 30, 8); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(world.hint, cw / 2, ch - 206);
    ctx.textAlign = 'left';
  }

  // Controls reminder, fading out after the first minute.
  if (world.time < 60 && world.mode === 'playing' && !world.missions.dialogue) {
    ctx.globalAlpha = clamp(60 - world.time, 0, 1) * 0.8;
    ctx.fillStyle = 'rgba(8,12,22,0.6)';
    roundRect(ctx, 12, 100, 250, 118, 10); ctx.fill();
    ctx.fillStyle = '#dfe6f2';
    ctx.font = '12px system-ui, sans-serif';
    const lines = ['WASD / arrows — move & drive', 'Mouse — aim, click — shoot', 'E — enter / steal car, talk', 'Shift — sprint    Space — brake', 'P — pause    M — missions    H — help'];
    lines.forEach((l, i) => ctx.fillText(l, 24, 122 + i * 20));
    ctx.globalAlpha = 1;
  }

  drawMinimap(ctx, world, view);
}

export function drawMinimap(ctx, world, view) {
  const { cw, ch } = view;
  const size = 208;
  const mx = cw - size - 14, my = ch - size - 14 - (world.player.car ? 0 : 0);
  const scale = size / CITY_SIZE;
  ctx.fillStyle = 'rgba(8,12,22,0.72)';
  roundRect(ctx, mx - 6, my - 6, size + 12, size + 12, 10); ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.rect(mx, my, size, size);
  ctx.clip();
  // ground + beach
  ctx.fillStyle = '#33502e';
  ctx.fillRect(mx, my, size, size);
  ctx.fillStyle = '#c9b078';
  ctx.fillRect(mx, my + 3040 * scale, 1000 * scale, 160 * scale);
  ctx.fillStyle = '#2f7fa8';
  ctx.fillRect(mx, my + 3150 * scale, 1000 * scale, 50 * scale);
  // roads
  ctx.fillStyle = '#767c86';
  for (const rx of [200, 600, 1000, 1400, 1800, 2200, 2600, 3000]) ctx.fillRect(mx + rx * scale - 2, my, 4, size);
  for (const ry of [200, 600, 1000, 1400, 1800, 2200, 2600, 3000]) ctx.fillRect(mx, my + ry * scale - 2, size, 4);
  // parks
  ctx.fillStyle = '#4e7a3f';
  for (const p of world.city.parks) ctx.fillRect(mx + p.x0 * scale, my + p.y0 * scale, (p.x1 - p.x0) * scale, (p.y1 - p.y0) * scale);
  // mission marker
  const mm = world.missions.missionMarker();
  if (mm) {
    const pulse = 4 + Math.sin(world.time * 5) * 1.5;
    ctx.fillStyle = mm.start ? '#ffd76e' : '#ff5d8f';
    ctx.beginPath(); ctx.arc(mx + mm.x * scale, my + mm.y * scale, pulse, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(mx + mm.x * scale, my + mm.y * scale, pulse + 3, 0, TAU); ctx.stroke();
  }
  // police blips
  ctx.fillStyle = '#2d7dff';
  for (const car of world.cars) {
    if (car.police && !car.dead) {
      ctx.beginPath(); ctx.arc(mx + car.x * scale, my + car.y * scale, 3.5, 0, TAU); ctx.fill();
    }
  }
  // gang blips
  ctx.fillStyle = '#c0392b';
  for (const ped of world.peds) {
    if (ped.gang && !ped.dead) {
      ctx.beginPath(); ctx.arc(mx + ped.x * scale, my + ped.y * scale, 2.5, 0, TAU); ctx.fill();
    }
  }
  // player arrow
  const p = world.player;
  const px = p.car ? p.car.x : p.x, py = p.car ? p.car.y : p.y;
  const ang = p.car ? p.car.angle : p.angle;
  ctx.save();
  ctx.translate(mx + px * scale, my + py * scale);
  ctx.rotate(ang);
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-5, -5); ctx.lineTo(-2, 0); ctx.lineTo(-5, 5); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
  // north + label
  ctx.restore();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.fillText('N', mx + size - 10, my + 12);
  ctx.fillStyle = '#9fb2cc';
  ctx.font = '10px system-ui, sans-serif';
  ctx.fillText('PALMERA BAY', mx, my - 10 + size + 12);
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

function wrapText(ctx, text, x, y, maxW, lh) {
  const words = text.split(' ');
  let line = '', yy = y;
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && line) { ctx.fillText(line, x, yy); line = w; yy += lh; }
    else line = test;
  }
  if (line) ctx.fillText(line, x, yy);
}

// --- full-screen menus ---
export function drawTitle(ctx, world, view) {
  const { cw, ch } = view;
  // Sun-soaked gradient sky + skyline silhouette behind the title.
  const g = ctx.createLinearGradient(0, 0, 0, ch);
  g.addColorStop(0, '#ff9e5e'); g.addColorStop(0.45, '#ff6b8a'); g.addColorStop(0.75, '#7a4a8c'); g.addColorStop(1, '#1c1440');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, cw, ch);
  ctx.fillStyle = '#ffd76e';
  ctx.beginPath(); ctx.arc(cw * 0.78, ch * 0.22, 54, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(20,16,48,0.85)';
  const base = ch * 0.82;
  for (let i = 0; i < 24; i++) {
    const bw = cw / 24;
    const h = 40 + ((i * 137) % 130);
    ctx.fillRect(i * bw, base - h, bw - 4, h);
  }
  ctx.fillStyle = 'rgba(20,16,48,0.55)';
  ctx.fillRect(0, base, cw, ch - base);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.fillText('A SUN-SOAKED OPEN-WORLD CRIME STORY  •  AN ORIGINAL GAME — NOTHING FROM ROCKSTAR GAMES', cw / 2, ch * 0.16);
  ctx.fillStyle = '#ffd76e';
  ctx.font = 'bold 84px system-ui, sans-serif';
  ctx.fillText('PALMERA BAY', cw / 2, ch * 0.30);
  ctx.fillStyle = '#fff';
  ctx.font = 'italic 22px Georgia, serif';
  ctx.fillText('Rico Vane owes $20,000 to the Marlin Crew. The Bay is his to take — or to die in.', cw / 2, ch * 0.37);
  const hasSave = !!world.saveSlot;
  const items = [
    (hasSave ? '▶  CONTINUE — ' + world.saveSlot.label : '▶  NEW GAME'),
    'HOW TO PLAY',
    'FREE ROAM (no missions)',
  ];
  const sel = world.menuSel || 0;
  items.forEach((t, i) => {
    const y = ch * 0.50 + i * 48;
    if (i === sel) {
      ctx.fillStyle = '#ffd76e';
      roundRect(ctx, cw / 2 - 260, y - 32, 520, 42, 10); ctx.fill();
      ctx.fillStyle = '#1c1440';
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
    }
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.fillText(t, cw / 2, y);
  });
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillText('WASD move & drive  •  Mouse aim, click shoot  •  E steal car / talk  •  Shift sprint  •  P pause  •  M missions', cw / 2, ch * 0.78);
  ctx.fillText('6 story missions  •  traffic & pedestrians  •  wanted levels & police chases  •  minimap  •  day & night  •  autosave', cw / 2, ch * 0.83);
  ctx.textAlign = 'left';
}

export function drawOverlay(ctx, world, view, title, lines, accent) {
  const { cw, ch } = view;
  ctx.fillStyle = 'rgba(6,8,18,0.72)';
  ctx.fillRect(0, 0, cw, ch);
  ctx.textAlign = 'center';
  ctx.fillStyle = accent || '#ffd76e';
  ctx.font = 'bold 56px system-ui, sans-serif';
  ctx.fillText(title, cw / 2, ch * 0.36);
  ctx.fillStyle = '#fff';
  ctx.font = '17px system-ui, sans-serif';
  lines.forEach((l, i) => ctx.fillText(l, cw / 2, ch * 0.44 + i * 28));
  ctx.fillStyle = '#9fb2cc';
  ctx.font = '14px system-ui, sans-serif';
  ctx.fillText('Press ENTER to continue', cw / 2, ch * 0.44 + lines.length * 28 + 30);
  ctx.textAlign = 'left';
}

export function drawPause(ctx, world, view) {
  drawOverlay(ctx, world, view, 'PAUSED', [
    'Mission: ' + (world.missions.index < MISSIONS.length ? MISSIONS[world.missions.index].title : 'Free roam'),
    'Cash: ' + fmtMoney(world.money) + '   •   Missions done: ' + world.missionsDone,
    'H — help    •    S — save now    •    P / Esc — resume',
  ], '#7ee7ff');
}

export function drawHelp(ctx, world, view) {
  const { cw, ch } = view;
  ctx.fillStyle = 'rgba(6,8,18,0.88)';
  ctx.fillRect(0, 0, cw, ch);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd76e';
  ctx.font = 'bold 34px system-ui, sans-serif';
  ctx.fillText('HOW TO PLAY', cw / 2, 70);
  ctx.fillStyle = '#fff';
  ctx.font = '16px system-ui, sans-serif';
  const lines = [
    'ON FOOT: WASD or arrows to walk, Shift to sprint. Mouse aims, click shoots the pistol.',
    'DRIVING: W accelerate, S brake / reverse, A D steer, Space handbrake. E exits the car.',
    'STEALING: walk up to any parked or slow car and press E. If a cop sees you, expect stars.',
    'WANTED: stars rise when you steal, shoot or hit people. Lose the cops by breaking line of sight,',
    'then hide until the stars fade. At 3+ stars, Bay PD sends interceptors and roadblocks.',
    'MISSIONS: follow the pink diamond on the map. Talk with E. Finish all six to become King of the Bay.',
    'COMBAT: gang members fight back. Your health regens slowly; grab red crosses to heal fast.',
    'SAVE: the game autosaves after every mission. Press S any time to save. Progress lives in this browser.',
    'SIDE HUSTLES: green cash bags pay $150, health kits heal, blue crates give armour. Taxis pay fares —',
    'steal a taxi and drive passengers to their marker for quick cash.',
  ];
  lines.forEach((l, i) => ctx.fillText(l, cw / 2, 120 + i * 30));
  ctx.fillStyle = '#9fb2cc';
  ctx.font = '14px system-ui, sans-serif';
  ctx.fillText('Press H or Esc to close', cw / 2, ch - 40);
  ctx.textAlign = 'left';
}

export function drawMissionList(ctx, world, view) {
  const { cw, ch } = view;
  ctx.fillStyle = 'rgba(6,8,18,0.88)';
  ctx.fillRect(0, 0, cw, ch);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd76e';
  ctx.font = 'bold 34px system-ui, sans-serif';
  ctx.fillText('MISSIONS — THE RICO VANE STORY', cw / 2, 70);
  MISSIONS.forEach((m, i) => {
    const y = 120 + i * 56;
    const done = i < world.missions.index;
    const cur = i === world.missions.index && world.missions.index < MISSIONS.length;
    ctx.fillStyle = done ? '#2ecc71' : cur ? '#ffd76e' : '#5a6a82';
    ctx.font = 'bold 18px system-ui, sans-serif';
    ctx.fillText((done ? '✓  ' : cur ? '▶  ' : '○  ') + (i + 1) + '. ' + m.title + '  —  $' + m.reward.toLocaleString('en-US'), cw / 2, y);
    ctx.fillStyle = '#c8d2e0';
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText(m.intro[0][1], cw / 2, y + 20);
  });
  ctx.fillStyle = '#9fb2cc';
  ctx.font = '14px system-ui, sans-serif';
  ctx.fillText('Press M or Esc to close', cw / 2, ch - 40);
  ctx.textAlign = 'left';
}
