/* ═══════════════════════════════════════════════════════════
   Blueprint palette and chapter map.

   Concept A · The Build: a wireframe-blue grid on night navy,
   with gold for anything that has shipped. The chapter map
   drives three things: the HUD readout in the corner, the
   body[data-phase] token that re-tints the chrome, and the
   vignette windows in world.js.
   ═══════════════════════════════════════════════════════════ */

export const COL = {
  bg: 0x060a14,
  /* structure — everything the visitor is meant to read around */
  blue: 0x2f6fd0,
  blueHot: 0x5fb2ff,
  blueDeep: 0x0d2a5c,
  blueAbyss: 0x081c3d,
  /* signal — the gold that marks what is done and what matters */
  gold: 0xffc800,
  cyan: 0x5fb2ff,
  magenta: 0xffb024,
  red: 0xe85d75,
  ink: 0xf6f9ff,
};

/** The particle/cloud palette used by every vignette point cloud. */
export const PAL = [
  [0x2f, 0x6f, 0xd0],
  [0x5f, 0xb2, 0xff],
  [0xff, 0xc8, 0x00],
  [0x0d, 0x2a, 0x5c],
  [0xf6, 0xf9, 0xff],
];

/* Each chapter owns a slice of the walk. `from`/`to` match the data-from /
   data-to on the matching .panel in index.html — keep the two in step.
   `name` is the HUD readout: the act the site is in, not the chapter —
   the chapter already has a pill of its own in the top nav. */
const CHAPTERS = [
  { from: 0.0, to: 0.105, name: 'BLUEPRINT', phase: 'boot' },
  { from: 0.14, to: 0.265, name: 'WIREFRAME', phase: 'wire' },
  { from: 0.31, to: 0.44, name: 'WIREFRAME', phase: 'wire' },
  { from: 0.48, to: 0.615, name: 'BUILD', phase: 'build' },
  { from: 0.65, to: 0.775, name: 'BUILD', phase: 'build' },
  { from: 0.81, to: 0.925, name: 'LIVE', phase: 'live' },
  { from: 0.955, to: 1.0, name: 'LIVE', phase: 'live' },
];

const state = {
  name: CHAPTERS[0].name,
  phase: CHAPTERS[0].phase,
  chapter: 0,
  exp: 1,
  star: 1,
  glow: 1,
};

export function chapterAt(p) {
  let i = 0;
  for (let k = 0; k < CHAPTERS.length; k++) if (p >= CHAPTERS[k].from - 0.02) i = k;
  return i;
}

/**
 * HUD readout for the current moment in the walk. Returns a stable string so
 * the label only re-renders when the chapter actually changes.
 */
export function sampleSky(p) {
  const i = chapterAt(p);
  if (i !== state.chapter) {
    state.chapter = i;
    state.name = CHAPTERS[i].name;
    state.phase = CHAPTERS[i].phase;
  }
  return state;
}

/** Overall act of the story, used for the body[data-phase] token. */
export function uiPhase(p) {
  return CHAPTERS[chapterAt(p)].phase;
}

/** Copy of the chapter table — world.js lines its vignettes up against this. */
export const chapterWindows = CHAPTERS.map((c) => ({ from: c.from, to: c.to }));
