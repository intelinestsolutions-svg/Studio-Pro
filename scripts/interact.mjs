#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════
   Behaviour check.

   A reskin can pass every screenshot and still break the things
   that matter: the wheel chaining out of a content panel, the
   chapter jump, the lightbox, the AI launcher. This drives the
   built page over CDP, pokes each of them with real input events
   and reports what happened, including any console error or page
   exception raised on the way.

   usage: node scripts/interact.mjs [url] [w] [h] [out.png]
   ═══════════════════════════════════════════════════════════ */

import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [URL_ = 'http://127.0.0.1:5182/', W = '1440', H = '900', OUT = '/tmp/sp/interact.png'] =
  process.argv.slice(2);

const CHROME =
  process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9733 + (process.pid % 300);
const PROFILE = mkdtempSync(join(tmpdir(), 'interact-'));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--no-sandbox',
    '--no-proxy-server',
    '--no-first-run',
    '--no-default-browser-check',
    '--hide-scrollbars',
    `--user-data-dir=${PROFILE}`,
    `--remote-debugging-port=${PORT}`,
    `--window-size=${W},${H}`,
    'about:blank',
  ],
  { stdio: 'ignore' }
);

let ws;
const pending = new Map();
const listeners = [];
let seq = 0;

function send(method, params = {}) {
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

function onEvent(fn) {
  listeners.push(fn);
}

async function target() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {
      /* devtools not up yet */
    }
    await sleep(250);
  }
  throw new Error('chrome devtools never came up');
}

/** Run an async page expression and hand back its resolved value. */
async function run(expression) {
  const r = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text || 'page expression threw');
  return r.result.value;
}

async function wheel(x, y, dy) {
  await send('Input.dispatchMouseEvent', {
    type: 'mouseWheel',
    x,
    y,
    deltaX: 0,
    deltaY: dy,
    button: 'none',
    pointerType: 'mouse',
  });
  await sleep(900);
}

async function key(k) {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code: k });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: k });
  await sleep(450);
}

const results = [];
const record = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name} — ${detail}`);
};

async function main() {
  const wsUrl = await target();
  ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = () => rej(new Error('websocket failed'));
  });
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
      return;
    }
    listeners.forEach((fn) => fn(msg));
  };

  const faults = [];
  onEvent((msg) => {
    if (msg.method === 'Runtime.exceptionThrown') {
      faults.push('exception: ' + (msg.params.exceptionDetails?.text || '?'));
    }
    if (msg.method === 'Log.entryAdded' && msg.params.entry?.level === 'error') {
      faults.push('console: ' + msg.params.entry.text.slice(0, 140));
    }
  });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: Number(W),
    height: Number(H),
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send('Page.navigate', { url: URL_ });
  await sleep(3500);

  /* 1 · the wheel must chain out of a content panel — the walk is the
        only scroll container on the page, and a panel over it that eats
        the wheel freezes the site. */
  const y0 = await run('window.scrollY');
  await wheel(Number(W) / 2, Number(H) / 2, 760);
  const y1 = await run('window.scrollY');
  record('wheel chains over the hero panel', y1 > y0 + 120, `scrollY ${y0} → ${y1}`);

  /* 2 · chapter jump from the top nav */
  await run(`document.querySelector('.nav button[data-jump="0.20"]').click()`);
  await sleep(1600);
  const jump = await run(`JSON.stringify({
    scrollY: Math.round(window.scrollY),
    active: [...document.querySelectorAll('.panel.is-active .kicker')].map(k => k.textContent.trim()),
    on: (document.querySelector('.nav button.is-on') || {}).textContent,
    phase: document.body.dataset.phase
  })`);
  const j = JSON.parse(jump);
  record(
    'nav jump → Chapter II',
    /Our Work/.test(j.active.join(' ')) && /Work/.test(j.on) && j.phase === 'wire',
    jump
  );

  /* 2b · Chapter II's card is far taller than the viewport, so the wheel has
         to drain the card's own scroll first and then chain into the walk —
         a panel that swallows the wheel forever is a dead end. */
  const yb = await run('window.scrollY');
  for (let i = 0; i < 9; i++) await wheel(Number(W) / 2, Number(H) / 2, 420);
  const ya = await run(
    'JSON.stringify({ y: Math.round(window.scrollY), inner: Math.round(document.querySelectorAll(".panel")[1].querySelector(".card").scrollTop) })'
  );
  const a = JSON.parse(ya);
  record('wheel drains the tall card, then chains to the walk', a.y > yb + 200, `page ${yb} → ${a.y}, card scrollTop ${a.inner}`);

  /* 3 · lightbox: open, load a real snapshot, close on Escape */
  await run(`document.querySelector('.tile-art').click()`);
  await sleep(1200);
  const lb = await run(`JSON.stringify({
    open: document.getElementById('lightbox').classList.contains('is-open'),
    locked: document.documentElement.classList.contains('is-locked'),
    src: document.getElementById('lightboxImg').getAttribute('src'),
    w: document.getElementById('lightboxImg').naturalWidth
  })`);
  const l = JSON.parse(lb);
  record('lightbox opens with a real image', l.open && l.locked && l.w > 100, lb);

  await key('Escape');
  const lb2 = await run(`JSON.stringify({
    open: document.getElementById('lightbox').classList.contains('is-open'),
    locked: document.documentElement.classList.contains('is-locked')
  })`);
  const l2 = JSON.parse(lb2);
  record('Escape closes the lightbox and unlocks scroll', !l2.open && !l2.locked, lb2);

  /* 4 · AI launcher: opens, loads the embed, closes */
  await run(`document.getElementById('aiwOpen').click()`);
  await sleep(700);
  const chat = await run(`JSON.stringify({
    hidden: document.getElementById('aiwPanel').hidden,
    src: document.getElementById('aiwFrame').getAttribute('src'),
    expanded: document.getElementById('aiwOpen').getAttribute('aria-expanded')
  })`);
  const c = JSON.parse(chat);
  record(
    'AI launcher opens the panel',
    !c.hidden && c.expanded === 'true' && /prostudio\.my/.test(c.src),
    chat
  );
  await run(`document.getElementById('aiwClose').click()`);
  const chat2 = await run(`document.getElementById('aiwPanel').hidden`);
  record('AI launcher closes', chat2 === true, `hidden = ${chat2}`);

  /* 5 · every chapter still activates as the walk moves */
  const chapters = [];
  for (const p of [0, 0.2, 0.37, 0.54, 0.7, 0.86, 0.99]) {
    await run(`window.scrollTo(0, ${p} * (document.body.scrollHeight - innerHeight))`);
    await sleep(750);
    chapters.push(
      await run(`JSON.stringify({
        p: ${p},
        active: document.querySelectorAll('.panel.is-active').length,
        phase: document.body.dataset.phase
      })`)
    );
  }
  const parsed = chapters.map((s) => JSON.parse(s));
  const allActive = parsed.every((c2) => c2.active === 1);
  record('all seven chapters activate', allActive, parsed.map((c2) => `${c2.p}:${c2.phase}`).join(' '));

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(OUT, Buffer.from(shot.data, 'base64'));
  console.log('wrote', OUT);

  const pageErrors = await run('window.__pageFaults || []');
  const all = [...faults, ...pageErrors];
  record('no console errors / page exceptions', all.length === 0, all.length ? all.join(' | ') : 'clean');

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) process.exitCode = 1;
}

try {
  await main();
} catch (err) {
  console.error('interact failed:', err.message);
  process.exitCode = 1;
} finally {
  ws?.close();
  chrome.kill('SIGKILL');
  try {
    rmSync(PROFILE, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
}
