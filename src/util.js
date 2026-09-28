import * as THREE from 'three';

/* ═══════════════════════════════════════════════════════════
   Shared helpers: quality tier, the one procedural texture the
   world still needs, and the small maths the vignettes lean on.
   ═══════════════════════════════════════════════════════════ */

const smallScreen = Math.min(window.innerWidth, window.innerHeight) < 760;
const weakCPU = (navigator.hardwareConcurrency || 8) <= 4;

export const LOW_POWER = smallScreen || weakCPU;
export const SCALE = LOW_POWER ? 0.34 : 1;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;

export function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/* ── Canvas texture factory ─────────────────────────────── */
function canvasTexture(w, h, draw, { repeat = [1, 1], srgb = true } = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Soft radial sprite used for glows, flares and the beacon bloom. */
export function glowTexture(hardness = 0.18) {
  return canvasTexture(
    128,
    128,
    (ctx, w, h) => {
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(hardness, 'rgba(255,255,255,0.72)');
      g.addColorStop(0.45, 'rgba(255,255,255,0.18)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    },
    { srgb: false }
  );
}
