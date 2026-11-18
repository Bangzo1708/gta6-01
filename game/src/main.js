// main.js — boots Palmera Bay: finds the canvas, creates the game, starts the
// frame loop, and resizes the canvas to the window. The ?shot= scenes (see
// shots.js) are set up here so screenshots render the game, not the menu.

import { createGame, tick } from './game.js';
import { readShotParams, setupShot } from './shots.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

function resizeCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(canvas.clientWidth * dpr);
  canvas.height = Math.floor(canvas.clientHeight * dpr);
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

const game = createGame(canvas);
// Debug hook: lets automated play-tests inspect the live state.
window.__palmeraGame = game;
const { shot, seed } = readShotParams();
if (shot) {
  setupShot(game.state, shot, seed);
}

let lastTime = performance.now();

function frame(now) {
  const dt = (now - lastTime) / 1000;
  lastTime = now;
  tick(game, canvas, ctx, dt);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
