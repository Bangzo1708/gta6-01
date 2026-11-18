// hud.js — everything drawn on top of the world: health and money, the wanted
// stars, the mission objective, the minimap, the dialog box, banners, and the
// title, pause, wasted and busted screens. All canvas-drawn so the screenshots
// show exactly what a player sees.

import { clamp, moneyString, clockString } from './util.js';
import { districtAt, WORLD_SIZE } from './city.js';
import { missionObjectiveText, missionMarker, MISSION_DEFS } from './missions.js';

export function drawHUD(ctx, state, canvas) {
  const w = canvas.width;
  const h = canvas.height;
  const player = state.player;

  // --- Top right: minimap -------------------------------------------------
  drawMinimap(ctx, state, w - 218, 16, 202, 202);

  // --- Top left: wanted stars ---------------------------------------------
  drawStars(ctx, state.wanted, 22, 22);

  // Location + clock, under the stars.
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(16, 52, 210, 46);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(districtAt(player.x, player.y), 24, 58);
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillStyle = '#ffd76a';
  ctx.fillText(clockString(state.timePlayed) + '   •   ' + state.missionsDone + '/' + MISSION_DEFS.length + ' jobs', 24, 78);

  // --- Bottom left: health + money ----------------------------------------
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(16, h - 96, 250, 80);
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText('LEO MARLOW', 26, h - 88);
  // Health bar.
  ctx.fillStyle = '#222';
  ctx.fillRect(26, h - 66, 180, 12);
  const hpFrac = clamp(player.health / player.maxHealth, 0, 1);
  ctx.fillStyle = hpFrac > 0.5 ? '#2ecc71' : hpFrac > 0.25 ? '#f39c12' : '#e74c3c';
  ctx.fillRect(26, h - 66, 180 * hpFrac, 12);
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.strokeRect(26, h - 66, 180, 12);
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(Math.ceil(player.health) + ' HP', 212, h - 68);
  // Money.
  ctx.font = 'bold 20px system-ui, sans-serif';
  ctx.fillStyle = '#7dff8a';
  ctx.fillText(moneyString(state.money), 26, h - 38);

  // --- Bottom right: vehicle / weapon --------------------------------------
  if (player.car) {
    const car = player.car;
    const kmh = Math.round(Math.abs(car.speed) * 0.32);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(w - 226, h - 96, 210, 80);
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(car.model.toUpperCase(), w - 216, h - 88);
    ctx.font = 'bold 26px system-ui, sans-serif';
    ctx.fillText(kmh + ' km/h', w - 216, h - 62);
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillStyle = '#ffd76a';
    ctx.fillText('E — exit car', w - 216, h - 28);
    // Car health.
    ctx.fillStyle = '#222';
    ctx.fillRect(w - 216, h - 44, 120, 6);
    ctx.fillStyle = car.health > 40 ? '#2ecc71' : '#e74c3c';
    ctx.fillRect(w - 216, h - 44, 120 * clamp(car.health / 100, 0, 1), 6);
  } else {
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(w - 226, h - 96, 210, 80);
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('PISTOL  ∞', w - 216, h - 88);
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillStyle = '#cfd8dc';
    ctx.fillText('Click — shoot    F — punch', w - 216, h - 66);
    ctx.fillText('E — enter car    Shift — run', w - 216, h - 44);
  }

  // --- Objective line, top centre ------------------------------------------
  const objective = missionObjectiveText(state);
  if (objective) {
    ctx.font = 'bold 16px system-ui, sans-serif';
    const tw = ctx.measureText(objective).width;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(w / 2 - tw / 2 - 16, 14, tw + 32, 30);
    ctx.fillStyle = '#ffd76a';
    ctx.textAlign = 'center';
    ctx.fillText(objective, w / 2, 22);
    ctx.textAlign = 'left';
  }

  // --- Next-mission hint ----------------------------------------------------
  if (!state.mission && state.missionIndex < MISSION_DEFS.length && state.mode === 'playing') {
    ctx.font = 'bold 15px system-ui, sans-serif';
    const msg = 'Press M to start the next job: ' + MISSION_DEFS[state.missionIndex].title;
    const tw = ctx.measureText(msg).width;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(w / 2 - tw / 2 - 14, 52, tw + 28, 28);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(msg, w / 2, 60);
    ctx.textAlign = 'left';
  }

  // --- Busted warning --------------------------------------------------------
  if (player.bustedTimer > 0.3 && state.mode === 'playing') {
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff5252';
    ctx.fillText('THE COPS ARE ON YOU — RUN!', w / 2, h - 120);
    ctx.textAlign = 'left';
  }

  // --- Banner -----------------------------------------------------------------
  if (state.banner && state.banner.t > 0) {
    const alpha = clamp(state.banner.t, 0, 1);
    ctx.globalAlpha = alpha;
    ctx.textAlign = 'center';
    ctx.font = 'bold 30px system-ui, sans-serif';
    const colors = { mission: '#ffd76a', success: '#7dff8a', wanted: '#ff5252', fail: '#ff5252', info: '#ffffff' };
    ctx.fillStyle = colors[state.banner.kind] || '#ffffff';
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.lineWidth = 5;
    ctx.strokeText(state.banner.text, w / 2, h * 0.28);
    ctx.fillText(state.banner.text, w / 2, h * 0.28);
    if (state.banner.sub) {
      ctx.font = '16px system-ui, sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.strokeText(state.banner.sub, w / 2, h * 0.28 + 36);
      ctx.fillText(state.banner.sub, w / 2, h * 0.28 + 36);
    }
    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;
  }

  // --- Dialog box ---------------------------------------------------------------
  if (state.dialog) {
    const line = state.dialog.lines[state.dialog.index];
    const boxH = 118;
    ctx.fillStyle = 'rgba(10,12,20,0.88)';
    ctx.fillRect(w / 2 - 330, h - boxH - 110, 660, boxH);
    ctx.strokeStyle = '#ffd76a';
    ctx.lineWidth = 2;
    ctx.strokeRect(w / 2 - 330, h - boxH - 110, 660, boxH);
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.fillStyle = '#ffd76a';
    ctx.fillText(line.who.toUpperCase(), w / 2 - 312, h - boxH - 84);
    ctx.font = '16px system-ui, sans-serif';
    ctx.fillStyle = '#ffffff';
    wrapText(ctx, line.text, w / 2 - 312, h - boxH - 58, 624, 22);
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillStyle = '#9aa5b1';
    ctx.textAlign = 'right';
    ctx.fillText('E / Click — continue', w / 2 + 312, h - 122);
    ctx.textAlign = 'left';
  }

  // --- Controls reminder (first minute) ----------------------------------------
  if (state.timePlayed < 45 && !state.dialog && state.mode === 'playing') {
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.textAlign = 'center';
    ctx.fillText('WASD move  •  Mouse aim  •  Click shoot  •  E enter car  •  M mission  •  P pause  •  H mute', w / 2, h - 12);
    ctx.textAlign = 'left';
  }
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  let line = '';
  let yy = y;
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, yy);
      line = word;
      yy += lineHeight;
    } else {
      line = test;
    }
  }
  ctx.fillText(line, x, yy);
}

function drawStars(ctx, wanted, x, y) {
  for (let i = 0; i < 5; i++) {
    drawStar(ctx, x + i * 26 + 11, y + 11, 11, i < wanted ? '#ffd21f' : 'rgba(255,255,255,0.25)');
  }
}

function drawStar(ctx, cx, cy, r, color) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const ang = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 === 0 ? r : r * 0.45;
    const px = cx + Math.cos(ang) * rad;
    const py = cy + Math.sin(ang) * rad;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

// --- Minimap -------------------------------------------------------------------
function drawMinimap(ctx, state, x, y, w, h) {
  const scale = w / WORLD_SIZE;
  ctx.save();
  ctx.fillStyle = 'rgba(8,12,18,0.82)';
  ctx.fillRect(x - 4, y - 4, w + 8, h + 8);
  ctx.strokeStyle = '#ffd76a';
  ctx.lineWidth = 2;
  ctx.strokeRect(x - 4, y - 4, w + 8, h + 8);
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();

  // Ground.
  ctx.fillStyle = '#3f6b4f';
  ctx.fillRect(x, y, w, h);
  // Beach + sea.
  const beachY = y + (3320 * scale);
  ctx.fillStyle = '#e8d29a';
  ctx.fillRect(x, beachY, w, h - (beachY - y));
  ctx.fillStyle = '#2f7fb8';
  ctx.fillRect(x, y + (3480 * scale), w, h - (3480 * scale - 0));
  // Roads.
  ctx.fillStyle = '#5a5a5a';
  for (let c = 0; c <= WORLD_SIZE; c += 400) {
    ctx.fillRect(x + c * scale - 2, y, 4, h);
    ctx.fillRect(x, y + c * scale - 2, w, 4);
  }
  // Downtown blocks.
  ctx.fillStyle = '#8a7a68';
  ctx.fillRect(x + 1200 * scale, y + 800 * scale, 1200 * scale, 1200 * scale);
  // Mission marker.
  const marker = missionMarker(state);
  if (marker) {
    const pulse = 5 + 3 * Math.sin(state.time * 5);
    ctx.fillStyle = '#ffd21f';
    ctx.beginPath();
    ctx.arc(x + marker.x * scale, y + marker.y * scale, pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  // Police blips (red/blue) and traffic (white dots).
  for (const car of state.cars) {
    if (car.health <= 0) continue;
    if (car.police) {
      ctx.fillStyle = (Math.floor(state.time * 4) % 2 === 0) ? '#ff4040' : '#4080ff';
      ctx.fillRect(x + car.x * scale - 3, y + car.y * scale - 3, 6, 6);
    }
  }
  // Player arrow.
  const px = x + state.player.x * scale;
  const py = y + state.player.y * scale;
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(state.player.angle);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(7, 0);
  ctx.lineTo(-5, -5);
  ctx.lineTo(-5, 5);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
  // North label.
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.fillText('N', x + 6, y + 14);
  ctx.restore();
}

// --- Screens -------------------------------------------------------------------

export function drawTitle(ctx, state, canvas) {
  const w = canvas.width;
  const h = canvas.height;
  // Sunset gradient sky over a drawn skyline.
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#ff9a56');
  grad.addColorStop(0.45, '#ff6b6b');
  grad.addColorStop(0.75, '#7b2d8b');
  grad.addColorStop(1, '#1c2733');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  // Sun.
  ctx.fillStyle = '#ffd76a';
  ctx.beginPath();
  ctx.arc(w * 0.72, h * 0.30, 64, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,215,106,0.25)';
  ctx.beginPath();
  ctx.arc(w * 0.72, h * 0.30, 92, 0, Math.PI * 2);
  ctx.fill();
  // Skyline silhouettes.
  ctx.fillStyle = 'rgba(20,16,32,0.85)';
  const buildings = [0.06, 0.16, 0.1, 0.22, 0.14, 0.26, 0.12, 0.2, 0.09, 0.24, 0.15];
  let bx = 0;
  const bw = w / buildings.length;
  for (const bh of buildings) {
    const height = h * bh * 2.2;
    ctx.fillRect(bx, h * 0.62 - height, bw * 0.86, height + h * 0.4);
    bx += bw;
  }
  // Palm silhouettes.
  ctx.strokeStyle = 'rgba(20,16,32,0.9)';
  ctx.lineWidth = 6;
  for (const px of [w * 0.12, w * 0.88, w * 0.3]) {
    ctx.beginPath();
    ctx.moveTo(px, h * 0.62);
    ctx.quadraticCurveTo(px + 8, h * 0.5, px + 26, h * 0.46);
    ctx.stroke();
  }
  // Title.
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 84px system-ui, sans-serif';
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 18;
  ctx.fillText('PALMERA BAY', w / 2, h * 0.30);
  ctx.font = 'bold 26px system-ui, sans-serif';
  ctx.fillStyle = '#ffd76a';
  ctx.fillText('AN OPEN-WORLD CRIME STORY', w / 2, h * 0.30 + 44);
  ctx.shadowBlur = 0;
  ctx.font = '17px system-ui, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText('Leo Marlow is home. The city owes him — and he intends to collect.', w / 2, h * 0.30 + 82);

  // Menu.
  const items = state.hasSave
    ? ['CONTINUE', 'NEW GAME', 'HOW TO PLAY']
    : ['NEW GAME', 'HOW TO PLAY'];
  const startY = h * 0.56;
  items.forEach((item, i) => {
    const selected = i === state.menuIndex;
    ctx.font = 'bold 24px system-ui, sans-serif';
    if (selected) {
      ctx.fillStyle = '#ffd76a';
      ctx.fillText('▸ ' + item, w / 2, startY + i * 46);
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillText(item, w / 2, startY + i * 46);
    }
  });
  ctx.font = '14px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillText('↑ ↓ choose   •   Enter select   •   WASD move, mouse aim, E enter car, M mission', w / 2, h - 36);
  ctx.textAlign = 'left';
}

export function drawHowTo(ctx, canvas) {
  const w = canvas.width;
  const h = canvas.height;
  ctx.fillStyle = 'rgba(8,10,16,0.92)';
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd76a';
  ctx.font = 'bold 34px system-ui, sans-serif';
  ctx.fillText('HOW TO PLAY', w / 2, 90);
  ctx.fillStyle = '#ffffff';
  ctx.font = '17px system-ui, sans-serif';
  const lines = [
    'WASD / Arrows — walk or drive (Shift to sprint, Space to handbrake)',
    'Mouse — aim on foot. Left click — shoot. F — punch.',
    'E — enter / steal a car, talk to people, grab the cash.',
    'M — start the next story mission. Follow the yellow marker.',
    'Stealing cars, hurting people and shooting cops raise your wanted level.',
    'Police cruisers chase you — lose them and the heat cools off.',
    'P / Esc — pause. H — mute. The game autosaves after every mission.',
    '',
    'Win the story: finish all four jobs for Eddie Voss and own the Bay.',
  ];
  lines.forEach((line, i) => ctx.fillText(line, w / 2, 150 + i * 34));
  ctx.font = '15px system-ui, sans-serif';
  ctx.fillStyle = '#9aa5b1';
  ctx.fillText('Esc / Enter — back to the title screen', w / 2, h - 60);
  ctx.textAlign = 'left';
}

export function drawPause(ctx, canvas) {
  const w = canvas.width;
  const h = canvas.height;
  ctx.fillStyle = 'rgba(8,10,16,0.72)';
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 44px system-ui, sans-serif';
  ctx.fillText('PAUSED', w / 2, h * 0.38);
  ctx.font = '17px system-ui, sans-serif';
  ctx.fillStyle = '#cfd8dc';
  ctx.fillText('P / Esc — resume      S — save game      H — mute      Q — quit to title', w / 2, h * 0.38 + 44);
  ctx.fillStyle = '#ffd76a';
  ctx.font = '15px system-ui, sans-serif';
  ctx.fillText('Progress autosaves after every mission. Your save lives in this browser.', w / 2, h * 0.38 + 78);
  ctx.textAlign = 'left';
}

export function drawEndScreen(ctx, state, canvas, kind) {
  const w = canvas.width;
  const h = canvas.height;
  ctx.fillStyle = kind === 'dead' ? 'rgba(40,4,4,0.82)' : 'rgba(4,10,40,0.82)';
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.fillStyle = kind === 'dead' ? '#ff5252' : '#6ea8ff';
  ctx.font = 'bold 72px system-ui, sans-serif';
  ctx.fillText(kind === 'dead' ? 'WASTED' : 'BUSTED', w / 2, h * 0.38);
  ctx.fillStyle = '#ffffff';
  ctx.font = '18px system-ui, sans-serif';
  const reason = kind === 'dead'
    ? 'Leo Marlow did not survive Palmera Bay.'
    : 'The Palmera Bay PD finally caught up with Leo.';
  ctx.fillText(reason, w / 2, h * 0.38 + 40);
  ctx.font = '16px system-ui, sans-serif';
  ctx.fillStyle = '#cfd8dc';
  ctx.fillText('Jobs done: ' + state.missionsDone + '    •    Money kept: ' + moneyString(Math.floor(state.money * 0.8)) + '    •    Time: ' + clockString(state.timePlayed), w / 2, h * 0.38 + 84);
  ctx.fillStyle = '#ffd76a';
  ctx.font = 'bold 20px system-ui, sans-serif';
  ctx.fillText('Enter — respawn at the hospital (keep 80% of your cash)', w / 2, h * 0.38 + 140);
  ctx.font = '15px system-ui, sans-serif';
  ctx.fillStyle = '#9aa5b1';
  ctx.fillText('Q — quit to the title screen', w / 2, h * 0.38 + 172);
  ctx.textAlign = 'left';
}
