// render.js — draws Palmera Bay from above: grass and asphalt, the beach and
// the sea, buildings with lit windows, palm trees, cars, people, bullets and
// smoke. The camera follows Leo and zooms out a little when he drives.

import { clamp, lerp } from './util.js';
import { WORLD_SIZE, PITCH, ROAD_W, BEACH_Y } from './city.js';
import { particleAlpha } from './entities.js';
import { missionMarker } from './missions.js';

export function createCamera() {
  return { x: 1600, y: 1600, zoom: 1, targetZoom: 1 };
}

export function updateCamera(state, dt) {
  const cam = state.camera;
  const player = state.player;
  cam.x = lerp(cam.x, player.x, 1 - Math.pow(0.001, dt));
  cam.y = lerp(cam.y, player.y, 1 - Math.pow(0.001, dt));
  cam.targetZoom = player.car ? 0.8 : 1.0;
  cam.zoom = lerp(cam.zoom, cam.targetZoom, 1 - Math.pow(0.01, dt));
  // Never show the void past the map edge: clamp the view inside the world.
  const halfW = (state.viewW || 1280) / 2 / cam.zoom;
  const halfH = (state.viewH || 800) / 2 / cam.zoom;
  cam.x = WORLD_SIZE <= halfW * 2 ? WORLD_SIZE / 2 : clamp(cam.x, halfW, WORLD_SIZE - halfW);
  cam.y = WORLD_SIZE <= halfH * 2 ? WORLD_SIZE / 2 : clamp(cam.y, halfH, WORLD_SIZE - halfH);
}

export function render(ctx, state, canvas) {
  const cam = state.camera;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-cam.x, -cam.y);

  drawGround(ctx, state);
  drawRoads(ctx, state);
  drawParks(ctx, state);
  drawBuildings(ctx, state);
  drawPalms(ctx, state);
  drawPickups(ctx, state);
  drawMissionMarker(ctx, state);
  drawPeds(ctx, state);
  drawCars(ctx, state);
  drawPlayer(ctx, state);
  drawBullets(ctx, state);
  drawParticles(ctx, state);

  ctx.restore();

  // Vignette: a soft dark edge so the sun-soaked centre pops.
  const vig = ctx.createRadialGradient(
    canvas.width / 2, canvas.height / 2, Math.min(canvas.width, canvas.height) * 0.42,
    canvas.width / 2, canvas.height / 2, Math.max(canvas.width, canvas.height) * 0.75);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(20,10,0,0.28)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Red hurt flash.
  if (state.player.hurtTimer > 0) {
    ctx.fillStyle = 'rgba(255,0,0,' + (state.player.hurtTimer * 0.25) + ')';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
}

function drawGround(ctx, state) {
  // Grass base for the whole map.
  ctx.fillStyle = '#69a85c';
  ctx.fillRect(0, 0, WORLD_SIZE, WORLD_SIZE);
  // Mow stripes: subtle alternating bands across the grass.
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  for (let y = 0; y < WORLD_SIZE; y += 160) {
    ctx.fillRect(0, y, WORLD_SIZE, 80);
  }
  // Beach sand and the sea along the south edge.
  ctx.fillStyle = '#e8d29a';
  ctx.fillRect(0, BEACH_Y, WORLD_SIZE, WORLD_SIZE - BEACH_Y);
  ctx.fillStyle = '#2f7fb8';
  ctx.fillRect(0, BEACH_Y + 170, WORLD_SIZE, WORLD_SIZE - BEACH_Y - 170);
  // Waves: light strokes where the sea meets the sand.
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 3;
  for (let x = 0; x < WORLD_SIZE; x += 90) {
    ctx.beginPath();
    ctx.moveTo(x, BEACH_Y + 168 + Math.sin(x * 0.02 + state.time * 1.4) * 4);
    ctx.lineTo(x + 44, BEACH_Y + 168 + Math.sin((x + 44) * 0.02 + state.time * 1.4) * 4);
    ctx.stroke();
  }
  // World border: a dark fence line so the edge reads.
  ctx.strokeStyle = '#2f3b2f';
  ctx.lineWidth = 8;
  ctx.strokeRect(0, 0, WORLD_SIZE, WORLD_SIZE);
}

function drawRoads(ctx, state) {
  const city = state.city;
  // Asphalt.
  ctx.fillStyle = '#3c3f45';
  for (const road of city.roads) ctx.fillRect(road.x, road.y, road.w, road.h);
  // Centre dashes.
  ctx.fillStyle = '#e8c93a';
  for (let c = 0; c <= WORLD_SIZE; c += PITCH) {
    for (let v = 0; v < WORLD_SIZE; v += 64) {
      ctx.fillRect(c - 2, v, 4, 30);
      ctx.fillRect(v, c - 2, 30, 4);
    }
  }
  // Sidewalk edge: light strips along each road.
  ctx.fillStyle = '#c9c2b4';
  for (let c = 0; c <= WORLD_SIZE; c += PITCH) {
    ctx.fillRect(c - ROAD_W / 2 - 10, 0, 10, WORLD_SIZE);
    ctx.fillRect(c + ROAD_W / 2, 0, 10, WORLD_SIZE);
    ctx.fillRect(0, c - ROAD_W / 2 - 10, WORLD_SIZE, 10);
    ctx.fillRect(0, c + ROAD_W / 2, WORLD_SIZE, 10);
  }
  // Crosswalks at intersections.
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  for (let cx = 0; cx <= WORLD_SIZE; cx += PITCH) {
    for (let cy = 0; cy <= WORLD_SIZE; cy += PITCH) {
      for (let i = -3; i <= 3; i++) {
        ctx.fillRect(cx + i * 12 - 4, cy - ROAD_W / 2 - 10, 8, 10);
        ctx.fillRect(cx + i * 12 - 4, cy + ROAD_W / 2, 8, 10);
      }
    }
  }
}

function drawParks(ctx, state) {
  for (const park of state.city.parks) {
    ctx.fillStyle = '#4e8a44';
    ctx.fillRect(park.x, park.y, park.w, park.h);
    ctx.fillStyle = '#6aa85e';
    ctx.beginPath();
    ctx.arc(park.x + park.w * 0.3, park.y + park.h * 0.4, 26, 0, Math.PI * 2);
    ctx.arc(park.x + park.w * 0.7, park.y + park.h * 0.6, 32, 0, Math.PI * 2);
    ctx.fill();
    // A pond in the bigger parks.
    if (park.w > 200) {
      ctx.fillStyle = '#5db3d8';
      ctx.beginPath();
      ctx.ellipse(park.x + park.w * 0.55, park.y + park.h * 0.35, 34, 20, 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  for (const lot of state.city.parkingLots) {
    ctx.fillStyle = '#565b63';
    ctx.fillRect(lot.x, lot.y, lot.w, lot.h);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      const px = lot.x + 24 + i * 52;
      ctx.strokeRect(px, lot.y + 20, 40, 70);
      ctx.strokeRect(px, lot.y + lot.h - 90, 40, 70);
    }
  }
}

function drawBuildings(ctx, state) {
  for (const b of state.city.buildings) {
    // Shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(b.x + 6, b.y + 8, b.w, b.h);
    // Walls.
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    // Roof inset.
    ctx.fillStyle = b.roof;
    ctx.fillRect(b.x + 6, b.y + 6, b.w - 12, b.h - 12);
    // Windows: a grid of lit and dark panes.
    const cols = Math.max(2, Math.floor(b.w / 26));
    const rows = Math.max(2, Math.floor(b.h / 26));
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const wx = b.x + 10 + i * ((b.w - 20) / cols);
        const wy = b.y + 10 + j * ((b.h - 20) / rows);
        const lit = ((i * 7 + j * 13 + b.x) % 5) < 2;
        ctx.fillStyle = lit ? '#ffe9a3' : '#2c3e50';
        ctx.fillRect(wx, wy, 10, 12);
      }
    }
    // Tall downtown towers get a height ring and a rooftop box.
    if (b.tall) {
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 3;
      ctx.strokeRect(b.x + 3, b.y + 3, b.w - 6, b.h - 6);
      ctx.fillStyle = '#7a6a5c';
      ctx.fillRect(b.x + b.w / 2 - 12, b.y + b.h / 2 - 10, 24, 20);
    }
    // Landmark sign.
    if (b.landmark && b.label) {
      ctx.fillStyle = '#1c2733';
      ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(b.label.toUpperCase(), b.x + b.w / 2, b.y - 8);
      ctx.textAlign = 'left';
    }
  }
}

function drawPalms(ctx, state) {
  for (const palm of state.city.palms) {
    const s = palm.s;
    ctx.strokeStyle = '#7a5a3a';
    ctx.lineWidth = 4 * s;
    ctx.beginPath();
    ctx.moveTo(palm.x, palm.y);
    ctx.lineTo(palm.x + 3 * s, palm.y - 16 * s);
    ctx.stroke();
    ctx.fillStyle = '#2e8b57';
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.5;
      ctx.moveTo(palm.x + 3 * s, palm.y - 16 * s);
      ctx.quadraticCurveTo(
        palm.x + 3 * s + Math.cos(a) * 14 * s, palm.y - 16 * s + Math.sin(a) * 14 * s,
        palm.x + 3 * s + Math.cos(a + 0.5) * 18 * s, palm.y - 16 * s + Math.sin(a + 0.5) * 18 * s);
    }
    ctx.fill();
    // Coconut dots.
    ctx.fillStyle = '#6b4a2a';
    ctx.beginPath();
    ctx.arc(palm.x + 3 * s, palm.y - 13 * s, 2.5 * s, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawPickups(ctx, state) {
  for (const p of state.pickups) {
    const bob = Math.sin(p.bob) * 3;
    if (p.kind === 'cash') {
      ctx.fillStyle = '#2ecc71';
      ctx.fillRect(p.x - 11, p.y - 7 + bob, 22, 14);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('$', p.x, p.y + 4 + bob);
      ctx.textAlign = 'left';
    } else {
      // Health kit: white box, red cross.
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(p.x - 11, p.y - 9 + bob, 22, 18);
      ctx.fillStyle = '#e74c3c';
      ctx.fillRect(p.x - 3, p.y - 7 + bob, 6, 14);
      ctx.fillRect(p.x - 8, p.y - 2 + bob, 16, 5);
    }
  }
}

function drawMissionMarker(ctx, state) {
  const marker = missionMarker(state);
  if (!marker) return;
  const pulse = 1 + 0.18 * Math.sin(state.time * 4);
  ctx.save();
  ctx.translate(marker.x, marker.y);
  ctx.scale(pulse, pulse);
  ctx.strokeStyle = '#ffd21f';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(0, 0, marker.radius * 0.55, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,210,31,0.12)';
  ctx.fill();
  // A floating diamond above the spot.
  ctx.fillStyle = '#ffd21f';
  ctx.beginPath();
  ctx.moveTo(0, -46);
  ctx.lineTo(10, -32);
  ctx.lineTo(0, -18);
  ctx.lineTo(-10, -32);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#1c2733';
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(marker.name.toUpperCase(), marker.x, marker.y - 56);
  ctx.textAlign = 'left';
}

function drawPeds(ctx, state) {
  for (const ped of state.peds) {
    ctx.save();
    ctx.translate(ped.x, ped.y);
    if (ped.dead) {
      // Fallen: a still shape on the ground.
      ctx.rotate(ped.angle + Math.PI / 2);
      ctx.fillStyle = ped.shirt;
      ctx.fillRect(-12, -5, 24, 10);
      ctx.fillStyle = ped.skin;
      ctx.beginPath();
      ctx.arc(15, 0, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      continue;
    }
    ctx.rotate(ped.angle);
    // Shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(0, 2, 12, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    // Body: shirt torso, head, hair.
    ctx.fillStyle = ped.shirt;
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = ped.skin;
    ctx.beginPath();
    ctx.arc(8, 0, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = ped.hair;
    ctx.beginPath();
    ctx.arc(6, -3, 5, Math.PI * 0.6, Math.PI * 1.9);
    ctx.fill();
    // Thugs wear a dark band so the player can spot the crew.
    if (ped.thug) {
      ctx.strokeStyle = '#e74c3c';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, 12, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Panic: a "!" above the head.
    if (ped.panic > 0) {
      ctx.rotate(-ped.angle);
      ctx.fillStyle = '#ff5252';
      ctx.font = 'bold 18px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('!', 0, -18);
      ctx.textAlign = 'left';
    }
    ctx.restore();
    // Health bar for hurt thugs.
    if (ped.hostile && ped.health < 100) {
      ctx.fillStyle = '#222';
      ctx.fillRect(ped.x - 14, ped.y - 24, 28, 5);
      ctx.fillStyle = '#e74c3c';
      ctx.fillRect(ped.x - 14, ped.y - 24, 28 * clamp(ped.health / 100, 0, 1), 5);
    }
  }
}

function drawCars(ctx, state) {
  for (const car of state.cars) {
    if (car.health === -999) {
      drawWreck(ctx, car);
      continue;
    }
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    // Shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(-car.w / 2 + 3, -car.h / 2 + 4, car.w, car.h);
    // Body.
    ctx.fillStyle = car.color;
    roundRect(ctx, -car.w / 2, -car.h / 2, car.w, car.h, 7);
    ctx.fill();
    // Cabin.
    ctx.fillStyle = 'rgba(20,30,40,0.85)';
    roundRect(ctx, -car.w * 0.18, -car.h / 2 + 3, car.w * 0.36, car.h - 6, 4);
    ctx.fill();
    // Windshield shine.
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(car.w * 0.12, -car.h / 2 + 4, 4, car.h - 8);
    // Headlights.
    ctx.fillStyle = '#fff8c9';
    ctx.fillRect(car.w / 2 - 2, -car.h / 2 + 3, 3, 5);
    ctx.fillRect(car.w / 2 - 2, car.h / 2 - 8, 3, 5);
    // Taxi checker / police livery.
    if (car.model === 'Taxi') {
      ctx.fillStyle = '#1c2733';
      for (let i = 0; i < 5; i++) ctx.fillRect(-car.w / 2 + 6 + i * 8, -2, 5, 4);
    }
    if (car.police) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-car.w / 2 + 2, -car.h / 2 + 2, car.w - 4, 6);
      ctx.fillRect(-car.w / 2 + 2, car.h / 2 - 8, car.w - 4, 6);
      // Flashing light bar.
      const flash = Math.floor(state.time * 6) % 2 === 0;
      ctx.fillStyle = flash ? '#ff2d2d' : '#2d7bff';
      ctx.fillRect(-6, -car.h / 2 - 2, 12, 5);
      ctx.fillStyle = flash ? '#2d7bff' : '#ff2d2d';
      ctx.fillRect(-6, car.h / 2 - 3, 12, 5);
    }
    ctx.restore();
    // Damage smoke is spawned by the car update, not drawn here.
    if (car.health < 40 && car.health > 0) {
      ctx.fillStyle = 'rgba(60,60,60,0.5)';
      ctx.beginPath();
      ctx.arc(car.x, car.y - 6, 8 + Math.sin(state.time * 9) * 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawWreck(ctx, car) {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  ctx.fillStyle = '#2b2b2b';
  roundRect(ctx, -car.w / 2, -car.h / 2, car.w, car.h, 7);
  ctx.fill();
  ctx.fillStyle = '#ff5e00';
  ctx.fillRect(-car.w / 4, -car.h / 2, car.w / 2, 4);
  ctx.restore();
}

function drawPlayer(ctx, state) {
  const player = state.player;
  if (player.car) return; // the car drawing shows the player
  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.rotate(player.angle);
  // Shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(0, 3, 13, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  // Leo: teal jacket, dark jeans, backwards cap.
  ctx.fillStyle = '#0f766e';
  ctx.beginPath();
  ctx.arc(0, 0, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f1c27d';
  ctx.beginPath();
  ctx.arc(9, 0, 6.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1c2733';
  ctx.beginPath();
  ctx.arc(7, -2, 6, Math.PI * 0.5, Math.PI * 1.8);
  ctx.fill();
  // Pistol in hand, pointing at the aim.
  ctx.fillStyle = '#222';
  ctx.fillRect(10, -2, 12, 4);
  ctx.restore();
  // Aim reticle at the mouse.
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(state.input.mouseWorldX, state.input.mouseWorldY, 9, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(state.input.mouseWorldX - 13, state.input.mouseWorldY);
  ctx.lineTo(state.input.mouseWorldX - 5, state.input.mouseWorldY);
  ctx.moveTo(state.input.mouseWorldX + 5, state.input.mouseWorldY);
  ctx.lineTo(state.input.mouseWorldX + 13, state.input.mouseWorldY);
  ctx.moveTo(state.input.mouseWorldX, state.input.mouseWorldY - 13);
  ctx.lineTo(state.input.mouseWorldX, state.input.mouseWorldY - 5);
  ctx.moveTo(state.input.mouseWorldX, state.input.mouseWorldY + 5);
  ctx.lineTo(state.input.mouseWorldX, state.input.mouseWorldY + 13);
  ctx.stroke();
}

function drawBullets(ctx, state) {
  ctx.fillStyle = '#ffe066';
  for (const b of state.bullets) {
    ctx.beginPath();
    ctx.arc(b.x, b.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawParticles(ctx, state) {
  for (const p of state.particles) {
    const alpha = particleAlpha(p);
    ctx.globalAlpha = alpha;
    if (p.kind === 'smoke') {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.kind === 'flash') {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
  }
  ctx.globalAlpha = 1;
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
