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
  };

    let scene, camera, renderer, controls, animFrame, threeReady = false;
  let raycaster = null;
  let editorDrag = null;

  let sandboxListCache = [];

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

  function animate() {
    animFrame = requestAnimationFrame(animate);
    if (controls) controls.update();
        if (!state.editorMode) state.objects.forEach(o => { if (o.mesh) o.mesh.rotation.y += 0.0022; });

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

      else (meta.parts || []).slice(0, 12).forEach(p => group.add(buildPartMesh(p)));

      scene.add(group);
      state.objects.set(id, {
                id, name: meta.name || meta.text || id, type: meta.type || 'primitive_group',
        parts: meta.parts || null, text: meta.text || null, position: pos,
        rotation, scale, color: meta.color || null, mesh: group,

      });
      return id;
    },
    updateObject(id, patch) {
      const rec = state.objects.get(id);
      if (!rec) throw new Error('Objeto no encontrado: ' + id);
            if (patch.position) { const p = clampVec(patch.position); rec.mesh.position.set(p[0],p[1],p[2]); rec.position = p; }
      if (Array.isArray(patch.rotation)) { rec.mesh.rotation.set(...patch.rotation.map(n => clamp(Number(n), -Math.PI * 4, Math.PI * 4))); rec.rotation = patch.rotation.slice(0,3); }
      if (Array.isArray(patch.scale)) { const s = patch.scale.map(n => clamp(Number(n), 0.1, 5)); rec.mesh.scale.set(s[0],s[1],s[2]); rec.scale = s; }
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
            const target = (rotation||[0,0,0]).map(n => clamp(Number(n), -Math.PI*4, Math.PI*4));
      return this._tween(rec.mesh.rotation, target, duration, () => { rec.rotation = target; });

    },
    scaleObject(id, scaleArr, duration) {
      const rec = state.objects.get(id); if (!rec) throw new Error('Objeto no encontrado: ' + id);
            const target = (scaleArr||[1,1,1]).map(n => clamp(Number(n), 0.1, 5));
      return this._tween(rec.mesh.scale, target, duration, () => { rec.scale = target; });

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
    clear() { state.objects.forEach(rec => scene.remove(rec.mesh)); state.objects.clear(); },

    inspect() {
      return { objectCount: state.objects.size, objects: Array.from(state.objects.values())
        .map(o => ({ id: o.id, name: o.name, type: o.type, position: o.position, color: o.color })) };
    },
    serialize() {
            return Array.from(state.objects.values()).map(o => ({
        id: o.id, name: o.name, type: o.type, parts: o.parts, text: o.text,
        position: [o.mesh.position.x, o.mesh.position.y, o.mesh.position.z],
        rotation: [o.mesh.rotation.x, o.mesh.rotation.y, o.mesh.rotation.z],
        scale: [o.mesh.scale.x, o.mesh.scale.y, o.mesh.scale.z], color: o.color,
      }));

    },
    hydrate(list) { this.clear(); (list || []).slice(0, MAX_OBJECTS).forEach(o => this.addObject(o)); },
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
      if (state.selectedObjectId) setObjectHighlight(SceneManager.getObject(state.selectedObjectId), true);
      renderEditorUI();
    },
    applyFields() {
      const rec = state.selectedObjectId ? SceneManager.getObject(state.selectedObjectId) : null;
      if (!rec) return;
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
      const id = SceneManager.duplicateObject(state.selectedObjectId);
      this.select(id); scheduleSave();
    },
    remove() {
      const rec = state.selectedObjectId ? SceneManager.getObject(state.selectedObjectId) : null;
      if (!rec) return;
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
      if (!state.editorMode || !raycaster || !camera) return;
      const rect = canvas.getBoundingClientRect();
      const pointer = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      const roots = Array.from(state.objects.values()).map(o => o.mesh);
      const hit = raycaster.intersectObjects(roots, true)[0];
      const id = findObjectIdFromHit(hit);
      if (!id) { Editor.select(null); return; }
      Editor.select(id);
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
      const p = clampVec(next); rec.mesh.position.set(p[0],p[1],p[2]); rec.position = p; editorDrag.moved = true;
      renderEditorUI();
    });
    const finishDrag = event => {
      if (!editorDrag || editorDrag.pointerId !== event.pointerId) return;
      controls.enabled = true; canvas.releasePointerCapture?.(event.pointerId);
      if (editorDrag.moved) { logAction(`Editor: movido ${state.selectedObjectId}`); scheduleSave(); }
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
      try { executeTool(call.name, call.args); }
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
        editorMode: state.editorMode,
        selectedObjectId: state.selectedObjectId,
        autonomyEnabled: state.autonomyEnabled,
        apiUsage: state.apiUsage,
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
        await setDoc(ref, { name, createdAt: Date.now(), updatedAt: Date.now(), messages: [], memory: {}, actionLog: [], scene: [], editorMode: false, selectedObjectId: null, autonomyEnabled: false, apiUsage: { requests: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0, reportedCost: 0, last: null } });

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
    state.editorMode = data.editorMode === true;
    state.selectedObjectId = null;
    renderUsageHUD();
    state.autonomyEnabled = false;

    const chatEl = $('sandbox-chat'); if (chatEl) chatEl.innerHTML = '';
    state.messages.forEach(m => renderMessage(m.role, m.text));
    const logEl = $('sandbox-action-log'); if (logEl) { logEl.innerHTML = ''; state.actionLog.forEach(a => {
      const line = document.createElement('div'); line.className = 'sbx-log-line';
      line.textContent = `[${new Date(a.ts).toLocaleTimeString('es-AR')}] ${a.text}`; logEl.appendChild(line);
    }); }

        SceneManager.hydrate(data.scene || []);
    state.selectedObjectId = data.selectedObjectId && SceneManager.getObject(data.selectedObjectId) ? data.selectedObjectId : null;
    if (state.selectedObjectId) setObjectHighlight(SceneManager.getObject(state.selectedObjectId), true);
    setStatus('idle'); updateAutonomyUI(); renderAgentStateHUD(); renderEditorUI(); renderSandboxList();

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
