/* CUT-REAL PAINT · canvas ligero y móvil */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const state = { drawing: false, eraser: false, history: [], points: [] };
  let ctx;
  function canvas() { return $('cutreal-paint-canvas'); }
  function paintOpen() { const panel = $('cutreal-paint'); if (!panel) return false; panel.hidden = false; panel.setAttribute('aria-hidden', 'false'); panel.style.display = 'flex'; resizeCanvas(); return true; }
  function paintClose() { const panel = $('cutreal-paint'); if (!panel) return false; panel.hidden = true; panel.setAttribute('aria-hidden', 'true'); panel.style.display = 'none'; return true; }
  function resizeCanvas() { const c = canvas(); if (!c) return; ctx ||= c.getContext('2d'); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; if (!state.history.length) { ctx.fillStyle = '#071225'; ctx.fillRect(0, 0, c.width, c.height); } }
  function point(event) { const c = canvas(); const rect = c.getBoundingClientRect(); return { x: (event.clientX - rect.left) * c.width / rect.width, y: (event.clientY - rect.top) * c.height / rect.height }; }
  function saveHistory() { const c = canvas(); state.history.push(c.toDataURL('image/png')); if (state.history.length > 20) state.history.shift(); }
  function restore(data) { const image = new Image(); image.onload = () => { ctx.clearRect(0, 0, canvas().width, canvas().height); ctx.drawImage(image, 0, 0); }; image.src = data; }
  function begin(event) { event.preventDefault(); saveHistory(); state.drawing = true; const p = point(event); state.points = [p]; ctx.beginPath(); ctx.moveTo(p.x, p.y); canvas().setPointerCapture?.(event.pointerId); }
  function move(event) { if (!state.drawing) return; event.preventDefault(); const p = point(event); const color = $('cutreal-paint-color')?.value || '#64dfff'; const size = Number($('cutreal-paint-size')?.value || 6); ctx.strokeStyle = state.eraser ? '#071225' : color; ctx.lineWidth = state.eraser ? size * 3 : size; ctx.lineTo(p.x, p.y); ctx.stroke(); state.points.push(p); }
  function end() { state.drawing = false; ctx.closePath(); }
  function undo() { const previous = state.history.pop(); if (previous) restore(previous); }
  function clearCanvas() { saveHistory(); ctx.fillStyle = '#071225'; ctx.fillRect(0, 0, canvas().width, canvas().height); }
  function download() { const c = canvas(); const link = document.createElement('a'); link.download = 'cut-real-paint.png'; link.href = c.toDataURL('image/png'); link.click(); }
  function bind() { const c = canvas(); if (!c || c.dataset.bound) return; c.dataset.bound = '1'; ctx = c.getContext('2d'); resizeCanvas(); c.addEventListener('pointerdown', begin); c.addEventListener('pointermove', move); c.addEventListener('pointerup', end); c.addEventListener('pointercancel', end); $('cutreal-paint-close')?.addEventListener('click', paintClose); $('cutreal-paint-undo')?.addEventListener('click', undo); $('cutreal-paint-clear')?.addEventListener('click', clearCanvas); $('cutreal-paint-download')?.addEventListener('click', download); $('cutreal-paint-eraser')?.addEventListener('click', event => { state.eraser = !state.eraser; event.currentTarget.classList.toggle('active', state.eraser); event.currentTarget.textContent = state.eraser ? 'Lápiz' : 'Borrador'; }); $('cutreal-paint-size')?.addEventListener('input', event => { const output = $('cutreal-paint-size-value'); if (output) output.textContent = event.target.value; }); window.addEventListener('resize', () => { if (!$('cutreal-paint')?.hidden) resizeCanvas(); }); }
  window.CutRealPaint = { open: paintOpen, close: paintClose };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once: true }); else bind();
})();
