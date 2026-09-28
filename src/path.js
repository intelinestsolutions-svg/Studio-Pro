import * as THREE from 'three';

/* ═══════════════════════════════════════════════════════════
   The build line. One curve feeds the glowing rail underfoot,
   the camera, and every station scatter pass, so the world
   always assembles along the line you actually travel.
   ═══════════════════════════════════════════════════════════ */

const CONTROL = [
  [0, 6],
  [2, -6],
  [5, -18],
  [3, -30],
  [-3, -41],
  [-7, -53],
  [-4, -65],
  [2, -76],
  [7, -88],
  [5, -100],
  [-1, -111],
  [-6, -123],
  [-4, -135],
  [2, -146],
  [4, -158],
];

/** Flat floor — the build happens on a level plane, not terrain. */
export function floorHeight() {
  return 0;
}

const points = CONTROL.map(([x, z]) => new THREE.Vector3(x, floorHeight(), z));

export const CURVE = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.5);
CURVE.arcLengthDivisions = 600;

export const PATH_LENGTH = CURVE.getLength();

/** Width of the glowing build rail, in metres. */
export const TRAIL_WIDTH = 3.0;

const _p = new THREE.Vector3();
const _t = new THREE.Vector3();

/** Position + lateral direction at normalised distance t (0..1). */
export function trailFrame(t, outPos = new THREE.Vector3(), outSide = new THREE.Vector3()) {
  const tt = Math.min(Math.max(t, 0), 1);
  CURVE.getPointAt(tt, outPos);
  CURVE.getTangentAt(tt, _t);
  outSide.set(-_t.z, 0, _t.x).normalize();
  return { pos: outPos, side: outSide };
}

/** Scatter helper: a point offset from the rail by `offset` metres. */
export function offsetFromTrail(t, offset) {
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  trailFrame(t, p, s);
  p.addScaledVector(s, offset);
  p.y = floorHeight();
  return p;
}

/** Build the walkable ribbon that hugs the floor. */
export function buildTrailGeometry(segments = 700) {
  const pos = new Float32Array((segments + 1) * 2 * 3);
  const uv = new Float32Array((segments + 1) * 2 * 2);
  const nrm = new Float32Array((segments + 1) * 2 * 3);
  const idx = new Uint32Array(segments * 6);

  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const half = TRAIL_WIDTH * 0.5;
  const vTiles = PATH_LENGTH / 5.5;

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    trailFrame(t, p, s);

    for (let k = 0; k < 2; k++) {
      const sign = k === 0 ? -1 : 1;
      const x = p.x + s.x * half * sign;
      const z = p.z + s.z * half * sign;
      const y = floorHeight(x, z) + 0.05;
      const o = (i * 2 + k) * 3;

      pos[o] = x;
      pos[o + 1] = y;
      pos[o + 2] = z;
      nrm[o] = 0;
      nrm[o + 1] = 1;
      nrm[o + 2] = 0;

      const uo = (i * 2 + k) * 2;
      uv[uo] = k;
      uv[uo + 1] = t * vTiles;
    }
  }

  for (let i = 0; i < segments; i++) {
    const a = i * 2;
    const o = i * 6;
    idx[o] = a;
    idx[o + 1] = a + 2;
    idx[o + 2] = a + 1;
    idx[o + 3] = a + 1;
    idx[o + 4] = a + 2;
    idx[o + 5] = a + 3;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeBoundingSphere();
  return geo;
}
