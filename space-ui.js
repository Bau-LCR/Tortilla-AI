/* CUTREAL SPACE · UI aislada y tolerante a carga tardía */
(function () {
  'use strict';
  let timer = null;
  let bound = false;
  let rendererReady = false;
  const core = () => window.CutRealSpaceCore;
  const renderer = () => window.CutRealSpaceRenderer;
  const view = () => document.getElementById('space-view');

  function showError(message) {
    const stage = document.getElementById('space-stage');
    if (!stage) return;
    let box = stage.querySelector('.space-runtime-error');
    if (!box) {
      box = document.createElement('div');
      box.className = 'space-runtime-error';
      stage.appendChild(box);
    }
    box.textContent = message;
  }

  function open(event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    const v = view();
    if (!v) return false;
    v.hidden = false;
    v.removeAttribute('aria-hidden');
    document.body.classList.add('space-open');
    try {
      if (!rendererReady) {
        const stage = document.getElementById('space-stage');
        if (!stage || !renderer()?.init(stage)) throw new Error('El motor visual no está disponible.');
        rendererReady = true;
      }
      if (!core()?.state?.bodies?.length) core().loadPreset('solar');
      renderer().rebuild();
      render();
      window.dispatchEvent(new CustomEvent('cutreal:space-ready'));
    } catch (error) {
      console.error('[SPACE] No se pudo iniciar:', error);
      showError('SPACE está abierto, pero el motor 3D no pudo iniciarse. Recargá la página e intentá nuevamente.');
    }
    return false;
  }

  function close(event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    const v = view();
    if (v) {
      v.hidden = true;
      v.setAttribute('aria-hidden', 'true');
    }
    document.body.classList.remove('space-open');
    return false;
  }

  function render() {
    const s = core()?.state;
    if (!s) return;
    const list = document.getElementById('space-object-list');
    if (list) list.innerHTML = s.bodies.map(b => `<button class="space-object ${s.selectedId === b.id ? 'selected' : ''}" data-id="${b.id}"><span class="space-object-dot" style="background:${b.color}"></span>${b.name}<small>${b.type}</small></button>`).join('');
    const selected = core().selected();
    const inspector = document.getElementById('space-inspector');
    if (inspector) inspector.innerHTML = selected ? `<h3>${selected.name}</h3><label>Masa<input data-key="mass" type="number" value="${selected.mass}"></label><label>Radio<input data-key="radius" type="number" value="${selected.radius}"></label><label>Temperatura<input data-key="temperature" type="number" value="${selected.temperature}"></label><p>Velocidad: ${Math.hypot(...selected.velocity).toFixed(2)} m/s</p><button id="space-why" type="button">¿Por qué?</button>` : '<p>Seleccioná un objeto para inspeccionarlo.</p>';
    const status = document.getElementById('space-status');
    if (status) status.textContent = `${s.running ? 'EJECUTANDO' : 'PAUSADO'} · t=${s.time.toFixed(0)} s · ${s.bodies.length} cuerpos`;
    const events = document.getElementById('space-events');
    if (events) events.innerHTML = s.events.slice(0, 8).map(e => `<div><time>${e.time.toFixed(0)}s</time> ${e.text}</div>`).join('');
  }

  function bind() {
    if (bound) return;
    bound = true;
    document.addEventListener('click', event => {
      const openButton = event.target.closest('[data-space-open]');
      if (openButton) return open(event);
      const closeButton = event.target.closest('[data-space-close]');
      if (closeButton) return close(event);
      const object = event.target.closest('#space-view .space-object');
      if (object) {
        core().select(object.dataset.id);
        renderer()?.focus(object.dataset.id);
        render();
        return;
      }
      if (event.target.closest('#space-why')) window.alert(core().why());
    }, true);
    document.getElementById('space-load-solar')?.addEventListener('click', () => { core().loadPreset('solar'); renderer()?.rebuild(); render(); });
    document.getElementById('space-load-empty')?.addEventListener('click', () => { core().reset(); renderer()?.rebuild(); render(); });
    document.getElementById('space-add')?.addEventListener('click', () => { core().addCustom(); renderer()?.rebuild(); render(); });
    document.getElementById('space-play')?.addEventListener('click', () => { core().state.running = true; render(); });
    document.getElementById('space-pause')?.addEventListener('click', () => { core().state.running = false; render(); });
    document.getElementById('space-step')?.addEventListener('click', () => { core().step(3600); renderer()?.rebuild(); render(); });
    document.getElementById('space-reset')?.addEventListener('click', () => { core().state.time = 0; core().state.running = false; render(); });
    document.getElementById('space-export')?.addEventListener('click', () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([core().exportJSON()], { type: 'application/json' })); a.download = 'cutreal-space-simulation.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 0); });
    document.getElementById('space-mode')?.addEventListener('change', e => { core().state.mode = e.target.value; renderer()?.rebuild(); });
    document.getElementById('space-amplification')?.addEventListener('input', e => { core().state.visualAmplification = Number(e.target.value); renderer()?.rebuild(); });
    timer = setInterval(() => { if (!view() || view().hidden) return; core()?.update(); if (core()?.state?.running) renderer()?.rebuild(); render(); }, 120);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once: true });
  else bind();
  window.CutRealSpace = { open, close, render };
})();
