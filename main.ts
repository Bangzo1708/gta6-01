// Palmera Bay — the make.fun gta6-01 entry program (Node 22, standard library only).
//
// The game is this repository's game/ folder: a complete open-world crime game that
// plays offline in a desktop browser (game/index.html and its ES modules, no library,
// no network request). The program hands it in: it copies game/ and screenshots/ from
// beside this file to /output and writes /output/dossier.json, the summary the judge
// reads, with the vendored make.fun library (vendor/makefun-game.ts, copied byte for
// byte from the kit and never rewritten).
//
// What the game is: Rico Vane, a wheelman fresh out of lockup, owes $20,000 to the
// Marlin Crew and has one week in the sun-soaked city of Palmera Bay to pay it back.
// Six story missions, a city to explore on foot and by car, traffic and pedestrians,
// cars to steal, a five-star wanted system with police chases, combat, a HUD with a
// live minimap, day and night, synthesized sound and music, a start screen and a save.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// The program is deterministic: it copies files in sorted path order and the dossier
// builder writes canonical bytes, so running it twice writes identical bytes to /output.

import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const gameDir = join(here, 'game');
const shotsDir = join(here, 'screenshots');

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes;
// the others refuse an entry the scorer would refuse (more than 4 screenshots or one
// over 256 KiB; more than 993 files in game/ or 48 MiB of game files, in all, or a
// path under game/ over 1000 bytes: game/ counts beside /output's own 1000-entry cap,
// its screenshots/ and dossier.json).
const DOSSIER_CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

// A screenshot name the gate accepts: letters, digits and . _ -, 1 to 128 chars,
// never starting with . or -. The first by name is the cover.
const SHOT_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const SHOT_MAGIC = { png: [0x89, 0x50, 0x4e, 0x47], jpeg: [0xff, 0xd8, 0xff] };

function fail(message) {
  throw new Error(`main.ts: ${message}`);
}

function checkGameTree() {
  if (!existsSync(gameDir) || !lstatSync(gameDir).isDirectory()) fail('game/ is missing: the playable game lives in game/, its index.html at the root');
  const index = join(gameDir, 'index.html');
  if (!existsSync(index) || !lstatSync(index).isFile()) fail('game/index.html is missing');
  if (statSync(index).size > 1024 * 1024) fail('game/index.html is over the 1 MiB the gate allows');
  // Every entry under game/ must be a plain file or directory — no symlinks.
  const stack = [''];
  let entries = 0;
  let bytes = 0;
  while (stack.length > 0) {
    const rel = stack.pop();
    const dir = rel === '' ? gameDir : join(gameDir, rel);
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = rel === '' ? entry.name : `${rel}/${entry.name}`;
      entries += 1;
      if (entry.isSymbolicLink()) fail(`game/${path} is a symbolic link: game/ holds plain files and directories only`);
      if (entry.isDirectory()) { stack.push(path); continue; }
      if (!entry.isFile()) fail(`game/${path} is not a plain file`);
      bytes += statSync(join(gameDir, path)).size;
    }
  }
  if (entries > DOSSIER_CAPS.game_max_files) fail(`game/ holds ${entries} entries, over the ${DOSSIER_CAPS.game_max_files} the gate allows`);
  if (bytes > DOSSIER_CAPS.game_max_bytes) fail(`game/ is ${bytes} bytes, over the ${DOSSIER_CAPS.game_max_bytes} the gate allows`);
  return { entries, bytes };
}

function checkScreenshots() {
  if (!existsSync(shotsDir) || !lstatSync(shotsDir).isDirectory()) fail('screenshots/ is missing: 3 or 4 real renders of the game belong there');
  const names = readdirSync(shotsDir).filter((n) => !n.startsWith('.')).sort();
  if (names.length < 3 || names.length > DOSSIER_CAPS.screenshots.max) {
    fail(`screenshots/ holds ${names.length} images: the gate wants 3 or 4`);
  }
  for (const name of names) {
    if (!SHOT_NAME.test(name)) fail(`screenshots/${name}: a name the gate refuses (letters, digits and . _ -, not starting with . or -)`);
    const file = join(shotsDir, name);
    if (!lstatSync(file).isFile()) fail(`screenshots/${name} is not a plain file`);
    const bytes = readFileSync(file);
    if (bytes.length > DOSSIER_CAPS.screenshots.max_bytes) {
      fail(`screenshots/${name} is ${bytes.length} bytes, over the ${DOSSIER_CAPS.screenshots.max_bytes} the gate allows`);
    }
    const isPng = SHOT_MAGIC.png.every((b, i) => bytes[i] === b);
    const isJpeg = SHOT_MAGIC.jpeg.every((b, i) => bytes[i] === b);
    if (!isPng && !isJpeg) fail(`screenshots/${name} is neither a PNG nor a JPEG`);
  }
  return names;
}

// Copy a directory tree in sorted path order so the output is stable run to run.
function copyTreeSorted(src, dest) {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const from = join(src, entry.name);
    const to = join(dest, entry.name);
    if (entry.isDirectory()) copyTreeSorted(from, to);
    else if (entry.isFile()) cpSync(from, to);
    else fail(`${from} is not a plain file or directory`);
  }
}

// How many bytes of source the dossier's text would carry before its cap: source files
// are the ones buildDossier shows in full (a source extension, not under vendor/ and
// not a *.min.js). Over the cap the dossier cuts the tail off, so warn instead of
// discovering it on the leaderboard.
const SOURCE_EXT = ['.html', '.js', '.mjs', '.css', '.glsl', '.vert', '.frag', '.wgsl', '.json'];
function sourceTextBytes() {
  let total = 0;
  const stack = [''];
  while (stack.length > 0) {
    const rel = stack.pop();
    const dir = rel === '' ? gameDir : join(gameDir, rel);
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = rel === '' ? entry.name : `${rel}/${entry.name}`;
      if (entry.isDirectory()) {
        if (entry.name !== 'vendor') stack.push(path);
        continue;
      }
      const lower = entry.name.toLowerCase();
      if (lower.endsWith('.min.js') || lower.endsWith('.min.mjs') || lower.endsWith('.min.css')) continue;
      if (SOURCE_EXT.some((ext) => lower.endsWith(ext))) total += statSync(join(gameDir, path)).size;
    }
  }
  return total;
}

const game = checkGameTree();
const shots = checkScreenshots();

// Start from a clean output directory so a stale file can never ride along.
if (existsSync(out)) rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
copyTreeSorted(gameDir, join(out, 'game'));
copyTreeSorted(shotsDir, join(out, 'screenshots'));

// The dossier is built from the output itself, so it always matches what is handed in.
const dossier = buildDossier(out, DOSSIER_CAPS);
writeFileSync(join(out, 'dossier.json'), dossier);

const gameBytes = game.bytes;
const shotBytes = shots.reduce((n, name) => n + statSync(join(out, 'screenshots', name)).size, 0);
console.log(`Palmera Bay handed in: game/ ${game.entries} entries, ${gameBytes} bytes; ` +
  `screenshots/ ${shots.join(', ')} (${shotBytes} bytes); dossier.json ${dossier.length} bytes.`);
console.log(`Cover screenshot: ${shots[0]}. Output: ${resolve(out)}`);
const sourceBytes = sourceTextBytes();
if (sourceBytes > DOSSIER_CAPS.text_max_bytes) {
  console.log(`Note: the game's source is ${sourceBytes} bytes, over the dossier text cap of ` +
    `${DOSSIER_CAPS.text_max_bytes} — the dossier cuts the tail of the last source file.`);
} else {
  console.log(`Source text: ${sourceBytes} bytes, inside the dossier text cap.`);
}
