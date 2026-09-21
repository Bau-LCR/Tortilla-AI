/* CUT-REAL NAVIGATION FALLBACK · accesos y cierres seguros */
(function () {
  'use strict';
  const el = id => document.getElementById(id);
  const hide = node => { if (!node) return; node.hidden = true; node.setAttribute('aria-hidden', 'true'); node.style.display = 'none'; };
  const show = node => { if (!node) return; node.hidden = false; node.removeAttribute('aria-hidden'); node.style.display = 'flex'; };

  function closeSandbox() {
    const overlay = el('sandbox-overlay');
    hide(overlay);
    document.body.classList.remove('sandbox-open');
    const workspace = el('sbx-panel-workspace');
    if (workspace) workspace.hidden = true;
    return true;
  }
  function openSandbox() {
    const overlay = el('sandbox-overlay');
    if (!overlay) return false;
    show(overlay);
    document.body.classList.add('sandbox-open');
    return true;
  }
  function closeWorkspace() {
    const workspace = el('sbx-panel-workspace');
    if (workspace) workspace.hidden = true;
    el('sandbox-tab-scene')?.click();
  }
  function openWorkspace() {
    if (!openSandbox()) return false;
    const workspace = el('sbx-panel-workspace');
    if (workspace) { workspace.hidden = false; workspace.style.display = 'block'; }
    el('sandbox-tab-workspace')?.click();
    return true;
  }
  function showPanel(id, display = 'block') {
    const panel = el(id);
    if (!panel) return false;
    panel.hidden = false;
    panel.setAttribute('aria-hidden', 'false');
    panel.style.display = display;
    return true;
  }
  function closeAll() {
    window.CutRealSpace?.close?.();
    window.CutRealSuper?.close?.();
    window.CutRealNexus?.close?.();
    closeSandbox();
    closeWorkspace();
    el('agent-mode-panel')?.setAttribute('hidden', 'true');
    document.body.classList.remove('super-view-active', 'nexus-open', 'space-open', 'sandbox-open');
  }
  function open(action) {
    if (action === 'space') return window.CutRealSpace?.open?.() || document.getElementById('space-header-btn')?.click() || showPanel('space-view', 'flex');
    if (action === 'super') return window.CutRealSuper?.open?.() || document.getElementById('super-nav-btn')?.click() || document.getElementById('super-open-btn')?.click() || showPanel('super-view', 'block');
    if (action === 'randar') return window.CutRealNexus?.open?.() || document.getElementById('nexus-nav-btn')?.click() || document.getElementById('nexus-open-btn')?.click() || showPanel('nexus-view', 'block');
    if (action === 'sandbox') return window.openSandbox();
    if (action === 'workspace') return openWorkspace();
    if (action === 'admin') return document.getElementById('admin-btn')?.click() || showPanel('admin-overlay', 'flex');
    if (action === 'logout') return window.logout?.() || false;
    if (action === 'clear-chat') return window.resetChat?.() || false;
    if (action === 'paint-ai') return window.CutRealAIPaint?.open?.() || false;
    if (action === 'projects') return window.CutRealProjects?.open?.() || false;
    if (action === 'chat') { closeAll(); const chat = el('chat'); if (chat) { chat.hidden = false; chat.style.display = ''; chat.scrollIntoView?.({ block: 'center' }); } el('input')?.focus?.(); return true; }
    return false;
  }

  window.openSandbox = window.openSandbox || openSandbox;
  window.closeSandbox = window.closeSandbox || closeSandbox;
  window.CutRealNavigation = { open, closeAll, openSandbox, closeSandbox, openWorkspace, closeWorkspace };

  function bind() {
    document.addEventListener('click', event => {
      const closeButton = event.target.closest('#sandbox-close-btn, #super-close-btn, #nexus-close-btn, [data-close-module]');
      if (closeButton) {
        event.preventDefault();
        event.stopPropagation();
        if (closeButton.id === 'sandbox-close-btn') closeSandbox();
        else if (closeButton.id === 'super-close-btn') { window.CutRealSuper?.close?.(); hide(el('super-view')); document.body.classList.remove('super-view-active'); }
        else if (closeButton.id === 'nexus-close-btn') window.CutRealNexus?.close?.();
        else closeAll();
        return;
      }
      const tool = event.target.closest('#tools-menu [data-tool-action]');
      if (tool) {
        const action = tool.dataset.toolAction;
        if (['space', 'super', 'randar', 'sandbox', 'workspace', 'admin', 'logout', 'clear-chat', 'chat', 'paint-ai', 'projects'].includes(action)) {
          event.preventDefault();
          event.stopImmediatePropagation();
          open(action);
          el('tools-menu')?.setAttribute('hidden', '');
          el('tools-menu-btn')?.setAttribute('aria-expanded', 'false');
        }
      }
    }, true);
    el('sandbox-close-btn')?.setAttribute('data-close-module', 'sandbox');
    el('super-close-btn')?.setAttribute('data-close-module', 'super');
    el('nexus-close-btn')?.setAttribute('data-close-module', 'randar');
    el('wks-close-btn')?.addEventListener('click', closeWorkspace);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once: true });
  else bind();
})();
