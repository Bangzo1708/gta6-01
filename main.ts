// Palmera Bay — a gta6-01 entry (Node 22, standard library only).
//
// The game is this repository's game/ folder: plain static files a desktop
// browser loads offline (game/index.html and its ES modules, no library and no
// network request). This program hands it in: it copies game/ and screenshots/
// from beside this file to /output and writes /output/dossier.json, the summary
// the judge reads, with the vendored make.fun library.
//
// Serve the game locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// The program runs twice and both runs must write the same bytes, so it does
// nothing time- or order-dependent: it copies the same files in the same order
// and lets buildDossier do the only writing that could vary (it cannot — the
// dossier is a pure function of the copied files).

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = resolve(process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

// The gate's own caps, from the kit's reference/gate.json. The program refuses
// to hand in an entry the scorer would refuse, instead of writing it and
// hoping: too many screenshots, one over 256 KiB, or a game/ over its file or
// byte budget all fail here, loudly, before any output is written.
const LIMITS = {
  textMaxBytes: 163840,
  maxScreenshots: 4,
  maxScreenshotBytes: 262144,
  maxGameFiles: 993,
  maxGameBytes: 50331648,
  maxGamePathBytes: 1000,
};

function fail(message) {
  throw new Error('palmera-bay main.ts: ' + message);
}

function countGameFiles(dir, prefix) {
  let files = 0;
  let bytes = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    const rel = prefix ? prefix + '/' + entry.name : entry.name;
    if (Buffer.byteLength(rel, 'utf8') > LIMITS.maxGamePathBytes) {
      fail('game path over 1000 bytes: ' + rel);
    }
    if (entry.isDirectory()) {
      files += 1;
      const sub = countGameFiles(path, rel);
      files += sub.files;
      bytes += sub.bytes;
    } else if (entry.isFile()) {
      files += 1;
      bytes += statSync(path).size;
    } else {
      fail('game/ holds a non-file, non-directory entry: ' + rel);
    }
  }
  return { files, bytes };
}

function checkScreenshots(dir) {
  if (!existsSync(dir)) fail('screenshots/ is missing from the repository');
  const names = readdirSync(dir)
    .filter((name) => !name.startsWith('.'))
    .sort();
  if (names.length < 3 || names.length > LIMITS.maxScreenshots) {
    fail('screenshots/ must hold 3 or 4 images, found ' + names.length);
  }
  for (const name of names) {
    if (!/^[A-Za-z0-9._-]+$/.test(name) || name.startsWith('-')) {
      fail('bad screenshot name: ' + name);
    }
    const size = statSync(join(dir, name)).size;
    if (size > LIMITS.maxScreenshotBytes) {
      fail('screenshot over 256 KiB: ' + name + ' (' + size + ' bytes)');
    }
  }
  return names;
}

function main() {
  const gameDir = join(here, 'game');
  const shotsDir = join(here, 'screenshots');
  if (!existsSync(join(gameDir, 'index.html'))) fail('game/index.html is missing');
  // index.html has its own gate cap (1 MiB); check it before copying anything.
  const indexSize = statSync(join(gameDir, 'index.html')).size;
  if (indexSize > 1048576) fail('game/index.html is ' + indexSize + ' bytes, over the 1 MiB cap');
  const game = countGameFiles(gameDir, '');
  if (game.files > LIMITS.maxGameFiles) {
    fail('game/ holds ' + game.files + ' files and directories, over the 993 cap');
  }
  if (game.bytes > LIMITS.maxGameBytes) {
    fail('game/ is ' + game.bytes + ' bytes, over the 48 MiB cap');
  }
  const shots = checkScreenshots(shotsDir);

  mkdirSync(out, { recursive: true });
  cpSync(gameDir, join(out, 'game'), { recursive: true });
  mkdirSync(join(out, 'screenshots'), { recursive: true });
  cpSync(shotsDir, join(out, 'screenshots'), { recursive: true });

  writeFileSync(
    join(out, 'dossier.json'),
    buildDossier(out, {
      text_max_bytes: LIMITS.textMaxBytes,
      screenshots: { max: LIMITS.maxScreenshots, max_bytes: LIMITS.maxScreenshotBytes },
      game_max_files: LIMITS.maxGameFiles,
      game_max_bytes: LIMITS.maxGameBytes,
      game_path_max_bytes: LIMITS.maxGamePathBytes,
    }),
  );
  // The dossier has its own gate cap (1.5 MiB); refuse to hand in an
  // over-size one instead of letting the scorer refuse the entry.
  const dossierSize = statSync(join(out, 'dossier.json')).size;
  if (dossierSize > 1572864) fail('dossier.json is ' + dossierSize + ' bytes, over the 1.5 MiB cap');

  // A one-line receipt on stdout, so a human running it sees what was handed in.
  console.log(
    'palmera-bay: game/ ' + game.files + ' entries, ' + game.bytes + ' bytes; ' +
    'screenshots ' + shots.join(', ') + '; dossier written to ' + join(out, 'dossier.json'),
  );
}

main();
