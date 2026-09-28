/* ═══════════════════════════════════════════════════════════
   Studio Pro AI — floating chat widget.

   Ported from prostudio.my, which embeds the same agent we run at
   ai.prostudio.my. Nothing is downloaded until the first click: the
   panel starts as `about:blank` and only then pulls in the iframe,
   so a visitor who never opens the chat never pays for it.
   ═══════════════════════════════════════════════════════════ */

const EMBED_URL = 'https://ai.prostudio.my/?embed=1';

export function createChat() {
  const root = document.getElementById('aiw');
  if (!root) return null;

  const panel = document.getElementById('aiwPanel');
  const row = document.getElementById('aiwRow');
  const fab = document.getElementById('aiwOpen');
  const close = document.getElementById('aiwClose');
  const frame = document.getElementById('aiwFrame');

  if (!panel || !row || !fab || !close || !frame) return null;

  let loaded = false;

  function open() {
    if (!loaded) {
      frame.src = EMBED_URL;
      loaded = true;
    }
    panel.hidden = false;
    row.hidden = true; /* the close button replaces the launcher */
    fab.setAttribute('aria-expanded', 'true');
    close.focus();
  }

  function shut() {
    panel.hidden = true;
    row.hidden = false;
    fab.setAttribute('aria-expanded', 'false');
    fab.focus();
  }

  fab.addEventListener('click', open);
  close.addEventListener('click', shut);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.hidden) shut();
  });

  /* /?chat=1 or /#ai opens it straight away — handy for shared links */
  if (/(?:^|[#&?])(chat|ai)=1(?:&|$)/.test(location.search + location.hash)) open();

  return { open, shut, isOpen: () => !panel.hidden };
}
