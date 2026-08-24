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
  const MAX_HISTORY_SNAPSHOTS  = 24;
  const MAX_FIRESTORE_SNAPSHOTS = 8;
  const SAVE_RETRY_DELAYS = [250, 900, 2200];

  let currentUser = null;
  let sandboxId   = null;
  let agentRequestInFlight = false;

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
    apiUsage: { requests: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0, reportedCost: 0, last: null },
    editorMode: false,
    selectedObjectId: null,
    catalogTint: '#33ff77',
    chatVisible: true,
    gridVisible: true,
    wireframe: false,
    neonEnabled: true,
    ecoMode: false,
    cameraPreset: 'hero',
    undoStack: [],
    redoStack: [],
    snapshots: [],
    saveState: 'idle',
    environment: 'lab',
    quality: 'balanced',
    physicsEnabled: false,
    gravityEnabled: true,
    worldPaused: false,
    timeScale: 1,
    snapEnabled: false,
    snapSize: 1,
    clonePattern: 'line',
    connections: [],
    linkMode: false,
    linkSourceId: null,
    connectionType: 'data',
    worldPreset: 'showcase',
    cameraPath: [],
    cameraRecording: false,
    cameraPlaying: false,
    behaviorPreset: 'idle',
    sandboxMode: 'editor',
    climate: 'clear',
    worldHour: 14,
    player: { position: [0, 1.7, 5], velocityY: 0, grounded: true },
    dimensions: [],
    activeDimensionId: 'nexus-001',
    fps: 0,
    frameTime: 0,
  };

    let scene, camera, renderer, controls, animFrame, threeReady = false;
  let gridHelper = null;
  let neonLights = [];
  let raycaster = null;
  let lastStatsPaint = 0;
  let editorDrag = null;

  let sandboxListCache = [];
  let saveInFlight = null;
  let saveQueued = false;
  let saveSequence = 0;
  let perfLastFrame = performance.now();
  let perfWindowStart = performance.now();
  let perfFrames = 0;
  let cameraPathTimer = null;
  let cameraPathPlayback = null;
  const connectionLines = new Map();

  // ---------- UTIL ----------
  const $ = (id) => document.getElementById(id);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, Number.isFinite(v) ? v : a));
  const clampVec = (arr) => Array.isArray(arr) ? [0,1,2].map(i => clamp(arr[i], -WORLD_BOUND, WORLD_BOUND)) : [0,0,0];
    const genId = () => 'obj_' + Math.random().toString(36).slice(2, 9);
  function suggestedScenePosition(position) {
    if (Array.isArray(position) && position.length >= 3 && position.every(n => Number.isFinite(Number(n)))) return clampVec(position);
    const slots = [[0,0,0],[3.4,0,0],[-3.4,0,0],[0,0,3.4],[0,0,-3.4],[3.4,0,3.4],[-3.4,0,-3.4]];
    return slots[state.objects.size % slots.length];
  }

  const escapeHtml = (s) => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const safeColor = (hex) => (typeof hex === 'string' && /^#[0-9a-fA-F]{6}$/.test(hex)) ? hex : null;
  // Presupuesto por submalla: suficiente para animales reconocibles sin
  // permitir payloads gigantes en un dispositivo móvil.
  const MAX_LOWPOLY_VERTICES = 192;
  const MAX_LOWPOLY_FACES = 320;
  const MAX_LOWPOLY_PARTS = 12;
  const MIN_LOWPOLY_PARTS = 4;
  const MIN_LOWPOLY_TOTAL_VERTICES = 24;
  const MIN_LOWPOLY_TOTAL_FACES = 24;

  function debounce(fn, ms) {
    let t = null;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  // ============================================================
  //  THREE.JS — motor 3D
  // ============================================================
  function initThree(canvas) {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x02070a);
    scene.fog = new THREE.Fog(0x02070a, 16, 52);

    camera = new THREE.PerspectiveCamera(55, (canvas.clientWidth||300)/(canvas.clientHeight||300), 0.1, 200);
    camera.position.set(9, 7, 9);

    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    resizeRenderer();

    gridHelper = new THREE.GridHelper(24, 24, 0x65f5d6, 0x173c38);
    gridHelper.material.opacity = 0.28; gridHelper.material.transparent = true;
    scene.add(gridHelper);

    scene.add(new THREE.HemisphereLight(0x8ffff0, 0x020407, 0.8));
    const p1 = new THREE.PointLight(0x33ff77, 1.7, 60); p1.position.set(6,10,6); scene.add(p1);
    const p2 = new THREE.PointLight(0x2266ff, 0.65, 60); p2.position.set(-8,6,-6); scene.add(p2);
    const p3 = new THREE.PointLight(0xff42bc, 0.35, 45); p3.position.set(0,4,-10); scene.add(p3);
    neonLights = [p1, p2, p3];
    applySceneVisualState();

        controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.08;
    controls.minDistance = 3; controls.maxDistance = 40;
    raycaster = new THREE.Raycaster();
    bindEditorCanvas(renderer.domElement);

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

  function rememberAnimationBase(rec) {
    if (!rec || rec.animationBase) return;
    rec.animationBase = {
      position: rec.mesh.position.toArray(),
      rotation: rec.mesh.rotation.toArray(),
      children: new Map(),
    };
    rec.mesh.traverse(child => {
      if (child === rec.mesh) return;
      rec.animationBase.children.set(child, { position: child.position.toArray(), rotation: child.rotation.toArray(), scale: child.scale.toArray() });
    });
  }

  function resetAnimationTransforms(rec) {
    if (!rec?.animationBase) return;
    const base = rec.animationBase;
    rec.mesh.position.set(...base.position); rec.mesh.rotation.set(...base.rotation);
    base.children.forEach((value, child) => {
      if (!child.parent) return;
      child.position.set(...value.position); child.rotation.set(...value.rotation); child.scale.set(...value.scale);
    });
  }

  function animateCatalogObject(rec, now) {
    if (!rec?.mesh || !rec.animationPlaying) return;
    rememberAnimationBase(rec);
    resetAnimationTransforms(rec);
    const t = now * 0.001 * clamp(Number(rec.animationSpeed) || 1, .15, 3);
    const wave = Math.sin(t * 3.6), slow = Math.sin(t * 1.8), pulse = .45 + .55 * (Math.sin(t * 4) + 1) / 2;
    const animation = rec.animation || 'idle';
    const base = rec.animationBase;
    const childByRole = role => {
      let found = null; rec.mesh.traverse(child => { if (!found && child.userData?.catalogRole === role) found = child; }); return found;
    };
    const rotateRole = (role, x = 0, y = 0, z = 0) => { const child = childByRole(role); if (child) { child.rotation.x += x; child.rotation.y += y; child.rotation.z += z; } };
    const rotateRoles = (roles, x = 0, y = 0, z = 0) => roles.forEach(role => rotateRole(role, x, y, z));
    if (animation === 'walk' || animation === 'drive') {
      rotateRoles(['leg_left','leg_front_left','leg_back_left','wheel_fl','wheel_bl'], wave * .42, 0, 0);
      rotateRoles(['leg_right','leg_front_right','leg_back_right','wheel_fr','wheel_br'], -wave * .42, 0, 0);
      rotateRoles(['arm_left'], -wave * .18, 0, 0); rotateRoles(['arm_right'], wave * .18, 0, 0);
      rec.mesh.position.y = base.position[1] + Math.abs(Math.sin(t * 3.6)) * .035;
    } else if (animation === 'wave') {
      rotateRole('arm_right', 0, 0, -.65 + wave * .42); rotateRole('hand_right', 0, 0, -.65 + wave * .42);
    } else if (animation === 'breathe' || animation === 'breath' || animation === 'idle') {
      ['body','chest','torso','head'].forEach(role => { const child = childByRole(role); if (child) child.scale.y *= 1 + slow * .035; });
      rec.mesh.position.y = base.position[1] + slow * .025;
    } else if (animation === 'pulse') {
      rec.mesh.traverse(child => { if (child.isMesh && child.material) { child.material.emissiveIntensity = .18 + pulse * .65; } });
      rec.mesh.scale.setScalar(1 + Math.sin(t * 4) * .018);
    } else if (animation === 'spin') {
      rec.mesh.rotation.y = base.rotation[1] + t * .85;
    } else if (animation === 'hover' || animation === 'float') {
      rec.mesh.position.y = base.position[1] + Math.sin(t * 2.2) * .16;
      rec.mesh.rotation.z = base.rotation[2] + Math.sin(t * 2.2) * .045;
    } else if (animation === 'fly') {
      rec.mesh.position.y = base.position[1] + Math.sin(t * 2.2) * .22;
      rec.mesh.rotation.x = base.rotation[0] + Math.sin(t * 2.2) * .1;
      rotateRoles(['wing_left','wing_right'], wave * .28, 0, 0);
    } else if (animation === 'sway') {
      rec.mesh.rotation.z = base.rotation[2] + Math.sin(t * 1.5) * .12;
    } else if (animation === 'dance') {
      rec.mesh.rotation.y = base.rotation[1] + Math.sin(t * 2.5) * .28;
      rec.mesh.rotation.z = base.rotation[2] + Math.sin(t * 5) * .12;
      rec.mesh.position.y = base.position[1] + Math.abs(Math.sin(t * 2.5)) * .16;
    } else if (animation === 'cast') {
      rotateRole('arm_right', 0, 0, -.5 + wave * .2); rotateRole('staff', 0, wave * .7, 0);
      rec.mesh.traverse(child => { if (child.userData?.catalogRole === 'orb' && child.material) child.material.emissiveIntensity = 1 + pulse; });
    } else if (animation === 'scan') {
      rec.mesh.rotation.y = base.rotation[1] + t * .42;
      rec.mesh.traverse(child => { if (child.userData?.catalogRole?.includes('sensor') && child.material) child.material.emissiveIntensity = .2 + pulse; });
    } else if (animation === 'launch') {
      rec.mesh.position.y = base.position[1] + Math.max(0, Math.sin(t * 1.4)) * .5;
    } else if (animation === 'orbit') {
      rec.mesh.rotation.y = base.rotation[1] + t * .52; rec.mesh.position.x = base.position[0] + Math.cos(t * .8) * .22; rec.mesh.position.z = base.position[2] + Math.sin(t * .8) * .22;
    }
  }

  function animateCatalogObjects(now) {
    state.objects.forEach(rec => { if (rec.type === 'catalog_lowpoly') animateCatalogObject(rec, now); });
  }

  const navigationKeys = new Set();
  let playerJumpQueued = false;
  function setSandboxMode(mode, persist = true) {
    const allowed = ['editor','player','god','drone','cinematic','ai']; state.sandboxMode = allowed.includes(mode) ? mode : 'editor';
    const hints = { editor: 'Editor: seleccioná y manipulá objetos', player: 'Player: WASD / flechas · Space para saltar', god: 'God: control directo del mundo habilitado', drone: 'Drone: navegación aérea con WASD', cinematic: 'Cinematic: recorridos de cámara y composición', ai: 'AI: usá el chat NEXUS para ejecutar acciones' };
    document.querySelectorAll('[data-sandbox-mode]').forEach(button => button.classList.toggle('active', button.dataset.sandboxMode === state.sandboxMode));
    const hint = $('sandbox-mode-hint'); if (hint) hint.textContent = hints[state.sandboxMode];
    if (state.sandboxMode === 'editor') { state.editorMode = true; if (controls) controls.enabled = true; }
    else if (state.sandboxMode === 'player' || state.sandboxMode === 'drone') { state.editorMode = false; if (controls) controls.enabled = false; }
    else { state.editorMode = false; if (controls) controls.enabled = true; }
    if (camera && ['player','drone'].includes(state.sandboxMode) && Array.isArray(state.player?.position)) camera.position.fromArray(state.player.position);
    const joystick = $('sandbox-mobile-joystick'); if (joystick) joystick.hidden = !['player','drone'].includes(state.sandboxMode);
    renderEditorUI(); renderFutureUI(); if (persist) { logAction(`Modo: ${state.sandboxMode.toUpperCase()}`); scheduleSave(); }
  }
  function stepModeNavigation(dt) {
    if (!camera || !['player','drone'].includes(state.sandboxMode) || state.worldPaused) return;
    const direction = new THREE.Vector3(); if (navigationKeys.has('KeyW') || navigationKeys.has('ArrowUp')) direction.z -= 1; if (navigationKeys.has('KeyS') || navigationKeys.has('ArrowDown')) direction.z += 1; if (navigationKeys.has('KeyA') || navigationKeys.has('ArrowLeft')) direction.x -= 1; if (navigationKeys.has('KeyD') || navigationKeys.has('ArrowRight')) direction.x += 1; if (direction.lengthSq()) direction.normalize();
    const speed = state.sandboxMode === 'drone' ? 6 : 3.6; camera.position.x = clamp(camera.position.x + direction.x * speed * dt, -WORLD_BOUND, WORLD_BOUND); camera.position.z = clamp(camera.position.z + direction.z * speed * dt, -WORLD_BOUND, WORLD_BOUND);
    if (state.sandboxMode === 'player') { state.player.velocityY = Number(state.player.velocityY) || 0; if (playerJumpQueued && state.player.grounded) { state.player.velocityY = 5.2; state.player.grounded = false; } playerJumpQueued = false; if (state.gravityEnabled) state.player.velocityY -= 9.8 * dt * state.timeScale; camera.position.y = Math.max(1.1, camera.position.y + state.player.velocityY * dt); if (camera.position.y <= 1.1) { camera.position.y = 1.1; state.player.velocityY = 0; state.player.grounded = true; } }
    state.player.position = camera.position.toArray(); if (controls) controls.target.set(camera.position.x, camera.position.y, camera.position.z - 2); renderConnectionLines();
  }

  function animate() {
    animFrame = requestAnimationFrame(animate);
    const now = performance.now(); const frameTime = Math.min(100, now - perfLastFrame); perfLastFrame = now; perfFrames += 1;
    if (now - perfWindowStart >= 500) { state.fps = Math.round(perfFrames * 1000 / (now - perfWindowStart)); state.frameTime = frameTime; perfFrames = 0; perfWindowStart = now; }
    if (controls) controls.update();
    stepModeNavigation(frameTime / 1000);
    if (!state.worldPaused && !state.editorMode) state.objects.forEach(o => { if (o.mesh && o.type !== 'catalog_lowpoly') o.mesh.rotation.y += 0.0022 * state.timeScale; });
    if (!state.worldPaused) animateCatalogObjects(now * state.timeScale);
    stepLightPhysics(frameTime / 1000); renderConnectionLines();
    if (camera && now - lastStatsPaint > 600) { applyDistanceCulling(); renderSceneStats(); lastStatsPaint = now; }
    if (renderer && scene && camera) renderer.render(scene, camera);
  }

  function renderSceneStats() {
    const el = $('sandbox-scene-stats'); if (!el) return;
    let vertices = 0, faces = 0;
    state.objects.forEach(rec => rec.mesh?.traverse(child => {
      if (!child.isMesh || !child.geometry || child.visible === false) return;
      const pos = child.geometry.getAttribute?.('position'); vertices += pos?.count || 0;
      faces += Math.floor((pos?.count || 0) / 3);
    }));
    el.textContent = `${state.objects.size} objetos · ${vertices.toLocaleString('es-AR')} vértices · ${faces.toLocaleString('es-AR')} tris · ${state.fps || 0} FPS · ${Number(state.frameTime || 0).toFixed(1)} ms`;
  }

  function applyWireframe() {
    state.objects.forEach(rec => rec.mesh?.traverse(child => { if (child.isMesh && child.material) child.material.wireframe = !!state.wireframe; }));
    $('sandbox-wire-toggle')?.classList.toggle('active', state.wireframe);
  }

  const ENVIRONMENT_PRESETS = {
    lab: { background: 0x02070a, fog: 0x02070a, near: 16, far: 52, lights: [0x33ff77, 0x2266ff, 0xff42bc] },
    cyberpunk: { background: 0x100318, fog: 0x100318, near: 12, far: 44, lights: [0xff3bd4, 0x4b6cff, 0x00eaff] },
    space: { background: 0x01020b, fog: 0x01020b, near: 22, far: 75, lights: [0x8cbcff, 0x5277ff, 0x9d72ff] },
    alien: { background: 0x041008, fog: 0x041008, near: 11, far: 42, lights: [0x7dff54, 0x32e6bf, 0xd4ff42] },
    white: { background: 0xc7d2d1, fog: 0xc7d2d1, near: 18, far: 58, lights: [0x80cfff, 0x9ffff0, 0xffc2e8] },
    industrial: { background: 0x0b0c0d, fog: 0x0b0c0d, near: 10, far: 38, lights: [0xffaa4d, 0x91a6b4, 0xff624d] },
    minimal: { background: 0x050609, fog: 0x050609, near: 25, far: 90, lights: [0xffffff, 0x9bbcff, 0x88ffcc] },
  };
  const QUALITY_PRESETS = {
    eco: { pixelRatio: .85, far: 28, label: 'Eco móvil' }, balanced: { pixelRatio: 1.35, far: 52, label: 'Balanceada' }, cinematic: { pixelRatio: 2, far: 90, label: 'Cinemática' },
  };
  function applyEnvironment(name, persist = true) {
    const preset = ENVIRONMENT_PRESETS[name] || ENVIRONMENT_PRESETS.lab;
    state.environment = ENVIRONMENT_PRESETS[name] ? name : 'lab';
    if (scene) { scene.background = new THREE.Color(preset.background); if (scene.fog) { scene.fog.color.setHex(preset.fog); scene.fog.near = preset.near; scene.fog.far = preset.far; } }
    if (neonLights.length) neonLights.forEach((light, index) => light.color.setHex(preset.lights[index]));
    const select = $('sandbox-environment-select'); if (select) select.value = state.environment;
    if (persist) { logAction(`Ambiente: ${state.environment}`); scheduleSave(); }
  }
  function applyQualitySettings(persist = true) {
    const preset = QUALITY_PRESETS[state.quality] || QUALITY_PRESETS.balanced;
    if (renderer) renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, preset.pixelRatio));
    if (camera) { camera.far = preset.far; camera.updateProjectionMatrix(); }
    state.ecoMode = state.quality === 'eco';
    const select = $('sandbox-quality-select'); if (select) select.value = state.quality;
    if (persist) { applyDistanceCulling(); logAction(`Calidad: ${preset.label}`); scheduleSave(); }
  }
  function applyDistanceCulling() {
    const far = (QUALITY_PRESETS[state.quality] || QUALITY_PRESETS.balanced).far + 4;
    if (!camera) return;
    state.objects.forEach(rec => {
      if (!rec.mesh) return;
      const distance = camera.position.distanceTo(rec.mesh.position); rec.mesh.visible = distance <= far * 1.35;
      rec.mesh.traverse(child => {
        if (!child.isMesh) return;
        const role = String(child.userData?.catalogRole || '').toLowerCase();
        const fineDetail = /eye|hand|knee|spot|antenna|sensor|window|visor|collar|light|orb|halo/.test(role);
        const mediumDetail = /hair|shoulder|elbow|wing|tail|horn|beak|muzzle/.test(role);
        child.visible = rec.mesh.visible && !(state.quality === 'eco' && distance > far * .42 && fineDetail) && !(state.quality === 'eco' && distance > far * .9 && mediumDetail);
      });
    });
  }
  function applyClimate(name, persist = true) { const climate = CLIMATE_PRESETS[name] ? name : 'clear'; state.climate = climate; const preset = CLIMATE_PRESETS[climate]; const env = ENVIRONMENT_PRESETS[state.environment] || ENVIRONMENT_PRESETS.lab; if (scene?.fog) { scene.fog.near = env.near * preset.fog; scene.fog.far = env.far * preset.fog; } if (neonLights.length) neonLights.forEach((light, index) => { light.intensity = (state.neonEnabled ? [1.7,.65,.35][index] : [.75,.22,.08][index]) * preset.intensity; }); $('sandbox-climate-select') && ($('sandbox-climate-select').value = climate); if (persist) { logAction(`Clima: ${preset.label}`); scheduleSave(); } }
  function applyWorldHour(hour, persist = true) { state.worldHour = clamp(Number(hour), 0, 24); const night = state.worldHour < 6 || state.worldHour >= 19; const climateFactor = (CLIMATE_PRESETS[state.climate] || CLIMATE_PRESETS.clear).intensity; const baseLights = state.neonEnabled ? [1.7,.65,.35] : [.75,.22,.08]; if (neonLights.length) neonLights.forEach((light, index) => { light.intensity = baseLights[index] * climateFactor * (night ? 1.08 : .92); }); const output = $('sandbox-world-hour-value'); if (output) output.textContent = `${String(Math.floor(state.worldHour)).padStart(2,'0')}:00`; const input = $('sandbox-world-hour'); if (input) input.value = state.worldHour; if (persist) { logAction(`Hora dimensional: ${String(Math.floor(state.worldHour)).padStart(2,'0')}:00`); scheduleSave(); } }
  function applySceneVisualState() {
    if (gridHelper) gridHelper.visible = state.gridVisible;
    $('sandbox-grid-toggle')?.classList.toggle('active', state.gridVisible);
    $('sandbox-neon-toggle')?.classList.toggle('active', state.neonEnabled);
    $('sandbox-performance-toggle')?.classList.toggle('active', state.ecoMode);
    if (neonLights.length) neonLights.forEach((light, index) => { light.intensity = state.neonEnabled ? [1.7,.65,.35][index] : [0.75,.22,.08][index]; });
    applyEnvironment(state.environment, false); applyQualitySettings(false); applyWireframe(); applyClimate(state.climate, false); applyWorldHour(state.worldHour, false);
  }

  function stepLightPhysics(dt) {
    if (!state.physicsEnabled || state.worldPaused) return;
    state.objects.forEach(rec => {
      if (!rec.mesh || rec.type === 'text') return;
      rec.velocityY = Number.isFinite(rec.velocityY) ? rec.velocityY : 0;
      if (state.gravityEnabled) rec.velocityY -= 9.8 * dt * state.timeScale;
      rec.mesh.position.y += rec.velocityY * dt * state.timeScale;
      if (rec.mesh.position.y < 0) { rec.mesh.position.y = 0; rec.velocityY = 0; }
      rec.position = rec.mesh.position.toArray();
    });
  }

  function cloneSelectedWithPattern() {
    const source = state.selectedObjectId ? SceneManager.getObject(state.selectedObjectId) : null;
    if (!source) { showToastSafe('Seleccioná un objeto para clonar.', '#ffaa44'); return []; }
    const count = clamp(Math.trunc(Number($('sandbox-clone-count')?.value) || 3), 1, 12);
    const pattern = $('sandbox-clone-pattern')?.value || 'line'; state.clonePattern = pattern; recordUndoSnapshot();
    const ids = [];
    for (let i = 0; i < count; i++) {
      const id = SceneManager.duplicateObject(source.id); const rec = SceneManager.getObject(id); if (!rec) continue;
      let offset = [0, 0, 0];
      if (pattern === 'grid') { const cols = Math.ceil(Math.sqrt(count + 1)); offset = [(i % cols + 1) * 2.2, 0, Math.floor(i / cols) * 2.2]; }
      else if (pattern === 'ring') { const angle = (i + 1) * Math.PI * 2 / (count + 1); offset = [Math.cos(angle) * 4, 0, Math.sin(angle) * 4]; }
      else offset = [(i + 1) * 2.2, 0, 0];
      const pos = [source.mesh.position.x + offset[0], source.mesh.position.y + offset[1], source.mesh.position.z + offset[2]]; SceneManager.updateObject(id, { position: pos }); ids.push(id);
    }
    logAction(`Patrón ${pattern}: ${ids.length} clones creados`); scheduleSave(); renderFutureUI(); return ids;
  }

  const WORLD_PRESETS = {
    showcase: ['human-explorer','cat-cyber','hovercar-neon','portal-gate','crystal-cluster'],
    nature: ['ancient-tree','mushroom-lab','crystal-cluster','dragon-green','dog-companion'],
    fleet: ['space-shuttle','rover-explorer','aero-bike','drone-guardian','orbital-satellite'],
    'cyber-city': ['sky-tower','neon-lighthouse','holo-terminal','energy-reactor','android-scout'],
  };
  function generateWorldPreset() {
    if (!sandboxId || !window.CutRealCatalog) return;
    const key = $('sandbox-world-preset')?.value || 'showcase'; const ids = WORLD_PRESETS[key] || WORLD_PRESETS.showcase;
    recordUndoSnapshot(); clearConnections(); SceneManager.clear(); state.worldPreset = key;
    ids.forEach((catalogId, index) => { const meta = window.CutRealCatalog.instantiate(catalogId, { color: state.catalogTint }); if (!meta) return; meta.position = [((index % 3) - 1) * 4, 0, (Math.floor(index / 3) - .5) * 4]; SceneManager.addObject(meta); });
    logAction(`Mundo ${key}: ${state.objects.size} activos colocados`); scheduleSave(); renderEditorUI(); renderFutureUI();
  }
  function connectionKey(from, to) { return [from, to].sort().join('::'); }
  function renderConnectionLines() {
    connectionLines.forEach((line, key) => { const edge = state.connections.find(item => connectionKey(item.from, item.to) === key); const from = edge && SceneManager.getObject(edge.from); const to = edge && SceneManager.getObject(edge.to); if (!from || !to) { scene?.remove(line); line.geometry?.dispose?.(); line.material?.dispose?.(); connectionLines.delete(key); return; } const points = [from.mesh.position.clone().setY(from.mesh.position.y + 1), to.mesh.position.clone().setY(to.mesh.position.y + 1)]; line.geometry.setFromPoints(points); });
    state.connections.forEach(edge => { const key = connectionKey(edge.from, edge.to); if (connectionLines.has(key) || !SceneManager.getObject(edge.from) || !SceneManager.getObject(edge.to) || !scene) return; const material = new THREE.LineBasicMaterial({ color: edge.type === 'energy' ? 0xff42bc : 0x42eaff, transparent: true, opacity: .78 }); const line = new THREE.Line(new THREE.BufferGeometry(), material); line.userData.sbxConnectionId = edge.id; scene.add(line); connectionLines.set(key, line); const from = SceneManager.getObject(edge.from), to = SceneManager.getObject(edge.to); line.geometry.setFromPoints([from.mesh.position.clone().setY(from.mesh.position.y + 1), to.mesh.position.clone().setY(to.mesh.position.y + 1)]); });
  }
  function clearConnections() { connectionLines.forEach(line => { scene?.remove(line); line.geometry?.dispose?.(); line.material?.dispose?.(); }); connectionLines.clear(); state.connections = []; }
  function createConnection(fromId, toId, type = 'data') {
    if (!fromId || !toId || fromId === toId || !SceneManager.getObject(fromId) || !SceneManager.getObject(toId)) return false;
    const key = connectionKey(fromId, toId); if (state.connections.some(item => connectionKey(item.from, item.to) === key)) return false;
    const edge = { id: `link_${Date.now().toString(36)}`, from: fromId, to: toId, type: type === 'energy' ? 'energy' : 'data' }; state.connections.push(edge);
    const material = new THREE.LineBasicMaterial({ color: edge.type === 'energy' ? 0xff42bc : 0x42eaff, transparent: true, opacity: .78 }); const geometry = new THREE.BufferGeometry(); const line = new THREE.Line(geometry, material); line.userData.sbxConnectionId = edge.id; scene.add(line); connectionLines.set(key, line); renderConnectionLines(); logAction(`Enlace ${edge.type}: ${fromId} → ${toId}`); scheduleSave(); return true;
  }
  function toggleLinkMode() {
    state.linkMode = !state.linkMode; state.linkSourceId = null; const button = $('sandbox-link-toggle'); if (button) { button.classList.toggle('active', state.linkMode); button.textContent = state.linkMode ? 'Elegí dos objetos…' : 'Enlazar objetos'; }
    showToastSafe(state.linkMode ? 'Modo enlace activo: seleccioná dos objetos.' : 'Modo enlace cancelado.', '#55eaca');
  }
  function exportSceneJSON() {
    const payload = { version: 2, exportedAt: new Date().toISOString(), scene: SceneManager.serialize(), environment: state.environment, quality: state.quality, connections: state.connections };
    const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })); link.download = `cut-real-sandbox-${sandboxId || 'scene'}-${Date.now()}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000); logAction('Escena exportada como JSON');
  }
  async function importSceneFile(file) {
    if (!file) return;
    try { const payload = JSON.parse(await file.text()); const list = Array.isArray(payload) ? payload : payload.scene; if (!Array.isArray(list)) throw new Error('El JSON no contiene una escena válida.'); recordUndoSnapshot(); clearConnections(); SceneManager.hydrate(list); state.environment = ENVIRONMENT_PRESETS[payload.environment] ? payload.environment : state.environment; state.quality = QUALITY_PRESETS[payload.quality] ? payload.quality : state.quality; state.connections = Array.isArray(payload.connections) ? payload.connections.slice(-80) : []; applySceneVisualState(); renderConnectionLines(); renderEditorUI(); renderFutureUI(); logAction(`Escena importada: ${state.objects.size} objetos`); await persistSandbox(true); } catch (error) { showToastSafe(`No se pudo importar: ${error.message}`, '#ff6666'); }
  }

  // ============================================================
  //  NEXUS WORLDS / PORTALS — expansión sobre el mismo Sandbox
  // ============================================================
  const MAX_DIMENSIONS = 8;
  const CLIMATE_PRESETS = { clear: { label: 'Despejado', fog: 1, intensity: 1 }, rain: { label: 'Lluvia', fog: .82, intensity: .86 }, fog: { label: 'Niebla', fog: .45, intensity: .7 }, storm: { label: 'Tormenta', fog: .62, intensity: .58 }, snow: { label: 'Nieve', fog: .72, intensity: .92 }, dust: { label: 'Polvo marciano', fog: .7, intensity: .68 } };
  const DIMENSION_PRESETS = {
    earth: { name: 'EARTH', environment: 'lab', climate: 'clear', worldHour: 14, gravityEnabled: true, timeScale: 1, worldPreset: 'showcase' },
    aether: { name: 'AETHER', environment: 'space', climate: 'clear', worldHour: 22, gravityEnabled: true, timeScale: .8, worldPreset: 'fleet' },
    void: { name: 'VOID', environment: 'minimal', climate: 'fog', worldHour: 0, gravityEnabled: false, timeScale: .6, worldPreset: 'showcase' },
    mars: { name: 'MARS', environment: 'industrial', climate: 'dust', worldHour: 16, gravityEnabled: true, timeScale: 1, worldPreset: 'nature' },
    'cyber-city': { name: 'CYBER CITY', environment: 'cyberpunk', climate: 'rain', worldHour: 23, gravityEnabled: true, timeScale: 1, worldPreset: 'cyber-city' },
  };
  function newDimensionRecord(presetKey = 'earth', id = `nexus-${Date.now().toString(36)}`) {
    const preset = DIMENSION_PRESETS[presetKey] || DIMENSION_PRESETS.earth;
    return { id, name: preset.name, createdAt: Date.now(), updatedAt: Date.now(), environment: preset.environment, climate: preset.climate || 'clear', worldHour: preset.worldHour ?? 14, quality: 'balanced', physicsEnabled: false, gravityEnabled: preset.gravityEnabled, worldPaused: false, timeScale: preset.timeScale, worldPreset: preset.worldPreset, connections: [], cameraPath: [], scene: [] };
  }
  function activeDimension() { return state.dimensions.find(item => item.id === state.activeDimensionId) || state.dimensions[0] || null; }
  function syncActiveDimension() {
    const active = activeDimension(); if (!active) return null;
    active.updatedAt = Date.now(); active.environment = state.environment; active.climate = state.climate; active.worldHour = state.worldHour; active.quality = state.quality; active.physicsEnabled = state.physicsEnabled; active.gravityEnabled = state.gravityEnabled; active.worldPaused = state.worldPaused; active.timeScale = state.timeScale; active.worldPreset = state.worldPreset; active.connections = state.connections.slice(-80); active.cameraPath = state.cameraPath.slice(-24); active.scene = SceneManager.serialize(); return active;
  }
  function setDimensionRuntime(record) {
    state.activeDimensionId = record.id; state.environment = ENVIRONMENT_PRESETS[record.environment] ? record.environment : 'lab'; state.climate = CLIMATE_PRESETS[record.climate] ? record.climate : 'clear'; state.worldHour = Number.isFinite(Number(record.worldHour)) ? clamp(Number(record.worldHour), 0, 24) : 14; state.quality = QUALITY_PRESETS[record.quality] ? record.quality : 'balanced'; state.physicsEnabled = record.physicsEnabled === true; state.gravityEnabled = record.gravityEnabled !== false; state.worldPaused = record.worldPaused === true; state.timeScale = Number.isFinite(Number(record.timeScale)) ? clamp(Number(record.timeScale), 0, 2) : 1; state.worldPreset = WORLD_PRESETS[record.worldPreset] ? record.worldPreset : 'showcase'; state.connections = Array.isArray(record.connections) ? record.connections.slice(-80) : []; state.cameraPath = Array.isArray(record.cameraPath) ? record.cameraPath.slice(-24) : []; state.selectedObjectId = null; SceneManager.hydrate(Array.isArray(record.scene) ? record.scene : []); applySceneVisualState(); if (camera && controls) setCameraPreset(state.cameraPreset); renderEditorUI(); renderSceneStats(); renderConnectionLines(); renderFutureUI(); renderDimensionsUI(); }
  function normalizeDimensionRecord(record, fallbackId) { const base = newDimensionRecord('earth', record?.id || fallbackId); return { ...base, ...(record || {}), id: String(record?.id || fallbackId), name: sanitizeText(record?.name || base.name, 40) || base.name, scene: Array.isArray(record?.scene) ? record.scene.slice(0, MAX_OBJECTS) : [], connections: Array.isArray(record?.connections) ? record.connections.slice(-80) : [], cameraPath: Array.isArray(record?.cameraPath) ? record.cameraPath.slice(-24) : [] }; }
  function ensureDimensions(data) {
    const saved = Array.isArray(data?.dimensions) ? data.dimensions : [];
    if (saved.length) state.dimensions = saved.slice(0, MAX_DIMENSIONS).map((item, index) => normalizeDimensionRecord(item, `nexus-${String(index + 1).padStart(3, '0')}`));
    else state.dimensions = [normalizeDimensionRecord({ id: 'nexus-001', name: 'EARTH', scene: data?.scene || [], environment: data?.environment, climate: data?.climate, worldHour: data?.worldHour, quality: data?.quality, physicsEnabled: data?.physicsEnabled, gravityEnabled: data?.gravityEnabled, worldPaused: data?.worldPaused, timeScale: data?.timeScale, worldPreset: data?.worldPreset, connections: data?.connections, cameraPath: data?.cameraPath }, 'nexus-001')];
    state.activeDimensionId = state.dimensions.some(item => item.id === data?.activeDimensionId) ? data.activeDimensionId : state.dimensions[0].id; state.sandboxMode = ['editor','player','god','drone','cinematic','ai'].includes(data?.sandboxMode) ? data.sandboxMode : 'editor'; state.player = { position: Array.isArray(data?.player?.position) ? clampVec(data.player.position) : [0,1.7,5], velocityY: Number(data?.player?.velocityY) || 0, grounded: data?.player?.grounded !== false }; setDimensionRuntime(activeDimension());
  }
  async function switchDimension(id) {
    const next = state.dimensions.find(item => item.id === id); if (!next || next.id === state.activeDimensionId) return false;
    syncActiveDimension(); setDimensionRuntime(next); logAction(`Dimensión activa: ${next.name}`); await persistSandbox(true); return true;
  }
  function createDimension(presetOverride = null, nameOverride = null) {
    if (state.dimensions.length >= MAX_DIMENSIONS) { showToastSafe(`Límite de ${MAX_DIMENSIONS} dimensiones alcanzado.`, '#ffaa44'); return null; }
    syncActiveDimension(); const key = DIMENSION_PRESETS[presetOverride] ? presetOverride : ($('sandbox-dimension-preset')?.value || 'earth'); const record = newDimensionRecord(key); record.name = sanitizeText(nameOverride || $('sandbox-dimension-name')?.value || record.name, 40); state.dimensions.push(record); setDimensionRuntime(record); applyDimensionPreset(key, false); logAction(`Dimensión creada: ${record.name}`); renderDimensionsUI(); void persistSandbox(true); return record.id;
  }
  function duplicateDimension() {
    if (state.dimensions.length >= MAX_DIMENSIONS) { showToastSafe(`Límite de ${MAX_DIMENSIONS} dimensiones alcanzado.`, '#ffaa44'); return null; }
    const source = syncActiveDimension(); if (!source) return null; const copy = JSON.parse(JSON.stringify(source)); copy.id = `nexus-${Date.now().toString(36)}`; copy.name = `${source.name} COPY`; copy.createdAt = Date.now(); state.dimensions.push(copy); setDimensionRuntime(copy); logAction(`Dimensión duplicada: ${copy.name}`); void persistSandbox(true); return copy.id;
  }
  function renameDimension(nameOverride = null) { const active = activeDimension(); if (!active) return false; const input = $('sandbox-dimension-name'); const name = sanitizeText(nameOverride || input?.value, 40).trim(); if (!name) { showToastSafe('Escribí un nombre para la dimensión.', '#ffaa44'); return false; } active.name = name; active.updatedAt = Date.now(); logAction(`Dimensión renombrada: ${name}`); renderDimensionsUI(); void persistSandbox(true); return true; }
  async function deleteDimension() { const active = activeDimension(); if (!active || state.dimensions.length <= 1) { showToastSafe('Debe existir al menos una dimensión.', '#ffaa44'); return false; } if (!confirm(`¿Eliminar permanentemente ${active.name}? Esta acción no se puede deshacer.`)) return false; state.dimensions = state.dimensions.filter(item => item.id !== active.id); const next = state.dimensions[0]; setDimensionRuntime(next); logAction(`Dimensión eliminada: ${active.name}`); await persistSandbox(true); return true; }
  function applyDimensionPreset(key, persist = true) { const active = activeDimension(); const preset = DIMENSION_PRESETS[key] || DIMENSION_PRESETS.earth; if (!active) return; active.environment = preset.environment; active.climate = preset.climate || 'clear'; active.worldHour = preset.worldHour ?? 14; active.gravityEnabled = preset.gravityEnabled; active.timeScale = preset.timeScale; active.worldPreset = preset.worldPreset; state.environment = preset.environment; state.climate = active.climate; state.worldHour = active.worldHour; state.gravityEnabled = preset.gravityEnabled; state.timeScale = preset.timeScale; state.worldPreset = preset.worldPreset; if (key === 'cyber-city' && sandboxId && window.CutRealCatalog) generateWorldPreset(); else { applySceneVisualState(); renderFutureUI(); } logAction(`Preset dimensional aplicado: ${preset.name}`); if (persist) void persistSandbox(true); renderDimensionsUI(); }
  function createPortalForTarget(targetOverride = null, positionOverride = null) { const targetId = targetOverride || $('sandbox-portal-target')?.value; const target = state.dimensions.find(item => item.id === targetId); if (!target || target.id === state.activeDimensionId) { showToastSafe('Elegí otra dimensión como destino.', '#ffaa44'); return null; } const meta = window.CutRealCatalog?.instantiate('portal-gate', { color: state.catalogTint, animation: 'spin', animationPlaying: true }); if (!meta) { showToastSafe('El asset portal-gate no está disponible.', '#ff6666'); return null; } recordUndoSnapshot(); meta.name = `NEXUS Gate → ${target.name}`;     meta.position = Array.isArray(positionOverride) ? clampVec(positionOverride) : suggestedScenePosition(); meta.portalTargetDimension = target.id; const id = SceneManager.addObject(meta); Editor.select(id); logAction(`Portal creado hacia ${target.name}`); scheduleSave(); return id; }
  function connectSelectedPortal(portalIdOverride = null, targetOverride = null) { const portalId = portalIdOverride || state.selectedObjectId; const rec = portalId ? SceneManager.getObject(portalId) : null; const target = state.dimensions.find(item => item.id === (targetOverride || $('sandbox-portal-target')?.value)); if (!rec || rec.catalogId !== 'portal-gate' || !target || target.id === state.activeDimensionId) { showToastSafe('Seleccioná un NEXUS Gate y un destino válido.', '#ffaa44'); return false; } rec.portalTargetDimension = target.id; rec.name = `NEXUS Gate → ${target.name}`; logAction(`Portal conectado hacia ${target.name}`); scheduleSave(); renderDimensionsUI(); return true; }
  async function enterSelectedPortal(portalIdOverride = null) { const portalId = portalIdOverride || state.selectedObjectId; const rec = portalId ? SceneManager.getObject(portalId) : null; if (!rec?.portalTargetDimension) { showToastSafe('Seleccioná un portal conectado.', '#ffaa44'); return false; } return switchDimension(rec.portalTargetDimension); }
  function renderDimensionsUI() { const active = activeDimension(); const select = $('sandbox-dimension-select'); const target = $('sandbox-portal-target'); const options = state.dimensions.map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)} · ${escapeHtml(item.id)}</option>`).join(''); if (select) { select.innerHTML = options; select.value = active?.id || ''; } if (target) { target.innerHTML = `<option value="">Elegir destino…</option>${options}`; target.value = target.value && state.dimensions.some(item => item.id === target.value) ? target.value : ''; } const name = $('sandbox-dimension-name'); if (name && document.activeElement !== name) name.value = active?.name || ''; const status = $('sandbox-dimension-active-status'); if (status) status.textContent = active ? `${active.id.toUpperCase()} · ${active.name}` : 'Sin dimensión'; const info = $('sandbox-dimension-info'); if (info && active) info.textContent = `${active.name}: ${active.scene?.length || state.objects.size} objetos · ambiente ${active.environment} · clima ${state.climate} · hora ${String(Math.floor(state.worldHour)).padStart(2,'0')}:00 · gravedad ${active.gravityEnabled ? 'activa' : 'desactivada'} · ${state.connections.length} conexiones`; const map = $('sandbox-dimension-map'); if (map) map.innerHTML = state.dimensions.map(item => `<button class="sbx-dimension-node ${item.id === state.activeDimensionId ? 'active' : ''}" data-dimension-id="${escapeHtml(item.id)}">${escapeHtml(item.name)}<small>${escapeHtml(item.id)} · ${item.scene?.length || 0} obj.</small></button>`).join(''); }

  function setChatVisible(visible, persist = true) {
    state.chatVisible = !!visible;
    $('sandbox-overlay')?.classList.toggle('sbx-chat-collapsed', !state.chatVisible);
    const btn = $('sandbox-chat-toggle'); if (btn) btn.textContent = state.chatVisible ? '◧ Ocultar chat' : '◨ Mostrar chat';
    if (persist) { scheduleSave(); renderFutureUI(); }
  }

  function setCameraPreset(preset) {
    if (!camera || !controls) return;
    state.cameraPreset = preset;
    const target = new THREE.Vector3(0, 1, 0);
    const positions = { hero: [9,7,9], top: [0,15,.01], orbit: [-9,6,-9] };
    camera.position.set(...(positions[preset] || positions.hero)); controls.target.copy(target); controls.update();
    logAction(`Cámara: ${preset}`); renderFutureUI();
  }

  function toggleCameraRecording() {
    state.cameraRecording = !state.cameraRecording;
    if (cameraPathTimer) { clearInterval(cameraPathTimer); cameraPathTimer = null; }
    if (state.cameraRecording) {
      state.cameraPath = [{ position: camera.position.toArray(), target: controls.target.toArray() }];
      cameraPathTimer = setInterval(() => { if (!camera || !controls || state.cameraPath.length >= 24) return; state.cameraPath.push({ position: camera.position.toArray(), target: controls.target.toArray() }); if (state.cameraPath.length >= 24) toggleCameraRecording(); }, 260);
      logAction('Path de cámara: grabando');
    } else { logAction(`Path de cámara: ${state.cameraPath.length} puntos guardados`); scheduleSave(); }
    const button = $('sandbox-camera-record'); if (button) { button.classList.toggle('active', state.cameraRecording); button.textContent = state.cameraRecording ? '■ Stop' : '● Rec'; }
  }
  function playCameraPath() {
    if (!camera || !controls || state.cameraPath.length < 2) { showToastSafe('Grabá al menos dos puntos de cámara primero.', '#ffaa44'); return; }
    if (cameraPathPlayback) { clearInterval(cameraPathPlayback); cameraPathPlayback = null; state.cameraPlaying = false; return; }
    state.cameraPlaying = true; let index = 0; let fromPosition = camera.position.toArray(); let fromTarget = controls.target.toArray(); let segmentStart = performance.now();
    cameraPathPlayback = setInterval(() => { const progress = clamp((performance.now() - segmentStart) / 900, 0, 1); const ease = 1 - Math.pow(1 - progress, 3); const point = state.cameraPath[index]; camera.position.fromArray(fromPosition.map((v, i) => v + (point.position[i] - v) * ease)); controls.target.fromArray(fromTarget.map((v, i) => v + (point.target[i] - v) * ease)); controls.update(); if (progress >= 1) { fromPosition = point.position.slice(); fromTarget = point.target.slice(); index += 1; segmentStart = performance.now(); if (index >= state.cameraPath.length) { clearInterval(cameraPathPlayback); cameraPathPlayback = null; state.cameraPlaying = false; renderFutureUI(); } } }, 32);
    logAction('Path de cámara: reproducción');
  }
  function captureSceneSnapshot() { return JSON.parse(JSON.stringify(SceneManager.serialize())); }
  function collectSceneMetrics(targetId = null) {
    let vertices = 0, triangles = 0, meshes = 0;
    const target = targetId ? SceneManager.getObject(targetId) : null;
    const records = target ? [target] : Array.from(state.objects.values());
    records.forEach(rec => rec.mesh?.traverse(child => {
      if (!child.isMesh || !child.geometry) return;
      meshes += 1;
      const position = child.geometry.getAttribute?.('position');
      vertices += position?.count || 0;
      triangles += child.geometry.index ? child.geometry.index.count / 3 : Math.floor((position?.count || 0) / 3);
    }));
    return { objects: target ? 1 : state.objects.size, meshes, vertices, triangles: Math.floor(triangles), selected: target?.name || null };
  }
  function renderSceneAnalysis() {
    const el = $('sandbox-analysis-content'); if (!el) return;
    const selected = state.selectedObjectId ? collectSceneMetrics(state.selectedObjectId) : null;
    const world = collectSceneMetrics();
    const selectedLine = selected ? `<div class="sbx-analysis-focus"><b>Selección:</b> ${escapeHtml(selected.selected)} · ${selected.meshes} mallas · ${selected.vertices.toLocaleString('es-AR')} vértices · ${selected.triangles.toLocaleString('es-AR')} triángulos</div>` : '<div class="sbx-analysis-focus">Sin objeto seleccionado. Se muestran métricas globales.</div>';
    el.innerHTML = `${selectedLine}<div class="sbx-analysis-grid"><div><span>Objetos</span><b>${world.objects}</b></div><div><span>Mallas</span><b>${world.meshes}</b></div><div><span>Vértices</span><b>${world.vertices.toLocaleString('es-AR')}</b></div><div><span>Triángulos</span><b>${world.triangles.toLocaleString('es-AR')}</b></div></div><small>Lectura directa de BufferGeometry en Three.js; no es una estimación.</small>`;
  }
  function createSceneSnapshot() {
    if (!sandboxId) return null;
    const snapshot = { id: `snap_${Date.now().toString(36)}`, createdAt: Date.now(), scene: captureSceneSnapshot(), cameraPreset: state.cameraPreset, label: `Snapshot ${new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}` };
    state.snapshots = [snapshot, ...state.snapshots.filter(item => item?.scene)].slice(0, MAX_FIRESTORE_SNAPSHOTS);
    logAction(`Snapshot creado: ${snapshot.label}`); renderSaveState('saving'); void persistSandbox(true); renderFutureUI();
    return snapshot;
  }
  function recoverLatestSnapshot() {
    const snapshot = state.snapshots[0];
    if (!snapshot?.scene) { showToastSafe('Todavía no hay snapshots para recuperar.', '#ffaa44'); return false; }
    recordUndoSnapshot();
    SceneManager.hydrate(snapshot.scene); state.selectedObjectId = null; state.cameraPreset = snapshot.cameraPreset || state.cameraPreset;
    applySceneVisualState(); if (camera && controls) setCameraPreset(state.cameraPreset); renderEditorUI(); renderSceneStats();
    logAction(`Snapshot recuperado: ${snapshot.label || snapshot.id}`); void persistSandbox(true); renderFutureUI(); return true;
  }
  function openSceneScanner() {
    const panel = $('sandbox-analysis-panel'); if (panel) panel.hidden = false;
    renderSceneAnalysis(); switchMobileTab('scene');
  }
  function recordUndoSnapshot() {
    const current = captureSceneSnapshot();
    const previous = state.undoStack[state.undoStack.length - 1];
    if (previous && JSON.stringify(previous) === JSON.stringify(current)) return;
    state.undoStack.push(current); if (state.undoStack.length > MAX_HISTORY_SNAPSHOTS) state.undoStack.shift(); state.redoStack = [];
    renderFutureUI();
  }
  function restoreSceneSnapshot(snapshot) {
    SceneManager.hydrate(Array.isArray(snapshot) ? snapshot : []); state.selectedObjectId = null; renderEditorUI(); renderSceneStats(); scheduleSave();
  }
  function undoScene() {
    if (!state.undoStack.length) return;
    const current = captureSceneSnapshot(); state.redoStack.push(current); const snapshot = state.undoStack.pop(); restoreSceneSnapshot(snapshot); logAction('Undo: escena restaurada'); renderFutureUI();
  }
  function redoScene() {
    if (!state.redoStack.length) return;
    const current = captureSceneSnapshot(); state.undoStack.push(current); const snapshot = state.redoStack.pop(); restoreSceneSnapshot(snapshot); logAction('Redo: escena restaurada'); renderFutureUI();
  }
  function takeSceneScreenshot() {
    if (!renderer?.domElement) return;
    renderer.render(scene, camera); const link = document.createElement('a'); link.download = `cut-real-sandbox-${Date.now()}.png`; link.href = renderer.domElement.toDataURL('image/png'); link.click(); logAction('Captura PNG guardada');
  }
  function clearSceneFromDock() {
    if (!state.objects.size || !confirm('¿Vaciar todos los objetos de esta escena?')) return;
    recordUndoSnapshot(); SceneManager.clear(); state.selectedObjectId = null; renderEditorUI(); scheduleSave(); logAction('Escena vaciada desde NEXUS'); renderFutureUI();
  }

  const GEOMS = {
    sphere:   () => new THREE.SphereGeometry(0.5, 20, 16),
    box:      () => new THREE.BoxGeometry(1, 1, 1),
    cylinder: () => new THREE.CylinderGeometry(0.5, 0.5, 1, 20),
    cone:     () => new THREE.ConeGeometry(0.5, 1, 20),
    torus:    () => new THREE.TorusGeometry(0.5, 0.18, 12, 24),
    plane:    () => new THREE.PlaneGeometry(1, 1),
  };

  function buildMaterial(part, flatShading) {
    return new THREE.MeshStandardMaterial({
      color: safeColor(part.color) || 0x33ff77,
      wireframe: !!part.wireframe,
      flatShading: !!flatShading || !!part.flatShading,
      transparent: part.opacity != null,
      opacity: part.opacity != null ? clamp(part.opacity, 0.05, 1) : 1,
      emissive: 0x0a2a14, emissiveIntensity: 0.25,
      metalness: 0.15, roughness: 0.55,
    });
  }

  function applyPartTransform(mesh, part) {
    const pos = clampVec(part.position || [0,0,0]);
    mesh.position.set(pos[0], pos[1], pos[2]);
    if (Array.isArray(part.rotation)) mesh.rotation.set(part.rotation[0]||0, part.rotation[1]||0, part.rotation[2]||0);
    if (Array.isArray(part.scale)) {
      const s = part.scale.map(n => clamp(n, 0.05, 6));
      mesh.scale.set(s[0]||1, s[1]||1, s[2]||1);
    }
    return mesh;
  }

  function normalizeLowPolyVertices(vertices) {
    const rows = Array.isArray(vertices) ? vertices.slice(0, MAX_LOWPOLY_VERTICES) : [];
    const flat = rows.length && Array.isArray(rows[0])
      ? rows.flatMap(v => [v?.[0], v?.[1], v?.[2]])
      : rows;
    const out = flat.slice(0, MAX_LOWPOLY_VERTICES * 3).map(n => clamp(Number(n), -WORLD_BOUND, WORLD_BOUND));
    if (out.length < 9 || out.length % 3 !== 0) throw new Error('Una malla low-poly necesita al menos 3 vértices [x,y,z].');
    return out;
  }

  function normalizeLowPolyFaces(faces, vertexCount) {
    const out = [];
    for (const face of (Array.isArray(faces) ? faces : []).slice(0, MAX_LOWPOLY_FACES)) {
      if (!Array.isArray(face) || face.length < 3) continue;
      const ids = face.slice(0, 8).map(n => Math.trunc(Number(n)));
      if (ids.some(n => !Number.isInteger(n) || n < 0 || n >= vertexCount)) continue;
      for (let i = 1; i < ids.length - 1 && out.length < MAX_LOWPOLY_FACES * 3; i++) {
        out.push(ids[0], ids[i], ids[i + 1]);
      }
    }
    if (out.length < 9) throw new Error('Una malla low-poly necesita al menos 3 caras válidas.');
    return out;
  }

  function rotateLocalPoint(v, rotation) {
    const [rx, ry, rz] = rotation || [0,0,0];
    let [x,y,z] = v;
    let c = Math.cos(rx), s = Math.sin(rx); [y,z] = [y*c - z*s, y*s + z*c];
    c = Math.cos(ry); s = Math.sin(ry); [x,z] = [x*c + z*s, -x*s + z*c];
    c = Math.cos(rz); s = Math.sin(rz); [x,y] = [x*c - y*s, x*s + y*c];
    return [x,y,z];
  }

  // LEGACY DISABLED: estas funciones se conservan por compatibilidad histórica,
  // pero no participan en ninguna tool de generación low-poly.
  function makeEllipsoidShape(rx, ry, rz, segments = 8, rings = 4) {
    const vertices = [[0, ry, 0]];
    for (let r = 1; r < rings; r++) {
      const phi = Math.PI * r / rings;
      for (let s = 0; s < segments; s++) {
        const theta = Math.PI * 2 * s / segments;
        vertices.push([Math.sin(phi) * rx * Math.cos(theta), Math.cos(phi) * ry, Math.sin(phi) * rz * Math.sin(theta)]);
      }
    }
    const bottom = vertices.length; vertices.push([0, -ry, 0]);
    const faces = [];
    for (let s = 0; s < segments; s++) faces.push([0, 1+s, 1+(s+1)%segments]);
    for (let r = 0; r < rings - 2; r++) {
      const a = 1 + r * segments, b = a + segments;
      for (let s = 0; s < segments; s++) {
        const n = (s+1)%segments;
        faces.push([a+s,b+s,a+n], [a+n,b+s,b+n]);
      }
    }
    const last = 1 + (rings - 2) * segments;
    for (let s = 0; s < segments; s++) faces.push([last+s,bottom,last+(s+1)%segments]);
    return { vertices, faces };
  }

  function makeFrustumShape(rxTop, rzTop, rxBottom, rzBottom, height, segments = 6) {
    const vertices = [];
    for (const [y, rx, rz] of [[height/2, rxTop, rzTop], [-height/2, rxBottom, rzBottom]]) {
      for (let s = 0; s < segments; s++) {
        const theta = Math.PI * 2 * s / segments;
        vertices.push([rx * Math.cos(theta), y, rz * Math.sin(theta)]);
      }
    }
    const faces = [[...Array(segments).keys()].reverse(), [...Array(segments).keys()].map(i => segments+i)];
    for (let s = 0; s < segments; s++) {
      const n = (s+1)%segments;
      faces.push([s,n,segments+s], [n,segments+n,segments+s]);
    }
    return { vertices, faces };
  }

  function makeBoxShape(sx, sy, sz) {
    const x=sx/2, y=sy/2, z=sz/2;
    return { vertices:[[-x,-y,-z],[x,-y,-z],[x,y,-z],[-x,y,-z],[-x,-y,z],[x,-y,z],[x,y,z],[-x,y,z]], faces:[[0,1,2],[0,2,3],[4,6,5],[4,7,6],[0,4,5],[0,5,1],[1,5,6],[1,6,2],[2,6,7],[2,7,3],[4,0,3],[4,3,7]] };
  }

  function makeTriPrismShape(width, height, depth) {
    const w=width/2, d=depth/2;
    return { vertices:[[-w,0,-d],[w,0,-d],[0,height,-d],[-w,0,d],[w,0,d],[0,height,d]], faces:[[0,1,2],[3,5,4],[0,3,4],[0,4,1],[1,4,5],[1,5,2],[2,5,3],[2,3,0]] };
  }

  function combineSemanticShapes(shapes, color) {
    const vertices = [], faces = [];
    for (const spec of shapes) {
      const offset = vertices.length;
      const pos = spec.position || [0,0,0], scale = spec.scale || [1,1,1], rotation = spec.rotation || [0,0,0];
      for (const vertex of spec.shape.vertices) {
        const rotated = rotateLocalPoint([vertex[0]*scale[0], vertex[1]*scale[1], vertex[2]*scale[2]], rotation);
        vertices.push([rotated[0]+pos[0], rotated[1]+pos[1], rotated[2]+pos[2]]);
      }
      for (const face of spec.shape.faces) faces.push(face.map(index => index + offset));
    }
    return { geometry: 'lowpoly', vertices, faces, color, flatShading: true };
  }

  // LEGACY DISABLED: no llamar desde tools; la IA debe suministrar meshes reales.
  function semanticModelMeshes(kind, color) {
    const main = safeColor(color) || '#33ff77';
    const dark = '#18251d';
    const skin = '#c98f72';
    const white = '#f4f4e8';
    if (kind === 'cat' || kind === 'gato') {
      return [
        combineSemanticShapes([{ shape: makeEllipsoidShape(1.0,.75,1.25), position:[0,1.35,0] }], main),
        combineSemanticShapes([{ shape: makeEllipsoidShape(.72,.68,.7), position:[0,2.62,.62] }], main),
        combineSemanticShapes([{ shape: makeEllipsoidShape(.32,.22,.28), position:[0,2.38,1.18] }], '#d99a85'),
        combineSemanticShapes([
          { shape: makeFrustumShape(.19,.19,.25,.25,.9), position:[-.56,.55,.62] }, { shape: makeFrustumShape(.19,.19,.25,.25,.9), position:[.56,.55,.62] },
          { shape: makeFrustumShape(.19,.19,.25,.25,.9), position:[-.56,.55,-.62] }, { shape: makeFrustumShape(.19,.19,.25,.25,.9), position:[.56,.55,-.62] },
        ], main),
        combineSemanticShapes([{ shape: makeTriPrismShape(.42,.72,.34), position:[-.4,3.12,.62] }, { shape: makeTriPrismShape(.42,.72,.34), position:[.4,3.12,.62] }], main),
        combineSemanticShapes([
          { shape: makeEllipsoidShape(.23,.23,.55), position:[1.05,1.65,-.55], rotation:[0,.35,-.3] },
          { shape: makeEllipsoidShape(.2,.2,.5), position:[1.42,2.0,-.7], rotation:[0,.25,-.45] },
          { shape: makeEllipsoidShape(.16,.16,.42), position:[1.55,2.35,-.62], rotation:[0,.1,-.1] },
        ], main),
        combineSemanticShapes([{ shape: makeEllipsoidShape(.1,.1,.07), position:[-.27,2.76,1.2] }, { shape: makeEllipsoidShape(.1,.1,.07), position:[.27,2.76,1.2] }], dark),
      ];
    }
    if (kind === 'person' || kind === 'persona') {
      return [
        combineSemanticShapes([{ shape: makeFrustumShape(.52,.3,.68,.42,1.35), position:[0,1.45,0] }], main),
        combineSemanticShapes([{ shape: makeEllipsoidShape(.42,.48,.38), position:[0,2.55,0] }], skin),
        combineSemanticShapes([{ shape: makeEllipsoidShape(.45,.18,.4), position:[0,2.92,0] }], dark),
        combineSemanticShapes([{ shape: makeFrustumShape(.16,.16,.2,.2,1.15), position:[-.72,1.45,0], rotation:[0,0,-.16] }, { shape: makeFrustumShape(.16,.16,.2,.2,1.15), position:[.72,1.45,0], rotation:[0,0,.16] }], skin),
        combineSemanticShapes([{ shape: makeFrustumShape(.22,.22,.27,.27,1.25), position:[-.3,.1,0] }, { shape: makeFrustumShape(.22,.22,.27,.27,1.25), position:[.3,.1,0] }], dark),
        combineSemanticShapes([{ shape: makeBoxShape(.42,.18,.7), position:[-.3,-.58,.13] }, { shape: makeBoxShape(.42,.18,.7), position:[.3,-.58,.13] }], dark),
      ];
    }
    if (kind === 'house' || kind === 'casa') {
      return [
        combineSemanticShapes([{ shape: makeBoxShape(2.5,2.0,2.1), position:[0,1.0,0] }], '#bd7048'),
        combineSemanticShapes([{ shape: makeTriPrismShape(2.9,1.2,2.35), position:[0,2.0,0], rotation:[0,0,0] }], '#8f3c35'),
        combineSemanticShapes([{ shape: makeBoxShape(.62,1.1,.12), position:[0,.55,1.08] }], dark),
        combineSemanticShapes([{ shape: makeBoxShape(.45,.45,.12), position:[-.72,1.25,1.08] }, { shape: makeBoxShape(.45,.45,.12), position:[.72,1.25,1.08] }], white),
        combineSemanticShapes([{ shape: makeBoxShape(.32,.85,.32), position:[.72,2.55,-.38] }], '#6f5142'),
      ];
    }
    if (kind === 'car' || kind === 'auto' || kind === 'vehiculo') {
      return [
        combineSemanticShapes([{ shape: makeBoxShape(2.8,.65,1.45), position:[0,.72,0] }], main),
        combineSemanticShapes([{ shape: makeBoxShape(1.45,.72,1.2), position:[0,1.34,-.05] }], '#4f7565'),
        combineSemanticShapes([
          { shape: makeEllipsoidShape(.32,.32,.16), position:[-1.0,.32,.72], rotation:[Math.PI/2,0,0] }, { shape: makeEllipsoidShape(.32,.32,.16), position:[1.0,.32,.72], rotation:[Math.PI/2,0,0] },
          { shape: makeEllipsoidShape(.32,.32,.16), position:[-1.0,.32,-.72], rotation:[Math.PI/2,0,0] }, { shape: makeEllipsoidShape(.32,.32,.16), position:[1.0,.32,-.72], rotation:[Math.PI/2,0,0] },
        ], dark),
      ];
    }
    if (kind === 'tree' || kind === 'arbol') {
      return [combineSemanticShapes([{ shape: makeFrustumShape(.28,.28,.38,.38,1.8), position:[0,.9,0] }], '#70452f'), combineSemanticShapes([{ shape: makeEllipsoidShape(1.0,1.1,1.0), position:[0,2.3,0] }, { shape: makeEllipsoidShape(.7,.8,.7), position:[-.7,2.1,.1] }, { shape: makeEllipsoidShape(.7,.8,.7), position:[.7,2.1,.1] }], '#3f9b4c')];
    }
    return [combineSemanticShapes([{ shape: makeEllipsoidShape(.8,.8,.8) }], main)];
  }

  // La geometría low-poly debe venir del modelo. Esta validación no interpreta
  // nombres, semanticType ni roles para construir piezas: solo verifica y
  // prepara los datos que el modelo ya generó.
  function validateGeneratedLowPolyMeshes(meshes, fallbackColor) {
    if (!Array.isArray(meshes) || meshes.length === 0) {
      throw new Error('create_lowpoly_object requiere meshes generados por la IA con vertices y faces reales. No se usan plantillas automáticas.');
    }
    const parts = meshes.slice(0, MAX_LOWPOLY_PARTS).map((part, index) => {
      if (!part || typeof part !== 'object') throw new Error(`La submalla ${index + 1} no es un objeto válido.`);
      if (!Array.isArray(part.vertices) || !Array.isArray(part.faces)) {
        throw new Error(`La submalla ${index + 1} debe incluir vertices y faces generados por la IA.`);
      }
      if (part.role != null && typeof part.role !== 'string') {
        throw new Error(`El role de la submalla ${index + 1} debe ser texto.`);
      }
      const vertices = normalizeLowPolyVertices(part.vertices);
      const faces = normalizeLowPolyFaces(part.faces, vertices.length / 3);
      if (vertices.length < 9 || faces.length < 9) {
        throw new Error(`La submalla ${index + 1} necesita al menos 3 vértices y 3 caras válidas.`);
      }
      const color = safeColor(part.color) || safeColor(fallbackColor) || '#33ff77';
      return { ...part, geometry: 'lowpoly', flatShading: true, color };
    });
    const totalVertices = parts.reduce((sum, part) => sum + part.vertices.length / 3, 0);
    const totalFaces = parts.reduce((sum, part) => sum + part.faces.length / 3, 0);
    if (parts.length < MIN_LOWPOLY_PARTS || totalVertices < MIN_LOWPOLY_TOTAL_VERTICES || totalFaces < MIN_LOWPOLY_TOTAL_FACES) {
      throw new Error(`La malla low-poly es demasiado simple: requiere al menos ${MIN_LOWPOLY_PARTS} submallas, ${MIN_LOWPOLY_TOTAL_VERTICES} vértices y ${MIN_LOWPOLY_TOTAL_FACES} triángulos generados por la IA.`);
    }
    return parts;
  }

  // LEGACY DISABLED: semanticType nunca se infiere desde el nombre del objeto.
  function semanticKindFromText(text) {
    const value = String(text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (/\b(gato|gatito|cat|felino)\b/.test(value)) return 'cat';
    if (/\b(persona|personaje humano|humano|human|person)\b/.test(value)) return 'person';
    if (/\b(casa|casita|house|hogar)\b/.test(value)) return 'house';
    if (/\b(auto|coche|carro|vehiculo|vehículo|car)\b/.test(value)) return 'car';
    if (/\b(arbol|árbol|tree)\b/.test(value)) return 'tree';
    return null;
  }

  function buildLowPolyMesh(part) {
    const vertexValues = normalizeLowPolyVertices(part.vertices);
    const vertexCount = vertexValues.length / 3;
    const indices = normalizeLowPolyFaces(part.faces, vertexCount);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertexValues, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return applyPartTransform(new THREE.Mesh(geometry, buildMaterial(part, true)), part);
  }

  function buildPartMesh(part) {
    if (part && (part.geometry === 'lowpoly' || part.geometry === 'mesh')) return buildLowPolyMesh(part);
    const geomFn = GEOMS[part.geometry] || GEOMS.box;
    return applyPartTransform(new THREE.Mesh(geomFn(), buildMaterial(part, false)), part);
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
      if (meta.type === 'catalog_lowpoly' && meta.catalogId && !Array.isArray(meta.parts)) {
        const catalogMeta = window.CutRealCatalog?.instantiate(meta.catalogId, { color: meta.color, animation: meta.animation, animationSpeed: meta.animationSpeed, animationPlaying: meta.animationPlaying });
        if (catalogMeta) meta = { ...catalogMeta, ...meta, parts: catalogMeta.parts };
      }
      const id = meta.id || genId();
            const group = new THREE.Group();
      const pos = suggestedScenePosition(meta.position);
      const rotation = Array.isArray(meta.rotation) ? meta.rotation.map(n => clamp(Number(n), -Math.PI * 4, Math.PI * 4)) : [0,0,0];
      const scale = Array.isArray(meta.scale) ? meta.scale.map(n => clamp(Number(n), 0.1, 5)) : [1,1,1];
      group.position.set(pos[0], pos[1], pos[2]);
      group.rotation.set(rotation[0] || 0, rotation[1] || 0, rotation[2] || 0);
      group.scale.set(scale[0] || 1, scale[1] || 1, scale[2] || 1);
      group.userData.sbxObjectId = id;

      if (meta.type === 'text') group.add(buildTextSprite(meta.text, meta.color));

      else (meta.parts || []).slice(0, meta.type === 'catalog_lowpoly' ? 24 : 12).forEach(p => {
        const child = buildPartMesh(p);
        child.userData.catalogRole = p.role || '';
        group.add(child);
      });

      scene.add(group);
      state.objects.set(id, {
                id, name: meta.name || meta.text || id, type: meta.type || 'primitive_group',
        parts: meta.parts || null, text: meta.text || null, position: pos,
        rotation, scale, color: meta.color || null, mesh: group,
        catalogId: meta.catalogId || null, catalogCategory: meta.catalogCategory || null,
        catalogDescription: meta.catalogDescription || null,
        portalTargetDimension: meta.portalTargetDimension || null,
        animation: meta.animation || 'idle', animationSpeed: clamp(Number(meta.animationSpeed) || 1, .15, 3),
        animationPlaying: meta.animationPlaying !== false, animationBase: null,

      });
      applyWireframe(); renderSceneStats();
      return id;
    },
    updateObject(id, patch) {
      const rec = state.objects.get(id);
      if (!rec) throw new Error('Objeto no encontrado: ' + id);
            if (patch.position) { const p = clampVec(patch.position); rec.mesh.position.set(p[0],p[1],p[2]); rec.position = p; if (rec.animationBase) rec.animationBase.position = p.slice(); }
      if (Array.isArray(patch.rotation)) { const nextRotation = patch.rotation.slice(0,3).map(n => clamp(Number(n), -Math.PI * 4, Math.PI * 4)); rec.mesh.rotation.set(...nextRotation); rec.rotation = nextRotation; if (rec.animationBase) rec.animationBase.rotation = nextRotation.slice(); }
      if (Array.isArray(patch.scale)) { const s = patch.scale.map(n => clamp(Number(n), 0.1, 5)); rec.mesh.scale.set(s[0],s[1],s[2]); rec.scale = s; if (rec.animationBase) rec.animationBase.scale = s.slice(); }
      if (Array.isArray(patch.parts)) {
        while (rec.mesh.children.length) rec.mesh.remove(rec.mesh.children[0]);
        patch.parts.slice(0, rec.type === 'catalog_lowpoly' ? 24 : 12).forEach(p => { const child = buildPartMesh(p); child.userData.catalogRole = p.role || ''; rec.mesh.add(child); });
        rec.parts = patch.parts.slice(0, rec.type === 'catalog_lowpoly' ? 24 : 12); rec.animationBase = null;
      }
      if (patch.animation) rec.animation = String(patch.animation).slice(0, 24);
      if (patch.animationSpeed != null) rec.animationSpeed = clamp(Number(patch.animationSpeed), .15, 3);
      if (patch.animationPlaying != null) rec.animationPlaying = !!patch.animationPlaying;
      applyWireframe(); renderSceneStats(); return true;
    },
    deleteObject(id) {
      const rec = state.objects.get(id);
      if (!rec) return false;
      scene.remove(rec.mesh);
      state.objects.delete(id);
      state.connections = state.connections.filter(edge => edge.from !== id && edge.to !== id); renderConnectionLines(); renderSceneStats();
      return true;
    },
    moveObject(id, position, duration) {
      const rec = state.objects.get(id); if (!rec) throw new Error('Objeto no encontrado: ' + id);
      const target = clampVec(position);
            return this._tween(rec.mesh.position, target, duration, () => { rec.position = target; if (rec.animationBase) rec.animationBase.position = target.slice(); });

    },
    rotateObject(id, rotation, duration) {
      const rec = state.objects.get(id); if (!rec) throw new Error('Objeto no encontrado: ' + id);
            const target = (rotation||[0,0,0]).map(n => clamp(Number(n), -Math.PI*4, Math.PI*4));
      return this._tween(rec.mesh.rotation, target, duration, () => { rec.rotation = target; if (rec.animationBase) rec.animationBase.rotation = target.slice(); });

    },
    scaleObject(id, scaleArr, duration) {
      const rec = state.objects.get(id); if (!rec) throw new Error('Objeto no encontrado: ' + id);
            const target = (scaleArr||[1,1,1]).map(n => clamp(Number(n), 0.1, 5));
      return this._tween(rec.mesh.scale, target, duration, () => { rec.scale = target; if (rec.animationBase) rec.animationBase.scale = target.slice(); });

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
        setAnimation(id, patch = {}) {
      const rec = state.objects.get(id); if (!rec) throw new Error('Objeto no encontrado: ' + id);
      this.updateObject(id, { animation: patch.animation || rec.animation, animationSpeed: patch.animationSpeed ?? rec.animationSpeed, animationPlaying: patch.animationPlaying ?? rec.animationPlaying });
      return { animation: rec.animation, animationSpeed: rec.animationSpeed, animationPlaying: rec.animationPlaying };
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
      if (safeColor(color)) { rec.color = color; rec.parts = Array.isArray(rec.parts) ? rec.parts.map(partData => ({ ...partData, color })) : rec.parts; }
      renderSceneStats(); return true;
    },
    getObject(id) { return state.objects.get(id) || null; },
    duplicateObject(id) {
      const rec = state.objects.get(id); if (!rec) throw new Error('Objeto no encontrado: ' + id);
      const copy = JSON.parse(JSON.stringify(this.serialize().find(o => o.id === id)));
      copy.id = genId();
      copy.name = `${rec.name || 'Objeto'} copia`;
      copy.position = [rec.mesh.position.x + 0.9, rec.mesh.position.y, rec.mesh.position.z + 0.9];
      const newId = this.addObject(copy);
      logAction(`Objeto duplicado: ${rec.name || id}`);
      return newId;
    },
    clear() { state.objects.forEach(rec => scene.remove(rec.mesh)); state.objects.clear(); clearConnections(); state.selectedObjectId = null; renderSceneStats(); },

    inspect() {
      return { objectCount: state.objects.size, objects: Array.from(state.objects.values())
        .map(o => ({ id: o.id, name: o.name, type: o.type, position: o.position, color: o.color })) };
    },
    serialize() {
            return Array.from(state.objects.values()).map(o => ({
        id: o.id, name: o.name, type: o.type, parts: (o.type === 'catalog_lowpoly' && o.catalogId) ? null : o.parts, text: o.text,
        position: o.animationBase?.position?.slice?.() || [o.mesh.position.x, o.mesh.position.y, o.mesh.position.z],
        rotation: o.animationBase?.rotation?.slice?.() || [o.mesh.rotation.x, o.mesh.rotation.y, o.mesh.rotation.z],
        scale: o.animationBase?.scale?.slice?.() || [o.mesh.scale.x, o.mesh.scale.y, o.mesh.scale.z], color: o.color,
        catalogId: o.catalogId, catalogCategory: o.catalogCategory, catalogDescription: o.catalogDescription,
        portalTargetDimension: o.portalTargetDimension || null,
        animation: o.animation, animationSpeed: o.animationSpeed, animationPlaying: o.animationPlaying,
      }));

    },
    hydrate(list) { const savedConnections = state.connections.slice(); this.clear(); state.connections = savedConnections; (list || []).slice(0, MAX_OBJECTS).forEach(o => this.addObject(o)); renderConnectionLines(); },
  };

    // ============================================================
  //  MODO EDITOR — edición directa de la escena
  // ============================================================
  function findObjectIdFromHit(hit) {
    let node = hit?.object || null;
    while (node) {
      if (node.userData && node.userData.sbxObjectId) return node.userData.sbxObjectId;
      node = node.parent;
    }
    return null;
  }

  function setObjectHighlight(rec, active) {
    if (!rec?.mesh) return;
    rec.mesh.traverse(child => {
      if (!child.isMesh || !child.material || Array.isArray(child.material)) return;
      if (active) {
        if (!child.userData.editorSavedEmissive) {
          child.userData.editorSavedEmissive = { hex: child.material.emissive?.getHex?.() || 0, intensity: child.material.emissiveIntensity || 0 };
        }
        if (child.material.emissive) child.material.emissive.set(0x55ff99);
        child.material.emissiveIntensity = 0.9;
      } else if (child.userData.editorSavedEmissive) {
        const saved = child.userData.editorSavedEmissive;
        if (child.material.emissive) child.material.emissive.setHex(saved.hex);
        child.material.emissiveIntensity = saved.intensity;
        delete child.userData.editorSavedEmissive;
      }
    });
  }

  function editorInputValue(id, fallback) {
    const el = $(id); const value = Number(el?.value);
    return Number.isFinite(value) ? value : fallback;
  }

  let catalogQuery = '';
  let catalogCategory = 'all';

  function catalogItemsForView() {
    const catalog = window.CutRealCatalog;
    if (!catalog?.items) return [];
    const query = String(catalogQuery || '').trim().toLowerCase();
    return catalog.items.filter(item => {
      const matchesCategory = catalogCategory === 'all' || item.category === catalogCategory;
      const haystack = [item.name, item.description, item.category, ...(item.tags || [])].join(' ').toLowerCase();
      return matchesCategory && (!query || haystack.includes(query));
    });
  }

  function renderCatalog() {
    const grid = $('sandbox-catalog-grid');
    const catalog = window.CutRealCatalog;
    if (!grid || !catalog) return;
    const items = catalogItemsForView();
    const count = $('sandbox-catalog-count'); if (count) count.textContent = catalog.count || catalog.items.length;
    if (!items.length) {
      grid.innerHTML = '<div class="sbx-catalog-empty">No hay assets con ese filtro. Probá otra búsqueda.</div>'; return;
    }
    grid.innerHTML = items.map(item => `
      <article class="sbx-catalog-card" data-catalog-id="${escapeHtml(item.id)}">
        <div class="sbx-catalog-thumb"><canvas data-catalog-preview="${escapeHtml(item.id)}" aria-label="Mini vista de ${escapeHtml(item.name)}"></canvas><span class="sbx-catalog-kind">${escapeHtml(item.category)}</span></div>
        <div class="sbx-catalog-card-body"><h3>${escapeHtml(item.name)}</h3><p>${escapeHtml(item.description)}</p><div class="sbx-catalog-card-foot"><span class="sbx-catalog-motion">◌ ${escapeHtml(item.animation)}</span><button class="sbx-place-btn" data-catalog-place="${escapeHtml(item.id)}">+ Colocar</button></div></div>
      </article>`).join('');
    grid.querySelectorAll('[data-catalog-preview]').forEach(canvas => catalog.renderThumbnail(canvas, canvas.dataset.catalogPreview));
  }

  function openCatalogPanel() {
    const panel = $('sandbox-catalog-panel'); if (!panel) return;
    panel.hidden = false; renderCatalog(); switchMobileTab('catalog');
  }
  function closeCatalogPanel() {
    const panel = $('sandbox-catalog-panel'); if (panel) panel.hidden = true;
    switchMobileTab('scene');
  }
  function placeCatalogModel(catalogId) {
    if (!sandboxId) { showToastSafe('Creá o abrí un Sandbox antes de colocar un modelo.', '#ff8844'); return null; }
    const catalog = window.CutRealCatalog; const meta = catalog?.instantiate(catalogId, { color: state.catalogTint });
    if (!meta) return null;
    recordUndoSnapshot();
    meta.position = suggestedScenePosition();
    const id = SceneManager.addObject(meta);
      if (typeof Editor !== 'undefined') Editor.select(id); else { state.selectedObjectId = id; renderEditorUI(); }
    logAction(`Catálogo: colocado ${meta.name}`); scheduleSave();
    const rec = SceneManager.getObject(id); if (rec) setObjectHighlight(rec, true);
    return id;
  }

  function renderAnimationUI() {
    const rec = state.selectedObjectId ? SceneManager.getObject(state.selectedObjectId) : null;
    const supported = !!rec && rec.type === 'catalog_lowpoly';
    const label = $('sandbox-animation-selected'); if (label) label.textContent = supported ? `${rec.name} · ${rec.animation || 'idle'}` : 'Seleccioná un modelo del catálogo para animarlo';
    const select = $('sandbox-animation-select'); if (select) { select.disabled = !supported; if (supported) select.value = rec.animation || 'idle'; }
    const speed = $('sandbox-animation-speed'); const output = $('sandbox-animation-speed-value');
    if (speed) { speed.disabled = !supported; if (supported) speed.value = rec.animationSpeed || 1; }
    if (output) output.textContent = `${Number(speed?.value || 1).toFixed(2)}×`;
    const toggle = $('sandbox-animation-toggle'); if (toggle) { toggle.disabled = !supported; toggle.textContent = supported && rec.animationPlaying ? '⏸ Pausar' : '▶ Reproducir'; }
    const save = $('sandbox-animation-save'); if (save) save.disabled = !supported;
  }

    function renderFutureUI() {
    renderDimensionsUI();
    const stats = $('sandbox-scene-stats');
    if (stats) renderSceneStats();
    const chatBtn = $('sandbox-chat-toggle'); if (chatBtn) chatBtn.textContent = state.chatVisible ? '◧ Ocultar chat' : '◨ Mostrar chat';
    ['hero','top','orbit'].forEach(preset => $('sandbox-camera-' + preset)?.classList.toggle('active', state.cameraPreset === preset));
    $('sandbox-grid-toggle')?.classList.toggle('active', state.gridVisible);
    $('sandbox-wire-toggle')?.classList.toggle('active', state.wireframe);
    $('sandbox-neon-toggle')?.classList.toggle('active', state.neonEnabled);
    $('sandbox-performance-toggle')?.classList.toggle('active', state.ecoMode);
    const environment = $('sandbox-environment-select'); if (environment) environment.value = state.environment;
    const quality = $('sandbox-quality-select'); if (quality) quality.value = state.quality;
    const physics = $('sandbox-physics-toggle'); if (physics) physics.checked = state.physicsEnabled;
    const gravity = $('sandbox-gravity-toggle'); if (gravity) gravity.checked = state.gravityEnabled;
    const time = $('sandbox-time-scale'); if (time) time.value = state.timeScale;
    const timeValue = $('sandbox-time-scale-value'); if (timeValue) timeValue.textContent = `${Number(state.timeScale).toFixed(1)}×`;
    const pattern = $('sandbox-clone-pattern'); if (pattern) pattern.value = state.clonePattern;
    const worldPreset = $('sandbox-world-preset'); if (worldPreset) worldPreset.value = state.worldPreset;
    const climate = $('sandbox-climate-select'); if (climate) climate.value = state.climate;
    const hour = $('sandbox-world-hour'); if (hour) hour.value = state.worldHour;
    const hourValue = $('sandbox-world-hour-value'); if (hourValue) hourValue.textContent = `${String(Math.floor(state.worldHour)).padStart(2,'0')}:00`;
    const snap = $('sandbox-snap-toggle'); if (snap) snap.checked = state.snapEnabled;
    const link = $('sandbox-link-toggle'); if (link) { link.classList.toggle('active', state.linkMode); link.textContent = state.linkMode ? 'Elegí dos objetos…' : 'Enlazar objetos'; }
    const record = $('sandbox-camera-record'); if (record) { record.classList.toggle('active', state.cameraRecording); record.textContent = state.cameraRecording ? '■ Stop' : '● Rec'; }
    const play = $('sandbox-camera-play'); if (play) { play.classList.toggle('active', state.cameraPlaying); play.textContent = state.cameraPlaying ? '■ Stop' : '▶ Path'; }
    const undo = $('sandbox-undo-btn'); if (undo) undo.disabled = !state.undoStack.length;
    const redo = $('sandbox-redo-btn'); if (redo) redo.disabled = !state.redoStack.length;
  }

  function applyAnimationControls() {
    const rec = state.selectedObjectId ? SceneManager.getObject(state.selectedObjectId) : null;
    if (!rec || rec.type !== 'catalog_lowpoly') return;
    SceneManager.setAnimation(rec.id, { animation: $('sandbox-animation-select')?.value || rec.animation, animationSpeed: Number($('sandbox-animation-speed')?.value || 1) });
    logAction(`Animación actualizada: ${rec.name}`); scheduleSave(); renderAnimationUI();
  }

  function toggleSelectedAnimation() {
    const rec = state.selectedObjectId ? SceneManager.getObject(state.selectedObjectId) : null;
    if (!rec || rec.type !== 'catalog_lowpoly') return;
    SceneManager.setAnimation(rec.id, { animationPlaying: !rec.animationPlaying });
    if (!rec.animationPlaying) resetAnimationTransforms(rec);
    scheduleSave(); renderAnimationUI();
  }

  function renderEditorUI() {
    const button = $('sandbox-editor-btn');
    const toolbar = $('sandbox-editor-toolbar');
    const selectedLabel = $('sandbox-editor-selected');
    const rec = state.selectedObjectId ? SceneManager.getObject(state.selectedObjectId) : null;
    if (button) {
      button.classList.toggle('active', !!state.editorMode);
      button.textContent = state.editorMode ? '✎ Editor activo' : '✎ Modo Editor';
    }
    if (toolbar) toolbar.hidden = !state.editorMode;
    if (selectedLabel) selectedLabel.textContent = rec ? `Seleccionado: ${rec.name}` : 'Seleccioná un objeto';
    const fields = {
      'sandbox-editor-x': rec?.mesh.position.x ?? 0,
      'sandbox-editor-y': rec?.mesh.position.y ?? 0,
      'sandbox-editor-z': rec?.mesh.position.z ?? 0,
      'sandbox-editor-rx': rec ? THREE.MathUtils.radToDeg(rec.mesh.rotation.x) : 0,
      'sandbox-editor-ry': rec ? THREE.MathUtils.radToDeg(rec.mesh.rotation.y) : 0,
      'sandbox-editor-rz': rec ? THREE.MathUtils.radToDeg(rec.mesh.rotation.z) : 0,
      'sandbox-editor-scale': rec?.mesh.scale.x ?? 1,
      'sandbox-editor-color': rec?.color || '#33ff77',
    };
    Object.entries(fields).forEach(([id, value]) => { const el = $(id); if (el && document.activeElement !== el) el.value = value; });
    ['sandbox-editor-apply','sandbox-editor-duplicate','sandbox-editor-delete','sandbox-editor-focus'].forEach(id => { const el=$(id); if(el) el.disabled=!rec; });
    renderAnimationUI();
  }

  const Editor = {
    toggle() {
      state.editorMode = !state.editorMode;
      if (!state.editorMode) {
        editorDrag = null;
        if (controls) controls.enabled = true;
        this.select(null);
      }
      renderEditorUI();
      scheduleSave();
    },
    select(id) {
      if (state.selectedObjectId) setObjectHighlight(SceneManager.getObject(state.selectedObjectId), false);
      state.selectedObjectId = id && SceneManager.getObject(id) ? id : null;
      if (state.linkMode && state.selectedObjectId) {
        if (!state.linkSourceId) { state.linkSourceId = state.selectedObjectId; showToastSafe('Origen seleccionado. Elegí el segundo objeto.', '#55eaca'); }
        else if (state.linkSourceId !== state.selectedObjectId) { createConnection(state.linkSourceId, state.selectedObjectId, $('sandbox-link-type')?.value || 'data'); state.linkMode = false; state.linkSourceId = null; const linkButton = $('sandbox-link-toggle'); if (linkButton) { linkButton.classList.remove('active'); linkButton.textContent = 'Enlazar objetos'; } }
      }
    if (state.selectedObjectId) setObjectHighlight(SceneManager.getObject(state.selectedObjectId), true);
    renderConnectionLines(); renderEditorUI();
    },
    applyFields() {
      const rec = state.selectedObjectId ? SceneManager.getObject(state.selectedObjectId) : null;
      if (!rec) return;
      recordUndoSnapshot();
      const position = ['sandbox-editor-x','sandbox-editor-y','sandbox-editor-z'].map((id, i) => editorInputValue(id, rec.mesh.position.toArray()[i]));
      const rotation = ['sandbox-editor-rx','sandbox-editor-ry','sandbox-editor-rz'].map((id, i) => THREE.MathUtils.degToRad(editorInputValue(id, 0)));
      const s = clamp(editorInputValue('sandbox-editor-scale', 1), 0.1, 5);
      SceneManager.updateObject(rec.id, { position, rotation, scale: [s,s,s] });
      const color = $('sandbox-editor-color')?.value;
      if (safeColor(color)) SceneManager.changeAppearance(rec.id, { color });
      logAction(`Editor: actualizado ${rec.name}`);
      renderEditorUI(); scheduleSave();
    },
    duplicate() {
      if (!state.selectedObjectId) return;
      recordUndoSnapshot();
      const id = SceneManager.duplicateObject(state.selectedObjectId);
      this.select(id); scheduleSave();
    },
    remove() {
      const rec = state.selectedObjectId ? SceneManager.getObject(state.selectedObjectId) : null;
      if (!rec) return;
      recordUndoSnapshot();
      SceneManager.deleteObject(rec.id); state.selectedObjectId = null;
      logAction(`Editor: eliminado ${rec.name}`); renderEditorUI(); scheduleSave();
    },
    focus() {
      const rec = state.selectedObjectId ? SceneManager.getObject(state.selectedObjectId) : null;
      if (!rec || !camera || !controls) return;
      const target = rec.mesh.position.clone();
      controls.target.copy(target); camera.position.copy(target.clone().add(new THREE.Vector3(5,4,5))); controls.update();
    },
  };

  function bindEditorCanvas(canvas) {
    if (!canvas || canvas.dataset.editorBound) return;
    canvas.dataset.editorBound = '1';
    canvas.addEventListener('pointerdown', event => {
      if ((!state.editorMode && !state.linkMode) || !raycaster || !camera) return;
      const rect = canvas.getBoundingClientRect();
      const pointer = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      const roots = Array.from(state.objects.values()).map(o => o.mesh);
      const hit = raycaster.intersectObjects(roots, true)[0];
      const id = findObjectIdFromHit(hit);
      if (!id) { Editor.select(null); return; }
      Editor.select(id);
      recordUndoSnapshot();
      editorDrag = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, origin: SceneManager.getObject(id).mesh.position.clone(), moved: false };
      controls.enabled = false;
      canvas.setPointerCapture?.(event.pointerId);
    });
    canvas.addEventListener('pointermove', event => {
      if (!editorDrag || editorDrag.pointerId !== event.pointerId) return;
      const rec = SceneManager.getObject(state.selectedObjectId); if (!rec) return;
      const dx = (event.clientX - editorDrag.startX) / 42;
      const dz = (event.clientY - editorDrag.startY) / 42;
      const next = [editorDrag.origin.x + dx, editorDrag.origin.y, editorDrag.origin.z + dz];
      let p = clampVec(next);
      if (state.snapEnabled) p = p.map(value => Math.round(value / state.snapSize) * state.snapSize);
      rec.mesh.position.set(p[0],p[1],p[2]); rec.position = p; editorDrag.moved = true; renderConnectionLines();
      renderEditorUI();
    });
    const finishDrag = event => {
      if (!editorDrag || editorDrag.pointerId !== event.pointerId) return;
      controls.enabled = true; canvas.releasePointerCapture?.(event.pointerId);
      if (editorDrag.moved) { const moved = SceneManager.getObject(state.selectedObjectId); if (moved?.animationBase) moved.animationBase.position = moved.mesh.position.toArray(); logAction(`Editor: movido ${state.selectedObjectId}`); scheduleSave(); }
      editorDrag = null;
    };
    canvas.addEventListener('pointerup', finishDrag);
    canvas.addEventListener('pointercancel', finishDrag);
  }

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
    create_lowpoly_object: ({ name, semanticType, meshes, position, color }) => {
      const parts = validateGeneratedLowPolyMeshes(meshes, color);
      const id = SceneManager.addObject({ name: sanitizeText(name, 40), type: 'lowpoly_mesh', parts, position });
      logAction(`Creada malla low-poly generada por IA: ${sanitizeText(name,40)}`);
      return { ok: true, id, semanticType: semanticType || 'custom', vertices: parts.reduce((n, p) => n + (Array.isArray(p.vertices) ? p.vertices.length : 0), 0), parts: parts.length };
    },
    update_lowpoly_object: ({ id, semanticType, meshes, position, color }) => {
      const rec = SceneManager.getObject(id);
      if (!rec) throw new Error(`No existe el objeto low-poly ${id}.`);
      const parts = validateGeneratedLowPolyMeshes(meshes, color || rec?.color);
      SceneManager.updateObject(id, { parts, position });
      logAction(`Malla low-poly generada por IA modificada: ${id}`);
      return { ok: true, id, semanticType: semanticType || 'custom', parts: parts.length };
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
    clear_scene: () => { recordUndoSnapshot(); SceneManager.clear(); renderEditorUI(); logAction('Escena vaciada'); scheduleSave(); return { ok: true }; },
    set_agent_state: ({ state: label, color }) => {
      state.agentState = { label: sanitizeText(label, 24), color: safeColor(color) || state.agentState.color };
      renderAgentStateHUD(); return { ok: true };
    },
    create_dimension: ({ name, preset }) => { const id = createDimension(preset || 'earth', sanitizeText(name, 40)); if (!id) throw new Error('No se pudo crear la dimensión.'); return { ok: true, id }; },
    duplicate_dimension: () => { const id = duplicateDimension(); if (!id) throw new Error('No se pudo duplicar la dimensión.'); return { ok: true, id }; },
    rename_dimension: ({ name }) => { if (!renameDimension(name)) throw new Error('El nombre de dimensión no es válido.'); return { ok: true, name: activeDimension()?.name }; },
    delete_dimension: ({ id, confirmed }) => { if (confirmed !== true) throw new Error('CONFIRM DESTRUCTIVE ACTION: la eliminación requiere confirmación explícita del usuario.'); if (id && id !== state.activeDimensionId) throw new Error('La eliminación de otra dimensión debe seleccionarse primero en la consola.'); return deleteDimension().then?.(ok => ({ ok })) || { ok: false, pending: true }; },
    set_dimension_preset: ({ preset }) => { if (!DIMENSION_PRESETS[preset]) throw new Error('Preset dimensional no permitido.'); applyDimensionPreset(preset); return { ok: true, preset }; },
    set_environment: ({ environment }) => { if (!ENVIRONMENT_PRESETS[environment]) throw new Error('Ambiente no permitido.'); applyEnvironment(environment); return { ok: true, environment }; },
    set_climate: ({ climate }) => { if (!CLIMATE_PRESETS[climate]) throw new Error('Clima no permitido.'); applyClimate(climate); return { ok: true, climate }; },
    set_world_time: ({ hour }) => { applyWorldHour(hour); return { ok: true, hour: state.worldHour }; },
    set_gravity: ({ enabled }) => { state.gravityEnabled = !!enabled; applySceneVisualState(); logAction(`Gravedad: ${state.gravityEnabled ? 'ON' : 'OFF'}`); scheduleSave(); return { ok: true, enabled: state.gravityEnabled }; },
    create_portal: ({ targetDimensionId, position }) => { const id = createPortalForTarget(targetDimensionId, position); if (!id) throw new Error('No se pudo crear el portal o el destino no existe.'); return { ok: true, id, targetDimensionId }; },
    connect_portal: ({ portalId, targetDimensionId }) => { const ok = connectSelectedPortal(portalId, targetDimensionId); if (!ok) throw new Error('El portal o destino no es válido.'); return { ok: true, portalId, targetDimensionId }; },
    enter_portal: ({ portalId }) => enterSelectedPortal(portalId).then?.(ok => ({ ok })) || { ok: false },
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

  function renderUsageHUD() {
    const el = $('sandbox-openrouter-usage'); if (!el) return;
    const u = state.apiUsage || {};
    const cost = Number(u.reportedCost || 0);
    const model = u.last?.model ? ` · ${u.last.model}` : '';
    const provider = u.last?.provider || 'Gemini';
    el.textContent = `${provider} · ${Number(u.totalTokens || 0)} tokens · $${cost.toFixed(6)}${model}`;
    el.title = u.last?.generationId ? `Generation: ${u.last.generationId}` : 'Uso de la API exclusiva del Sandbox';
  }

  function recordModelUsage(decision) {
    const usage = decision?.usage || {};
    const promptTokens = Number(usage.prompt_tokens || usage.input_tokens || 0);
    const completionTokens = Number(usage.completion_tokens || usage.output_tokens || 0);
    const totalTokens = Number(usage.total_tokens || promptTokens + completionTokens);
    const rawCost = decision?.cost ?? usage.cost ?? usage.cost_details?.upstream_inference_cost;
    const reportedCost = rawCost == null || rawCost === '' ? null : Number(rawCost);
    state.apiUsage.requests += 1;
    state.apiUsage.promptTokens += promptTokens;
    state.apiUsage.completionTokens += completionTokens;
    state.apiUsage.totalTokens += totalTokens;
    if (Number.isFinite(reportedCost)) state.apiUsage.reportedCost += reportedCost;
    state.apiUsage.last = {
      at: Date.now(), model: decision?.model || 'desconocido', provider: decision?.provider || 'Gemini',
      generationId: decision?.generationId || null, promptTokens, completionTokens, totalTokens,
      reportedCost: Number.isFinite(reportedCost) ? reportedCost : null,
    };
    const costText = Number.isFinite(reportedCost) ? `$${reportedCost.toFixed(6)}` : 'no informado';
    renderUsageHUD();
    logAction(`${state.apiUsage.last.provider} | ${state.apiUsage.last.model} | ${totalTokens} tokens | costo reportado: ${costText}`);
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
      dimensions: state.dimensions.slice(0, MAX_DIMENSIONS).map(item => ({ id: item.id, name: item.name, active: item.id === state.activeDimensionId, environment: item.environment, gravityEnabled: item.gravityEnabled, objects: item.scene?.length || 0 })),
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

    // 423 / 403 siempre son bloqueos administrativos. Un 503 solo es
    // bloqueo si trae el código administrativo MAINTENANCE; un 503 sin ese
    // código debe conservar el detalle del proveedor para poder diagnosticar
    // una indisponibilidad transitoria de Gemini.
    const administrative503Codes = new Set(['MAINTENANCE']);
    const isAdministrativeBlock = res.status === 423
      || res.status === 403
      || (res.status === 503 && administrative503Codes.has(data && data.code));
    if (isAdministrativeBlock) {
      const err = new Error((data && data.error) || 'El Sandbox no está disponible ahora mismo.');
      err.blocked = true;
      err.code = (data && data.code) || 'BLOCKED';
      throw err;
    }

    // 429 → límite de Gemini o límite global del admin.
    // Conservamos el Retry-After enviado por el servidor para no
    // reintentar cada 20 segundos cuando el límite es más largo.
    if (res.status === 429) {
      const err = new Error((data && (data.message || data.error)) || 'Gemini está limitando temporalmente el Sandbox.');
      err.rateLimited = true;
      err.retryAfterMs = Number(data && data.retryAfterMs) || RATE_LIMIT_RETRY_MS;
      err.code = (data && data.code) || 'RATE_LIMITED';
      throw err;
    }

    if (!res.ok) {
      const baseMessage = (data && data.error) || ('El agente no respondió (HTTP ' + res.status + ')');
      const detail = data && data.detail ? ` — ${data.detail}` : '';
      const code = data && data.code ? ` [${data.code}]` : '';
      const build = data && data.build ? ` {build ${data.build}}` : '';
      throw new Error(`${baseMessage}${detail}${code}${build}`);
    }

    return data;
  }

  async function runOneStep(userText) {
    if (agentRequestInFlight) {
      if (userText) showToastSafe('El agente ya está procesando una solicitud.', '#ffaa33');
      return;
    }
    agentRequestInFlight = true;
    try {
      return await runOneStepInternal(userText);
    } finally {
      agentRequestInFlight = false;
    }
  }

  async function runOneStepInternal(userText) {
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
      // Límite de consumo: una consulta manual debe terminar en error
      // visible; solo la autonomía se programa para reintentar.
      if (e.rateLimited) {
        const retryMs = Math.max(3000, Number(e.retryAfterMs) || RATE_LIMIT_RETRY_MS);
        const retrySeconds = Math.ceil(retryMs / 1000);
        const message = `${e.message} Reintento recomendado en ${retrySeconds}s.`;
        logAction('⚡ ' + message);
        if (userText) {
          setStatus('error');
          showToastSafe(message, '#ffaa33');
        } else {
          setStatus('waiting');
          if (state.autonomyEnabled && !state.paused) scheduleNextTick(retryMs);
        }
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
    if (decision && (decision.model || decision.usage || decision.generationId)) recordModelUsage(decision);
    if (decision?.build && state.lastSandboxBuild !== decision.build) {
      state.lastSandboxBuild = decision.build;
      logAction(`Backend Sandbox activo: ${decision.build}`);
    }

    // El servidor puede "saltear" este paso sin haber llamado a Gemini:
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
    const toolCalls = (decision.toolCalls || []).slice(0, 4);
    if (toolCalls.length) {
      logAction(`Tools recibidas: ${toolCalls.map(call => call.name || 'desconocida').join(', ')}`);
    } else if (userText && !decision.assistantText) {
      logAction('⚠️ El modelo respondió sin texto ni tools; se reintentará con la tool visual forzada si corresponde.');
    }
    for (const call of toolCalls) {
      const toolEl = $('sandbox-current-tool');
      if (toolEl) toolEl.textContent = '⚙ ' + call.name;
      try { await executeTool(call.name, call.args); }
      catch (e) { logAction(`⚠️ Herramienta "${call.name}" falló: ${e.message}`); }
    }
    const toolEl = $('sandbox-current-tool'); if (toolEl) toolEl.textContent = '';

    if (decision.cyclesUsed != null && decision.cyclesMax != null) {
      updateCyclesHUD(decision.cyclesUsed, decision.cyclesMax);
    }
    scheduleSave();
    if (userText) setStatus('idle');
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

  function renderSaveState(status, detail = '') {
    state.saveState = status;
    const el = $('sandbox-save-state'); if (!el) return;
    const labels = { idle: 'Sin cambios', saving: 'Guardando…', saved: 'Guardado', error: 'Error al guardar' };
    el.textContent = detail || labels[status] || status;
    el.className = `sbx-save-state sbx-save-${status}`;
    if (status === 'error') el.title = detail || 'La última escritura falló; se reintentará.';
  }

  function buildPersistencePayload() {
    return {
      updatedAt: Date.now(),
      messages: state.messages.slice(-120),
      memory: state.memory,
      actionLog: state.actionLog.slice(-80).map(a => a.text + '|' + a.ts),
      scene: SceneManager.serialize(),
      snapshots: state.snapshots.slice(0, MAX_FIRESTORE_SNAPSHOTS),
      environment: state.environment,
      quality: state.quality,
      physicsEnabled: state.physicsEnabled,
      gravityEnabled: state.gravityEnabled,
      worldPaused: state.worldPaused,
      timeScale: state.timeScale,
      snapEnabled: state.snapEnabled,
      snapSize: state.snapSize,
      clonePattern: state.clonePattern,
      connectionType: state.connectionType,
      worldPreset: state.worldPreset,
      connections: state.connections.slice(-80),
      cameraPath: state.cameraPath.slice(-24),
      behaviorPreset: state.behaviorPreset,
      editorMode: state.editorMode,
      selectedObjectId: state.selectedObjectId,
      chatVisible: state.chatVisible,
      gridVisible: state.gridVisible,
      wireframe: state.wireframe,
      neonEnabled: state.neonEnabled,
      ecoMode: state.ecoMode,
      cameraPreset: state.cameraPreset,
      autonomyEnabled: state.autonomyEnabled,
      apiUsage: state.apiUsage,
      activeDimensionId: state.activeDimensionId,
      dimensions: (syncActiveDimension() ? state.dimensions : []).slice(0, MAX_DIMENSIONS),
      climate: state.climate,
      worldHour: state.worldHour,
      sandboxMode: state.sandboxMode,
      player: { position: state.player.position.slice(0, 3), velocityY: Number(state.player.velocityY) || 0, grounded: state.player.grounded !== false },
    };
  }

  function waitMs(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
  const scheduleSave = debounce(() => { void persistSandbox(false); }, SAVE_DEBOUNCE_MS);

  async function persistSandbox(immediate = false) {
    if (!currentUser || !sandboxId || !window.firestore || !window.db) return false;
    if (saveInFlight) {
      saveQueued = true;
      if (immediate) await saveInFlight;
      return false;
    }
    const sequence = ++saveSequence;
    const targetSandboxId = sandboxId;
    renderSaveState('saving');
    const payload = buildPersistencePayload();
    saveInFlight = (async () => {
      let lastError = null;
      for (let attempt = 0; attempt <= SAVE_RETRY_DELAYS.length; attempt++) {
        try {
          const { setDoc } = window.firestore;
          await setDoc(sandboxDoc(targetSandboxId), payload, { merge: true });
          return true;
        } catch (error) {
          lastError = error;
          if (attempt < SAVE_RETRY_DELAYS.length) await waitMs(SAVE_RETRY_DELAYS[attempt]);
        }
      }
      throw lastError || new Error('No se pudo guardar la escena.');
    })();
    try {
      await saveInFlight;
      if (sandboxId === targetSandboxId) renderSaveState('saved', `Guardado · ${new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`);
      return true;
    } catch (error) {
      console.warn('[Sandbox] Error guardando:', error);
      if (sandboxId === targetSandboxId) renderSaveState('error', 'Error al guardar · reintentá');
      return false;
    } finally {
      saveInFlight = null;
      if (saveQueued && sequence === saveSequence) { saveQueued = false; void persistSandbox(true); }
    }
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
        await setDoc(ref, { name, createdAt: Date.now(), updatedAt: Date.now(), messages: [], memory: {}, actionLog: [], scene: [], snapshots: [], environment: 'lab', quality: 'balanced', physicsEnabled: false, gravityEnabled: true, worldPaused: false, timeScale: 1, snapEnabled: false, snapSize: 1, clonePattern: 'line', connectionType: 'data', worldPreset: 'showcase', connections: [], cameraPath: [], behaviorPreset: 'idle', editorMode: false, selectedObjectId: null, chatVisible: true, gridVisible: true, wireframe: false, neonEnabled: true, ecoMode: false, cameraPreset: 'hero', activeDimensionId: 'nexus-001', dimensions: [newDimensionRecord('earth', 'nexus-001')], climate: 'clear', worldHour: 14, sandboxMode: 'editor', player: { position: [0,1.7,5], velocityY: 0, grounded: true }, autonomyEnabled: false, apiUsage: { requests: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0, reportedCost: 0, last: null } });

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
    state.apiUsage = data.apiUsage || { requests: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0, reportedCost: 0, last: null };
    state.snapshots = Array.isArray(data.snapshots) ? data.snapshots.slice(0, MAX_FIRESTORE_SNAPSHOTS) : [];
    state.environment = ENVIRONMENT_PRESETS[data.environment] ? data.environment : 'lab';
    state.quality = QUALITY_PRESETS[data.quality] ? data.quality : 'balanced';
    state.physicsEnabled = data.physicsEnabled === true;
    state.gravityEnabled = data.gravityEnabled !== false;
    state.worldPaused = data.worldPaused === true;
    const storedTimeScale = Number(data.timeScale); state.timeScale = Number.isFinite(storedTimeScale) ? clamp(storedTimeScale, 0, 2) : 1;
    state.snapEnabled = data.snapEnabled === true;
    state.snapSize = clamp(Number(data.snapSize), .1, 4) || 1;
    state.clonePattern = ['line','grid','ring'].includes(data.clonePattern) ? data.clonePattern : 'line';
    state.connectionType = data.connectionType === 'energy' ? 'energy' : 'data';
    state.worldPreset = WORLD_PRESETS[data.worldPreset] ? data.worldPreset : 'showcase';
    state.connections = Array.isArray(data.connections) ? data.connections.slice(-80) : [];
    state.cameraPath = Array.isArray(data.cameraPath) ? data.cameraPath.slice(-24) : [];
    state.behaviorPreset = String(data.behaviorPreset || 'idle').slice(0, 24);
    state.editorMode = data.editorMode === true;
    state.chatVisible = data.chatVisible !== false;
    state.gridVisible = data.gridVisible !== false;
    state.wireframe = data.wireframe === true;
    state.neonEnabled = data.neonEnabled !== false;
    state.ecoMode = data.ecoMode === true;
    state.cameraPreset = data.cameraPreset || 'hero';
    state.undoStack = []; state.redoStack = [];
    state.selectedObjectId = null;
    ensureDimensions(data);
    renderSaveState('saved', 'Sincronizado');
    renderUsageHUD();
        state.autonomyEnabled = false;
    setSandboxMode(state.sandboxMode, false);

    const chatEl = $('sandbox-chat'); if (chatEl) chatEl.innerHTML = '';
    state.messages.forEach(m => renderMessage(m.role, m.text));
    const logEl = $('sandbox-action-log'); if (logEl) { logEl.innerHTML = ''; state.actionLog.forEach(a => {
      const line = document.createElement('div'); line.className = 'sbx-log-line';
      line.textContent = `[${new Date(a.ts).toLocaleTimeString('es-AR')}] ${a.text}`; logEl.appendChild(line);
    }); }

        // ensureDimensions ya hidrató la dimensión activa; no se vuelve a cargar data.scene encima.
    state.selectedObjectId = data.selectedObjectId && SceneManager.getObject(data.selectedObjectId) ? data.selectedObjectId : null;
    if (state.selectedObjectId) setObjectHighlight(SceneManager.getObject(state.selectedObjectId), true);
    if (camera && controls) setCameraPreset(state.cameraPreset);
    setChatVisible(state.chatVisible, false);
    applySceneVisualState(); renderSceneStats();
    setStatus('idle'); updateAutonomyUI(); renderAgentStateHUD(); renderEditorUI(); renderSandboxList(); renderFutureUI();

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
    setChatVisible(state.chatVisible, false); applySceneVisualState(); renderDimensionsUI(); renderFutureUI();
  }
  async function closeSandboxPanel() {
    pauseAutonomy();
    await persistSandbox(true);
    const overlay = $('sandbox-overlay'); if (overlay) overlay.style.display = 'none';
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
    document.querySelectorAll('[data-sandbox-mode]').forEach(button => button.addEventListener('click', () => setSandboxMode(button.dataset.sandboxMode)));
    window.addEventListener('keydown', event => { if (['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)) return; if (['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.code)) { navigationKeys.add(event.code); event.preventDefault(); } if (event.code === 'Space' && ['player','drone'].includes(state.sandboxMode)) { playerJumpQueued = true; event.preventDefault(); } });
    window.addEventListener('keyup', event => navigationKeys.delete(event.code));
    const joystick = $('sandbox-mobile-joystick');
    if (joystick) { const updateJoystick = event => { const rect = joystick.getBoundingClientRect(); const x = event.clientX - (rect.left + rect.width / 2), y = event.clientY - (rect.top + rect.height / 2); const angle = Math.atan2(y, x); const threshold = rect.width * .16; navigationKeys.delete('KeyW'); navigationKeys.delete('KeyA'); navigationKeys.delete('KeyS'); navigationKeys.delete('KeyD'); if (Math.hypot(x,y) > threshold) { if (Math.abs(x) > Math.abs(y)) navigationKeys.add(x > 0 ? 'KeyD' : 'KeyA'); else navigationKeys.add(y > 0 ? 'KeyS' : 'KeyW'); } }; const clearJoystick = () => { ['KeyW','KeyA','KeyS','KeyD'].forEach(key => navigationKeys.delete(key)); }; joystick.addEventListener('pointerdown', event => { joystick.setPointerCapture?.(event.pointerId); updateJoystick(event); }); joystick.addEventListener('pointermove', event => { if (joystick.hasPointerCapture?.(event.pointerId)) updateJoystick(event); }); joystick.addEventListener('pointerup', clearJoystick); joystick.addEventListener('pointercancel', clearJoystick); }
    $('sandbox-autonomy-toggle')?.addEventListener('click', () => state.autonomyEnabled ? stopAutonomy('Desactivado por el usuario') : startAutonomy());
    $('sandbox-pause-btn')?.addEventListener('click', () => state.paused ? resumeAutonomy() : pauseAutonomy());
        $('sandbox-step-btn')?.addEventListener('click', stepOnce);
    $('sandbox-editor-btn')?.addEventListener('click', () => Editor.toggle());
    $('sandbox-editor-apply')?.addEventListener('click', () => Editor.applyFields());
    $('sandbox-editor-duplicate')?.addEventListener('click', () => Editor.duplicate());
    $('sandbox-editor-delete')?.addEventListener('click', () => Editor.remove());
    $('sandbox-editor-focus')?.addEventListener('click', () => Editor.focus());
    $('sandbox-editor-color')?.addEventListener('input', () => { if (state.editorMode && state.selectedObjectId) Editor.applyFields(); });
    document.addEventListener('keydown', event => {
      if (!state.editorMode || !state.selectedObjectId || ['INPUT','TEXTAREA'].includes(document.activeElement?.tagName)) return;
      if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); Editor.remove(); }
      if (event.key === 'Escape') Editor.select(null);
    });
    renderEditorUI();
    $('sandbox-tab-chat')?.addEventListener('click', () => { setChatVisible(true); switchMobileTab('chat'); });

    $('sandbox-tab-scene')?.addEventListener('click', () => switchMobileTab('scene'));
    $('sandbox-chat-toggle')?.addEventListener('click', () => setChatVisible(!state.chatVisible));
    $('sandbox-camera-hero')?.addEventListener('click', () => setCameraPreset('hero'));
    $('sandbox-camera-top')?.addEventListener('click', () => setCameraPreset('top'));
    $('sandbox-camera-orbit')?.addEventListener('click', () => setCameraPreset('orbit'));
    $('sandbox-camera-record')?.addEventListener('click', toggleCameraRecording);
    $('sandbox-camera-play')?.addEventListener('click', playCameraPath);
    $('sandbox-focus-selected')?.addEventListener('click', () => Editor.focus());
    $('sandbox-grid-toggle')?.addEventListener('click', () => { state.gridVisible = !state.gridVisible; applySceneVisualState(); scheduleSave(); renderFutureUI(); });
    $('sandbox-wire-toggle')?.addEventListener('click', () => { state.wireframe = !state.wireframe; applySceneVisualState(); scheduleSave(); renderFutureUI(); });
    $('sandbox-neon-toggle')?.addEventListener('click', () => { state.neonEnabled = !state.neonEnabled; applySceneVisualState(); scheduleSave(); renderFutureUI(); });
    $('sandbox-performance-toggle')?.addEventListener('click', () => { state.ecoMode = !state.ecoMode; state.quality = state.ecoMode ? 'eco' : 'balanced'; applySceneVisualState(); scheduleSave(); renderFutureUI(); });
    $('sandbox-environment-select')?.addEventListener('change', event => applyEnvironment(event.target.value));
    $('sandbox-climate-select')?.addEventListener('change', event => applyClimate(event.target.value));
    $('sandbox-world-hour')?.addEventListener('input', event => applyWorldHour(event.target.value));
    $('sandbox-quality-select')?.addEventListener('change', event => { state.quality = QUALITY_PRESETS[event.target.value] ? event.target.value : 'balanced'; applyQualitySettings(); renderFutureUI(); });
    $('sandbox-physics-toggle')?.addEventListener('change', event => { state.physicsEnabled = !!event.target.checked; scheduleSave(); logAction(`Física ligera: ${state.physicsEnabled ? 'ON' : 'OFF'}`); renderFutureUI(); });
    $('sandbox-gravity-toggle')?.addEventListener('change', event => { state.gravityEnabled = !!event.target.checked; scheduleSave(); logAction(`Gravedad: ${state.gravityEnabled ? 'ON' : 'OFF'}`); });
    $('sandbox-time-scale')?.addEventListener('input', event => { state.timeScale = clamp(Number(event.target.value), 0, 2); const out = $('sandbox-time-scale-value'); if (out) out.textContent = `${state.timeScale.toFixed(1)}×`; scheduleSave(); });
    $('sandbox-clone-pattern')?.addEventListener('change', event => { state.clonePattern = ['line','grid','ring'].includes(event.target.value) ? event.target.value : 'line'; scheduleSave(); });
    $('sandbox-clone-btn')?.addEventListener('click', cloneSelectedWithPattern);
    $('sandbox-world-preset')?.addEventListener('change', event => { state.worldPreset = event.target.value; scheduleSave(); });
    $('sandbox-world-generate')?.addEventListener('click', generateWorldPreset);
    $('sandbox-link-toggle')?.addEventListener('click', toggleLinkMode);
    $('sandbox-link-type')?.addEventListener('change', event => { state.connectionType = event.target.value === 'energy' ? 'energy' : 'data'; scheduleSave(); });
    $('sandbox-export-btn')?.addEventListener('click', exportSceneJSON);
    $('sandbox-import-btn')?.addEventListener('click', () => $('sandbox-import-input')?.click());
    $('sandbox-import-input')?.addEventListener('change', event => { void importSceneFile(event.target.files?.[0]); event.target.value = ''; });
    $('sandbox-snap-toggle')?.addEventListener('change', event => { state.snapEnabled = !!event.target.checked; scheduleSave(); });
    $('sandbox-undo-btn')?.addEventListener('click', undoScene);
    $('sandbox-redo-btn')?.addEventListener('click', redoScene);
    $('sandbox-screenshot-btn')?.addEventListener('click', takeSceneScreenshot);
    $('sandbox-clear-btn')?.addEventListener('click', clearSceneFromDock);
    $('sandbox-snapshot-btn')?.addEventListener('click', createSceneSnapshot);
    $('sandbox-recover-btn')?.addEventListener('click', recoverLatestSnapshot);
    $('sandbox-scan-btn')?.addEventListener('click', openSceneScanner);
    $('sandbox-dimension-select')?.addEventListener('change', event => { void switchDimension(event.target.value); });
    $('sandbox-dimension-new')?.addEventListener('click', createDimension);
    $('sandbox-dimension-duplicate')?.addEventListener('click', duplicateDimension);
    $('sandbox-dimension-rename')?.addEventListener('click', renameDimension);
    $('sandbox-dimension-delete')?.addEventListener('click', () => { void deleteDimension(); });
    $('sandbox-dimension-apply-preset')?.addEventListener('click', () => applyDimensionPreset($('sandbox-dimension-preset')?.value || 'earth'));
    $('sandbox-portal-create')?.addEventListener('click', createPortalForTarget);
    $('sandbox-portal-connect')?.addEventListener('click', connectSelectedPortal);
    $('sandbox-portal-enter')?.addEventListener('click', () => { void enterSelectedPortal(); });
    $('sandbox-dimension-map')?.addEventListener('click', event => { const node = event.target.closest('[data-dimension-id]'); if (node) void switchDimension(node.dataset.dimensionId); });
    $('sandbox-analysis-close')?.addEventListener('click', () => { const panel = $('sandbox-analysis-panel'); if (panel) panel.hidden = true; });
    $('sandbox-catalog-btn')?.addEventListener('click', openCatalogPanel);
    $('sandbox-catalog-close')?.addEventListener('click', closeCatalogPanel);
    $('sandbox-tab-catalog')?.addEventListener('click', openCatalogPanel);
    $('sandbox-catalog-search')?.addEventListener('input', event => { catalogQuery = event.target.value; renderCatalog(); });
    $('sandbox-catalog-category')?.addEventListener('change', event => { catalogCategory = event.target.value; renderCatalog(); });
    $('sandbox-catalog-color')?.addEventListener('input', event => { if (safeColor(event.target.value)) { state.catalogTint = event.target.value; renderCatalog(); if (state.selectedObjectId) { SceneManager.changeAppearance(state.selectedObjectId, { color: state.catalogTint }); renderEditorUI(); scheduleSave(); } } });
    $('sandbox-catalog-grid')?.addEventListener('click', event => { const button = event.target.closest('[data-catalog-place]'); if (button) placeCatalogModel(button.dataset.catalogPlace); });
    $('sandbox-animation-select')?.addEventListener('change', applyAnimationControls);
    $('sandbox-animation-speed')?.addEventListener('input', event => { const output = $('sandbox-animation-speed-value'); if (output) output.textContent = `${Number(event.target.value).toFixed(2)}×`; applyAnimationControls(); });
    $('sandbox-animation-toggle')?.addEventListener('click', toggleSelectedAnimation);
    $('sandbox-animation-save')?.addEventListener('click', applyAnimationControls);
    setSandboxMode(state.sandboxMode, false); renderCatalog(); renderDimensionsUI(); renderFutureUI();

    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') void persistSandbox(true); });
    window.addEventListener('beforeunload', () => { void persistSandbox(true); });
    window.addEventListener('pagehide', () => { void persistSandbox(true); });
  }
  function switchMobileTab(tab) {
    const overlay = $('sandbox-overlay');
    const catalogPanel = $('sandbox-catalog-panel');
    if (catalogPanel) catalogPanel.hidden = tab !== 'catalog';
    overlay?.classList.toggle('sbx-show-scene', tab === 'scene' || tab === 'catalog');
    overlay?.classList.toggle('sbx-show-catalog', tab === 'catalog');
    $('sandbox-tab-chat')?.classList.toggle('active', tab === 'chat');
    $('sandbox-tab-scene')?.classList.toggle('active', tab === 'scene');
    $('sandbox-tab-catalog')?.classList.toggle('active', tab === 'catalog');
  }

  document.addEventListener('DOMContentLoaded', bindUI);

  // ---------- API PÚBLICA ----------
  window.CutRealSandbox = {
    open: openSandboxById, remove: removeSandbox, onAuthReady,
    registerTool: registerExternalTool,
    bridge: WorkspaceBridge,
    catalog: { list: () => window.CutRealCatalog?.items || [], place: placeCatalogModel, render: renderCatalog, setAnimation: (id, patch) => { const result = SceneManager.setAnimation(id, patch); scheduleSave(); renderAnimationUI(); return result; } },
    persist: () => persistSandbox(true),
    setChatVisible,
    getCurrentSandboxId: () => sandboxId,
    getCurrentUser: () => currentUser,
  };
  window.openSandbox  = openSandboxPanel;
  window.closeSandbox = closeSandboxPanel;

})();
