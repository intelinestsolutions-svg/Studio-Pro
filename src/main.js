import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { sampleSky, uiPhase } from './palette.js';
import { createSky } from './sky.js';
import { createWorld } from './world.js';
import { createJourney } from './journey.js';
import { createContent } from './content.js';
import { createLightbox } from './lightbox.js';
import { createChat } from './chat.js';
import { LOW_POWER } from './util.js';

document.body.classList.add('is-booting');

/* `?still=1` parks every CSS transition at its end value. Set it before any
   work happens so a chapter is complete on the first composited frame. */
if (new URLSearchParams(location.search).has('still')) {
  document.documentElement.classList.add('is-still');
}

const canvas = document.getElementById('stage-canvas');

/* ── renderer ───────────────────────────────────────────────────────
   A visitor with no WebGL must still get the whole site: every panel,
   every link, the form and the chat. The scene is optional; the story
   is not. So the renderer is probed first and everything below branches
   on whether we actually got one.
   ─────────────────────────────────────────────────────────────── */
let renderer = null;
try {
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: !LOW_POWER,
    powerPreference: 'high-performance',
    stencil: false,
  });
} catch (err) {
  console.error('[studio] WebGL unavailable, falling back to the document:', err);
  renderer = null;
}

/* ── scene & camera (only meaningful with a renderer) ─────────────── */
let scene = null;
let camera = null;
let sky = null;
let world = null;
let composer = null;
let bloom = null;

if (renderer) {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, LOW_POWER ? 1.5 : 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  // The world runs unlit: every material is MeshBasicMaterial, so there are no
  // shadow maps to maintain and ACES would only wash the blue out to pastel.
  // Keep the pipeline linear and let bloom do the shaping.
  renderer.shadowMap.enabled = false;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x060a14, 1);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x060a14);

  camera = new THREE.PerspectiveCamera(
    58,
    window.innerWidth / window.innerHeight,
    0.1,
    1500
  );
  camera.position.set(0, 0, 17);
} else {
  // No camera to drive — but journey still owns scroll progress and the
  // pointer, which is all the story layer needs.
  camera = new THREE.Object3D();
}

/* ── story layer — always on ──────────────────────────────────────── */
const journey = createJourney(camera);
const content = createContent(journey);
const lightbox = createLightbox();
const chat = createChat();

if (renderer) {
  sky = createSky(scene);
  world = createWorld(scene);

  /* ── post ───────────────────────────────────────────────────────── */
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  // Held fairly tight: blue on near-black clips to white very easily, and
  // the point of this design is that the *lines* stay crisp under the glow.
  bloom = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.62,
    0.62,
    0.22
  );
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
}

/* ── resize ───────────────────────────────────────────────────────── */
function resize() {
  if (!renderer) return;
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, LOW_POWER ? 1.5 : 2));
  renderer.setSize(w, h);
  composer.setSize(w, h);
  bloom.resolution.set(w, h);
}
window.addEventListener('resize', resize);
if (renderer) resize();

/* ── loop ─────────────────────────────────────────────────────────── */
let last = performance.now();
let booted = false;

function tick(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  const time = now / 1000;

  journey.update(dt);
  const state = sampleSky(journey.progress);
  content.update(journey.progress, state);

  if (!renderer) return;

  sky.update(state, time, camera, dt);
  world.update({
    time,
    camera,
    progress: journey.progress,
    pointer: journey.pointer,
  });

  // Phase drives the intensity: dark and restrained at boot, fully lit once
  // the site declares itself LIVE at the contact chapter.
  const lit = state.phase === 'live' ? 1 : state.phase === 'build' ? 0.82 : 0.68;
  bloom.strength = 0.42 + lit * 0.2;

  composer.render();
  finishBoot();
}

function frame(now) {
  tick(now);
  requestAnimationFrame(frame);
}

function finishBoot() {
  if (booted) return;
  booted = true;
  document.body.classList.remove('is-booting');
}

if (renderer) {
  requestAnimationFrame(frame);
} else {
  /* ── document-only fallback ───────────────────────────────────────
     No animation loop to wait on: the panels are driven straight off
     the scroll event, so the site is complete on the very first paint
     rather than after a frame that may never come.
     ────────────────────────────────────────────────────────────── */
  const paint = () => {
    tick(performance.now());
    finishBoot();
  };
  window.addEventListener('scroll', paint, { passive: true });
  window.addEventListener('resize', paint);
  document.body.classList.add('no-webgl');
  paint();
  // one more pass after layout settles (fonts, images, the walk height)
  setTimeout(paint, 120);
}

/* ── smooth-scroll the nav for browsers without it ───── */
document.documentElement.style.scrollBehavior = 'auto';

journey.setFirstMoveHook(() => {
  document.getElementById('hint')?.classList.add('is-gone');
});

/* ── deep-link to a moment in the build: /?p=0.54 ────────
   Useful for sharing a specific chapter, and for capture.
   Done synchronously: headless renderers may only ever produce a
   single animation frame, so waiting on rAF to land the scroll can
   mean the chapter never repaints. */
const startAt = parseFloat(new URLSearchParams(location.search).get('p') || '');
if (Number.isFinite(startAt)) {
  const p = Math.min(Math.max(startAt, 0), 1);
  const apply = () => {
    const max = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
    journey.snap(p);
    window.scrollTo({ top: p * max, behavior: 'instant' });
    content.update(journey.progress, sampleSky(journey.progress));
    document.getElementById('hint')?.classList.add('is-gone');
  };
  apply();
  // Re-apply once layout settles and again after load: a headless capture can
  // be taken from the very first composited frame, before the walk has height.
  if (document.readyState === 'complete') setTimeout(apply, 120);
  else window.addEventListener('load', () => setTimeout(apply, 120), { once: true });
}

// expose a tiny surface for poking at the scene from devtools
window.__studio = {
  scene,
  camera,
  renderer,
  composer,
  bloom,
  journey,
  world,
  sky,
  content,
  lightbox,
  chat,
  /** Jump the walk to `p` and draw exactly one frame. */
  renderAt(p) {
    journey.snap(p);
    tick(performance.now());
    return journey.progress;
  },
};

if (!renderer) finishBoot();
