// save.js — save and load for Palmera Bay, kept in localStorage.
// A save holds the story progress, money, health, position, owned car and the
// clock. The game autosaves after every finished mission and on the pause menu.

const SAVE_KEY = 'palmera-bay-save-v1';

export function hasSave() {
  try {
    return window.localStorage.getItem(SAVE_KEY) !== null;
  } catch (err) {
    return false;
  }
}

export function writeSave(state) {
  const data = {
    version: 1,
    savedAt: new Date().toISOString(),
    money: Math.floor(state.money),
    health: Math.round(state.player.health),
    missionIndex: state.missionIndex,
    missionsDone: state.missionsDone,
    timePlayed: Math.floor(state.timePlayed),
    kills: state.stats.kills,
    carsStolen: state.stats.carsStolen,
    playerX: Math.round(state.player.x),
    playerY: Math.round(state.player.y),
    playerAngle: state.player.angle,
    wanted: state.wanted,
    car: state.player.car ? {
      model: state.player.car.model,
      color: state.player.car.color,
      health: Math.round(state.player.car.health),
    } : null,
  };
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch (err) {
    return false;
  }
}

export function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.version !== 1) return null;
    return data;
  } catch (err) {
    return null;
  }
}

export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch (err) {
    // Saving is optional; the game plays on without it.
  }
}
