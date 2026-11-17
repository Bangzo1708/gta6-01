// Save / load through localStorage. Autosaves after every mission and on demand (S).
// A save holds money, health, position, mission progress, wanted level and the clock.
const KEY = 'palmera-bay-save-v1';

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || typeof s.money !== 'number') return null;
    return s;
  } catch (e) { return null; }
}

export function writeSave(world) {
  try {
    const p = world.player;
    const s = {
      money: world.money,
      health: p.health,
      ammo: p.ammo,
      x: p.car ? p.car.x : p.x,
      y: p.car ? p.car.y : p.y,
      missionIndex: world.missions.index,
      missionsDone: world.missionsDone,
      clock: world.clock,
      dayTime: world.dayTime,
      label: 'Mission ' + (world.missions.index + 1) + ' of 6 • ' + fmt(world.money),
      savedAt: Date.now(),
    };
    localStorage.setItem(KEY, JSON.stringify(s));
    return s;
  } catch (e) { return null; }
}

export function clearSave() {
  try { localStorage.removeItem(KEY); } catch (e) { /* storage unavailable */ }
}

function fmt(n) { return '$' + Math.floor(n).toLocaleString('en-US'); }
