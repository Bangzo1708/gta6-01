// input.js — keyboard and mouse state for Palmera Bay.
// Tracks held keys, edge-triggered presses (so one keypress = one action), and
// the mouse position in world coordinates (computed from the camera each frame).

export function createInput(canvas) {
  const input = {
    keys: new Set(),
    pressed: new Set(), // keys pressed since the last consumePress call
    mouseX: 0,
    mouseY: 0,
    mouseDown: false,
    mouseClicked: false, // left click edge, consumed the same way as keys
    mouseWorldX: 0,
    mouseWorldY: 0,
    anyKey: false,
  };

  const KEY_ALIASES = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  };

  function normalizeKey(event) {
    const k = event.key;
    if (KEY_ALIASES[k]) return KEY_ALIASES[k];
    if (k === ' ') return 'space';
    return k.length === 1 ? k.toLowerCase() : k.toLowerCase();
  }

  window.addEventListener('keydown', (event) => {
    const key = normalizeKey(event);
    if (['up', 'down', 'left', 'right', 'space'].includes(key)) event.preventDefault();
    if (!event.repeat) {
      input.keys.add(key);
      input.pressed.add(key);
      input.anyKey = true;
    }
  });
  window.addEventListener('keyup', (event) => {
    input.keys.delete(normalizeKey(event));
  });
  window.addEventListener('blur', () => {
    input.keys.clear();
  });

  canvas.addEventListener('mousemove', (event) => {
    const rect = canvas.getBoundingClientRect();
    input.mouseX = event.clientX - rect.left;
    input.mouseY = event.clientY - rect.top;
  });
  canvas.addEventListener('mousedown', (event) => {
    if (event.button === 0) {
      input.mouseDown = true;
      input.mouseClicked = true;
    }
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) input.mouseDown = false;
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  return input;
}

// True while the key is held down.
export function keyDown(input, key) {
  return input.keys.has(key);
}

// True once per physical press; consumes the press.
export function keyPressed(input, key) {
  if (input.pressed.has(key)) {
    input.pressed.delete(key);
    return true;
  }
  return false;
}

// True once per left click; consumes the click.
export function mouseClicked(input) {
  if (input.mouseClicked) {
    input.mouseClicked = false;
    return true;
  }
  return false;
}

// Clear all edge-triggered state at the end of a frame.
export function endFrame(input) {
  input.pressed.clear();
  input.mouseClicked = false;
  input.anyKey = false;
}

// Recompute the mouse position in world coordinates from the camera.
export function updateMouseWorld(input, camera, canvas) {
  const scaleX = canvas.width / canvas.clientWidth;
  const scaleY = canvas.height / canvas.clientHeight;
  const sx = (input.mouseX * scaleX - canvas.width / 2) / camera.zoom + camera.x;
  const sy = (input.mouseY * scaleY - canvas.height / 2) / camera.zoom + camera.y;
  input.mouseWorldX = sx;
  input.mouseWorldY = sy;
}
