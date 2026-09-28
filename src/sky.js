import * as THREE from 'three';
import { glowTexture, LOW_POWER, SCALE } from './util.js';

/* ═══════════════════════════════════════════════════════════
   The backdrop. No sun, no clouds, no daylight — the blueprint
   runs at night, on navy.

   Four things sit behind every vignette:
     · a perspective floor grid in wireframe blue that warms to
       gold on the final chapters
     · a slow starfield
     · drifting dust
     · one big blue bloom sitting behind the world, lifted toward
       the right where the sky is brightest
   ═══════════════════════════════════════════════════════════ */

const GRID_VERT = /* glsl */ `
  varying vec3 vW;
  void main() {
    vec4 w = modelMatrix * vec4( position, 1.0 );
    vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const GRID_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uAlt;
  uniform float uOpacity;
  uniform float uScale;
  uniform float uMix;
  varying vec3 vW;

  void main() {
    vec2 c = vW.xz / uScale;
    vec2 g = abs( fract( c - 0.5 ) - 0.5 ) / max( fwidth( c ), 1e-5 );
    float line = 1.0 - min( min( g.x, g.y ), 1.0 );

    // distance fade keeps the far plane from moiré-ing against the horizon
    float d = length( vW.xz );
    float fade = 1.0 - smoothstep( 18.0, 165.0, d );

    vec3 col = mix( uColor, uAlt, uMix );
    float a = line * uOpacity * fade;
    if ( a <= 0.002 ) discard;
    gl_FragColor = vec4( col, a );
  }
`;

export function createSky(scene) {
  const g = (n) => n * SCALE;

  /* ── floor grid ───────────────────────────────────────── */
  const gridMat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(0x2f6fd0) },
      uAlt: { value: new THREE.Color(0xffc800) },
      uOpacity: { value: 0.55 },
      uScale: { value: 6 },
      uMix: { value: 0 },
    },
    vertexShader: GRID_VERT,
    fragmentShader: GRID_FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const grid = new THREE.Mesh(new THREE.PlaneGeometry(600, 600, 1, 1), gridMat);
  grid.rotation.x = -Math.PI / 2;
  grid.position.y = -6.4;
  grid.renderOrder = -2;
  scene.add(grid);

  /* ── starfield ────────────────────────────────────────── */
  const STAR_N = Math.round(g(700));
  const starPos = new Float32Array(STAR_N * 3);
  for (let i = 0; i < STAR_N; i++) {
    const r = 150 + Math.random() * 120;
    const th = Math.random() * Math.PI * 2;
    const ph = Math.acos(2 * Math.random() - 1);
    starPos[i * 3] = r * Math.sin(ph) * Math.cos(th);
    starPos[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th) * 0.55;
    starPos[i * 3 + 2] = r * Math.cos(ph);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const stars = new THREE.Points(
    starGeo,
    new THREE.PointsMaterial({
      color: 0xd8e8ff,
      map: glowTexture(0.42),
      size: 1.7,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    })
  );
  scene.add(stars);

  /* ── drifting dust ────────────────────────────────────── */
  const DUST_N = Math.round(g(420));
  const dustPos = new Float32Array(DUST_N * 3);
  for (let i = 0; i < DUST_N; i++) {
    dustPos[i * 3] = (Math.random() * 2 - 1) * 34;
    dustPos[i * 3 + 1] = -6 + Math.random() * 20;
    dustPos[i * 3 + 2] = -30 + Math.random() * 34;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dust = new THREE.Points(
    dustGeo,
    new THREE.PointsMaterial({
      color: 0x9fd0ff,
      map: glowTexture(0.5),
      size: 0.42,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  scene.add(dust);

  /* ── the bloom sitting behind everything ──────────────── */
  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture(0.2),
      color: 0x1b57b5,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    })
  );
  glow.scale.setScalar(135);
  glow.position.set(34, 9, -46);
  glow.renderOrder = -3;
  scene.add(glow);

  let mixTarget = 0;
  let mix = 0;

  function update(state, time, camera, dt) {
    // the grid ships blue and goes gold once the site is "live"
    mixTarget = state.phase === 'live' ? 1 : 0;
    mix += (mixTarget - mix) * Math.min(1, dt * 1.4);
    gridMat.uniforms.uMix.value = mix;
    gridMat.uniforms.uOpacity.value = 0.55 + mix * 0.12;

    // floor rides the camera so the grid never runs out
    grid.position.x = camera.position.x;
    grid.position.z = camera.position.z;

    stars.rotation.y = time * 0.006;
    dust.rotation.y = Math.sin(time * 0.04) * 0.05;
    dust.position.y = Math.sin(time * 0.3) * 0.3;
    glow.material.opacity = 0.36 + 0.08 * Math.sin(time * 0.55);

    if (LOW_POWER) return;
  }

  return { update, grid, stars, dust, glow };
}
