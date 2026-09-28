#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════
   Deploy `dist/` to Hostinger over the hPanel API.

   Why file-by-file instead of the archive endpoint: the apex
   document root also holds the ai/, test/ and apps/ folders that
   the ai.prostudio.my, test.prostudio.my and apps.prostudio.my
   subdomains point at, and the archive deploy is documented as
   "overwrites the website's existing contents". Uploading each
   file with TUS `?override=true` replaces exactly what we ship
   and cannot touch a sibling vhost directory.

   Flow:
     1. POST /api/hosting/v1/files/upload-urls  -> TUS url + keys
     2. for every file: TUS create (POST, Upload-Length)
                        then PATCH the bytes (Upload-Offset 0)

   Env:
     HOSTINGER_API_TOKEN   required (hPanel -> API)
     HOSTINGER_USERNAME    default u382882503
     HOSTINGER_DOMAIN      default prostudio.my
     DEPLOY_DIR            default dist
   ═══════════════════════════════════════════════════════════ */

import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

const API = 'https://developers.hostinger.com';
const TOKEN = process.env.HOSTINGER_API_TOKEN;
const USERNAME = process.env.HOSTINGER_USERNAME || 'u382882503';
const DOMAIN = process.env.HOSTINGER_DOMAIN || 'prostudio.my';
const SRC = process.env.DEPLOY_DIR || 'dist';

if (!TOKEN) {
  console.error('HOSTINGER_API_TOKEN is not set');
  process.exit(2);
}

/** Every request carries the bearer token; API errors throw with context. */
async function api(path, { method = 'GET', body, headers = {} } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status} ${text.slice(0, 300)}`);
  }
  return text ? JSON.parse(text) : null;
}

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.isFile()) yield full;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── 1 · get a TUS handle (409 while the vhost is still being set up) ── */
let handle;
for (let attempt = 1; attempt <= 6; attempt++) {
  try {
    handle = await api('/api/hosting/v1/files/upload-urls', {
      method: 'POST',
      body: { username: USERNAME, domain: DOMAIN },
    });
    break;
  } catch (err) {
    if (!/409/.test(err.message) || attempt === 6) throw err;
    const wait = Number(/Retry-After\D+(\d+)/.exec(err.message)?.[1] || 10);
    console.log(`  vhost still setting up, retrying in ${wait}s (attempt ${attempt})`);
    await sleep(wait * 1000);
  }
}
const { url, auth_key, rest_auth_key } = handle;
if (!url || !auth_key || !rest_auth_key) {
  throw new Error('upload-urls response was missing url/auth_key/rest_auth_key');
}

const tusHeaders = {
  'X-Auth': auth_key,
  'X-Auth-Rest': rest_auth_key,
  'Tus-Resumable': '1.0.0',
};

/** Encode each path segment so `assets/index-…js` and `.htaccess` both travel. */
const encodePath = (rel) => rel.split('/').map(encodeURIComponent).join('/');

const files = [];
for await (const f of walk(SRC)) files.push(f);
files.sort();

let bytesTotal = 0;
const failures = [];

for (const file of files) {
  const rel = relative(SRC, file).split(sep).join('/');
  const bytes = await readFile(file);
  bytesTotal += bytes.length;
  const target = `${url}/${encodePath(rel)}?override=true`;

  try {
    /* create the upload */
    const created = await fetch(target, {
      method: 'POST',
      headers: { ...tusHeaders, 'Upload-Length': String(bytes.length), 'Upload-Offset': '0' },
    });
    if (created.status !== 201) {
      throw new Error(`create ${created.status} ${(await created.text()).slice(0, 200)}`);
    }

    /* send the bytes */
    const patched = await fetch(target, {
      method: 'PATCH',
      headers: {
        ...tusHeaders,
        'Content-Type': 'application/offset+octet-stream',
        'Upload-Offset': '0',
      },
      body: bytes,
    });
    if (patched.status !== 204 && patched.status !== 200) {
      throw new Error(`patch ${patched.status} ${(await patched.text()).slice(0, 200)}`);
    }
    const offset = Number(patched.headers.get('upload-offset') || bytes.length);
    if (offset !== bytes.length) {
      throw new Error(`incomplete: server offset ${offset} of ${bytes.length}`);
    }
    console.log(`  ok  ${rel}  (${bytes.length} B)`);
  } catch (err) {
    failures.push(`${rel}: ${err.message}`);
    console.error(`  FAIL ${rel}: ${err.message}`);
  }
}

console.log(
  `\n${files.length - failures.length}/${files.length} files, ` +
    `${(bytesTotal / 1024).toFixed(0)} KiB -> ${DOMAIN}`
);

if (failures.length) {
  console.error('deploy finished with failures:\n  ' + failures.join('\n  '));
  process.exit(1);
}
