import { clamp } from './util.js';
import { uiPhase } from './palette.js';

/* ═══════════════════════════════════════════════════════════
   The story layer. Each chapter owns a window of the walk;
   outside it the panel is simply not there.
   ═══════════════════════════════════════════════════════════ */

const JUMPS = [0, 0.2, 0.37, 0.54, 0.7, 0.86];

export function createContent(journey) {
  const panels = Array.from(document.querySelectorAll('.panel')).map((el) => ({
    el,
    from: parseFloat(el.dataset.from ?? '0'),
    to: parseFloat(el.dataset.to ?? '1'),
    on: false,
  }));

  const railFill = document.getElementById('railFill');
  const clockLabel = document.getElementById('clockLabel');
  const hint = document.getElementById('hint');
  const phaseHost = document.body;

  const navButtons = Array.from(document.querySelectorAll('.nav button'));
  let lastPhase = '';
  let lastLabel = '';

  document.querySelectorAll('[data-jump]').forEach((btn) => {
    btn.addEventListener('click', () => journey.jumpTo(parseFloat(btn.dataset.jump)));
  });

  const form = document.getElementById('signup');
  const note = document.getElementById('formNote');
  if (form) {
    // Drop a Formspree (or similar) URL here and the form posts there.
    // Left empty, it falls back to opening the visitor's mail client.
    const ENDPOINT = form.dataset.endpoint || '';

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const get = (id) => (form.querySelector('#' + id)?.value || '').trim();

      const name = get('name');
      const email = get('email');
      const message = get('message');
      const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);

      if (!name || !emailOk || !message) {
        if (note) {
          note.textContent = !name
            ? 'Please add your name so we know who we are replying to.'
            : !emailOk
              ? 'Please enter a valid email address so we can reply.'
              : 'Tell us a little about the project so we can quote it properly.';
        }
        return;
      }

      if (ENDPOINT) {
        try {
          const res = await fetch(ENDPOINT, {
            method: 'POST',
            headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, message }),
          });
          if (res.ok) {
            if (note) note.textContent = 'Thank you — your message is on its way. We will reply within one working day.';
            form.reset();
            return;
          }
        } catch (err) {
          console.error(err);
        }
      }

      const subject = encodeURIComponent(`Website enquiry from ${name}`);
      const body = encodeURIComponent(`${message}\n\n— ${name}\n${email}`);
      window.location.href = `mailto:sales@prostudio.my?subject=${subject}&body=${body}`;
      if (note) note.textContent = 'Opening your mail app — press send and we will take it from there.';
    });
  }

  function update(progress, state) {
    const p = clamp(progress, 0, 1);

    for (const panel of panels) {
      // a little breathing room so panels never pop on a single frame
      const on = p >= panel.from - 0.001 && p <= panel.to + 0.001;
      if (on !== panel.on) {
        panel.on = on;
        panel.el.classList.toggle('is-active', on);
      }
    }

    if (railFill) railFill.style.height = (p * 100).toFixed(2) + '%';

    if (clockLabel && state.name !== lastLabel) {
      lastLabel = state.name;
      clockLabel.textContent = state.name;
    }

    const phase = uiPhase(p);
    if (phase !== lastPhase) {
      lastPhase = phase;
      phaseHost.dataset.phase = phase;
    }

    if (hint) hint.classList.toggle('is-gone', p > 0.01);

    // which chapter is "current" in the top nav
    let active = 0;
    for (let i = 0; i < JUMPS.length; i++) if (p >= JUMPS[i] - 0.055) active = i;
    navButtons.forEach((b, i) => b.classList.toggle('is-on', i === active));
  }

  return { update };
}
