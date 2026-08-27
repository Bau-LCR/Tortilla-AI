// CUT-REAL controls UI — independent, local-only presentation behavior.
(function () {
  'use strict';
  const STORAGE_KEY = 'cutreal_controls_collapsed_v1';

  function readCollapsed() {
    try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch (_) { return false; }
  }

  function writeCollapsed(value) {
    try { localStorage.setItem(STORAGE_KEY, value ? '1' : '0'); } catch (_) {}
  }

  function setCollapsed(panel, button, collapsed, persist = true) {
    panel.dataset.collapsed = String(collapsed);
    panel.classList.toggle('is-collapsed', collapsed);
    button.setAttribute('aria-expanded', String(!collapsed));
    button.textContent = collapsed ? '⌄' : '⌃';
    button.setAttribute('aria-label', collapsed ? 'Expandir controles superiores' : 'Retraer controles superiores');
    button.title = collapsed ? 'Expandir controles superiores' : 'Retraer controles superiores';
    if (persist) writeCollapsed(collapsed);
  }

  function bind() {
    const panel = document.getElementById('side-controls');
    const button = document.getElementById('controls-collapse-btn');
    if (!panel || !button || button.dataset.bound === '1') return;
    button.dataset.bound = '1';
    setCollapsed(panel, button, readCollapsed(), false);
    button.addEventListener('click', () => setCollapsed(panel, button, panel.dataset.collapsed !== 'true'));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once: true });
  else bind();
})();
