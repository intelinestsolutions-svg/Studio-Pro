#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════
   Chrome DevTools screenshot with a real wait.

   `chrome --screenshot` fires the instant the load event lands,
   which on this site is *before* the `?p=` deep link has
   scrolled the walk and before the entrance stagger has run.
   Every chapter after the hero therefore photographs as an
   empty frame. Driving CDP instead lets us wait out the frame,
   read the state back, and only then grab the pixels.

   usage: node scripts/shot.mjs <url> <outfile> [w] [h] [waitMs]
   ═══════════════════════════════════════════════════════════ */

import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [url, out, W = '1440', H = '1080', WAIT = '3000', EXTRA = ''] = process.argv.slice(2);
if (!url || !out) {
  console.error('usage: node scripts/shot.mjs <url> <outfile> [w] [h] [waitMs]');
  process.exit(2);
}

const CHROME =
  process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9333 + (process.pid % 600);
const PROFILE = mkdtempSync(join(tmpdir(), 'shot-'));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(CHROME, [
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
], { stdio: 'ignore' });

let ws;
const pending = new Map();
let seq = 0;

function send(method, params = {}) {
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
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
    }
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: Number(W),
    height: Number(H),
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send('Page.navigate', { url });
  await sleep(Number(WAIT));

  /* Read the state back so a capture can never silently lie about
     what was actually on screen. */
  const probe = await send('Runtime.evaluate', {
    expression: `JSON.stringify({
      html: document.documentElement.className,
      body: document.body.className,
      active: [...document.querySelectorAll('.panel.is-active')]
        .map((p) => (p.querySelector('.kicker') || {}).textContent?.trim()),
      scrollY: Math.round(window.scrollY),
      vw: window.innerWidth,
      grid: document.querySelector('.grid3')
        ? getComputedStyle(document.querySelector('.grid3')).gridTemplateColumns
        : null
    })`,
    returnByValue: true,
  });
  console.log('state:', probe.result.value);

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(out, Buffer.from(shot.data, 'base64'));
  console.log('wrote', out);

  if (EXTRA) {
    const x = await send('Runtime.evaluate', { expression: EXTRA, returnByValue: true });
    console.log('probe:', typeof x.result.value === 'string' ? x.result.value : JSON.stringify(x.result.value));
  }
}

try {
  await main();
} catch (err) {
  console.error('shot failed:', err.message);
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
