/* CUT-REAL compatibility policy: reversible presentation controls only. */
(() => {
  'use strict';
  const POLICY = { randarEnabled: false, cutrealOsEnabled: false };
  const hide = (selector, hidden) => document.querySelectorAll(selector).forEach(el => {
    el.hidden = hidden;
    el.setAttribute('aria-hidden', hidden ? 'true' : 'false');
  });
  function apply() {
    hide('#nexus-overlay, #nexus-nav-btn, #nexus-open-btn, .nexus-nav-floating', !POLICY.randarEnabled);
    hide('#cutreal-os-launch, #cro-drawer', !POLICY.cutrealOsEnabled);
    document.documentElement.dataset.randarEnabled = String(POLICY.randarEnabled);
    document.documentElement.dataset.cutrealOsEnabled = String(POLICY.cutrealOsEnabled);
    const mission = document.getElementById('super-mission-mode');
    mission?.querySelectorAll('option').forEach(option => {
      const disabledMode = ['parallel-universe', 'simulation-lab', 'ai-debate', 'ai-evolution', 'super-master'].includes(option.value);
      option.hidden = disabledMode; option.disabled = disabledMode;
    });
    if (mission && ['parallel-universe', 'simulation-lab', 'ai-debate', 'ai-evolution', 'super-master'].includes(mission.value)) mission.value = 'standard';
    document.querySelectorAll('#super-graph-filter option[value="judge"]').forEach(option => { option.hidden = true; option.disabled = true; });
  }
  function guard(event) {
    const target = event.target.closest?.('#nexus-nav-btn, #nexus-open-btn, .nexus-nav-floating, #cutreal-os-launch');
    if (target && ((target.id || '').includes('nexus') || target.classList.contains('nexus-nav-floating') || target.id === 'cutreal-os-launch')) {
      event.preventDefault(); event.stopImmediatePropagation();
    }
  }
  document.addEventListener('click', guard, true);
  document.addEventListener('DOMContentLoaded', apply);
  new MutationObserver(apply).observe(document.documentElement, { childList: true, subtree: true });
  window.CutRealModePolicy = { POLICY, apply, enableRandar: () => { POLICY.randarEnabled = true; apply(); }, disableRandar: () => { POLICY.randarEnabled = false; apply(); } };
})();
