// ============================================================
//  workspace.js — Cut-real AI · WORKSPACE (dentro del Sandbox)
//
//  Editor de código real + preview en iframe aislado, integrado
//  al MISMO agente y Tool Registry que ya usa sandbox.js (no
//  duplica el loop de autonomía ni la llamada a OpenRouter).
//
//  REQUIERE (ver INTEGRATION.md):
//   - Que sandbox.js exponga: window.CutRealSandbox.registerTool,
//     .bridge, .getCurrentSandboxId(), .getCurrentUser()
//   - CodeMirror 5 cargado por CDN antes de este script.
//   - El HTML del panel #sbx-panel-workspace dentro de #sandbox-overlay.
//
//  Persistencia (Firestore, reusa window.db/auth/firestore ya
//  inicializados por index.html — no crea una segunda instancia):
//    chats/{uid}/sandboxes/{sandboxId}/workspace_files/{fileId}
//    chats/{uid}/sandboxes/{sandboxId}/workspace_meta/state
//    chats/{uid}/sandboxes/{sandboxId}/workspace_history/{changeId}
//
//  Seguridad del preview: iframe con sandbox="allow-scripts"
//  SIN "allow-same-origin" → el iframe corre en un origen opaco,
//  no puede tocar el DOM del padre, Firebase, localStorage ni
//  tokens. Toda comunicación es vía postMessage, validando
//  e.source === iframe.contentWindow.
// ============================================================
(function () {
  'use strict';

  const MAX_FILES          = 60;
  const MAX_FILE_SIZE      = 120000;   // caracteres
  const SAVE_DEBOUNCE_MS   = 1200;
  const RUN_DEBOUNCE_MS    = 500;
  const MAX_RUNTIME_ERRORS = 30;
  const MAX_HISTORY        = 200;

  const $ = (id) => document.getElementById(id);
  const escapeHtml = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const genId = () => 'f_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  const wks = {
    sandboxId: null,
    files: new Map(),      // path -> { id, path, content, language, updatedAt, updatedBy }
    folders: new Set(),    // carpetas vacías creadas explícitamente
    activeFile: null,
    cm: null,
    runtimeErrors: [],
    dirty: new Set(),
    loaded: false,
    loading: false,
    runTimer: null,
  };

  function debounce(fn, ms) {
    let t = null;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  function cu() { return window.CutRealSandbox && window.CutRealSandbox.getCurrentUser(); }
  function sid() { return window.CutRealSandbox && window.CutRealSandbox.getCurrentSandboxId(); }
  function toast(msg, color, icon) { if (window.showToast) window.showToast(msg, color, icon); }

  // ============================================================
  //  FIRESTORE
  // ============================================================
  function filesCol() {
    const { collection } = window.firestore;
    return collection(window.db, 'chats', cu().uid, 'sandboxes', wks.sandboxId, 'workspace_files');
  }
  function fileDocRef(id) {
    const { doc } = window.firestore;
    return doc(window.db, 'chats', cu().uid, 'sandboxes', wks.sandboxId, 'workspace_files', id);
  }
  function metaDocRef() {
    const { doc } = window.firestore;
    return doc(window.db, 'chats', cu().uid, 'sandboxes', wks.sandboxId, 'workspace_meta', 'state');
  }
  function historyColRef() {
    const { collection } = window.firestore;
    return collection(window.db, 'chats', cu().uid, 'sandboxes', wks.sandboxId, 'workspace_history');
  }

  async function logHistory(action, path, by) {
    try {
      const { doc, setDoc } = window.firestore;
      const id = genId();
      await setDoc(doc(historyColRef(), id), { action, path, by, at: Date.now() });
    } catch (e) { /* no crítico */ }
  }

  const scheduleSaveFile = debounce((path) => persistFile(path), SAVE_DEBOUNCE_MS);
  const scheduleSaveMeta = debounce(() => persistMeta(), SAVE_DEBOUNCE_MS);
  const scheduleRun = debounce(() => runProject(), RUN_DEBOUNCE_MS);

  async function persistFile(path) {
    const file = wks.files.get(path);
    if (!file || !cu() || !wks.sandboxId) return;
    try {
      const { setDoc } = window.firestore;
      await setDoc(fileDocRef(file.id), {
        path: file.path, content: file.content, language: file.language,
        updatedAt: Date.now(), updatedBy: file.updatedBy || 'user',
      }, { merge: true });
      wks.dirty.delete(path);
      renderFileTree();
      setStatus('Guardado', 'ok');
    } catch (e) { setStatus('Error guardando: ' + e.message, 'error'); }
  }

  async function persistMeta() {
    if (!cu() || !wks.sandboxId) return;
    try {
      const { setDoc } = window.firestore;
      await setDoc(metaDocRef(), {
        activeFile: wks.activeFile,
        folders: Array.from(wks.folders),
        updatedAt: Date.now(),
      }, { merge: true });
    } catch (e) { /* no crítico */ }
  }

  async function loadWorkspace(force) {
    const currentSid = sid();
    if (!currentSid || !cu()) return;
    if (wks.loaded && wks.sandboxId === currentSid && !force) return;
    if (wks.loading) return;
    wks.loading = true;
    wks.sandboxId = currentSid;
    wks.files.clear(); wks.folders.clear(); wks.dirty.clear(); wks.activeFile = null;
    setStatus('Cargando…', '');
    try {
      const { getDocs, getDoc } = window.firestore;
      const snap = await getDocs(filesCol());
      snap.forEach(d => {
        const data = d.data();
        wks.files.set(data.path, { id: d.id, path: data.path, content: data.content || '', language: data.language || languageForPath(data.path), updatedAt: data.updatedAt, updatedBy: data.updatedBy || 'user' });
      });
      const metaSnap = await getDoc(metaDocRef());
      if (metaSnap.exists()) {
        const meta = metaSnap.data();
        (meta.folders || []).forEach(f => wks.folders.add(f));
        wks.activeFile = meta.activeFile || null;
      }
      if (wks.files.size === 0) {
        seedDefaultProject();
      }
      if (!wks.activeFile || !wks.files.has(wks.activeFile)) {
        wks.activeFile = wks.files.has('index.html') ? 'index.html' : (wks.files.keys().next().value || null);
      }
      renderFileTree();
      renderEditorTabs();
      if (wks.activeFile) openFileInEditor(wks.activeFile);
      wks.loaded = true;
      setStatus(`${wks.files.size} archivo(s)`, 'ok');
      scheduleRun();
    } catch (e) {
      setStatus('Error cargando Workspace: ' + e.message, 'error');
    } finally {
      wks.loading = false;
    }
  }

  function seedDefaultProject() {
    createFileLocal('index.html', DEFAULT_HTML, 'user', false);
    createFileLocal('style.css', DEFAULT_CSS, 'user', false);
    createFileLocal('script.js', DEFAULT_JS, 'user', false);
  }

  const DEFAULT_HTML = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <h1>Nuevo proyecto</h1>
  <p>Editá los archivos de la izquierda. Este proyecto corre en un iframe aislado.</p>
  <script src="script.js"></script>
</body>
</html>`;
  const DEFAULT_CSS = `body {
  font-family: sans-serif;
  background: #0b0b0b;
  color: #eee;
  padding: 40px;
}
h1 { color: #33ff77; }`;
  const DEFAULT_JS = `console.log("Workspace listo.");`;

  // ============================================================
  //  MODELO DE ARCHIVOS (local, sincroniza con Firestore aparte)
  // ============================================================
  function languageForPath(path) {
    const ext = (path.split('.').pop() || '').toLowerCase();
    if (ext === 'html' || ext === 'htm') return 'htmlmixed';
    if (ext === 'css') return 'css';
    if (ext === 'js' || ext === 'mjs') return 'javascript';
    if (ext === 'json') return { name: 'javascript', json: true };
    if (ext === 'md') return 'markdown';
    return 'text/plain';
  }
  function fileIcon(path) {
    const ext = (path.split('.').pop() || '').toLowerCase();
    if (ext === 'html' || ext === 'htm') return '🌐';
    if (ext === 'css') return '🎨';
    if (ext === 'js' || ext === 'mjs') return '📜';
    if (ext === 'json') return '🔧';
    return '📄';
  }
  function normalizePath(p) {
    return String(p || '').trim().replace(/^\/+/, '').replace(/\/{2,}/g, '/');
  }

  function createFileLocal(path, content, by, save) {
    path = normalizePath(path);
    if (!path) throw new Error('Ruta de archivo vacía.');
    if (wks.files.has(path)) throw new Error(`Ya existe un archivo en "${path}".`);
    if (wks.files.size >= MAX_FILES) throw new Error(`Límite de ${MAX_FILES} archivos alcanzado.`);
    if ((content || '').length > MAX_FILE_SIZE) throw new Error('Archivo demasiado grande.');
    const file = { id: genId(), path, content: content || '', language: languageForPath(path), updatedAt: Date.now(), updatedBy: by };
    wks.files.set(path, file);
    if (save !== false) { scheduleSaveFile(path); scheduleSaveMeta(); logHistory('created', path, by); }
    return file;
  }

  function updateFileLocal(path, content, by) {
    const file = wks.files.get(path);
    if (!file) throw new Error(`Archivo no encontrado: "${path}".`);
    if ((content || '').length > MAX_FILE_SIZE) throw new Error('Archivo demasiado grande.');
    file.content = content;
    file.updatedAt = Date.now();
    file.updatedBy = by;
    wks.dirty.add(path);
    scheduleSaveFile(path);
    logHistory('updated', path, by);
    return file;
  }

  async function deleteFileLocal(path, by) {
    const file = wks.files.get(path);
    if (!file) throw new Error(`Archivo no encontrado: "${path}".`);
    wks.files.delete(path);
    wks.dirty.delete(path);
    try { const { deleteDoc } = window.firestore; await deleteDoc(fileDocRef(file.id)); } catch (e) {}
    logHistory('deleted', path, by);
    if (wks.activeFile === path) {
      wks.activeFile = wks.files.keys().next().value || null;
      if (wks.activeFile) openFileInEditor(wks.activeFile); else clearEditor();
    }
    scheduleSaveMeta();
    renderFileTree(); renderEditorTabs(); scheduleRun();
  }

  async function renameFileLocal(oldPath, newPath, by) {
    oldPath = normalizePath(oldPath); newPath = normalizePath(newPath);
    const file = wks.files.get(oldPath);
    if (!file) throw new Error(`Archivo no encontrado: "${oldPath}".`);
    if (wks.files.has(newPath)) throw new Error(`Ya existe un archivo en "${newPath}".`);
    wks.files.delete(oldPath);
    file.path = newPath; file.language = languageForPath(newPath); file.updatedAt = Date.now(); file.updatedBy = by;
    wks.files.set(newPath, file);
    if (wks.activeFile === oldPath) wks.activeFile = newPath;
    try {
      const { setDoc } = window.firestore;
      await setDoc(fileDocRef(file.id), { path: newPath, content: file.content, language: file.language, updatedAt: Date.now(), updatedBy: by }, { merge: true });
    } catch (e) {}
    logHistory('renamed', `${oldPath} → ${newPath}`, by);
    scheduleSaveMeta();
    renderFileTree(); renderEditorTabs(); scheduleRun();
  }

  function createFolderLocal(path, by) {
    path = normalizePath(path);
    if (!path) throw new Error('Ruta de carpeta vacía.');
    wks.folders.add(path);
    logHistory('created', path + '/', by);
    scheduleSaveMeta();
    renderFileTree();
  }

  // ============================================================
  //  ÁRBOL DE ARCHIVOS — UI
  // ============================================================
  function buildTree() {
    const root = { children: {} };
    function ensureFolder(parts) {
      let node = root;
      for (const part of parts) {
        if (!part) continue;
        if (!node.children[part]) node.children[part] = { children: {}, type: 'folder' };
        node = node.children[part];
      }
      return node;
    }
    wks.folders.forEach(f => ensureFolder(f.split('/')));
    wks.files.forEach((file, path) => {
      const parts = path.split('/');
      const name = parts.pop();
      const parent = ensureFolder(parts);
      parent.children[name] = { type: 'file', path: file.path, name };
    });
    return root;
  }

  function renderNode(node, depth) {
    const entries = Object.entries(node.children).map(([name, n]) => ({ name, ...n }))
      .sort((a, b) => (a.type !== b.type) ? (a.type === 'folder' ? -1 : 1) : a.name.localeCompare(b.name));
    return entries.map(entry => {
      if (entry.type === 'folder') {
        return `<div class="wks-tree-folder" style="padding-left:${depth * 12}px">📁 ${escapeHtml(entry.name)}</div>${renderNode(entry, depth + 1)}`;
      }
      const active = entry.path === wks.activeFile ? 'active' : '';
      const dirty = wks.dirty.has(entry.path) ? '<span class="wks-file-dirty">●</span>' : '';
      return `<div class="wks-tree-file ${active}" style="padding-left:${depth * 12 + 12}px" data-path="${escapeHtml(entry.path)}">
        <span class="wks-file-icon">${fileIcon(entry.path)}</span>
        <span class="wks-file-name">${escapeHtml(entry.name)}</span>
        ${dirty}
        <button class="wks-file-del" data-path="${escapeHtml(entry.path)}" title="Eliminar">🗑️</button>
      </div>`;
    }).join('');
  }

  function renderFileTree() {
    const el = $('wks-file-tree');
    if (!el) return;
    if (wks.files.size === 0 && wks.folders.size === 0) {
      el.innerHTML = '<div class="wks-tree-empty">Sin archivos todavía.<br>Creá uno con "📄 Nuevo archivo".</div>';
      return;
    }
    el.innerHTML = renderNode(buildTree(), 0);
  }

  function renderEditorTabs() {
    const el = $('wks-editor-tabs');
    if (!el) return;
    const openPaths = wks.activeFile ? [wks.activeFile] : [];
    el.innerHTML = openPaths.map(p => `
      <div class="wks-editor-tab active" data-path="${escapeHtml(p)}">
        ${fileIcon(p)} ${escapeHtml(p)}${wks.dirty.has(p) ? ' ●' : ''}
      </div>`).join('') || '';
  }

  // ============================================================
  //  EDITOR — CodeMirror
  // ============================================================
  function ensureEditor() {
    if (wks.cm || typeof CodeMirror === 'undefined') return;
    const mount = $('wks-editor-mount');
    if (!mount) return;
    mount.innerHTML = '';
    wks.cm = CodeMirror(mount, {
      value: '', lineNumbers: true, theme: 'dracula', mode: 'htmlmixed',
      autoCloseTags: true, matchBrackets: true, tabSize: 2, indentUnit: 2,
      extraKeys: { 'Ctrl-S': saveActiveFile, 'Cmd-S': saveActiveFile },
    });
    wks.cm.on('change', () => {
      if (!wks.activeFile) return;
      const content = wks.cm.getValue();
      const file = wks.files.get(wks.activeFile);
      if (file && file.content === content) return;
      updateFileLocal(wks.activeFile, content, 'user');
      renderFileTree(); renderEditorTabs();
      scheduleRun();
    });
  }

  function saveActiveFile() {
    if (wks.activeFile) persistFile(wks.activeFile);
  }

  function openFileInEditor(path) {
    const file = wks.files.get(path);
    if (!file) return;
    wks.activeFile = path;
    ensureEditor();
    if (wks.cm) {
      wks.cm.setOption('mode', file.language);
      wks.cm.setValue(file.content || '');
      setTimeout(() => wks.cm.refresh(), 30);
    }
    renderFileTree(); renderEditorTabs(); scheduleSaveMeta();
  }

  function clearEditor() {
    wks.activeFile = null;
    if (wks.cm) wks.cm.setValue('');
    renderEditorTabs();
  }

  // ============================================================
  //  PREVIEW — iframe aislado
  // ============================================================
  function buildPreviewDoc() {
    const entry = wks.files.get('index.html');
    if (!entry) return null;
    let html = entry.content;

    // Inline de <link rel="stylesheet" href="X"> que apunten a archivos del proyecto
    html = html.replace(/<link[^>]+href=["']([^"']+)["'][^>]*>/gi, (match, href) => {
      const clean = normalizePath(href);
      const file = wks.files.get(clean);
      if (file && file.language === 'css') return `<style>\n${file.content}\n</style>`;
      return match;
    });

    // Inline de <script src="X"></script> que apunten a archivos del proyecto
    html = html.replace(/<script[^>]+src=["']([^"']+)["'][^>]*>\s*<\/script>/gi, (match, src) => {
      const clean = normalizePath(src);
      const file = wks.files.get(clean);
      if (file) return `<script>\n${file.content}\n</script>`;
      return match;
    });

    const bridgeScript = `
<script>
(function(){
  function send(type,payload){ try{ parent.postMessage({__cutrealWorkspace:true, type, payload}, '*'); }catch(e){} }
  window.addEventListener('error', function(e){
    send('error', { message: String(e.message||'Error'), line: e.lineno, col: e.colno });
  });
  window.addEventListener('unhandledrejection', function(e){
    send('error', { message: 'Promesa rechazada: ' + (e.reason && e.reason.message || e.reason) });
  });
  var _log = console.log;
  console.log = function(){ send('log', { args: Array.prototype.slice.call(arguments).map(String) }); _log.apply(console, arguments); };
  window.CutReal3D = {
    createObject: function(meta){ send('bridge', {action:'createObject', args:[meta]}); },
    deleteObject: function(id){ send('bridge', {action:'deleteObject', args:[id]}); },
    moveObject: function(id,position,duration){ send('bridge', {action:'moveObject', args:[id,position,duration]}); },
    rotateObject: function(id,rotation,duration){ send('bridge', {action:'rotateObject', args:[id,rotation,duration]}); },
    scaleObject: function(id,scale,duration){ send('bridge', {action:'scaleObject', args:[id,scale,duration]}); },
    setColor: function(id,color){ send('bridge', {action:'setColor', args:[id,color]}); },
    createText: function(text,position,color){ send('bridge', {action:'createText', args:[text,position,color]}); },
  };
  send('ready', {});
})();
<\/script>`;

    if (/<head[^>]*>/i.test(html)) html = html.replace(/<head[^>]*>/i, (m) => m + bridgeScript);
    else html = bridgeScript + html;

    return html;
  }

  function runProject() {
    const frame = $('wks-preview-frame');
    const col = document.querySelector('.wks-preview-col');
    if (!frame) return;
    const doc = buildPreviewDoc();
    if (!doc) {
      if (col) col.innerHTML = '<div class="wks-preview-empty">Creá un archivo "index.html" para ver el preview.</div>';
      return;
    }
    if (!frame.isConnected && col) { col.innerHTML = ''; col.appendChild(frame); }
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.srcdoc = doc;
    logConsole('info', 'Proyecto ejecutado.');
  }

  window.addEventListener('message', (e) => {
    const frame = $('wks-preview-frame');
    if (!frame || e.source !== frame.contentWindow) return;
    const d = e.data;
    if (!d || !d.__cutrealWorkspace) return;
    if (d.type === 'error') {
      wks.runtimeErrors.push({ message: d.payload.message, line: d.payload.line, col: d.payload.col, ts: Date.now() });
      if (wks.runtimeErrors.length > MAX_RUNTIME_ERRORS) wks.runtimeErrors.shift();
      logConsole('error', d.payload.message + (d.payload.line ? ` (línea ${d.payload.line})` : ''));
    } else if (d.type === 'log') {
      logConsole('info', (d.payload.args || []).join(' '));
    } else if (d.type === 'bridge') {
      const api = window.CutRealSandbox && window.CutRealSandbox.bridge;
      if (api && typeof api[d.payload.action] === 'function') {
        try { api[d.payload.action](...(d.payload.args || [])); logConsole('ai', `Sandbox 3D: ${d.payload.action}`); }
        catch (err) { logConsole('error', 'Bridge 3D: ' + err.message); }
      }
    }
  });

  function logConsole(kind, text) {
    const el = $('wks-console');
    if (!el) return;
    const time = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const line = document.createElement('div');
    line.className = 'wks-console-item wks-console-' + kind;
    line.innerHTML = `<span class="wks-console-time">[${time}]</span><span>${escapeHtml(text)}</span>`;
    el.appendChild(line);
    el.scrollTop = el.scrollHeight;
    while (el.children.length > 60) el.removeChild(el.firstChild);
  }

  function setStatus(text, kind) {
    const el = $('wks-status');
    if (!el) return;
    el.textContent = text;
    el.className = 'wks-status' + (kind === 'error' ? ' wks-status-error' : kind === 'ok' ? ' wks-status-ok' : '');
  }

  // ============================================================
  //  HERRAMIENTAS DEL AGENTE — se registran en el Tool Registry
  //  de sandbox.js (window.CutRealSandbox.registerTool), NO se
  //  crea un loop de agente paralelo.
  // ============================================================
  const WORKSPACE_TOOLS = {
    create_file: ({ path, content }) => {
      const f = createFileLocal(path, content || '', 'ai');
      renderFileTree(); renderEditorTabs(); scheduleRun();
      logConsole('ai', `Archivo creado: ${f.path}`);
      return { ok: true, path: f.path };
    },
    read_file: ({ path }) => {
      const file = wks.files.get(normalizePath(path));
      if (!file) return { ok: false, error: 'No existe: ' + path };
      return { ok: true, path: file.path, content: file.content };
    },
    update_file: ({ path, content }) => {
      const clean = normalizePath(path);
      updateFileLocal(clean, content || '', 'ai');
      if (wks.activeFile === clean && wks.cm) wks.cm.setValue(content || '');
      renderFileTree(); renderEditorTabs(); scheduleRun();
      logConsole('ai', `Archivo modificado: ${clean}`);
      return { ok: true };
    },
    delete_file: ({ path }) => {
      deleteFileLocal(normalizePath(path), 'ai');
      logConsole('ai', `Archivo eliminado: ${path}`);
      return { ok: true };
    },
    rename_file: ({ path, newPath }) => {
      renameFileLocal(path, newPath, 'ai');
      logConsole('ai', `Renombrado: ${path} → ${newPath}`);
      return { ok: true };
    },
    create_folder: ({ path }) => {
      createFolderLocal(path, 'ai');
      return { ok: true };
    },
    list_files: () => ({ files: Array.from(wks.files.keys()) }),
    run_project: () => { runProject(); return { ok: true }; },
    get_runtime_errors: () => ({ errors: wks.runtimeErrors.slice(-10) }),
    get_project_structure: () => ({ structure: Array.from(wks.files.keys()), folders: Array.from(wks.folders) }),
  };

  function registerTools() {
    if (!window.CutRealSandbox || typeof window.CutRealSandbox.registerTool !== 'function') {
      setTimeout(registerTools, 400); // sandbox.js puede cargar después
      return;
    }
    Object.entries(WORKSPACE_TOOLS).forEach(([name, fn]) => window.CutRealSandbox.registerTool(name, fn));
  }

  // Contexto que el loop del agente (en sandbox.js) le manda a OpenRouter
  function getContextForAgent() {
    return {
      files: Array.from(wks.files.values()).map(f => ({ path: f.path, language: f.language, size: f.content.length })),
      activeFile: wks.activeFile,
      runtimeErrorCount: wks.runtimeErrors.length,
      lastErrors: wks.runtimeErrors.slice(-3).map(e => e.message),
    };
  }

  // ============================================================
  //  UI — botones, tabs, delegación de eventos
  // ============================================================
  function bindUI() {
    $('wks-new-file-btn')?.addEventListener('click', () => {
      const name = prompt('Nombre del archivo (ej: components/card.js):');
      if (!name) return;
      try { createFileLocal(name, '', 'user'); wks.activeFile = normalizePath(name); openFileInEditor(wks.activeFile); renderFileTree(); scheduleRun(); }
      catch (e) { toast(e.message, '#ff4444', '❌'); }
    });
    $('wks-new-folder-btn')?.addEventListener('click', () => {
      const name = prompt('Nombre de la carpeta:');
      if (!name) return;
      try { createFolderLocal(name, 'user'); } catch (e) { toast(e.message, '#ff4444', '❌'); }
    });
    $('wks-run-btn')?.addEventListener('click', runProject);

    $('wks-file-tree')?.addEventListener('click', (e) => {
      const delBtn = e.target.closest('.wks-file-del');
      if (delBtn) {
        e.stopPropagation();
        const path = delBtn.dataset.path;
        if (confirm(`¿Eliminar "${path}"? No se puede deshacer.`)) deleteFileLocal(path, 'user');
        return;
      }
      const item = e.target.closest('.wks-tree-file');
      if (item) openFileInEditor(item.dataset.path);
    });

    document.querySelectorAll('.wks-mtab').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.wks-mtab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const target = btn.dataset.target;
        document.querySelectorAll('.wks-layout > div').forEach(col => col.classList.toggle('wks-col-active', col.dataset.panel === target));
        if (target === 'editor' && wks.cm) setTimeout(() => wks.cm.refresh(), 30);
      });
    });

    // Botón/tab "Workspace" del Sandbox
    $('sandbox-workspace-btn')?.addEventListener('click', () => {
      const overlay = $('sandbox-overlay');
      const showing = overlay?.classList.contains('sbx-show-workspace');
      overlay?.classList.toggle('sbx-show-workspace', !showing);
      if (!showing) { ensureEditor(); loadWorkspace(false); setTimeout(() => wks.cm && wks.cm.refresh(), 60); }
    });
    $('sandbox-tab-workspace')?.addEventListener('click', () => {
      document.querySelectorAll('.sbx-mobile-tabs button').forEach(b => b.classList.remove('active'));
      $('sandbox-tab-workspace')?.classList.add('active');
      $('sandbox-overlay')?.classList.remove('sbx-show-scene');
      $('sandbox-overlay')?.classList.add('sbx-show-workspace');
      ensureEditor(); loadWorkspace(false);
      setTimeout(() => wks.cm && wks.cm.refresh(), 60);
    });
    // Si el usuario vuelve a Chat/Escena, salimos del modo Workspace
    $('sandbox-tab-chat')?.addEventListener('click', () => $('sandbox-overlay')?.classList.remove('sbx-show-workspace'));
    $('sandbox-tab-scene')?.addEventListener('click', () => $('sandbox-overlay')?.classList.remove('sbx-show-workspace'));
  }

  document.addEventListener('DOMContentLoaded', () => { bindUI(); registerTools(); });

  // ---------- API PÚBLICA ----------
  window.CutRealWorkspace = {
    getContextForAgent,
    reload: () => loadWorkspace(true),
    run: runProject,
  };

})();
