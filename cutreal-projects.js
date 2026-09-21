/* CUT-REAL PROJECTS · editor asistido por IA, aislado de Chat Normal y Sandbox */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const key = 'cutreal-projects-state';
  const vaultKey = 'cutreal-project-vault-v1';
  const MAX_VERSIONS = 40;
  const state = { projects: [], active: null };
  let codeMirrorInstance = null;

  const defaultFiles = () => ({
    'index.html': '<!doctype html>\n<html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><h1>Proyecto</h1></body></html>',
    'style.css': 'body { font-family: sans-serif; }',
    'script.js': 'console.log("Proyecto listo");'
  });
  const defaults = () => ({ id: `project-${crypto.randomUUID?.() || Date.now()}`, name: 'Nuevo proyecto', category: 'programacion', model: 'pro', messages: [], files: defaultFiles(), activeFile: 'index.html', versions: [] });
  const esc = value => String(value ?? '').replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]));
  const clone = value => JSON.parse(JSON.stringify(value));
  const safeFileName = value => { const file = String(value || '').trim().replace(/\\/g, '/'); return /^(?!\/)(?!.*\.\.)[A-Za-z0-9][A-Za-z0-9._/-]{0,95}$/.test(file) ? file : ''; };

  function normaliseProject(project) {
    const base = defaults();
    return { ...base, ...project, files: { ...defaultFiles(), ...(project?.files || {}) }, messages: Array.isArray(project?.messages) ? project.messages : [], versions: Array.isArray(project?.versions) ? project.versions : [] };
  }
  function load() {
    try {
      const data = JSON.parse(localStorage.getItem(key) || '{}');
      state.projects = Array.isArray(data.projects) ? data.projects.map(normaliseProject) : [];
      state.active = data.active || state.projects[0]?.id || null;
    } catch (_) { state.projects = []; }
  }
  function save() { try { localStorage.setItem(key, JSON.stringify(state)); } catch (_) {} }
  function active() { return state.projects.find(item => item.id === state.active); }
  function open() { const panel = $('cutreal-projects'); if (!panel) return false; panel.hidden = false; panel.style.display = 'flex'; render(); return true; }
  function close() { const panel = $('cutreal-projects'); if (panel) { panel.hidden = true; panel.style.display = 'none'; } return true; }
  function create() { const project = defaults(); project.name = $('cutreal-project-name')?.value.trim() || project.name; project.category = $('cutreal-project-category')?.value || project.category; project.model = $('cutreal-project-model')?.value || 'pro'; recordVersion(project, 'Proyecto creado'); state.projects.unshift(project); state.active = project.id; save(); render(); }
  function remove(id = state.active) { const project = state.projects.find(item => item.id === id); if (!project) return; if (!confirm(`¿Eliminar el proyecto “${project.name}”?`)) return; state.projects = state.projects.filter(item => item.id !== id); state.active = state.projects[0]?.id || null; save(); render(); }
  function createFile() { const project = active(); const input = $('cr-project-new-file-name'); const file = safeFileName(input?.value); if (!project || !file) { setStatus('Nombre de archivo no válido. Usá letras, números, puntos, guiones o subcarpetas.'); return; } if (Object.prototype.hasOwnProperty.call(project.files, file)) { setStatus('Ese archivo ya existe.'); return; } recordVersion(project, `Antes de crear ${file}`); project.files[file] = ''; project.activeFile = file; if (input) input.value = ''; save(); renderEditor(); run(); setStatus(`Archivo creado · ${file}`); }
  function renameFile() { const project = active(); const current = project?.activeFile; if (!project || !current) return; const file = safeFileName(prompt('Nuevo nombre del archivo:', current)); if (!file || file === current) return; if (Object.prototype.hasOwnProperty.call(project.files, file)) { setStatus('Ese nombre ya está en uso.'); return; } recordVersion(project, `Antes de renombrar ${current}`); project.files[file] = project.files[current]; delete project.files[current]; project.activeFile = file; save(); renderEditor(); run(); setStatus(`Archivo renombrado · ${file}`); }
  function deleteFile() { const project = active(); const current = project?.activeFile; if (!project || !current || Object.keys(project.files).length <= 1) { setStatus('El proyecto debe conservar al menos un archivo.'); return; } if (!confirm(`¿Eliminar ${current}?`)) return; recordVersion(project, `Antes de eliminar ${current}`); delete project.files[current]; project.activeFile = Object.keys(project.files)[0]; save(); renderEditor(); run(); setStatus(`Archivo eliminado · ${current}`); }

  function snapshot(project) { return { files: clone(project.files), activeFile: project.activeFile, savedAt: Date.now() }; }
  function recordVersion(project, reason) {
    if (!project) return;
    project.versions = Array.isArray(project.versions) ? project.versions : [];
    const next = snapshot(project);
    const previous = project.versions[0];
    if (previous && JSON.stringify(previous.files) === JSON.stringify(next.files)) return;
    project.versions.unshift({ ...next, reason: String(reason || 'Cambio') });
    project.versions = project.versions.slice(0, MAX_VERSIONS);
  }
  function setStatus(text) { if ($('cr-project-status')) $('cr-project-status').textContent = text; }

  function renderList() {
    const list = $('cutreal-project-list'); if (!list) return;
    list.innerHTML = state.projects.map(item => `<div class="cr-project-row"><button type="button" class="cr-project-item ${item.id === state.active ? 'active' : ''}" data-project-id="${esc(item.id)}"><b>${esc(item.name)}</b><small>${esc(item.category)} · ${esc(item.model)}</small></button><button type="button" class="cr-project-delete" data-project-delete="${esc(item.id)}" title="Eliminar proyecto">×</button></div>`).join('') || '<p class="cr-project-empty">Creá tu primer proyecto.</p>';
    list.querySelectorAll('[data-project-id]').forEach(button => button.addEventListener('click', () => { state.active = button.dataset.projectId; save(); render(); }));
    list.querySelectorAll('[data-project-delete]').forEach(button => button.addEventListener('click', event => { event.stopPropagation(); remove(button.dataset.projectDelete); }));
  }
  function editorMode(file) { const extension = String(file).split('.').pop().toLowerCase(); return extension === 'html' || extension === 'htm' ? 'htmlmixed' : extension === 'css' ? 'css' : extension === 'json' ? { name: 'javascript', json: true } : extension === 'md' || extension === 'txt' ? 'text/plain' : 'javascript'; }
  function updateLineCount(value) { const count = String(value ?? '').split('\n').length; if ($('cr-project-lines')) $('cr-project-lines').textContent = `${count} ${count === 1 ? 'línea' : 'líneas'}`; }
  function renderEditor() {
    const project = active(); const editor = $('cr-project-editor'); const tabs = $('cr-project-file-tabs'); if (!project || !editor || !tabs) return;
    if (codeMirrorInstance) { codeMirrorInstance.toTextArea(); codeMirrorInstance = null; }
    tabs.innerHTML = Object.keys(project.files).map(file => `<button type="button" class="${file === project.activeFile ? 'active' : ''}" data-project-file="${esc(file)}">${esc(file)}</button>`).join('');
    tabs.querySelectorAll('[data-project-file]').forEach(button => button.addEventListener('click', () => { project.activeFile = button.dataset.projectFile; save(); renderEditor(); }));
    const initial = project.files[project.activeFile] || '';
    let checkpoint;
    const onChange = value => { project.files[project.activeFile] = value; updateLineCount(value); save(); clearTimeout(checkpoint); checkpoint = setTimeout(() => { recordVersion(project, `Edición manual de ${project.activeFile}`); save(); run(); setStatus(`Guardado y preview actualizado · ${project.activeFile}`); }, 700); };
    if (window.CodeMirror) {
      codeMirrorInstance = window.CodeMirror.fromTextArea(editor, { mode: editorMode(project.activeFile), theme: 'dracula', lineNumbers: true, lineWrapping: false, autoCloseBrackets: true, autoCloseTags: true, tabSize: 2, indentUnit: 2, viewportMargin: Infinity });
      codeMirrorInstance.setValue(initial); codeMirrorInstance.on('change', instance => onChange(instance.getValue()));
      setTimeout(() => codeMirrorInstance?.refresh(), 0);
    } else { editor.value = initial; editor.oninput = () => onChange(editor.value); }
    updateLineCount(initial);
  }
  function renderChat() {
    const project = active(); const chat = $('cr-project-chat'); if (!chat) return;
    chat.innerHTML = project ? project.messages.map(item => `<div class="cr-project-msg ${item.role === 'user' ? 'user' : 'ai'}"><b>${item.role === 'user' ? 'Vos' : 'IA del proyecto'}:</b> ${esc(item.content)}</div>`).join('') : '<div class="cr-project-empty">Seleccioná o creá un proyecto.</div>';
    chat.scrollTop = chat.scrollHeight;
  }
  function render() {
    renderList(); renderEditor(); renderChat(); const project = active();
    if ($('cr-project-model') && project) $('cr-project-model').value = project.model || 'pro';
    if ($('cr-project-id') && project) $('cr-project-id').textContent = `ID: ${project.id}`;
  }
  function run() {
    const project = active(); const frame = $('cr-project-preview'); if (!project || !frame) return;
    const extraCss = Object.entries(project.files).filter(([file]) => file !== 'style.css' && /\.css$/i.test(file)).map(([, content]) => `<style>${content}</style>`).join('');
    const extraJs = Object.entries(project.files).filter(([file]) => file !== 'script.js' && /\.js$/i.test(file)).map(([, content]) => `<script>${content}<\/script>`).join('');
    frame.srcdoc = `${project.files['index.html'] || ''}<style>${project.files['style.css'] || ''}</style>${extraCss}<script>${project.files['script.js'] || ''}<\/script>${extraJs}`;
    setStatus('Preview actualizado en tiempo real'); save();
  }

  function parseAiPayload(content) {
    const text = String(content || '').trim();
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    const candidate = fenced ? fenced[1].trim() : text;
    try { return JSON.parse(candidate); } catch (_) {
      const start = candidate.indexOf('{'); const end = candidate.lastIndexOf('}');
      if (start >= 0 && end > start) { try { return JSON.parse(candidate.slice(start, end + 1)); } catch (_) {} }
    }
    return { message: text, changes: [] };
  }
  function applyChanges(project, changes) {
    if (!Array.isArray(changes)) return { count: 0, files: [] };
    const changedFiles = new Set();
    for (const change of changes) {
      const file = safeFileName(change?.file);
      const operation = String(change?.operation || 'set').toLowerCase();
      if (!file) continue;
      if (operation === 'rename') {
        const oldFile = safeFileName(change?.from || change?.oldFile || change?.oldText);
        if (!oldFile || !Object.prototype.hasOwnProperty.call(project.files, oldFile) || Object.prototype.hasOwnProperty.call(project.files, file)) continue;
        project.files[file] = project.files[oldFile]; delete project.files[oldFile]; if (project.activeFile === oldFile) project.activeFile = file; changedFiles.add(file); continue;
      }
      if (operation === 'delete') { if (Object.keys(project.files).length > 1 && Object.prototype.hasOwnProperty.call(project.files, file)) { delete project.files[file]; if (project.activeFile === file) project.activeFile = Object.keys(project.files)[0]; changedFiles.add(file); } continue; }
      if (!Object.prototype.hasOwnProperty.call(project.files, file) && !['create', 'set', 'append'].includes(operation)) continue;
      const current = String(project.files[file] || '');
      if (operation === 'replace') {
        const oldText = String(change.oldText ?? change.find ?? '');
        const newText = String(change.newText ?? change.replacement ?? '');
        if (!oldText || !current.includes(oldText)) continue;
        project.files[file] = current.replace(oldText, newText);
      } else if (operation === 'append') {
        project.files[file] = current + String(change.content ?? '');
      } else if (typeof change.content === 'string') {
        project.files[file] = change.content;
      } else continue;
      changedFiles.add(file);
    }
    return { count: changedFiles.size, files: [...changedFiles] };
  }

  async function send() {
    const project = active(); const input = $('cr-project-input'); const chat = $('cr-project-chat'); const text = input?.value.trim(); if (!project || !text || !chat) return;
    input.value = ''; project.model = $('cr-project-model')?.value || project.model || 'pro'; project.messages.push({ role: 'user', content: text }); save(); renderChat();
    const thinking = document.createElement('div'); thinking.className = 'cr-project-msg ai cr-project-thinking'; thinking.innerHTML = '<b>IA del proyecto:</b> <span class="cr-project-dots"><i></i><i></i><i></i></span> Analizando y editando archivos…'; chat.appendChild(thinking); chat.scrollTop = chat.scrollHeight;
    const system = `Sos el agente exclusivo del proyecto ${project.name}. Categoría: ${project.category}. No mezcles Sandbox, SUPER ni Chat Normal. Sos un agente de desarrollo con acceso directo al editor: podés leer, crear, modificar, renombrar y eliminar archivos del proyecto sin pedirle al usuario que copie el código. Conocés y debés usar estas operaciones: set para escribir o crear un archivo, replace para cambios puntuales, append para agregar contenido, rename con file y from para cambiar nombres, y delete para eliminar archivos. Podés trabajar con cualquier archivo seguro (HTML, CSS, JavaScript, JSON, Markdown, SVG, TXT y subcarpetas simples), no solamente los archivos iniciales. Respondé ÚNICAMENTE JSON válido, sin Markdown, con esta forma: {"message":"explicación breve en español","changes":[{"file":"ruta/archivo.ext","operation":"set|create|replace|append|rename|delete","content":"contenido para set/create/append","oldText":"texto exacto para replace","newText":"reemplazo","from":"archivo anterior para rename"}]}. Aplicá los cambios directamente y mantené coherencia entre archivos relacionados. No le pidas al usuario el código actual: ya lo tenés en el contexto. Revisá siempre el estado actual antes de modificarlo. Archivos actuales disponibles: ${JSON.stringify(project.files)}`;
    try {
      const response = await fetch('/api/project-chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: project.model, mensajes: [{ role: 'system', content: system }, ...project.messages.slice(-14)] }) });
      const data = await response.json().catch(() => ({})); if (thinking.isConnected) thinking.remove();
      if (!response.ok) throw new Error(data.error || `El endpoint /api/project-chat respondió HTTP ${response.status}.`);
      const rawReply = data.choices?.[0]?.message?.content || data.error || '';
      const payload = parseAiPayload(rawReply); const result = applyChanges(project, payload.changes);
      if (result.count) { recordVersion(project, `IA: ${text.slice(0, 100)}`); project.messages.push({ role: 'assistant', content: `${payload.message || 'Cambios aplicados.'}\n\nArchivos actualizados en tiempo real: ${result.files.join(', ')}.` }); save(); render(); run(); }
      else { project.messages.push({ role: 'assistant', content: payload.message || rawReply || 'La IA no propuso cambios.' }); save(); renderChat(); }
      setStatus(result.count ? `IA actualizó ${result.files.join(', ')} · guardado` : 'Respuesta recibida · sin cambios de archivos');
    } catch (error) { if (thinking.isConnected) thinking.remove(); project.messages.push({ role: 'assistant', content: `No se pudo responder desde Proyectos: ${error.message}` }); save(); renderChat(); }
  }

  function vault() { try { return JSON.parse(localStorage.getItem(vaultKey) || '{}'); } catch (_) { return {}; } }
  async function vaultKeyMaterial() { const identity = window.auth?.currentUser?.uid || 'cutreal-local-device'; return crypto.subtle.importKey('raw', new TextEncoder().encode(identity), 'PBKDF2', false, ['deriveKey']); }
  async function encryptSecret(value) { const salt = crypto.getRandomValues(new Uint8Array(16)); const iv = crypto.getRandomValues(new Uint8Array(12)); const base = await vaultKeyMaterial(); const key = await crypto.subtle.deriveKey({ name:'PBKDF2', salt, iterations:100000, hash:'SHA-256' }, base, { name:'AES-GCM', length:256 }, false, ['encrypt','decrypt']); const data = await crypto.subtle.encrypt({name:'AES-GCM',iv}, key, new TextEncoder().encode(value)); return { salt:Array.from(salt), iv:Array.from(iv), data:Array.from(new Uint8Array(data)) }; }
  async function decryptSecret(record) { const base = await vaultKeyMaterial(); const key = await crypto.subtle.deriveKey({ name:'PBKDF2', salt:new Uint8Array(record.salt), iterations:100000, hash:'SHA-256' }, base, { name:'AES-GCM', length:256 }, false, ['encrypt','decrypt']); const data = await crypto.subtle.decrypt({name:'AES-GCM',iv:new Uint8Array(record.iv)}, key, new Uint8Array(record.data)); return new TextDecoder().decode(data); }
  async function saveSecret() { const project = active(); const input = $('cr-project-api-key'); if (!project || !input?.value) return; const data = vault(); data[project.id] = await encryptSecret(input.value); input.value = ''; localStorage.setItem(vaultKey, JSON.stringify(data)); if ($('cr-project-secret-status')) $('cr-project-secret-status').textContent = 'Clave cifrada localmente y oculta. No se comparte ni se envía al chat.'; }
  async function revealSecret() { const project = active(); const record = vault()[project?.id]; if (!record) return; try { const value = await decryptSecret(record); const input = $('cr-project-api-key'); if (input) { input.type = input.type === 'password' ? 'text' : 'password'; input.value = input.type === 'text' ? value : ''; } } catch (_) { if ($('cr-project-secret-status')) $('cr-project-secret-status').textContent = 'No se pudo descifrar con esta sesión de usuario.'; } }
  async function shareProject() { const project = active(); if (!project) return; const payload = { id: project.id, name: project.name, category: project.category, model: project.model, messages: project.messages, files: project.files, versions: project.versions }; const ownerUid = window.auth?.currentUser?.uid || null; const packed = btoa(unescape(encodeURIComponent(JSON.stringify(payload)))); const text = `${location.origin}${location.pathname}?project=${encodeURIComponent(project.id)}&data=${encodeURIComponent(packed)}`; try { if (window.firestore && window.db) { const { doc, setDoc } = window.firestore; await setDoc(doc(window.db, 'sharedProjects', project.id), { ...payload, ownerUid, sharedAt: Date.now() }); } } catch (_) {} try { await navigator.clipboard?.writeText(text); } catch (_) {} if ($('cr-project-share-status')) $('cr-project-share-status').textContent = `Enlace copiado. ID: ${project.id}`; }
  async function importProject() { const input = $('cr-project-import-id'); const raw = input?.value.trim(); if (!raw) return; const urlMatch = raw.match(/[?&]data=([^&]+)/); const embedded = urlMatch?.[1]; const id = raw.includes('project=') ? decodeURIComponent(raw.match(/[?&]project=([^&]+)/)?.[1] || raw) : raw; if (embedded) { try { const data = normaliseProject(JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(embedded)))))); state.projects.unshift(data); state.active = data.id; save(); render(); if ($('cr-project-share-status')) $('cr-project-share-status').textContent = 'Proyecto compartido abierto desde el enlace.'; return; } catch (_) {} } try { if (window.firestore && window.db) { const { doc, getDoc } = window.firestore; const snap = await getDoc(doc(window.db, 'sharedProjects', id)); if (!snap.exists()) throw new Error('No se encontró ese proyecto.'); const data = normaliseProject({ ...snap.data(), id }); state.projects.unshift(data); state.active = id; save(); render(); if ($('cr-project-share-status')) $('cr-project-share-status').textContent = 'Proyecto compartido importado.'; } } catch (error) { if ($('cr-project-share-status')) $('cr-project-share-status').textContent = error.message; } }
  function restoreVersion(versionIndex = 0) { const project = active(); const version = project?.versions?.[versionIndex]; if (!project || !version) return false; recordVersion(project, 'Antes de restaurar una versión'); project.files = clone(version.files); project.activeFile = version.activeFile || 'index.html'; save(); render(); run(); return true; }
  function toggleProjectPanel(panelId, buttonId) { const panel = $(panelId); if (!panel) return; panel.classList.toggle('cr-project-panel-expanded'); if (panel.classList.contains('cr-project-panel-expanded') && codeMirrorInstance) setTimeout(() => codeMirrorInstance.refresh(), 0); const button = $(buttonId); if (button) button.setAttribute('aria-label', panel.classList.contains('cr-project-panel-expanded') ? 'Reducir panel' : 'Ampliar panel'); }
  function toggleFullscreen() { const card = $('cutreal-projects')?.querySelector('.cr-project-card'); if (!card) return; if (document.fullscreenElement) { document.exitFullscreen?.(); } else if (card.requestFullscreen) { card.requestFullscreen().catch(() => card.classList.toggle('cr-project-fullscreen-fallback')); } else card.classList.toggle('cr-project-fullscreen-fallback'); }
  function togglePreviewViewport() { const panel = $('cr-project-preview-shell'); const button = $('cr-project-preview-expand'); if (!panel) return; const expanded = panel.classList.toggle('cr-project-preview-viewport'); document.body.classList.toggle('cr-project-preview-open', expanded); if (button) { button.setAttribute('aria-label', expanded ? 'Cerrar vista grande del preview' : 'Abrir preview en pantalla completa'); button.textContent = expanded ? '×' : '⛶'; } }
  function bind() { $('cr-project-close')?.addEventListener('click', close); $('cutreal-project-create')?.addEventListener('click', create); $('cr-project-run')?.addEventListener('click', run); $('cr-project-send')?.addEventListener('click', send); $('cr-project-delete-current')?.addEventListener('click', () => remove()); $('cr-project-share')?.addEventListener('click', shareProject); $('cr-project-import')?.addEventListener('click', importProject); $('cr-project-save-secret')?.addEventListener('click', saveSecret); $('cr-project-reveal-secret')?.addEventListener('click', revealSecret); $('cr-project-new-file')?.addEventListener('click', createFile); $('cr-project-rename-file')?.addEventListener('click', renameFile); $('cr-project-delete-file')?.addEventListener('click', deleteFile); $('cr-project-fullscreen')?.addEventListener('click', toggleFullscreen); $('cr-project-editor-expand')?.addEventListener('click', () => toggleProjectPanel('cr-project-editor-shell', 'cr-project-editor-expand')); $('cr-project-preview-expand')?.addEventListener('click', togglePreviewViewport); $('cr-project-model')?.addEventListener('change', event => { const project = active(); if (project) { project.model = event.target.value; save(); renderList(); } }); $('cr-project-new-file-name')?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); createFile(); } }); $('cr-project-input')?.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }); document.addEventListener('keydown', event => { if (event.key === 'Escape' && $('cr-project-preview-shell')?.classList.contains('cr-project-preview-viewport')) togglePreviewViewport(); }); }
  load(); if (!state.projects.length) { const starter = defaults(); starter.name = 'Mi primer proyecto'; recordVersion(starter, 'Estado inicial'); state.projects.push(starter); state.active = starter.id; save(); }
  window.CutRealProjects = { open, close, create, remove, shareProject, restoreVersion, getState: () => state };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once: true }); else bind();
})();
