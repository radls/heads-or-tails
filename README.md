# Heads or Tails

A photoreal 3D coin toss. Swipe the table to flip a rigid-body coin, then read heads or tails from how it actually lands. No accounts, no ads, no network calls after the page loads.

Live: [https://radls.github.io/heads-or-tails/](https://radls.github.io/heads-or-tails/)

## Run

```bash
npm install
npm run dev      # http://127.0.0.1:5173/
npm test         # unit tests
npm run build
npm run preview  # http://127.0.0.1:4180/
npm run verify   # unit tests, production build, 1,000-flip browser run
```

`GITHUB_PAGES=true` builds with the `/heads-or-tails/` base used on GitHub Pages. `npm run verify` sets that for the build and the preview. The end-to-end script needs Chrome at `/usr/bin/google-chrome`.

Coin relief maps live in `public/coins/` and are rebuilt with `npm run textures` only when the source art changes. Provenance stays in `assets-src/mint/sources.json` and `ASSETS.md`.

## Architecture

- `src/scene.js` — three.js stage. MeshPhysicalMaterial metals, runtime Sobel normal / roughness / AO maps from the relief, reeded edge geometry, a PMREM studio built from softbox planes, and a procedural wood, felt, or slate table. The camera sits on +Z. One shadow-casting light. The render loop stops when the coin is still.
- `src/physics.js` — Rapier, millimetres and grams, fixed 1/240 s steps. The face is the coin's local +Y in the world once it has been calm for 0.4 s (`src/face.js`).
- `src/audio.js` — WebAudio tones for the flick, the impacts, and the settle. No audio files.
- `src/ui.js`, `src/app.js` — menu, coin picker, history, settings, inspect mode, and `window.__hot` for tests. Settings and stats stay in `localStorage` under `heads-or-tails:`.
- `src/stats.js` — tallies, streaks, a 100-flip history, schema version, and safe parsing of corrupt storage.
- `src/coins.js` — the seven coins (diameters, mass, reeds, metal).

Random parts of a toss come from `crypto.getRandomValues` (`src/rng.js`). Fast mode runs the same steps back to back; only the wall clock changes.

## Bundle

Gzip sizes of the production JS and CSS (textures are loaded per coin, not inside the bundle):

<!-- gzip-start -->
Measured from `npm run build` with `GITHUB_PAGES=true`. See the table below after a local build; `npm run verify` prints the same files into `dist/`.
<!-- gzip-end -->
