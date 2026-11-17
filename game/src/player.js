// The player: Rico Vane on foot and behind the wheel. Movement, driving physics,
// car theft, shooting, punching, the wanted system and police response — the core
// of the crime loop. All numbers tuned for a top-down chase camera.
import { clamp, dist, angleTo, turnToward, TAU } from './util.js';
import { CITY_SIZE, collideBuildings, pointInBuilding, nearestRoadPoint } from './city.js';
import { makePoliceCar, burst, scareNearbyPeds } from './entities.js';

export function createPlayer(x, y) {
  return {
    x, y, angle: -Math.PI / 2, speed: 0, moving: false,
    health: 100, armour: 0, money: 0,
    weapon: 'pistol', ammo: 60,
    car: null, shootCooldown: 0, punchCooldown: 0,
    invuln: 0, // brief grace after being busted/wasted respawn
  };
}

export function updatePlayer(world, dt) {
  const p = world.player;
  const input = world.input;
  p.shootCooldown = Math.max(0, p.shootCooldown - dt);
  p.punchCooldown = Math.max(0, p.punchCooldown - dt);
  p.invuln = Math.max(0, p.invuln - dt);
  if (p.car) updateDriving(world, dt);
  else updateOnFoot(world, dt);
  // Slow health regen out of combat.
  if (world.wanted === 0 && p.health < 100 && p.health > 0) p.health = Math.min(100, p.health + 2.5 * dt);
  // Wanted decay: hide out of sight and the heat fades.
  if (world.wanted > 0) {
    world.wantedTimer += dt;
    const nearestCop = nearestPoliceDist(world);
    if (nearestCop > 520 && world.wantedTimer > 6) {
      world.wantedHeat -= dt * 14;
      if (world.wantedHeat <= 0) {
        world.wantedHeat = 0;
        world.setWanted(Math.max(0, world.wanted - 1));
        world.wantedTimer = 0;
      }
    } else if (nearestCop <= 520) {
      world.wantedTimer = 0;
    }
  }
  // Wanted escalation spawns.
  maintainPolice(world, dt);
}

function updateOnFoot(world, dt) {
  const p = world.player;
  const input = world.input;
  let mx = 0, my = 0;
  if (input.down('KeyW') || input.down('ArrowUp')) my -= 1;
  if (input.down('KeyS') || input.down('ArrowDown')) my += 1;
  if (input.down('KeyA') || input.down('ArrowLeft')) mx -= 1;
  if (input.down('KeyD') || input.down('ArrowRight')) mx += 1;
  const sprint = input.down('ShiftLeft') || input.down('ShiftRight');
  const speed = sprint ? 235 : 150;
  p.moving = mx !== 0 || my !== 0;
  if (p.moving) {
    const len = Math.hypot(mx, my);
    p.x += (mx / len) * speed * dt;
    p.y += (my / len) * speed * dt;
  }
  // Aim at the mouse.
  const view = world.view;
  const wx = world.cam.x - view.cw / 2 + input.mouseX;
  const wy = world.cam.y - view.ch / 2 + input.mouseY;
  p.angle = angleTo(p.x, p.y, wx, wy);
  p.x = clamp(p.x, 30, CITY_SIZE - 30);
  p.y = clamp(p.y, 30, CITY_SIZE - 30);
  const hit = collideBuildings(world.city, p.x, p.y, 12);
  if (hit.hit) { p.x = hit.x; p.y = hit.y; }

  // Enter / steal a car.
  if (input.justPressed('KeyE')) {
    if (world.missions.dialogue) { world.missions.advanceDialogue(); return; }
    const car = nearestCar(world, p.x, p.y, 64);
    if (car) enterCar(world, car);
    else if (world.missions.active === false && world.missions.index < 6) {
      // Standing on a mission start marker starts the mission.
      const mm = world.missions.missionMarker();
      if (mm && mm.start && dist(p.x, p.y, mm.x, mm.y) < 130) world.missions.startMission(world.missions.index);
    }
  }
  // Shooting.
  if (input.mouseDown && p.shootCooldown <= 0 && p.weapon === 'pistol' && p.ammo > 0) {
    p.shootCooldown = 0.22;
    p.ammo--;
    fireBullet(world, p.x + Math.cos(p.angle) * 16, p.y + Math.sin(p.angle) * 16, p.angle, 900, 'player');
    if (world.sounds) world.sounds.shoot();
    world.shake = Math.max(world.shake, 2);
    scareNearbyPeds(world, p.x, p.y, 260);
    if (world.wanted < 2) world.addWanted(1);
  }
  // Melee punch with F.
  if (input.justPressed('KeyF') && p.punchCooldown <= 0) {
    p.punchCooldown = 0.45;
    if (world.sounds) world.sounds.punch();
    const tx = p.x + Math.cos(p.angle) * 30, ty = p.y + Math.sin(p.angle) * 30;
    for (const ped of world.peds) {
      if (!ped.dead && dist(ped.x, ped.y, tx, ty) < 34) damagePed(world, ped, 35, 'player');
    }
    burst(world, tx, ty, '#fff', 4, 60);
  }
  // Pickups.
  for (const pk of world.pickups) {
    if (pk.taken) continue;
    if (dist(p.x, p.y, pk.x, pk.y) < 30) collectPickup(world, pk);
  }
}

function updateDriving(world, dt) {
  const p = world.player;
  const car = p.car;
  const input = world.input;
  const fwd = input.down('KeyW') || input.down('ArrowUp');
  const back = input.down('KeyS') || input.down('ArrowDown');
  const left = input.down('KeyA') || input.down('ArrowLeft');
  const right = input.down('KeyD') || input.down('ArrowRight');
  const brake = input.down('Space');
  const accel = car.model.accel;
  if (fwd) car.speed += accel * dt;
  if (back) car.speed -= accel * 0.8 * dt;
  if (brake) car.speed *= Math.pow(0.02, dt);
  car.speed -= car.speed * 0.55 * dt; // drag + rolling resistance
  car.speed = clamp(car.speed, -car.model.top * 0.45, car.model.top);
  const steer = (left ? -1 : 0) + (right ? 1 : 0);
  const spd = Math.abs(car.speed) / car.model.top;
  if (steer !== 0 && spd > 0.02) {
    car.angle += steer * (1.9 + spd * 0.9) * dt * (car.speed < 0 ? -1 : 1) * (brake ? 1.35 : 1);
  }
  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  const hit = collideBuildings(world.city, nx, ny, 15);
  if (hit.hit) {
    car.x = hit.x; car.y = hit.y;
    if (Math.abs(car.speed) > 200) {
      car.health -= 8;
      burst(world, car.x, car.y, '#f39c12', 8, 140);
      world.shake = Math.max(world.shake, 5);
      if (world.sounds) world.sounds.noise(0.15, 0.2, 500);
    }
    car.speed *= -0.25;
  } else {
    car.x = clamp(nx, 30, CITY_SIZE - 30);
    car.y = clamp(ny, 30, CITY_SIZE - 30);
  }
  p.x = car.x; p.y = car.y; p.angle = car.angle;
  // Running over pedestrians is a crime — and it is noticed.
  for (const ped of world.peds) {
    if (ped.dead) continue;
    if (dist(ped.x, ped.y, car.x, car.y) < 26 && Math.abs(car.speed) > 60) {
      damagePed(world, ped, 200, 'car');
      burst(world, ped.x, ped.y, '#c0392b', 10, 120);
      world.addWanted(1);
      scareNearbyPeds(world, car.x, car.y, 300);
    }
  }
  // Bumping traffic.
  for (const o of world.cars) {
    if (o === car || o.dead || o.police) continue;
    if (dist(o.x, o.y, car.x, car.y) < 34 && Math.abs(car.speed) > 80) {
      o.speed = car.speed * 0.4;
      o.x += Math.cos(car.angle) * 10;
      o.y += Math.sin(car.angle) * 10;
      o.health -= 12;
      car.speed *= 0.8;
      car.health -= 4;
      burst(world, o.x, o.y, '#f1c40f', 6, 100);
      world.shake = Math.max(world.shake, 3);
      if (Math.random() < 0.4) world.addWanted(1);
    }
  }
  // Drive-by shooting.
  if (input.mouseDown && p.shootCooldown <= 0 && p.ammo > 0) {
    p.shootCooldown = 0.3;
    p.ammo--;
    const a = angleTo(car.x, car.y, world.cam.x - world.view.cw / 2 + input.mouseX, world.cam.y - world.view.ch / 2 + input.mouseY);
    fireBullet(world, car.x + Math.cos(a) * 24, car.y + Math.sin(a) * 24, a, 950, 'player');
    if (world.sounds) world.sounds.shoot();
    if (world.wanted < 2) world.addWanted(1);
  }
  // Exit the car.
  if (input.justPressed('KeyE')) {
    exitCar(world);
  }
  // Pickups while driving (cash bags are magnetic).
  for (const pk of world.pickups) {
    if (pk.taken) continue;
    if (dist(car.x, car.y, pk.x, pk.y) < 40) collectPickup(world, pk);
  }
  // Car wrecked.
  if (car.health <= 0 && !car.dead) {
    car.dead = true;
    burst(world, car.x, car.y, '#e67e22', 26, 220);
    burst(world, car.x, car.y, '#2c3e50', 18, 120);
    if (world.sounds) world.sounds.noise(0.5, 0.4, 900);
    world.shake = 10;
    exitCar(world, true);
  }
  if (world.sounds) world.sounds.setEngine(Math.abs(car.speed) / car.model.top, true);
}

export function enterCar(world, car) {
  const p = world.player;
  if (car.police) return; // police cruisers are locked
  if (car.driver === 'ai' || car.driver === 'none') {
    // Stealing: witnessed by nearby cops or pedestrians raises the heat.
    const copNear = nearestPoliceDist(world) < 420;
    const pedNear = world.peds.some((pd) => !pd.dead && dist(pd.x, pd.y, car.x, car.y) < 200);
    if (car.parked === false && (copNear || pedNear)) {
      world.addWanted(1);
      world.hint = 'STOLEN! Someone saw you — lose the cops!';
      world.hintT = 3;
    } else if (car.parked === false) {
      world.hint = car.model.name + ' — yours now. Drive!';
      world.hintT = 2.5;
    }
    car.parked = false;
    scareNearbyPeds(world, car.x, car.y, 180);
    if (world.sounds) world.sounds.blip(320, 0.1, 'square', 0.12);
  }
  car.driver = 'player';
  p.car = car;
  p.x = car.x; p.y = car.y;
  if (world.sounds) world.sounds.blip(520, 0.08, 'sine', 0.1);
}

export function exitCar(world, wrecked = false) {
  const p = world.player;
  const car = p.car;
  if (!car) return;
  car.driver = 'ai';
  car.speed = wrecked ? 0 : car.speed * 0.3;
  p.car = null;
  p.x = car.x + Math.cos(car.angle + Math.PI / 2) * 34;
  p.y = car.y + Math.sin(car.angle + Math.PI / 2) * 34;
  const hit = collideBuildings(world.city, p.x, p.y, 12);
  if (hit.hit) { p.x = hit.x; p.y = hit.y; }
  if (world.sounds) world.sounds.setEngine(0, false);
}

function nearestCar(world, x, y, maxD) {
  let best = null, bd = maxD;
  for (const car of world.cars) {
    if (car.dead || car.police) continue;
    const d = dist(x, y, car.x, car.y);
    if (d < bd) { bd = d; best = car; }
  }
  return best;
}

export function nearestPoliceDist(world) {
  let bd = Infinity;
  const p = world.player;
  const px = p.car ? p.car.x : p.x, py = p.car ? p.car.y : p.y;
  for (const car of world.cars) {
    if (!car.police || car.dead) continue;
    bd = Math.min(bd, dist(px, py, car.x, car.y));
  }
  for (const ped of world.peds) {
    if (ped.police && !ped.dead) bd = Math.min(bd, dist(px, py, ped.x, ped.y));
  }
  return bd;
}

function maintainPolice(world, dt) {
  const want = world.wanted;
  const policeCars = world.cars.filter((c) => c.police && !c.dead).length;
  const target = want === 0 ? 0 : want === 1 ? 1 : want === 2 ? 2 : want === 3 ? 3 : want === 4 ? 4 : 6;
  if (policeCars < target) {
    world.policeSpawnT -= dt;
    if (world.policeSpawnT <= 0) {
      world.policeSpawnT = 1.2;
      const p = world.player;
      const px = p.car ? p.car.x : p.x, py = p.car ? p.car.y : p.y;
      const a = Math.random() * TAU;
      const x = clamp(px + Math.cos(a) * 700, 80, CITY_SIZE - 80);
      const y = clamp(py + Math.sin(a) * 700, 80, CITY_SIZE - 80);
      const rp = nearestRoadPoint(x, y);
      const car = makePoliceCar(rp.x, rp.y, angleTo(rp.x, rp.y, px, py));
      world.cars.push(car);
      if (world.sounds) world.sounds.blip(880, 0.12, 'square', 0.1);
    }
  }
  // On-foot busted: a police car touching the player on foot at low speed busts them.
  if (!world.player.car && want > 0 && world.player.invuln <= 0) {
    const p = world.player;
    for (const car of world.cars) {
      if (car.police && !car.dead && dist(car.x, car.y, p.x, p.y) < 40 && Math.abs(car.speed) < 240) {
        world.bustPlayer();
        return;
      }
    }
  }
  // Wasted: police bullets and gang fire handled in main loop damage.
}

export function fireBullet(world, x, y, angle, speed, from) {
  world.bullets.push({ x, y, angle, speed, from, life: 1.1 });
}

export function damagePed(world, ped, dmg, from) {
  if (ped.dead) return;
  ped.health -= dmg;
  burst(world, ped.x, ped.y, '#c0392b', 6, 90);
  if (ped.health <= 0) {
    ped.dead = true;
    ped.state = 'down';
    if (ped.gang) {
      world.money += 50;
      if (Math.random() < 0.5) {
        const pk = { x: ped.x, y: ped.y, kind: 'cashbag', bob: 0, taken: false };
        world.pickups.push(pk);
      }
    } else {
      world.addWanted(1);
      scareNearbyPeds(world, ped.x, ped.y, 320);
    }
  } else if (ped.gang) {
    ped.state = 'flee';
    ped.panic = 1.5;
  } else {
    ped.state = 'flee';
    ped.panic = 4;
  }
  void from;
}

export function damagePlayer(world, dmg) {
  const p = world.player;
  if (p.invuln > 0 || world.mode !== 'playing') return;
  if (p.armour > 0) {
    const absorbed = Math.min(p.armour, dmg);
    p.armour -= absorbed;
    dmg -= absorbed;
  }
  p.health -= dmg;
  world.shake = Math.max(world.shake, 4);
  if (p.health <= 0) {
    p.health = 0;
    world.wastePlayer();
  }
}

function collectPickup(world, pk) {
  pk.taken = true;
  const p = world.player;
  if (pk.kind === 'cashbag') {
    world.money += 150;
    if (world.missions.active) world.missions.stepState.bags = (world.missions.stepState.bags || 0) + 1;
    if (world.sounds) world.sounds.cash();
    world.hint = '+$150 street cash';
    world.hintT = 1.6;
  } else if (pk.kind === 'health') {
    p.health = Math.min(100, p.health + 40);
    if (world.sounds) world.sounds.pickup();
    world.hint = '+40 health';
    world.hintT = 1.6;
  } else if (pk.kind === 'ammo') {
    p.ammo += 30;
    if (world.sounds) world.sounds.pickup();
    world.hint = '+30 ammo';
    world.hintT = 1.6;
  } else if (pk.kind === 'armour') {
    p.armour = 100;
    if (world.sounds) world.sounds.pickup();
    world.hint = 'Armour equipped';
    world.hintT = 1.6;
  }
  burst(world, pk.x, pk.y, '#f1c40f', 8, 100);
}
