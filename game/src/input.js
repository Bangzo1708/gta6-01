// Keyboard + mouse state, with edge-triggered "just pressed" keys and a screen-space aim.
export class Input {
  constructor(canvas) {
    this.keys = {};
    this.pressed = {};
    this.mouseX = 0; this.mouseY = 0;
    this.mouseDown = false;
    this.mouseClicked = false;
    this.canvas = canvas;
    window.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'].includes(e.code)) e.preventDefault();
      if (!this.keys[e.code]) this.pressed[e.code] = true;
      this.keys[e.code] = true;
    });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    window.addEventListener('blur', () => { this.keys = {}; });
    canvas.addEventListener('mousemove', (e) => {
      const r = canvas.getBoundingClientRect();
      this.mouseX = e.clientX - r.left;
      this.mouseY = e.clientY - r.top;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) { this.mouseDown = true; this.mouseClicked = true; }
    });
    window.addEventListener('mouseup', (e) => { if (e.button === 0) this.mouseDown = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  down(code) { return !!this.keys[code]; }
  justPressed(code) { return !!this.pressed[code]; }
  anyMoveKey() {
    return this.down('KeyW') || this.down('KeyA') || this.down('KeyS') || this.down('KeyD') ||
      this.down('ArrowUp') || this.down('ArrowDown') || this.down('ArrowLeft') || this.down('ArrowRight');
  }
  endFrame() { this.pressed = {}; this.mouseClicked = false; }
}
