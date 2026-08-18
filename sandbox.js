// ============================================================
//  sandbox.js — Cut-real AI · SANDBOX
//  Agente autónomo con herramientas controladas + mundo 3D en
//  tiempo real (Three.js). Chat y persistencia independientes
//  del chat normal. Reusa window.auth / window.db / window.firestore
//  ya inicializados en index.html — no crea una segunda config
//  de Firebase.
//
//  CAMBIOS EN ESTA VERSIÓN (integración con api/sandbox-agent.js):
//   - Cada request al agente manda userId, sandboxId e isAdmin,
//     para que el servidor pueda aplicar límites por-sandbox y
//     el modo "solo administradores" configurado desde el Admin.
//   - Maneja las respuestas nuevas del servidor:
//       · { skipped: true, reason: 'cooldown', waitMs }
//       · { skipped: true, reason: 'max_cycles_reached' }
//       · { skipped: true, reason: 'global_rate_limit' }
//       · HTTP 423/403/503 → Sandbox bloqueado por un admin
//         (desactivado, solo-admin, mantenimiento o emergencia)
//     En NINGUNO de estos casos se cuenta como "error de conexión"
//     ni dispara reintentos agresivos: el límite del admin gana
//     siempre, tal como pediste.
//   - Los límites locales (MAX_STEPS_PER_RUN, MIN_COOLDOWN_MS,
//     MAX_CONSECUTIVE_ERRORS) siguen existiendo como piso de
//     seguridad del propio cliente, independientes de lo que
//     diga el admin — si el admin es más permisivo, estos siguen
//     aplicando; si el admin es más estricto, el servidor corta
//     antes de que estos entren en juego.
// ============================================================
(function () {
  'use strict';

  // ---------- CONFIG / LÍMITES DE SEGURIDAD ----------
  const MAX_OBJECTS            = 40;
  const MAX_STEPS_PER_RUN      = 25;   // tope de pasos autónomos consecutivos (piso local)
  const MIN_COOLDOWN_MS        = 3000; // frecuencia mínima entre pasos autónomos (piso local)
  const MAX_CONSECUTIVE_ERRORS = 3;    // corta la autonomía si falla seguido
  const SAVE_DEBOUNCE_MS       = 1500;
  const WORLD_BOUND            = 12;   // clamp de coordenadas
  const RATE_LIMIT_RETRY_MS    = 20000; // espera al pegar contra un límite de consumo del admin

  let currentUser = null;
  let sandboxId   = null;

  const state = {
    objects: new Map(),
    memory: {},
    actionLog: [],
    messages: [],
    autonomyEnabled: false,
    paused: false,
    consecutiveSteps: 0,
    consecutiveErrors: 0,
    status: 'idle',                                   // idle|thinking|acting|waiting|paused|error
    agentState: { label: 'inactivo', color: '#33ff77' },
  };

  let scene, camera, renderer, controls, animFrame, threeReady = false;
  let sandboxListCache = [];

  // ---------- UTIL ----------
  const $ = (id) => document.getElementById(id);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, Number.isFinite(v) ? v : a));
  const clampVec = (arr) => Array.isArray(arr) ? [0,1,2].map(i => clamp(arr[i], -WORLD_BOUND, WORLD_BOUND)) : [0,0,0];
  const genId = () => 'obj_' + Math.random().toString(36).slice(2, 9);
  const escapeHtml = (s) => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const safeColor = (hex) => (typeof hex === 'string' && /^#[0-9a-fA-F]{6}$/.test(hex)) ? hex : null;

  function debounce(fn, ms) {
    let t = null;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  // ============================================================
  //  THREE.JS — motor 3D
  // ============================================================
  function initThree(canvas) {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);

    camera = new THREE.PerspectiveCamera(55, (canvas.clientWidth||300)/(canvas.clientHeight||300), 0.1, 200);
    camera.position.set(9, 7, 9);

    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    resizeRenderer();

    const grid = new THREE.GridHelper(24, 24, 0xffffff, 0x1a3322);
    grid.material.opacity = 0.28; grid.material.transparent = true;
    scene.add(grid);

    scene.add(new THREE.AmbientLight(0x224422, 1.1));
    const p1 = new THREE.PointLight(0x33ff77, 1.4, 60); p1.position.set(6,10,6); scene.add(p1);
    const p2 = new THREE.PointLight(0x2266ff, 0.5, 60); p2.position.set(-8,6,-6); scene.add(p2);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.08;
    controls.minDistance = 3; controls.maxDistance = 40;

    window.addEventListener('resize', resizeRenderer);
    animate();
  }

  function resizeRenderer() {
    if (!renderer || !camera) return;
    const c = renderer.domElement;
    const w = c.clientWidth || 300, h = c.clientHeight || 300;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }

  function animate() {
    animFrame = requestAnimationFrame(animate);
    if (controls) controls.update();
    state.objects.forEach(o => { if (o.mesh) o.mesh.rotation.y += 0.0022; });
    if (renderer && scene && camera) renderer.render(scene, camera);
  }

  const GEOMS = {
    sphere:   () => new THREE.SphereGeometry(0.5, 20, 16),
    box:      () => new THREE.BoxGeometry(1, 1, 1),
    cylinder: () => new THREE.CylinderGeometry(0.5, 0.5, 1, 20),
    cone:     () => new THREE.ConeGeometry(0.5, 1, 20),
    torus:    () => new THREE.TorusGeometry(0.5, 0.18, 12, 24),
    plane:    () => new THREE.PlaneGeometry(1, 1),
  };

  function buildPartMesh(part) {
    const geomFn = GEOMS[part.geometry] || GEOMS.box;
    const mat = new THREE.MeshStandardMaterial({
      color: safeColor(part.color) || 0x33ff77,
      wireframe: !!part.wireframe,
      transparent: part.opacity != null,
      opacity: part.opacity != null ? clamp(part.opacity, 0.05, 1) : 1,
      emissive: 0x0a2a14, emissiveIntensity: 0.25,
      metalness: 0.15, roughness: 0.55,
    });
    const mesh = new THREE.Mesh(geomFn(), mat);
    const pos = clampVec(part.position || [0,0,0]);
    mesh.position.set(pos[0], pos[1], pos[2]);
    if (Array.isArray(part.rotation)) mesh.rotation.set(part.rotation[0]||0, part.rotation[1]||0, part.rotation[2]||0);
    if (Array.isArray(part.scale)) {
      const s = part.scale.map(n => clamp(n, 0.05, 6));
      mesh.scale.set(s[0]||1, s[1]||1, s[2]||1);
    }
    return mesh;
  }

  function buildTextSprite(text, color) {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.font = '700 46px Inter, sans-serif';
    ctx.fillStyle = safeColor(color) || '#33ff77';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 18;
    ctx.fillText(String(text).slice(0, 40), 256, 64);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true }));
    sprite.scale.set(3.4, 0.85, 1);
    return sprite;
  }

  // ============================================================
  //  SCENE MANAGER — estado semántico <-> objetos Three.js
  // ============================================================
  const SceneManager = {
    addObject(meta) {
      if (state.objects.size >= MAX_OBJECTS) throw new Error('Límite de objetos alcanzado (' + MAX_OBJECTS + ').');
      const id = meta.id || genId();
      const group = new THREE.Group();
      const pos = clampVec(meta.position || [0,0,0]);
      group.position.set(pos[0], pos[1], pos[2]);

      if (meta.type === 'text') group.add(buildTextSprite(meta.text, meta.color));
      else (meta.parts || []).slice(0, 12).forEach(p => group.add(buildPartMesh(p)));

      scene.add(group);
      state.objects.set(id, {
        id, name: meta.name || meta.text || id, type: meta.type || 'primitive_group',
        parts: meta.parts || null, text: meta.text || null, position: pos,
        color: meta.color || null, mesh: group,
      });
      return id;
    },
    updateObject(id, patch) {
      const rec = state.objects.get(id);
      if (!rec) throw new Error('Objeto no encontrado: ' + id);
      if (patch.position) { const p = clampVec(patch.position); rec.mesh.position.set(p[0],p[1],p[2]); rec.position = p; }
      if (Array.isArray(patch.parts)) {
        while (rec.mesh.children.length) rec.mesh.remove(rec.mesh.children[0]);
        patch.parts.slice(0,12).forEach(p => rec.mesh.add(buildPartMesh(p)));
        rec.parts = patch.parts;
      }
      return true;
    },
    deleteObject(id) {
      const rec = state.objects.get(id);
      if (!rec) return false;
      scene.remove(rec.mesh);
      state.objects.delete(id);
      return true;
    },
    moveObject(id, position, duration) {
      const rec = state.objects.get(id); if (!rec) throw new Error('Objeto no encontrado: ' + id);
      const target = clampVec(position);
      return this._tween(rec.mesh.position, target, duration, () => { rec.position = target; });
    },
    rotateObject(id, rotation, duration) {
      const rec = state.objects.get(id); if (!rec) throw new Error('Objeto no encontrado: ' + id);
      const target = (rotation||[0,0,0]).map(n => clamp(n, -Math.PI*4, Math.PI*4));
      return this._tween(rec.mesh.rotation, target, duration);
    },
    scaleObject(id, scaleArr, duration) {
      const rec = state.objects.get(id); if (!rec) throw new Error('Objeto no encontrado: ' + id);
      const target = (scaleArr||[1,1,1]).map(n => clamp(n, 0.1, 5));
      return this._tween(rec.mesh.scale, target, duration);
    },
    _tween(vecLike, target, duration, onDone) {
      const dur = clamp(duration || 1, 0.1, 5) * 1000;
      const start = { x: vecLike.x, y: vecLike.y, z: vecLike.z };
      const t0 = performance.now();
      function step(now) {
        const p = clamp((now - t0) / dur, 0, 1);
        const e = 1 - Math.pow(1 - p, 3);
        vecLike.x = start.x + (target[0]-start.x) * e;
        vecLike.y = start.y + (target[1]-start.y) * e;
        vecLike.z = start.z + (target[2]-start.z) * e;
        if (p < 1) requestAnimationFrame(step); else if (onDone) onDone();
      }
      requestAnimationFrame(step);
      return true;
    },
    changeAppearance(id, { color, opacity, wireframe }) {
      const rec = state.objects.get(id); if (!rec) throw new Error('Objeto no encontrado: ' + id);
      rec.mesh.traverse(child => {
        if (child.isMesh) {
          if (safeColor(color)) child.material.color.set(color);
          if (opacity != null) { child.material.transparent = true; child.material.opacity = clamp(opacity,0.05,1); }
          if (wireframe != null) child.material.wireframe = !!wireframe;
        }
      });
      if (safeColor(color)) rec.color = color;
      return true;
    },
    clear() { state.objects.forEach(rec => scene.remove(rec.mesh)); state.objects.clear(); },
    inspect() {
      return { objectCount: state.objects.size, objects: Array.from(state.objects.values())
        .map(o => ({ id: o.id, name: o.name, type: o.type, position: o.position, color: o.color })) };
    },
    serialize() {
      return Array.from(state.objects.values()).map(o => ({
        id: o.id, name: o.name, type: o.type, parts: o.parts, text: o.text, position: o.position, color: o.color,
      }));
    },
    hydrate(list) { this.clear(); (list || []).slice(0, MAX_OBJECTS).forEach(o => this.addObject(o)); },
  };

  // ============================================================
  //  TOOL REGISTRY — únicas acciones que el agente puede ejecutar
  // ============================================================
  function sanitizeText(t, max) { return String(t == null ? '' : t).slice(0, max || 400); }

  const TOOLS = {
    send_message: ({ text }) => { pushMessage('agent', sanitizeText(text, 400)); return { ok: true }; },
    create_3d_object: ({ name, parts, position }) => {
      if (!Array.isArray(parts) || !parts.length) throw new Error('parts requerido');
      const id = SceneManager.addObject({ name: sanitizeText(name, 40), parts, position });
      logAction(`Creado objeto: ${sanitizeText(name,40)}`); return { ok: true, id };
    },
    update_3d_object: ({ id, parts, position }) => {
      SceneManager.updateObject(id, { parts, position }); logAction(`Objeto modificado: ${id}`); return { ok: true };
    },
    delete_3d_object: ({ id }) => {
      const ok = SceneManager.deleteObject(id); logAction(`Objeto eliminado: ${id}`); return { ok };
    },
    create_3d_text: ({ id, text, position, color }) => {
      const oid = SceneManager.addObject({ id, type: 'text', text: sanitizeText(text, 40), position, color, name: sanitizeText(text,40) });
      logAction(`Texto creado: "${sanitizeText(text,40)}"`); return { ok: true, id: oid };
    },
    move_object: ({ id, position, duration }) => { SceneManager.moveObject(id, position, duration); logAction(`Moviendo ${id}`); return { ok: true }; },
    rotate_object: ({ id, rotation, duration }) => { SceneManager.rotateObject(id, rotation, duration); logAction(`Rotando ${id}`); return { ok: true }; },
    scale_object: ({ id, scale, duration }) => { SceneManager.scaleObject(id, scale, duration); logAction(`Escalando ${id}`); return { ok: true }; },
    change_object_appearance: ({ id, color, opacity, wireframe }) => { SceneManager.changeAppearance(id, { color, opacity, wireframe }); logAction(`Apariencia de ${id} actualizada`); return { ok: true }; },
    inspect_scene: () => SceneManager.inspect(),
    save_memory: ({ key, value }) => {
      if (!key) throw new Error('key requerido');
      if (Object.keys(state.memory).length >= 40 && !(key in state.memory)) throw new Error('Memoria llena');
      state.memory[String(key).slice(0,60)] = sanitizeText(value, 500);
      logAction(`Memoria guardada: ${key}`); return { ok: true };
    },
    retrieve_memory: ({ key }) => ({ value: state.memory[key] ?? null }),
    wait: ({ seconds }) => { logAction(`Esperando ${clamp(seconds||3,1,20)}s`); return { ok: true }; },
    clear_scene: () => { SceneManager.clear(); logAction('Escena vaciada'); return { ok: true }; },
    set_agent_state: ({ state: label, color }) => {
      state.agentState = { label: sanitizeText(label, 24), color: safeColor(color) || state.agentState.color };
      renderAgentStateHUD(); return { ok: true };
    },
  };

  function executeTool(name, args) {
    const fn = TOOLS[name];
    if (!fn) throw new Error('Herramienta no permitida: ' + name);
    return fn(args || {});
  }
    // ── Extensión externa del Tool Registry (usada por workspace.js) ──
  function registerExternalTool(name, fn) {
    if (typeof fn === 'function') TOOLS[name] = fn;
  }

  // API de puente controlada: el Workspace NUNCA toca SceneManager
  // directamente, solo estas funciones explícitas.
  const WorkspaceBridge = {
    createObject: (meta) => SceneManager.addObject(meta),
    deleteObject: (id) => SceneManager.deleteObject(id),
    moveObject: (id, position, duration) => SceneManager.moveObject(id, position, duration),
    rotateObject: (id, rotation, duration) => SceneManager.rotateObject(id, rotation, duration),
    scaleObject: (id, scale, duration) => SceneManager.scaleObject(id, scale, duration),
    setColor: (id, color) => SceneManager.changeAppearance(id, { color }),
    createText: (text, position, color) => SceneManager.addObject({ type: 'text', text, position, color }),
    getSceneState: () => SceneManager.inspect(),
  };

  // ============================================================
  //  CHAT / LOG UI
  // ============================================================
  function logAction(text) {
    state.actionLog.push({ text, ts: Date.now() });
    if (state.actionLog.length > 80) state.actionLog.shift();
    const el = $('sandbox-action-log');
    if (el) {
      const line = document.createElement('div');
      line.className = 'sbx-log-line';
      const time = new Date().toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
      line.innerHTML = `<span class="sbx-log-time">[${time}]</span> ${escapeHtml(text)}`;
      el.appendChild(line); el.scrollTop = el.scrollHeight;
    }
    scheduleSave();
  }

  function pushMessage(role, text) {
    state.messages.push({ role, text, ts: Date.now() });
    if (state.messages.length > 120) state.messages.shift();
    renderMessage(role, text);
    scheduleSave();
  }

  function renderMessage(role, text) {
    const chat = $('sandbox-chat'); if (!chat) return;
    const div = document.createElement('div');
    div.className = role === 'user' ? 'user' : 'ai';
    div.innerHTML = role === 'user' ? `<b>Tú:</b> ${escapeHtml(text)}` : `<b>🤖 Agente:</b> ${escapeHtml(text)}`;
    chat.appendChild(div); chat.scrollTop = chat.scrollHeight;
  }

  function renderAgentStateHUD() {
    const el = $('sandbox-agent-state'); if (!el) return;
    el.textContent = state.agentState.label;
    el.style.color = state.agentState.color;
    el.style.textShadow = `0 0 10px ${state.agentState.color}88`;
  }

  function setStatus(s) {
    state.status = s;
    const el = $('sandbox-status-pill'); if (!el) return;
    const labels = { idle:'Inactivo', thinking:'Pensando…', acting:'Actuando…', waiting:'Esperando…', paused:'Pausado', error:'Error' };
    el.textContent = labels[s] || s;
    el.className = 'sbx-status-pill sbx-status-' + s;
  }

  // Muestra, si existe el elemento opcional #sandbox-cycles-info,
  // cuántos ciclos autónomos lleva usados el Sandbox actual sobre
  // el máximo configurado por el admin. No falla si el elemento
  // no existe en tu HTML — es puramente informativo.
  function updateCyclesHUD(used, max) {
    const el = $('sandbox-cycles-info');
    if (!el) return;
    el.textContent = `⚙ ${used}/${max} ciclos`;
    el.style.color = used >= max * 0.8 ? '#ffaa44' : '#6a6';
  }

  // ============================================================
  //  AGENT LOOP
  // ============================================================
  async function requestAgentDecision(userText) {
    const payload = {
      messages: state.messages.slice(-16).map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text })),
      scene: { objects: SceneManager.inspect().objects },
      memoryKeys: Object.keys(state.memory),
      lastActions: state.actionLog.slice(-6).map(a => a.text),
      autonomous: !userText,
      userText: userText || null,
      // ── NUEVO: necesarios para que el servidor pueda aplicar límites
      //    por-sandbox y el modo "solo administradores" del panel Admin ──
      userId: currentUser?.uid || 'anon',
      sandboxId: sandboxId || 'default',
      isAdmin: window.__isAdminFlag === true,
      workspace: (window.CutRealWorkspace && typeof window.CutRealWorkspace.getContextForAgent === 'function')
        ? window.CutRealWorkspace.getContextForAgent() : null,
    };

    const res = await fetch('/api/sandbox-agent', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });

    let data = null;
    try { data = await res.json(); } catch (e) { /* respuesta sin body, se maneja abajo */ }

    // 423 / 403 / 503 → el Sandbox está bloqueado por un admin
    // (desactivado, solo-admin, mantenimiento o emergencia global).
    if (res.status === 423 || res.status === 403 || res.status === 503) {
      const err = new Error((data && data.error) || 'El Sandbox no está disponible ahora mismo.');
      err.blocked = true;
      err.code = (data && data.code) || 'BLOCKED';
      throw err;
    }

    // 429 → límite de consumo (rotación de keys agotada, o límite
    // global configurado por el admin). No es un error de red.
    if (res.status === 429) {
      const err = new Error((data && (data.message || data.error)) || 'Se alcanzó un límite de consumo configurado por un administrador.');
      err.rateLimited = true;
      throw err;
    }

    if (!res.ok) {
      throw new Error((data && data.error) || ('El agente no respondió (HTTP ' + res.status + ')'));
    }

    return data;
  }

  async function runOneStep(userText) {
    setStatus('thinking');
    let decision;
    try {
      decision = await requestAgentDecision(userText);
    } catch (e) {
      // Bloqueado por un admin: se corta la autonomía del todo, sin
      // reintentar solo — el usuario tiene que reactivarla a mano
      // (o esperar a que el admin la reactive/desbloquee).
      if (e.blocked) {
        logAction('🛑 ' + e.message);
        setStatus('paused');
        stopAutonomy(e.message);
        showToastSafe(e.message, '#ff4444');
        return;
      }
      // Límite de consumo (no de red): esperamos más tiempo antes de
      // reintentar, sin contarlo como "error de conexión".
      if (e.rateLimited) {
        logAction('⚡ ' + e.message);
        setStatus('waiting');
        if (state.autonomyEnabled && !state.paused) scheduleNextTick(RATE_LIMIT_RETRY_MS);
        return;
      }
      // Error real (red, servidor caído, etc.)
      state.consecutiveErrors++;
      logAction('⚠️ Error consultando al agente: ' + e.message);
      setStatus('error');
      if (state.consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) stopAutonomy('Demasiados errores seguidos.');
      return;
    }
    state.consecutiveErrors = 0;

    // El servidor puede "saltear" este paso sin haber llamado a Groq:
    // cooldown propio, tope de ciclos del admin, o límite global.
    // En todos los casos, el límite del admin gana — no reintentamos
    // agresivamente ni lo tratamos como error.
    if (decision && decision.skipped) {
      if (decision.reason === 'cooldown') {
        setStatus('waiting');
        if (state.autonomyEnabled && !state.paused) {
          scheduleNextTick(Math.max(decision.waitMs || MIN_COOLDOWN_MS, 500));
        }
        return;
      }
      if (decision.reason === 'max_cycles_reached') {
        logAction('⏹ ' + (decision.message || 'Máximo de ciclos autónomos alcanzado (límite del admin).'));
        stopAutonomy(decision.message || 'Máximo de ciclos alcanzado.');
        return;
      }
      if (decision.reason === 'global_rate_limit') {
        logAction('⚡ ' + (decision.message || 'Límite global de consumo del Sandbox alcanzado.'));
        setStatus('waiting');
        if (state.autonomyEnabled && !state.paused) scheduleNextTick(RATE_LIMIT_RETRY_MS);
        return;
      }
      setStatus('idle');
      return;
    }

    if (decision.assistantText) pushMessage('agent', decision.assistantText);

    setStatus('acting');
    for (const call of (decision.toolCalls || []).slice(0, 4)) {
      const toolEl = $('sandbox-current-tool');
      if (toolEl) toolEl.textContent = '⚙ ' + call.name;
      try { executeTool(call.name, call.args); }
      catch (e) { logAction(`⚠️ Herramienta "${call.name}" falló: ${e.message}`); }
    }
    const toolEl = $('sandbox-current-tool'); if (toolEl) toolEl.textContent = '';

    if (decision.cyclesUsed != null && decision.cyclesMax != null) {
      updateCyclesHUD(decision.cyclesUsed, decision.cyclesMax);
    }
    scheduleSave();
  }

  let autonomyTimer = null;
  function startAutonomy() {
    if (!sandboxId) return;
    state.autonomyEnabled = true; state.paused = false; state.consecutiveSteps = 0;
    updateAutonomyUI(); scheduleNextTick(300);
  }
  function pauseAutonomy() {
    state.paused = true; setStatus('paused'); updateAutonomyUI();
    if (autonomyTimer) clearTimeout(autonomyTimer);
  }
  function resumeAutonomy() {
    if (!state.autonomyEnabled) return;
    state.paused = false; updateAutonomyUI(); scheduleNextTick(300);
  }
  function stopAutonomy(reason) {
    state.autonomyEnabled = false; state.paused = false;
    if (autonomyTimer) clearTimeout(autonomyTimer);
    setStatus('idle'); updateAutonomyUI();
    if (reason) logAction('⏹ Autonomía detenida: ' + reason);
    persistSandbox(true);
  }
  function scheduleNextTick(delay) {
    if (autonomyTimer) clearTimeout(autonomyTimer);
    autonomyTimer = setTimeout(async () => {
      if (!state.autonomyEnabled || state.paused) return;
      if (state.consecutiveSteps >= MAX_STEPS_PER_RUN) { stopAutonomy('Límite de pasos alcanzado (piso local).'); return; }
      state.consecutiveSteps++;
      await runOneStep(null);
      if (state.autonomyEnabled && !state.paused) { setStatus('waiting'); scheduleNextTick(MIN_COOLDOWN_MS); }
    }, delay);
  }
  async function stepOnce() {
    if (!sandboxId) return;
    await runOneStep(null);
    setStatus('idle');
  }

  function updateAutonomyUI() {
    $('sandbox-autonomy-toggle')?.classList.toggle('active', state.autonomyEnabled && !state.paused);
    const pauseBtn = $('sandbox-pause-btn');
    if (pauseBtn) pauseBtn.textContent = state.paused ? '▶ Reanudar' : '⏸ Pausar';
  }

  // ============================================================
  //  PERSISTENCIA FIREBASE — chats/{uid}/sandboxes/{id}
  // ============================================================
  function sandboxCollection() {
    const { collection } = window.firestore;
    return collection(window.db, 'chats', currentUser.uid, 'sandboxes');
  }
  function sandboxDoc(id) {
    const { doc } = window.firestore;
    return doc(window.db, 'chats', currentUser.uid, 'sandboxes', id);
  }

  const scheduleSave = debounce(() => persistSandbox(false), SAVE_DEBOUNCE_MS);

  async function persistSandbox() {
    if (!currentUser || !sandboxId) return;
    try {
      const { setDoc } = window.firestore;
      await setDoc(sandboxDoc(sandboxId), {
        updatedAt: Date.now(),
        messages: state.messages.slice(-120),
        memory: state.memory,
        actionLog: state.actionLog.slice(-80).map(a => a.text + '|' + a.ts),
        scene: SceneManager.serialize(),
        autonomyEnabled: state.autonomyEnabled,
      }, { merge: true });
    } catch (e) { console.warn('[Sandbox] Error guardando:', e); }
  }

  async function loadSandboxList() {
    const { getDocs, query, orderBy } = window.firestore;
    try {
      const snap = await getDocs(query(sandboxCollection(), orderBy('updatedAt', 'desc')));
      sandboxListCache = [];
      snap.forEach(d => sandboxListCache.push({ id: d.id, ...d.data() }));
    } catch (e) { sandboxListCache = []; }
    renderSandboxList();
  }

  function renderSandboxList() {
    const el = $('sandbox-list'); if (!el) return;
    if (!sandboxListCache.length) { el.innerHTML = '<div class="sbx-empty">Todavía no creaste ningún Sandbox.</div>'; return; }
    el.innerHTML = sandboxListCache.map(s => `
      <div class="sbx-item ${s.id === sandboxId ? 'active' : ''}" onclick="CutRealSandbox.open('${s.id}')">
        <span class="sbx-item-name">${escapeHtml(s.name || 'Sandbox')}</span>
        <button class="sbx-item-del" onclick="event.stopPropagation();CutRealSandbox.remove('${s.id}')" title="Eliminar">🗑️</button>
      </div>`).join('');
  }

  async function createSandbox() {
    if (!currentUser) return;
    const { doc, setDoc } = window.firestore;
    const ref = doc(sandboxCollection());
    const name = 'Sandbox ' + new Date().toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit'}) + ' ' + new Date().toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'});
    await setDoc(ref, { name, createdAt: Date.now(), updatedAt: Date.now(), messages: [], memory: {}, actionLog: [], scene: [], autonomyEnabled: false });
    await loadSandboxList();
    await openSandboxById(ref.id);
  }

  async function openSandboxById(id) {
    stopAutonomy();
    sandboxId = id;
    const { getDoc } = window.firestore;
    const snap = await getDoc(sandboxDoc(id));
    if (!snap.exists()) { showToastSafe('Ese Sandbox ya no existe', '#ff4444'); return; }
    const data = snap.data();
    state.messages = data.messages || [];
    state.memory = data.memory || {};
    state.actionLog = (data.actionLog || []).map(s => { const [text,ts]=String(s).split('|'); return { text, ts:+ts||Date.now() }; });
    state.autonomyEnabled = false;

    const chatEl = $('sandbox-chat'); if (chatEl) chatEl.innerHTML = '';
    state.messages.forEach(m => renderMessage(m.role, m.text));
    const logEl = $('sandbox-action-log'); if (logEl) { logEl.innerHTML = ''; state.actionLog.forEach(a => {
      const line = document.createElement('div'); line.className = 'sbx-log-line';
      line.textContent = `[${new Date(a.ts).toLocaleTimeString('es-AR')}] ${a.text}`; logEl.appendChild(line);
    }); }

    SceneManager.hydrate(data.scene || []);
    setStatus('idle'); updateAutonomyUI(); renderAgentStateHUD(); renderSandboxList();
  }

  async function removeSandbox(id) {
    if (!confirm('¿Eliminar este Sandbox? Esta acción no se puede deshacer.')) return;
    const { deleteDoc } = window.firestore;
    await deleteDoc(sandboxDoc(id));
    if (id === sandboxId) { sandboxId = null; const c=$('sandbox-chat'); if(c) c.innerHTML=''; SceneManager.clear(); }
    await loadSandboxList();
  }

  function showToastSafe(msg, color) { if (window.showToast) window.showToast(msg, color); }

  // ============================================================
  //  ABRIR / CERRAR PANEL
  // ============================================================
  async function openSandboxPanel() {
    if (!currentUser) { showToastSafe('Iniciá sesión para usar el Sandbox', '#ff8844'); return; }
    const overlay = $('sandbox-overlay'); if (!overlay) return;
    overlay.style.display = 'flex';
    if (!threeReady) { initThree($('sandbox-canvas')); threeReady = true; }
    resizeRenderer();
    await loadSandboxList();
    if (!sandboxId && sandboxListCache.length) await openSandboxById(sandboxListCache[0].id);
  }
  function closeSandboxPanel() {
    const overlay = $('sandbox-overlay'); if (overlay) overlay.style.display = 'none';
    pauseAutonomy();
    persistSandbox(true);
  }

  function sendUserMessage() {
    const input = $('sandbox-input'); if (!input) return;
    const text = input.value.trim();
    if (!text || !sandboxId) return;
    input.value = '';
    pushMessage('user', text);
    runOneStep(text);
  }

  // ============================================================
  //  AUTH HOOK (llamado desde main.js)
  // ============================================================
  function onAuthReady(user) {
    currentUser = user;
    if (!user) { sandboxId = null; sandboxListCache = []; }
  }

  function bindUI() {
    $('sandbox-close-btn')?.addEventListener('click', closeSandboxPanel);
    $('sandbox-new-btn')?.addEventListener('click', createSandbox);
    $('sandbox-send-btn')?.addEventListener('click', sendUserMessage);
    $('sandbox-input')?.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendUserMessage(); } });
    $('sandbox-autonomy-toggle')?.addEventListener('click', () => state.autonomyEnabled ? stopAutonomy('Desactivado por el usuario') : startAutonomy());
    $('sandbox-pause-btn')?.addEventListener('click', () => state.paused ? resumeAutonomy() : pauseAutonomy());
    $('sandbox-step-btn')?.addEventListener('click', stepOnce);
    $('sandbox-tab-chat')?.addEventListener('click', () => switchMobileTab('chat'));
    $('sandbox-tab-scene')?.addEventListener('click', () => switchMobileTab('scene'));
  }
  function switchMobileTab(tab) {
    $('sandbox-overlay')?.classList.toggle('sbx-show-scene', tab === 'scene');
    $('sandbox-tab-chat')?.classList.toggle('active', tab === 'chat');
    $('sandbox-tab-scene')?.classList.toggle('active', tab === 'scene');
  }

  document.addEventListener('DOMContentLoaded', bindUI);

  // ---------- API PÚBLICA ----------
  window.CutRealSandbox = {
    open: openSandboxById, remove: removeSandbox, onAuthReady,
    registerTool: registerExternalTool,
    bridge: WorkspaceBridge,
    getCurrentSandboxId: () => sandboxId,
    getCurrentUser: () => currentUser,
  };
  window.openSandbox  = openSandboxPanel;
  window.closeSandbox = closeSandboxPanel;

})();
