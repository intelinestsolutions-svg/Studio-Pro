/* ═══════════════════════════════════════════════════════════
   The full-image viewer.

   Chapter I artwork is cropped down to a small thumbnail on the
   card. Clicking one lifts the untouched original onto the
   screen while the walk behind it is held perfectly still.
   ═══════════════════════════════════════════════════════════ */

const FOCUSABLE =
  'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function createLightbox() {
  const root = document.getElementById('lightbox');
  if (!root) return null;

  const triggers = Array.from(document.querySelectorAll('.tile-art[data-full]'));
  if (!triggers.length) return null;

  const img = root.querySelector('.lightbox__img');
  const titleEl = root.querySelector('.lightbox__title');
  const countEl = root.querySelector('.lightbox__count');
  const openEl = root.querySelector('.lightbox__open');
  const prevBtn = root.querySelector('.lightbox__btn--prev');
  const nextBtn = root.querySelector('.lightbox__btn--next');

  const items = triggers.map((el) => {
    const heading = el.dataset.title || '';
    const caption = el.dataset.caption || '';
    return {
      src: el.dataset.full,
      // A tile can carry the live URL; "Open original" then opens the real
      // site instead of the screenshot of it.
      url: el.dataset.url || '',
      title: heading,
      caption,
      alt: caption ? `${heading} — ${caption}` : heading,
    };
  });

  const last = items.length - 1;
  let index = 0;
  let isOpen = false;
  let lastFocus = null;
  let scrollY = 0;
  let token = 0;

  /* ── scroll lock ─────────────────────────────────────────
     The whole journey is driven by window scroll, so the page
     is frozen while the picture is up: overflow hidden plus a
     hard block on wheel / touch / paging keys.               */
  function freeze() {
    scrollY = window.scrollY;
    document.documentElement.classList.add('is-locked');
    window.addEventListener('wheel', blockEvent, { passive: false });
    window.addEventListener('touchmove', blockEvent, { passive: false });
  }

  function thaw() {
    document.documentElement.classList.remove('is-locked');
    window.removeEventListener('wheel', blockEvent);
    window.removeEventListener('touchmove', blockEvent);
    // some engines clamp scroll position when overflow flips back
    if (Math.abs(window.scrollY - scrollY) > 1) {
      window.scrollTo({ top: scrollY, left: 0, behavior: 'instant' });
    }
  }

  function blockEvent(e) {
    e.preventDefault();
  }

  /* ── painting a slide ─────────────────────────────────── */
  function show(i) {
    index = i < 0 ? last : i > last ? 0 : i;
    const item = items[index];
    const mine = ++token;

    const settle = () => {
      if (mine === token) root.classList.remove('is-loading');
    };

    root.classList.add('is-loading');
    img.alt = item.alt;
    img.src = item.src;

    if (img.complete && img.naturalWidth) {
      settle();
    } else {
      img.addEventListener('load', settle, { once: true });
      img.addEventListener('error', settle, { once: true });
    }

    titleEl.textContent = item.title;
    countEl.textContent = `${index + 1} of ${items.length}`;
    openEl.href = item.url || item.src;
    openEl.textContent = item.url ? 'Visit live site' : 'Open original';
    openEl.setAttribute(
      'aria-label',
      item.url
        ? `Open ${item.title} in a new tab`
        : `Open the original ${item.title} file in a new tab`
    );

    // warm the neighbours so arrows feel instant
    const warm = (n) => {
      const pre = new Image();
      pre.src = items[n].src;
    };
    warm(index < last ? index + 1 : 0);
    warm(index > 0 ? index - 1 : last);
  }

  /* ── open / close ─────────────────────────────────────── */
  function open(i, source) {
    show(i);
    if (isOpen) return;
    isOpen = true;
    lastFocus = source || document.activeElement;
    freeze();
    root.classList.add('is-open');
    root.setAttribute('aria-hidden', 'false');
    root.inert = false;

    // the overlay is still fading up (visibility transitions on), so the
    // dialog only accepts focus once the first frame has painted
    const closeBtn = root.querySelector('.lightbox__btn--close');
    const park = () => {
      if (isOpen && closeBtn && document.activeElement !== closeBtn) {
        closeBtn.focus({ preventScroll: true });
      }
    };
    requestAnimationFrame(park);
    setTimeout(park, 180);
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    root.classList.remove('is-open');
    root.classList.remove('is-loading');
    root.setAttribute('aria-hidden', 'true');
    root.inert = true;
    thaw();
    if (lastFocus && typeof lastFocus.focus === 'function') {
      lastFocus.focus({ preventScroll: true });
    }
    lastFocus = null;
  }

  const step = (d) => show(index + d);

  /* ── wiring ───────────────────────────────────────────── */
  triggers.forEach((el, i) => {
    el.addEventListener('click', () => open(i, el));
  });

  root.querySelectorAll('[data-lb-close]').forEach((el) => {
    el.addEventListener('click', close);
  });
  prevBtn.addEventListener('click', () => step(-1));
  nextBtn.addEventListener('click', () => step(1));

  document.addEventListener('keydown', (e) => {
    if (!isOpen) return;

    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        close();
        break;
      case 'ArrowLeft':
        e.preventDefault();
        step(-1);
        break;
      case 'ArrowRight':
        e.preventDefault();
        step(1);
        break;
      case 'Home':
        e.preventDefault();
        show(0);
        break;
      case 'End':
        e.preventDefault();
        show(last);
        break;
      case 'Tab': {
        // keep focus inside the dialog
        const focusable = Array.from(root.querySelectorAll(FOCUSABLE)).filter(
          (n) => n.offsetParent !== null
        );
        if (!focusable.length) break;
        const first = focusable[0];
        const at = focusable.indexOf(document.activeElement);
        if (e.shiftKey && (at <= 0 || at === -1)) {
          e.preventDefault();
          focusable[focusable.length - 1].focus();
        } else if (!e.shiftKey && at === focusable.length - 1) {
          e.preventDefault();
          first.focus();
        }
        break;
      }
      default:
        // nothing that pages the document behind the overlay
        if (
          ['PageUp', 'PageDown', 'Home', 'End', ' '].includes(e.key) ||
          (e.key.startsWith('Arrow') && ['ArrowUp', 'ArrowDown'].includes(e.key))
        ) {
          e.preventDefault();
        }
    }
  });

  // swipe left / right on touch
  let touchX = null;
  root.addEventListener(
    'touchstart',
    (e) => {
      touchX = e.changedTouches[0].clientX;
    },
    { passive: true }
  );
  root.addEventListener(
    'touchend',
    (e) => {
      if (touchX === null) return;
      const dx = e.changedTouches[0].clientX - touchX;
      touchX = null;
      if (Math.abs(dx) > 48) step(dx < 0 ? 1 : -1);
    },
    { passive: true }
  );

  // a slow drag is a swipe, a flick is a swipe — but a tap is not a step
  root.addEventListener('click', (e) => {
    if (e.target === root) close();
  });

  return { open, close };
}
