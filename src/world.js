import * as THREE from 'three';
import { COL, PAL } from './palette.js';
import { clamp, lerp, smoothstep, glowTexture, LOW_POWER, SCALE } from './util.js';

/* ═══════════════════════════════════════════════════════════════════════
   TERMINAL CYBER — the 3D world.

   Instead of one model walked end to end, there are seven vignettes, one
   per chapter, each seated behind the panel it belongs to. The camera is
   bolted in place; a vignette fades up as its window opens, drifts toward
   you while you read, and fades out again. Scroll position decides which
   one is live.

   The panel windows below come straight from index.html — kept in sync by
   reading the DOM rather than hard-coding twice.
   ═══════════════════════════════════════════════════════════════════════ */

const PAD = 0.055; // how far each vignette bleeds past its panel window
const GROW = [4.6, 3.9, 3.4, 3.1, 2.9, 2.7, 2.5]; // base radius per chapter

export function createWorld(scene) {
  const g = (n) => Math.round(n * SCALE);

  /* ────────────────────────────────────────────────────────────────────
     shared materials + helpers
     ──────────────────────────────────────────────────────────────────── */

  function mat(color, opacity = 1, blend = 'normal') {
    return new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      blending:
        blend === 'add'
          ? THREE.AdditiveBlending
          : blend === 'sub'
            ? THREE.SubtractiveBlending
            : THREE.NormalBlending,
      depthWrite: false,
    });
  }

  function mesh(geo, color, opacity = 1, blend = 'normal') {
    return new THREE.Mesh(geo, mat(color, opacity, blend));
  }

  /** Concentric wire hoops — the recurring "core" silhouette. */
  function rings(radius, color, opacity = 0.4, count = 3) {
    const grp = new THREE.Group();
    for (let i = 0; i < count; i++) {
      const r = (radius * (1 + i * 0.36)) / (1 + i * 0.05);
      const m = new THREE.Mesh(
        new THREE.TorusGeometry(r, 0.018, 6, 96),
        mat(color, opacity * (1 - i * 0.22), 'add')
      );
      m.userData.spin = (i % 2 ? -1 : 1) * (0.1 + i * 0.07);
      grp.add(m);
    }
    return grp;
  }

  /** A point cloud, optionally recoloured per particle from PAL. */
  function makePoints(positions, size, opacity, blend, palette) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    if (palette) {
      const col = new Float32Array(positions.length);
      for (let i = 0; i < positions.length; i += 3) {
        const c = PAL[(i / 3) % PAL.length];
        col[i] = c[0] / 255;
        col[i + 1] = c[1] / 255;
        col[i + 2] = c[2] / 255;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    }
    return new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        size,
        transparent: true,
        opacity,
        depthWrite: false,
        vertexColors: !!palette,
        blending: blend === 'add' ? THREE.AdditiveBlending : THREE.NormalBlending,
        sizeAttenuation: true,
      })
    );
  }

  /* ── raster glyphs (digits / code), drawn to a canvas ────────────── */

  function glyphTexture(cols, rows, hue, density = 0.5) {
    const cw = 16;
    const canvas = document.createElement('canvas');
    canvas.width = cols * cw;
    canvas.height = rows * cw;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(0,0,0,0)';
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = `600 ${cw - 3}px "IBM Plex Mono", monospace`;
    ctx.textBaseline = 'top';
    const glyphs = '0123456789ABCDEF#<>/\\{}[];:.';
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (Math.random() > density) continue;
        ctx.fillStyle = hue;
        ctx.globalAlpha = 0.25 + Math.random() * 0.75;
        ctx.fillText(glyphs[(Math.random() * glyphs.length) | 0], x * cw, y * cw);
      }
    }
    ctx.globalAlpha = 1;
    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    return tex;
  }

  /** Vertical curtain of code — texture scrolls downward behind a plane. */
  function makeGlyphs(w, h, color, cols = 26, rows = 40, density = 0.42) {
    const tex = glyphTexture(cols, rows, color, density);
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      })
    );
    m.userData.tex = tex;
    m.userData.rows = rows;
    return m;
  }

  function fallGlyphs(glyphs, t, speed = 0.075) {
    if (!glyphs || !glyphs.userData.tex) return;
    glyphs.userData.tex.offset.y = -(t * speed) % 1;
  }

  /* ── a wireframe sine surface ────────────────────────────────────── */

  function makeWave(w, h, color, amp = 1.6, seg = 12, opacity = 0.55) {
    const geo = new THREE.PlaneGeometry(20, w, 40, seg);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      pos.setZ(i, Math.sin(x * 0.42 + y * 0.34) * amp);
    }
    geo.computeVertexNormals();
    const m = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({
        color,
        wireframe: true,
        transparent: true,
        opacity,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    m.rotation.x = -Math.PI / 2;
    m.userData.geo = geo;
    m.userData.amp = amp;
    m.userData.base = Float32Array.from(pos.array);
    return m;
  }

  function updateWave(wave, t) {
    const geo = wave.userData.geo;
    const pos = geo.attributes.position;
    const base = wave.userData.base;
    const amp = wave.userData.amp;
    for (let i = 0; i < pos.count; i++) {
      const x = base[i * 3];
      const y = base[i * 3 + 1];
      pos.setZ(i, Math.sin(x * 0.42 + y * 0.34 + t * 1.5) * amp);
    }
    pos.needsUpdate = true;
  }

  /* ── printed circuit board: traces that light up ─────────────────── */

  function makeCircuit(size, color, count = 18) {
    const grp = new THREE.Group();
    const pts = [];
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const r0 = size * (0.25 + Math.random() * 0.35);
      const r1 = size * (0.62 + Math.random() * 0.4);
      pts.push([
        new THREE.Vector3(Math.cos(a) * r0, Math.sin(a) * r0, 0),
        new THREE.Vector3(Math.cos(a) * r1, Math.sin(a) * r1, 0),
      ]);
    }
    pts.forEach(([a, b], i) => {
      const mid = new THREE.Vector3(b.x, a.y, 0);
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([a, mid, b]),
        new THREE.LineBasicMaterial({
          color,
          transparent: true,
          opacity: 0.4,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      line.userData.ph = i * 0.4;
      grp.add(line);
      const pad = new THREE.Mesh(new THREE.CircleGeometry(0.06, 8), mat(color, 0.8, 'add'));
      pad.position.copy(b);
      pad.userData.ph = i * 0.4;
      grp.add(pad);
    });
    return grp;
  }

  /* ── interlinked node lattice ────────────────────────────────────── */

  function makeMesh(count, radius, color) {
    const grp = new THREE.Group();
    const nodes = [];
    for (let i = 0; i < count; i++) {
      const v = new THREE.Vector3(
        (Math.random() * 2 - 1) * radius,
        (Math.random() * 2 - 1) * radius * 0.75,
        (Math.random() * 2 - 1) * radius * 0.55
      );
      const n = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13, 0), mat(color, 0.9, 'add'));
      n.position.copy(v);
      n.userData.home = v.clone();
      n.userData.ph = Math.random() * 6.28;
      grp.add(n);
      nodes.push(n);
    }
    const segs = [];
    nodes.forEach((n, i) => {
      nodes.slice(i + 1).forEach((m) => {
        if (n.userData.home.distanceTo(m.userData.home) < radius * 0.62) segs.push([n, m]);
      });
    });
    segs.forEach(([a, b]) => {
      const l = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([a.position, b.position]),
        new THREE.LineBasicMaterial({
          color,
          transparent: true,
          opacity: 0.22,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      l.userData.a = a;
      l.userData.b = b;
      grp.add(l);
    });
    grp.userData.nodes = nodes;
    return grp;
  }

  /* ── equaliser bars (the credits room) ───────────────────────────── */

  function makeEq(count, color) {
    const grp = new THREE.Group();
    const bw = 0.42;
    const gap = 0.16;
    const total = count * (bw + gap);
    for (let i = 0; i < count; i++) {
      const bar = new THREE.Mesh(
        new THREE.BoxGeometry(bw, 1, 0.42),
        mat(i % 4 === 0 ? COL.gold : color, 0.62, 'add')
      );
      bar.position.x = -total / 2 + i * (bw + gap) + bw / 2;
      bar.userData.ph = i * 0.55;
      bar.userData.base = 1 + Math.random() * 2;
      grp.add(bar);
    }
    return grp;
  }

  function pulseEq(eq, t) {
    eq.children.forEach((b) => {
      const h = b.userData.base * (0.45 + 0.55 * Math.abs(Math.sin(t * 2.4 + b.userData.ph)));
      b.scale.y = h;
      b.position.y = -2.6 + h * 0.5;
    });
  }

  /* ── fade the whole subtree by rewriting every material opacity ──── */

  const fadePool = [];
  function fade(root, alpha) {
    root.traverse((o) => {
      if (!o.material) return;
      let arr = fadePool;
      arr.length = 0;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (let i = 0; i < mats.length; i++) arr.push(mats[i]);
      for (let i = 0; i < arr.length; i++) {
        const m = arr[i];
        if (m.userData.baseOpacity === undefined) m.userData.baseOpacity = m.opacity;
        m.opacity = m.userData.baseOpacity * alpha;
        m.visible = alpha > 0.012;
      }
      o.visible = alpha > 0.012;
    });
    root.userData.alpha = alpha;
  }

  const smooth = (a, b, x) => smoothstep(a, b, x);

  /* ────────────────────────────────────────────────────────────────────
     read the panel windows off the DOM — one source of truth
     ──────────────────────────────────────────────────────────────────── */

  const windows = [...document.querySelectorAll('.panel')].map((el) => ({
    from: parseFloat(el.dataset.from ?? '0'),
    to: parseFloat(el.dataset.to ?? '1'),
  }));

  const root = new THREE.Group();
  scene.add(root);

  const vignettes = [];
  function add(gObj, animate) {
    gObj.visible = false;
    root.add(gObj);
    const idx = vignettes.length;
    vignettes.push({ g: gObj, animate, win: windows[idx] || { from: 0, to: 1 }, alpha: 0 });
  }

  /* ── helper: local 0..1 inside a chapter, padded ─────────────────── */
  function localP(p, win) {
    const a = Math.max(0, win.from - PAD);
    const b = Math.min(1, win.to + PAD);
    return clamp((p - a) / Math.max(b - a, 1e-6), 0, 1);
  }

  /* ══════════════════════════════════════════════════════════════════
     1 · START — the core, wrapped in falling code
     ══════════════════════════════════════════════════════════════════ */
  (function () {
    const grp = new THREE.Group();
    const R = GROW[0];

    const core = new THREE.Group();
    const shell = mesh(new THREE.IcosahedronGeometry(R * 0.6, 1), COL.blue, 0.5, 'add');
    shell.material.wireframe = true;
    core.add(shell);

    const inner = mesh(new THREE.IcosahedronGeometry(R * 0.34, 0), COL.blueHot, 0.75, 'add');
    core.add(inner);

    const halo = rings(R, COL.blueHot, 0.4, 3);
    core.add(halo);
    grp.add(core);

    // two curtains of code flanking the core
    const gl = makeGlyphs(R * 2.4, R * 3.4, '#5fb2ff', 22, 46, 0.4);
    gl.position.set(-R * 1.9, 0, -R * 1.2);
    grp.add(gl);
    const gr = makeGlyphs(R * 2.4, R * 3.4, '#ffc800', 22, 46, 0.34);
    gr.position.set(R * 1.9, 0.4, -R * 1.4);
    grp.add(gr);

    const dust = makePoints(
      new Float32Array(g(700) * 3).map((_, i) =>
        i % 3 === 0
          ? (Math.random() * 2 - 1) * R * 2.2
          : i % 3 === 1
            ? (Math.random() * 2 - 1) * R * 1.6
            : (Math.random() * 2 - 1) * R * 1.2
      ),
      0.09,
      0.75,
      'add',
      true
    );
    grp.add(dust);

    add(grp, (p, t, ptr) => {
      core.rotation.y = t * 0.24 + ptr.x * 0.3;
      core.rotation.x = Math.sin(t * 0.4) * 0.22 + ptr.y * 0.2;
      inner.rotation.y = -t * 0.6;
      inner.scale.setScalar(1 + Math.sin(t * 2.1) * 0.07);
      shell.scale.setScalar(1 + Math.sin(t * 1.15) * 0.05);
      halo.children.forEach((m) => (m.rotation.z = t * m.userData.spin));
      fallGlyphs(gl, t, 0.06);
      fallGlyphs(gr, t, 0.095);
      dust.rotation.y = t * 0.05;
      grp.position.y = -0.4 + p * 1.6;
      fade(grp, smooth(0, 0.22, p) * (1 - smooth(0.74, 1, p)));
    });
  })();

  /* ══════════════════════════════════════════════════════════════════
     2 · OUR WORK — the monitor array
     ══════════════════════════════════════════════════════════════════ */
  (function () {
    const grp = new THREE.Group();
    const R = GROW[1];
    const screens = [];

    // a 3×2 bank of framed displays, each showing a different panel
    for (let i = 0; i < 6; i++) {
      const w = R * 0.86;
      const h = w * 0.64;
      const frame = new THREE.Group();

      const bez = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, 0.16),
        mat(COL.blueAbyss, 0.9)
      );
      bez.material.color.multiplyScalar(1);
      frame.add(bez);

      const glass = new THREE.Mesh(
        new THREE.PlaneGeometry(w * 0.9, h * 0.86),
        new THREE.MeshBasicMaterial({
          color: i === 4 ? COL.gold : i % 3 === 0 ? COL.blueHot : COL.blue,
          transparent: true,
          opacity: 0.32,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        })
      );
      glass.position.z = 0.1;
      frame.add(glass);

      const trace = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.PlaneGeometry(w * 0.96, h * 0.94)),
        new THREE.LineBasicMaterial({
          color: COL.blueHot,
          transparent: true,
          opacity: 0.65,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      trace.position.z = 0.11;
      frame.add(trace);

      const col = i % 3;
      const row = (i / 3) | 0;
      frame.position.set((col - 1) * (R * 0.96), (0.5 - row) * (R * 0.74), -i * 0.55);
      frame.userData.ph = i * 1.1;
      frame.userData.glass = glass;
      frame.userData.baseY = frame.position.y;
      grp.add(frame);
      screens.push(frame);
    }

    const rig = rings(R * 1.15, COL.blue, 0.3, 2);
    rig.rotation.x = Math.PI / 2.4;
    grp.add(rig);

    add(grp, (p, t, ptr) => {
      screens.forEach((s, i) => {
        const pulse = 0.36 + 0.3 * (0.5 + 0.5 * Math.sin(t * 2.2 + s.userData.ph));
        s.userData.glass.material.opacity = pulse;
        s.position.y = s.userData.baseY + Math.sin(t * 0.9 + i) * 0.13;
        s.rotation.y = ptr.x * 0.3 + Math.sin(t * 0.5 + i * 0.8) * 0.1;
        s.rotation.x = -ptr.y * 0.18;
      });
      rig.children.forEach((m) => (m.rotation.z = t * m.userData.spin));
      grp.rotation.y = Math.sin(t * 0.3) * 0.14 + ptr.x * 0.16;
      grp.position.y = p * 1.1;
      fade(grp, smooth(0, 0.2, p) * (1 - smooth(0.76, 1, p)));
    });
  })();

  /* ══════════════════════════════════════════════════════════════════
     3 · ABOUT — the network lattice
     ══════════════════════════════════════════════════════════════════ */
  (function () {
    const grp = new THREE.Group();
    const R = GROW[2];
    const net = makeMesh(g(46), R, COL.blueHot);
    grp.add(net);

    const shell = mesh(new THREE.SphereGeometry(R * 1.35, 20, 14), COL.blue, 0.16, 'add');
    shell.material.wireframe = true;
    grp.add(shell);

    const wave = makeWave(9, COL.blue, 1.1, 14, 0.4);
    wave.position.y = -R * 0.8;
    grp.add(wave);

    add(grp, (p, t, ptr) => {
      net.rotation.y = t * 0.16 + ptr.x * 0.3;
      net.rotation.x = Math.sin(t * 0.3) * 0.2 + ptr.y * 0.2;
      net.userData.nodes.forEach((n) => {
        const h = n.userData.home;
        n.position.set(
          h.x + Math.sin(t * 1.3 + n.userData.ph) * 0.16,
          h.y + Math.cos(t * 1.1 + n.userData.ph) * 0.16,
          h.z + Math.sin(t * 0.9 + n.userData.ph) * 0.16
        );
        n.scale.setScalar(0.7 + 0.5 * (0.5 + 0.5 * Math.sin(t * 2.4 + n.userData.ph)));
      });
      net.children.forEach((c) => {
        if (!c.userData.a) return;
        c.geometry.setFromPoints([c.userData.a.position, c.userData.b.position]);
      });
      shell.rotation.y = -t * 0.1;
      updateWave(wave, t);
      grp.position.y = -p * 0.9;
      fade(grp, smooth(0, 0.2, p) * (1 - smooth(0.76, 1, p)));
    });
  })();

  /* ══════════════════════════════════════════════════════════════════
     4 · PROCESS — the data pipeline
     ══════════════════════════════════════════════════════════════════ */
  (function () {
    const grp = new THREE.Group();
    const R = GROW[3];

    // four stations strung along a luminous conduit
    const stations = [];
    const conduitPts = [];
    for (let i = 0; i < 4; i++) {
      const x = (i - 1.5) * (R * 1.15);
      const y = Math.sin(i * 1.6) * R * 0.42;
      const st = new THREE.Group();
      const box = mesh(new THREE.BoxGeometry(R * 0.5, R * 0.5, R * 0.5), COL.blue, 0.4, 'add');
      box.material.wireframe = true;
      st.add(box);
      const node = mesh(new THREE.OctahedronGeometry(R * 0.16, 0), i === 3 ? COL.gold : COL.blueHot, 0.85, 'add');
      st.add(node);
      st.position.set(x, y, 0);
      st.userData.ph = i;
      st.userData.node = node;
      grp.add(st);
      stations.push(st);
      conduitPts.push(new THREE.Vector3(x, y, 0));
    }

    const conduit = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(conduitPts),
      new THREE.LineBasicMaterial({
        color: COL.blueHot,
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    grp.add(conduit);

    // packets running down the line
    const packets = makePoints(
      new Float32Array(g(90) * 3).fill(0),
      0.14,
      0.9,
      'add',
      false
    );
    grp.add(packets);
    const pArr = packets.geometry.attributes.position.array;
    for (let i = 0; i < pArr.length; i += 3) pArr[i] = -R * 2;

    const ring = rings(R * 1.5, COL.blueDeep, 0.3, 2);
    ring.rotation.y = Math.PI / 2;
    grp.add(ring);

    add(grp, (p, t, ptr) => {
      stations.forEach((s, i) => {
        s.rotation.y = t * 0.7;
        s.rotation.x = t * 0.35;
        s.userData.node.scale.setScalar(
          1 + 0.4 * Math.max(0, Math.sin(t * 2.6 - i * 0.9))
        );
        s.position.y = Math.sin(i * 1.6) * R * 0.42 + Math.sin(t * 1.4 + i) * 0.18;
      });

      // sweep the packets along
      const total = R * 4;
      for (let i = 0; i < pArr.length; i += 3) {
        let x = pArr[i] + 0.075;
        if (x > total / 2) x = -total / 2;
        pArr[i] = x;
        const u = (x + total / 2) / total;
        const seg = Math.min(2, Math.floor(u * 3));
        const f = u * 3 - seg;
        pArr[i + 1] = lerp(conduitPts[seg].y, conduitPts[seg + 1].y, f);
        pArr[i + 2] = 0;
      }
      packets.geometry.attributes.position.needsUpdate = true;

      ring.children.forEach((m) => (m.rotation.z = t * m.userData.spin));
      grp.rotation.y = ptr.x * 0.25;
      grp.position.y = p * 0.8;
      fade(grp, smooth(0, 0.2, p) * (1 - smooth(0.76, 1, p)));
    });
  })();

  /* ══════════════════════════════════════════════════════════════════
     5 · SERVICES — the chip and its circuit board
     ══════════════════════════════════════════════════════════════════ */
  (function () {
    const grp = new THREE.Group();
    const R = GROW[4];

    const board = makeCircuit(R * 1.7, COL.blue, 22);
    grp.add(board);

    const die = new THREE.Group();
    const plate = mesh(new THREE.BoxGeometry(R * 0.85, R * 0.85, 0.22), COL.blueAbyss, 0.95);
    die.add(plate);
    const lattice = new THREE.Group();
    for (let i = 0; i < 6; i++)
      for (let j = 0; j < 6; j++) {
        const cell = mesh(
          new THREE.PlaneGeometry(R * 0.09, R * 0.09),
          (i + j) % 5 === 0 ? COL.blueHot : COL.blue,
          0.55,
          'add'
        );
        cell.position.set((i - 2.5) * R * 0.12, (j - 2.5) * R * 0.12, 0.13);
        lattice.add(cell);
      }
    die.add(lattice);

    // legs
    for (let i = 0; i < 5; i++) {
      [-1, 1].forEach((s) => {
        const leg = mesh(new THREE.BoxGeometry(0.34, 0.07, 0.07), COL.blueHot, 0.7, 'add');
        leg.position.set(s * (R * 0.5), (i - 2) * R * 0.15, 0);
        die.add(leg);
      });
    }
    die.rotation.x = -0.5;
    die.rotation.y = 0.4;
    grp.add(die);

    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture(0.22),
        color: COL.blue,
        transparent: true,
        opacity: 0.6,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    glow.scale.setScalar(R * 3.4);
    glow.position.z = -1.2;
    grp.add(glow);

    add(grp, (p, t, ptr) => {
      die.rotation.y = 0.4 + t * 0.35 + ptr.x * 0.3;
      die.rotation.x = -0.5 + ptr.y * 0.22;
      board.children.forEach((c) => {
        const lit = 0.32 + 0.5 * (0.5 + 0.5 * Math.sin(t * 3.2 - c.userData.ph));
        if (c.material) c.material.opacity = lit;
      });
      lattice.children.forEach((c, i) => {
        c.material.opacity = 0.3 + 0.6 * Math.max(0, Math.sin(t * 4 - i * 0.18));
      });
      glow.material.opacity = 0.45 + 0.2 * Math.sin(t * 1.6);
      grp.rotation.y = Math.sin(t * 0.25) * 0.12 + ptr.x * 0.14;
      grp.position.y = -p * 0.7;
      fade(grp, smooth(0, 0.2, p) * (1 - smooth(0.76, 1, p)));
    });
  })();

  /* ══════════════════════════════════════════════════════════════════
     6 · CONTACT — the transmission beacon
     ══════════════════════════════════════════════════════════════════ */
  (function () {
    const grp = new THREE.Group();
    const R = GROW[5];

    const mast = mesh(new THREE.CylinderGeometry(0.1, 0.26, R * 2.1, 8), COL.blueHot, 0.7, 'add');
    mast.position.y = -R * 0.35;
    grp.add(mast);

    const beacon = mesh(new THREE.SphereGeometry(R * 0.24, 16, 12), COL.gold, 0.9, 'add');
    beacon.position.y = R * 0.7;
    grp.add(beacon);

    const beaconGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture(0.16),
        color: COL.gold,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    beaconGlow.scale.setScalar(R * 1.7);
    beaconGlow.position.copy(beacon.position);
    grp.add(beaconGlow);

    // expanding broadcast rings
    const waves = [];
    for (let i = 0; i < 4; i++) {
      const w = new THREE.Mesh(
        new THREE.RingGeometry(R * 0.5, R * 0.56, 64),
        mat(COL.blueHot, 0.5, 'add')
      );
      w.position.y = R * 0.7;
      w.userData.ph = i / 4;
      grp.add(w);
      waves.push(w);
    }

    const dish = new THREE.Group();
    const bowl = mesh(
      new THREE.SphereGeometry(R * 0.7, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.42),
      COL.blue,
      0.3,
      'add'
    );
    bowl.material.wireframe = true;
    bowl.rotation.x = Math.PI * 0.62;
    dish.add(bowl);
    dish.position.y = -R * 0.15;
    grp.add(dish);

    const orbit = rings(R * 1.25, COL.blueDeep, 0.32, 3);
    orbit.rotation.x = Math.PI / 2.1;
    grp.add(orbit);

    add(grp, (p, t, ptr) => {
      waves.forEach((w) => {
        const u = (t * 0.42 + w.userData.ph) % 1;
        w.scale.setScalar(0.5 + u * 3.4);
        w.material.opacity = (1 - u) * 0.55;
        w.visible = (1 - u) > 0.03;
      });
      const beat = 0.7 + 0.4 * Math.abs(Math.sin(t * 2.2));
      beacon.scale.setScalar(beat);
      beaconGlow.material.opacity = 0.4 + beat * 0.35;
      dish.rotation.y = t * 0.5 + ptr.x * 0.4;
      dish.rotation.z = -0.3 + ptr.y * 0.2;
      orbit.children.forEach((m) => (m.rotation.z = t * m.userData.spin));
      grp.position.y = p * 0.6;
      fade(grp, smooth(0, 0.2, p) * (1 - smooth(0.76, 1, p)));
    });
  })();

  /* ══════════════════════════════════════════════════════════════════
     7 · CREDITS — the console desk: waveform, spectrum, glyph rain
     ══════════════════════════════════════════════════════════════════ */
  (function () {
    const grp = new THREE.Group();
    const R = GROW[6];

    const eq = makeEq(LOW_POWER ? 11 : 17, COL.blueHot);
    eq.position.y = -0.4;
    grp.add(eq);

    const wave = makeWave(8, COL.blue, 1.5, 16, 0.5);
    wave.position.set(0, R * 0.55, -1);
    wave.scale.setScalar(0.7);
    grp.add(wave);

    const curtain = makeGlyphs(R * 4.4, R * 2.6, '#0d2a5c', 40, 26, 0.3);
    curtain.position.set(0, 0.2, -3.4);
    grp.add(curtain);

    const orbit = rings(R * 1.3, COL.blueDeep, 0.3, 2);
    orbit.rotation.x = Math.PI / 2;
    grp.add(orbit);

    add(grp, (p, t, ptr) => {
      pulseEq(eq, t);
      updateWave(wave, t);
      fallGlyphs(curtain, t, 0.05);
      orbit.children.forEach((m) => (m.rotation.z = t * m.userData.spin));
      grp.rotation.y = ptr.x * 0.2;
      grp.position.y = 0.4 - p * 1.4;
      fade(grp, smooth(0, 0.2, p) * (1 - smooth(0.8, 1, p)));
    });
  })();

  /* ══════════════════════════════════════════════════════════════════
     frame update
     ══════════════════════════════════════════════════════════════════ */

  function update({ time, camera, progress, pointer }) {
    // idle sway of the whole rig — tiny, because the camera is bolted down
    root.position.x = pointer.x * 0.7;
    root.position.y = -pointer.y * 0.45;
    root.rotation.y = pointer.x * 0.045;

    for (let i = 0; i < vignettes.length; i++) {
      const v = vignettes[i];
      const p = localP(progress, v.win);

      // outside its chapter → fully dark and off the renderer
      if (p <= 0.0001 || p >= 0.9999) {
        if (v.alpha !== 0) {
          v.alpha = 0;
          fade(v.g, 0);
          v.g.visible = false;
        }
        continue;
      }

      const grow = GROW[i] || 3;
      v.g.visible = true;
      // each chapter starts bigger than the last, so the world feels like it
      // is tightening toward you as you approach the contact room
      v.g.position.z = 11 - p * 9;
      v.g.scale.setScalar((0.7 + p * 0.5) * (grow / GROW[0]) * 1.35);
      v.g.position.x = 0;

      v.animate(p, time, pointer);

      // depth-fade as it recedes past the readable range
      const dist = Math.abs(camera.position.z - v.g.position.z);
      const depth = 1 - smooth(24, 34, dist);
      const a = v.g.userData.alpha ?? 1;
      if (depth < 1) fade(v.g, a * depth);

      v.alpha = v.g.userData.alpha ?? 1;
    }
  }

  return { update, root, vignettes };
}
