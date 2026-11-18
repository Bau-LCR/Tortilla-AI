/* CUT-REAL AI · PROGRAMADOR IA 2.0 */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const KEY = 'cutreal-programmer-v2';
  const defaults = {
    'index.html': '<!doctype html>\n<html lang="es">\n<head>\n  <meta charset="utf-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <title>Mi proyecto</title>\n</head>\n<body>\n  <main><h1>Mi primer proyecto</h1><p>Pedile a Cut-real que lo transforme.</p></main>\n</body>\n</html>',
    'style.css': 'body { margin: 0; font-family: system-ui, sans-serif; background: #0b1424; color: #eef5ff; }\nmain { max-width: 900px; margin: 12vh auto; padding: 32px; }',
    'script.js': 'console.log("Proyecto iniciado");'
  };
  const state = { open: false, files: { ...defaults }, active: 'index.html', busy: false, history: [], lastErrors: null };
  const esc = value => String(value ?? '').replace(/[&<>"]/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[ch]));
  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
      if (saved.files && typeof saved.files === 'object') state.files = { ...defaults, ...saved.files };
      if (saved.files && saved.active && state.files[saved.active]) state.active = saved.active;
      state.history = Array.isArray(saved.history) ? saved.history.slice(-30) : [];
    } catch (_) {}
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify({ files: state.files, active: state.active, history: state.history.slice(-30), updatedAt: Date.now() })); } catch (_) { setStatus('No se pudo guardar: almacenamiento local lleno.', 'error'); }
  }
  function setStatus(message, tone) {
    const el = $('programmer-status');
    if (el) { el.textContent = message; el.dataset.tone = tone || 'idle'; }
  }
  function renderFiles() {
    const list = $('programmer-file-list');
    if (!list) return;
    list.innerHTML = Object.keys(state.files).sort().map(path => `<button type="button" class="programmer-file ${path === state.active ? 'active' : ''}" data-file="${esc(path)}"><span>▤</span>${esc(path)}</button>`).join('');
    list.querySelectorAll('[data-file]').forEach(button => button.addEventListener('click', () => {
      syncEditor(); state.active = button.dataset.file; renderFiles(); renderEditor(); save();
    }));
  }
  function syncEditor() {
    const editor = $('programmer-editor');
    if (editor && state.active) state.files[state.active] = editor.value;
  }
  function renderEditor() {
    const editor = $('programmer-editor');
    if (!editor) return;
    editor.value = state.files[state.active] || '';
    const name = $('programmer-active-file');
    if (name) name.textContent = state.active;
    editor.focus({ preventScroll: true });
  }
  function makePreviewDocument() {
    let html = state.files['index.html'] || '<!doctype html><html><body></body></html>';
    const css = '<style>' + (state.files['style.css'] || '') + '</style>';
    const js = '<script>' + (state.files['script.js'] || '') + '<\\/script>';
    if (/<\/head>/i.test(html)) html = html.replace(/<\/head>/i, css + '</head>');
    else html = css + html;
    if (/<\/body>/i.test(html)) html = html.replace(/<\/body>/i, js + '</body>');
    else html += js;
    return html;
  }
  function run() {
    syncEditor();
    const frame = $('programmer-preview');
    if (!frame) return;
    frame.srcdoc = makePreviewDocument();
    state.lastErrors = null;
    setStatus('Vista previa actualizada · ejecución aislada', 'success');
    save();
  }
  function addMessage(role, text) {
    const feed = $('programmer-chat');
    if (!feed) return;
    const item = document.createElement('article');
    item.className = 'programmer-message ' + (role === 'user' ? 'user' : 'assistant');
    const who = document.createElement('small');
    who.textContent = role === 'user' ? 'VOS' : 'CUT-REAL · PROGRAMADOR';
    const body = document.createElement('p');
    body.textContent = text;
    item.append(who, body);
    feed.appendChild(item);
    feed.scrollTop = feed.scrollHeight;
  }
  function safeFilePath(path) {
    return typeof path === 'string' && path.length <= 100 && !path.startsWith('/') && !path.includes('..') && /^[\w./-]+$/.test(path);
  }
  async function send(promptOverride) {
    const field = $('programmer-prompt');
    const prompt = String(promptOverride || field?.value || '').trim();
    if (!prompt || state.busy) return;
    syncEditor();
    state.busy = true;
    if ($('programmer-send')) $('programmer-send').disabled = true;
    if (!promptOverride && field) field.value = '';
    addMessage('user', prompt);
    state.history.push({ role: 'user', content: prompt });
    setStatus('Gemini está trabajando en tu proyecto…', 'working');
    try {
      const response = await fetch('/api/programmer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, files: state.files, activeFile: state.active, history: state.history.slice(-8) })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Error HTTP ${response.status}`);
      if (data.files && typeof data.files === 'object') {
        for (const [path, content] of Object.entries(data.files)) {
          if (safeFilePath(path) && typeof content === 'string' && content.length <= 180000) state.files[path] = content;
        }
      }
      const reply = data.message || 'El proyecto fue actualizado.';
      addMessage('assistant', reply);
      state.history.push({ role: 'assistant', content: reply });
      if (!state.files[state.active]) state.active = Object.keys(state.files)[0] || 'index.html';
      renderFiles(); renderEditor(); run(); save();
      setStatus('Cambios recibidos de Gemini · revisá la vista previa', 'success');
    } catch (error) {
      addMessage('assistant', 'No pude completar esta operación: ' + error.message);
      setStatus(error.message, 'error');
    } finally {
      state.busy = false;
      if ($('programmer-send')) $('programmer-send').disabled = false;
      field?.focus();
    }
  }
  function open() {
    const panel = $('programmer-panel');
    if (!panel) return false;
    load(); state.open = true; panel.hidden = false; panel.setAttribute('aria-hidden', 'false');
    document.body.classList.add('programmer-open');
    renderFiles(); renderEditor(); run();
    if (!$('programmer-chat')?.children.length) addMessage('assistant', 'Soy tu Programador IA 2.0. Puedo crear aplicaciones web, editar archivos, revisar errores y mejorar proyectos. Los cambios se guardan en este dispositivo; ejecutá la vista previa para comprobarlos.');
    $('programmer-prompt')?.focus();
    return true;
  }
  function close() {
    syncEditor(); save();
    const panel = $('programmer-panel');
    if (panel) { panel.hidden = true; panel.setAttribute('aria-hidden', 'true'); }
    document.body.classList.remove('programmer-open'); state.open = false;
    return true;
  }
  function bind() {
    $('programmer-close')?.addEventListener('click', close);
    $('programmer-send')?.addEventListener('click', send);
    $('programmer-prompt')?.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send(); } });
    $('programmer-editor')?.addEventListener('input', () => { syncEditor(); save(); setStatus('Cambios locales guardados', 'idle'); });
    $('programmer-run')?.addEventListener('click', run);
    $('programmer-fix-errors')?.addEventListener('click', () => { if (!state.lastErrors) { setStatus('No hay errores de ejecución detectados en la vista previa.', 'idle'); return; } send('Corregí este error de ejecución detectado en la vista previa y revisá los archivos relacionados: ' + state.lastErrors); });
    window.addEventListener('message', event => { const frame = $('programmer-preview'); if (event.source !== frame?.contentWindow || event.data?.type !== 'cutreal-preview-error') return; state.lastErrors = String(event.data.message || 'Error desconocido') + (event.data.line ? ' · línea ' + event.data.line : ''); setStatus('Error detectado: ' + state.lastErrors, 'error'); });
    $('programmer-new-file')?.addEventListener('click', () => {
      const path = prompt('Nombre del nuevo archivo (por ejemplo: app.js)');
      if (!path || !safeFilePath(path) || state.files[path]) return;
      syncEditor(); state.files[path] = ''; state.active = path; renderFiles(); renderEditor(); save();
    });
    $('programmer-download')?.addEventListener('click', () => {
      syncEditor();
      const blob = new Blob([JSON.stringify(state.files, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob); const link = document.createElement('a');
      link.href = url; link.download = 'cut-real-proyecto.json'; link.click(); URL.revokeObjectURL(url);
    });
    $('programmer-reset')?.addEventListener('click', () => {
      if (!confirm('¿Restaurar los archivos iniciales? Esta acción reemplaza el proyecto local actual.')) return;
      state.files = { ...defaults }; state.active = 'index.html'; state.history = [];
      const feed = $('programmer-chat'); if (feed) feed.innerHTML = '';
      renderFiles(); renderEditor(); run(); save(); addMessage('assistant', 'Proyecto inicial restaurado.');
    });
  }
  window.CutRealProgrammer = { open, close, run, getState: () => ({ files: { ...state.files }, active: state.active }) };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once: true }); else bind();
})();
