import * as THREE from 'three';
import { clamp, lerp } from './util.js';

/* ═══════════════════════════════════════════════════════════
   The camera. The site does not walk a path — the eye
   is bolted at the front of the room and the chapters swap
   out behind the panel. Scroll still drives everything; it
   just drives *which* vignette is live and how far it has
   drifted toward you rather than where you are standing.

   Pointer parallax does the rest: a slow lean that keeps the
   still frame from reading as a flat image.
   ═══════════════════════════════════════════════════════════ */

const EYE = new THREE.Vector3(0, 0, 17);

export function createJourney(camera) {
  let target = 0;
  let progress = 0;
  let firstMoveDone = false;
  let onFirstMove = null;

  const ptr = { x: 0, y: 0, tx: 0, ty: 0 };
  const look = new THREE.Vector3();

  function maxScroll() {
    return Math.max(
      document.documentElement.scrollHeight - window.innerHeight,
      1
    );
  }

  function readScroll() {
    target = clamp(window.scrollY / maxScroll(), 0, 1);
    if (target > 0.004) fireFirstMove();
  }

  function fireFirstMove() {
    if (firstMoveDone) return;
    firstMoveDone = true;
    if (onFirstMove) onFirstMove();
  }

  window.addEventListener('scroll', readScroll, { passive: true });
  window.addEventListener('resize', readScroll);

  // Touch devices have no cursor to parallax with — pointermove still fires
  // on a tap, which would kick the frame sideways. Skip it there.
  const isTouch = matchMedia('(hover: none), (pointer: coarse)').matches;
  if (!isTouch) {
    window.addEventListener(
      'pointermove',
      (e) => {
        ptr.tx = (e.clientX / window.innerWidth) * 2 - 1;
        ptr.ty = (e.clientY / window.innerHeight) * 2 - 1;
      },
      { passive: true }
    );
  }

  readScroll();

  function jumpTo(p) {
    fireFirstMove();
    window.scrollTo({ top: clamp(p, 0, 1) * maxScroll(), behavior: 'smooth' });
  }

  /** Hard-set the walk (used by the debug renderer / tests). */
  function snap(p) {
    target = progress = clamp(p, 0, 1);
  }

  function update(dt) {
    // exponential smoothing: the readout stays weighty but responsive
    progress = lerp(progress, target, 1 - Math.pow(0.0015, dt));
    if (Math.abs(progress - target) < 0.00004) progress = target;

    ptr.x = lerp(ptr.x, ptr.tx, 1 - Math.pow(0.004, dt));
    ptr.y = lerp(ptr.y, ptr.ty, 1 - Math.pow(0.004, dt));

    const t = clamp(progress, 0, 1);

    // A very small drift down the room over the whole walk — enough that the
    // frame is never identical twice, not enough to lose the composition.
    camera.position.set(
      EYE.x + ptr.x * 0.85,
      EYE.y + -ptr.y * 0.55 + Math.sin(t * Math.PI * 2) * 0.18,
      EYE.z + t * 1.4
    );

    look.set(
      ptr.x * 1.15,
      -ptr.y * 0.7 - Math.sin(t * Math.PI) * 0.3,
      t * 6.5
    );
    camera.lookAt(look);

    // a whisper of roll so the parallax does not feel on rails
    camera.rotateZ(ptr.x * 0.014 + Math.sin(t * Math.PI * 2) * 0.006);
  }

  return {
    update,
    jumpTo,
    snap,
    get progress() {
      return progress;
    },
    get pointer() {
      return ptr;
    },
    setFirstMoveHook(fn) {
      onFirstMove = fn;
      if (firstMoveDone) fn();
    },
  };
}
