/* CUT-REAL TOOLS MENU · navegación centralizada y protegida */
(function () {
  'use strict';
  function init() {
    const button = document.getElementById('tools-menu-btn');
    const menu = document.getElementById('tools-menu');
    if (!button || !menu || menu.dataset.bound === 'true') return;
    menu.dataset.bound = 'true';
    const setAuthState = () => {
      const authenticated = !!window.auth?.currentUser || window.__currentUserAuthenticated === true;
      menu.querySelectorAll('[data-auth-only]').forEach(el => { el.hidden = !authenticated; });
      const admin = menu.querySelector('[data-admin-only]');
      if (admin) admin.hidden = window.__isAdminFlag !== true;
    };
    const close = () => { menu.hidden = true; button.setAttribute('aria-expanded', 'false'); };
    const open = () => { setAuthState(); menu.hidden = false; button.setAttribute('aria-expanded', 'true'); };
    button.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); menu.hidden ? open() : close(); });
    menu.addEventListener('click', event => {
      const item = event.target.closest('[data-tool-action]');
      if (!item) return;
      const action = item.dataset.toolAction;
      if (action === 'space') window.CutRealSpace?.open(event);
      if (action === 'super') document.getElementById('super-nav-btn')?.click();
      if (action === 'randar') { window.CutRealModePolicy?.enableRandar?.(); document.getElementById('nexus-nav-btn')?.click(); window.CutRealNexus?.open?.(); }
      if (action === 'sandbox') { const sandboxButton = document.getElementById('sandbox-btn'); if (sandboxButton) sandboxButton.click(); else window.openSandbox?.(); }
      if (action === 'workspace') { if (window.CutRealWorkspace?.open) window.CutRealWorkspace.open(); else document.getElementById('tab-workspace')?.click(); }
      if (action === 'admin' && window.__isAdminFlag === true) document.getElementById('admin-btn')?.click();
      if (action === 'logout' && window.logout) window.logout();
      if (action === 'clear-chat' && window.confirm('¿Borrar el chat actual?')) window.resetChat?.();
      close();
    });
    document.addEventListener('click', event => { if (!menu.hidden && !menu.contains(event.target) && event.target !== button) close(); });
    window.addEventListener('cutreal:auth-state', setAuthState);
    setAuthState();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
