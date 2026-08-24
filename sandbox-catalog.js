/* Cut-real AI · SANDBOX CATALOG
 * Biblioteca local de assets low-poly curados.
 * Estos modelos son activos colocables del catálogo; la IA conserva su flujo
 * independiente para generar meshes directas mediante create_lowpoly_object.
 */
(function () {
  'use strict';

  const clamp = (v, a, b) => Math.max(a, Math.min(b, Number.isFinite(v) ? v : a));
  const rotate = (v, r = [0, 0, 0]) => {
    let [x, y, z] = v;
    let [rx, ry, rz] = r.map(Number);
    let c = Math.cos(rx), s = Math.sin(rx); [y, z] = [y * c - z * s, y * s + z * c];
    c = Math.cos(ry); s = Math.sin(ry); [x, z] = [x * c + z * s, -x * s + z * c];
    c = Math.cos(rz); s = Math.sin(rz); [x, y] = [x * c - y * s, x * s + y * c];
    return [x, y, z];
  };
  const flat = (n, fallback) => Number.isFinite(Number(n)) ? Number(n) : fallback;
  const color = value => /^#[0-9a-f]{6}$/i.test(String(value || '')) ? value : '#33ff77';

  function ellipsoid(rx, ry, rz, segments = 6, rings = 3) {
    const vertices = [[0, ry, 0]];
    for (let ring = 1; ring < rings; ring++) {
      const phi = Math.PI * ring / rings;
      for (let i = 0; i < segments; i++) {
        const theta = Math.PI * 2 * i / segments;
        vertices.push([Math.sin(phi) * rx * Math.cos(theta), Math.cos(phi) * ry, Math.sin(phi) * rz * Math.sin(theta)]);
      }
    }
    const bottom = vertices.length;
    vertices.push([0, -ry, 0]);
    const faces = [];
    for (let i = 0; i < segments; i++) faces.push([0, 1 + i, 1 + ((i + 1) % segments)]);
    for (let ring = 0; ring < rings - 2; ring++) {
      const a = 1 + ring * segments, b = a + segments;
      for (let i = 0; i < segments; i++) {
        const n = (i + 1) % segments;
        faces.push([a + i, b + i, a + n], [a + n, b + i, b + n]);
      }
    }
    const last = 1 + (rings - 2) * segments;
    for (let i = 0; i < segments; i++) faces.push([last + i, bottom, last + ((i + 1) % segments)]);
    return { vertices, faces };
  }

  function frustum(rxTop, rzTop, rxBottom, rzBottom, height, segments = 6) {
    const vertices = [];
    for (const [y, rx, rz] of [[height / 2, rxTop, rzTop], [-height / 2, rxBottom, rzBottom]]) {
      for (let i = 0; i < segments; i++) {
        const theta = Math.PI * 2 * i / segments;
        vertices.push([rx * Math.cos(theta), y, rz * Math.sin(theta)]);
      }
    }
    const faces = [Array.from({ length: segments }, (_, i) => segments - 1 - i), Array.from({ length: segments }, (_, i) => segments + i)];
    for (let i = 0; i < segments; i++) {
      const n = (i + 1) % segments;
      faces.push([i, n, segments + i], [n, segments + n, segments + i]);
    }
    return { vertices, faces };
  }

  function box(sx, sy, sz) {
    const x = sx / 2, y = sy / 2, z = sz / 2;
    return { vertices: [[-x,-y,-z],[x,-y,-z],[x,y,-z],[-x,y,-z],[-x,-y,z],[x,-y,z],[x,y,z],[-x,y,z]], faces: [[0,1,2],[0,2,3],[4,6,5],[4,7,6],[0,4,5],[0,5,1],[1,5,6],[1,6,2],[2,6,7],[2,7,3],[4,0,3],[4,3,7]] };
  }

  function prism(width, height, depth) {
    const w = width / 2, d = depth / 2;
    return { vertices: [[-w,0,-d],[w,0,-d],[0,height,-d],[-w,0,d],[w,0,d],[0,height,d]], faces: [[0,1,2],[3,5,4],[0,3,4],[0,4,1],[1,4,5],[1,5,2],[2,5,3],[2,3,0]] };
  }

  function part(role, shape, at, tint, rotation = [0,0,0], scale = [1,1,1]) {
    const vertices = shape.vertices.map(v => {
      const q = rotate([v[0] * scale[0], v[1] * scale[1], v[2] * scale[2]], rotation);
      return [q[0] + at[0], q[1] + at[1], q[2] + at[2]];
    });
    return { role, geometry: 'lowpoly', vertices, faces: shape.faces, color: color(tint), flatShading: true };
  }
  const E = (role, at, size, tint, rotation) => part(role, ellipsoid(size[0], size[1], size[2]), at, tint, rotation);
  const B = (role, at, size, tint, rotation) => part(role, box(size[0], size[1], size[2]), at, tint, rotation);
  const F = (role, at, top, bottom, height, tint, rotation) => part(role, frustum(top[0], top[1], bottom[0], bottom[1], height), at, tint, rotation);
  const T = (role, at, size, tint, rotation) => part(role, prism(size[0], size[1], size[2]), at, tint, rotation);
  const C = (role, at, radius, height, tint, rotation) => F(role, at, [0.02, 0.02], [radius, radius], height, tint, rotation);

  const palettes = {
    human: { skin: '#d58d6b', suit: '#315f91', dark: '#17233d', accent: '#45f3c2', boot: '#10141c' },
    astronaut: { skin: '#d99b7c', suit: '#e8edf0', dark: '#19243e', accent: '#51d9ff', boot: '#222b36' },
    android: { skin: '#b8d6d4', suit: '#263646', dark: '#11171d', accent: '#ff4fc8', boot: '#080b10' },
    mage: { skin: '#a97869', suit: '#4d2f7d', dark: '#151022', accent: '#a9ff5a', boot: '#0c0a17' },
    cat: { fur: '#b87552', dark: '#241b1a', light: '#f0c79d', eye: '#83ffb4' },
    dog: { fur: '#c58b56', dark: '#3b261d', light: '#e9c48d', eye: '#7ecbff' },
    fox: { fur: '#de6b38', dark: '#3b1b2a', light: '#f2d0a4', eye: '#90f7ff' },
    dragon: { fur: '#3e9a78', dark: '#172f38', light: '#c7e878', eye: '#ffbd55' },
    vehicle: { body: '#2b9f9b', glass: '#baf7ff', dark: '#0d1724', accent: '#ff5f7e' },
    sciFi: { body: '#5664d8', glass: '#8fefff', dark: '#121b38', accent: '#fbce45' },
    nature: { stem: '#795238', leaf: '#4bad69', light: '#a8e66f', accent: '#d8a4ff' },
  };

  function human(p = palettes.human, variant = 'explorer') {
    const parts = [
      F('torso', [0,1.45,0], [.48,.36], [.68,.45], 1.28, p.suit),
      F('pelvis', [0,.68,0], [.46,.36], [.52,.4], .42, p.dark),
      E('head', [0,2.55,0], [.4,.48,.36], p.skin),
      E('hair', [0,2.88,-.02], [.43,.2,.37], p.dark),
      F('arm_left', [-.7,1.48,0], [.13,.13], [.2,.18], 1.16, p.suit, [0,0,-.15]),
      F('arm_right', [.7,1.48,0], [.13,.13], [.2,.18], 1.16, p.suit, [0,0,.15]),
      E('hand_left', [-.78,.84,0], [.14,.16,.14], p.skin),
      E('hand_right', [.78,.84,0], [.14,.16,.14], p.skin),
      F('leg_left', [-.29,.02,0], [.18,.19], [.25,.23], 1.22, p.dark),
      F('leg_right', [.29,.02,0], [.18,.19], [.25,.23], 1.22, p.dark),
      B('boot_left', [-.3,-.66,.14], [.42,.2,.72], p.boot),
      B('boot_right', [.3,-.66,.14], [.42,.2,.72], p.boot),
    ];
    if (variant === 'pilot') parts.push(B('visor', [0,2.57,.34], [.55,.22,.08], p.accent));
    if (variant === 'guardian') parts.push(T('shoulder_left', [-.78,2.0,0], [.38,.34,.35], p.accent), T('shoulder_right', [.78,2.0,0], [.38,.34,.35], p.accent));
    if (variant === 'mage') parts.push(C('staff', [.95,1.25,.05], .05, 2.9, p.accent, [0,0,-.05]), E('orb', [.95,2.78,.05], [.18,.18,.18], p.accent));
    if (variant === 'ninja') parts.push(B('scarf', [0,2.18,.36], [.62,.12,.12], p.accent, [0,.2,0]));
    return parts;
  }

  function quadruped(p = palettes.cat, variant = 'cat') {
    const parts = [
      E('body', [0,1.15,0], [1.05,.62,.58], p.fur),
      E('chest', [0,1.28,.48], [.58,.55,.5], p.light),
      E('head', [0,1.95,.78], [.58,.52,.55], p.fur),
      E('muzzle', [0,1.8,1.22], [.3,.24,.26], p.light),
      T('ear_left', [-.36,2.48,.75], [.4,.6,.24], p.fur, [0,.15,0]),
      T('ear_right', [.36,2.48,.75], [.4,.6,.24], p.fur, [0,-.15,0]),
      F('leg_front_left', [-.55,.45,.42], [.17,.16], [.25,.22], .9, p.fur),
      F('leg_front_right', [.55,.45,.42], [.17,.16], [.25,.22], .9, p.fur),
      F('leg_back_left', [-.55,.45,-.42], [.2,.2], [.3,.25], .9, p.fur),
      F('leg_back_right', [.55,.45,-.42], [.2,.2], [.3,.25], .9, p.fur),
      E('eye_left', [-.23,2.03,1.25], [.1,.11,.07], p.eye),
      E('eye_right', [.23,2.03,1.25], [.1,.11,.07], p.eye),
      E('tail_1', [1.0,1.5,-.55], [.24,.24,.62], p.fur, [0,.6,-.28]),
      E('tail_2', [1.35,1.9,-.72], [.18,.18,.48], p.fur, [0,.3,-.6]),
    ];
    if (variant === 'fox') parts.push(E('tail_tip', [1.58,2.15,-.82], [.23,.23,.3], p.light));
    if (variant === 'dog') parts.push(E('collar', [0,1.95,.87], [.45,.12,.45], p.dark));
    if (variant === 'wolf') parts.push(E('mane', [0,1.55,-.15], [1.05,.75,.64], p.dark));
    return parts;
  }

  function bird(p = palettes.fox, variant = 'bird') {
    return [
      E('body', [0,1.35,0], [.62,.58,.78], p.fur), E('head', [0,2.0,.42], [.42,.4,.42], p.light),
      T('beak', [0,1.98,.83], [.36,.22,.36], p.accent), T('wing_left', [-.62,1.4,0], [.7,.35,.2], p.fur, [0,0,-.3]),
      T('wing_right', [.62,1.4,0], [.7,.35,.2], p.fur, [0,0,.3]), B('leg_left', [-.2,.68,0], [.12,.5,.12], p.dark), B('leg_right', [.2,.68,0], [.12,.5,.12], p.dark),
      E('eye_left', [-.16,2.12,.7], [.08,.08,.06], p.eye), E('eye_right', [.16,2.12,.7], [.08,.08,.06], p.eye),
      T('tail', [0,1.25,-.82], [.6,.45,.25], p.fur, [0,0,0]),
    ];
  }

  function dragon(p = palettes.dragon) {
    return [
      E('body', [0,1.25,0], [1.15,.72,.7], p.fur), E('neck', [0,1.85,.55], [.52,.8,.5], p.fur), E('head', [0,2.55,.85], [.62,.5,.68], p.fur),
      T('horn_left', [-.3,3.1,.72], [.22,.65,.22], p.light), T('horn_right', [.3,3.1,.72], [.22,.65,.22], p.light),
      E('jaw', [0,2.32,1.3], [.38,.22,.35], p.light), E('wing_left', [-.9,1.75,-.1], [1.0,.7,.12], p.dark, [0,.25,-.3]),
      E('wing_right', [.9,1.75,-.1], [1.0,.7,.12], p.dark, [0,-.25,.3]), F('leg_left', [-.58,.48,.4], [.2,.2], [.3,.27], 1.05, p.fur),
      F('leg_right', [.58,.48,.4], [.2,.2], [.3,.27], 1.05, p.fur), E('tail_1', [1.0,1.35,-.55], [.3,.3,.8], p.fur, [0,.45,-.25]), E('tail_2', [1.45,1.62,-.85], [.22,.22,.65], p.fur, [0,.2,-.55]),
      E('eye_left', [-.24,2.65,1.45], [.1,.1,.06], p.eye), E('eye_right', [.24,2.65,1.45], [.1,.1,.06], p.eye),
    ];
  }

  function hovercar(p = palettes.vehicle, variant = 'hovercar') {
    const parts = [B('chassis', [0,.72,0], [2.7,.5,1.35], p.body), F('cabin', [0,1.3,-.04], [.65,.5], [.92,.62], .75, p.glass), E('wheel_fl', [-.95,.3,.72], [.3,.3,.16], p.dark, [Math.PI/2,0,0]), E('wheel_fr', [.95,.3,.72], [.3,.3,.16], p.dark, [Math.PI/2,0,0]), E('wheel_bl', [-.95,.3,-.72], [.3,.3,.16], p.dark, [Math.PI/2,0,0]), E('wheel_br', [.95,.3,-.72], [.3,.3,.16], p.dark, [Math.PI/2,0,0]), B('light_bar', [0,.78,.7], [1.5,.12,.08], p.accent)];
    if (variant === 'rover') parts.push(B('antenna', [0,2.0,0], [.08,.8,.08], p.accent), E('sensor', [0,2.42,0], [.22,.22,.22], p.glass));
    if (variant === 'bike') return [B('frame',[0,.75,0],[.3,.9,.3],p.body,[0,0,.2]), E('wheel_front',[0,.35,.85],[.48,.48,.1],p.dark,[Math.PI/2,0,0]), E('wheel_back',[0,.35,-.85],[.48,.48,.1],p.dark,[Math.PI/2,0,0]), B('handle',[0,1.15,.72],[.75,.08,.08],p.accent), B('seat',[0,1.05,-.05],[.5,.12,.3],p.dark)];
    return parts;
  }

  function spaceship(p = palettes.sciFi, variant = 'ship') {
    const parts = [F('hull',[0,.9,0],[.2,.2],[1.3,.7],1.5,p.body), T('nose',[0,1.1,1.22],[1.05,.8,.75],p.accent,[0,0,0]), E('cockpit',[0,1.55,.28],[.48,.3,.58],p.glass), T('wing_left',[-1.1,.92,-.15],[1.25,.18,.8],p.body,[0,0,-.12]), T('wing_right',[1.1,.92,-.15],[1.25,.18,.8],p.body,[0,0,.12]), C('engine_left',[-.55,.48,-.8],.24,.8,p.dark), C('engine_right',[.55,.48,-.8],.24,.8,p.dark)];
    if (variant === 'rocket') parts.push(C('fin_left',[-.58,.9,-.35],.2,1.2,p.accent,[0,0,-.4]), C('fin_right',[.58,.9,-.35],.2,1.2,p.accent,[0,0,.4]));
    if (variant === 'drone') parts.push(E('rotor_left',[-1.2,1.4,0],[.65,.08,.65],p.accent), E('rotor_right',[1.2,1.4,0],[.65,.08,.65],p.accent));
    return parts;
  }

  function tower(p = palettes.sciFi, variant = 'tower') {
    const parts = [F('base',[0,.6,0],[.7,.7],[1.25,1.25],1.2,p.dark), F('core',[0,2.25,0],[.45,.45],[.68,.68],2.2,p.body), B('window_band',[0,2.3,.5],[.9,.1,.12],p.glass), B('window_band_2',[0,2.95,.48],[.7,.1,.12],p.accent), T('antenna',[0,3.65,0],[.55,.9,.55],p.accent)];
    if (variant === 'house') return [B('walls',[0,1.1,0],[2.4,2.1,2],p.body), T('roof',[0,2.15,0],[2.8,1.15,2.25],p.accent), B('door',[0,.65,1.04],[.55,1.05,.1],p.dark), B('window_left',[-.72,1.35,1.04],[.45,.45,.1],p.glass), B('window_right',[.72,1.35,1.04],[.45,.45,.1],p.glass)];
    return parts;
  }

  function nature(p = palettes.nature, variant = 'tree') {
    if (variant === 'crystal') return [T('crystal_a',[-.35,1.2,0],[.6,2.5,.6],p.accent,[0,.15,0]), T('crystal_b',[.35,1.0,.12],[.55,2.0,.55],p.light,[0,-.2,0]), T('crystal_c',[0,.75,-.28],[.45,1.5,.45],p.leaf), T('crystal_d',[.05,.55,.36],[.35,1.1,.35],p.accent,[0,.3,0])];
    if (variant === 'mushroom') return [F('stem',[0,.65,0],[.22,.22],[.32,.3],1.3,p.stem), E('cap',[0,1.48,0],[.9,.3,.9],p.accent), E('spot_left',[-.35,1.58,.55],[.12,.08,.12],p.light), E('spot_right',[.35,1.58,.45],[.12,.08,.12],p.light)];
    if (variant === 'cactus') return [F('trunk',[0,1.1,0],[.28,.28],[.4,.4],2.2,p.leaf), F('arm_left',[-.52,1.45,0],[.14,.14],[.2,.2],.9,p.leaf,[0,0,-Math.PI/2]), F('arm_right',[.52,1.2,0],[.14,.14],[.2,.2],.8,p.leaf,[0,0,Math.PI/2]), B('pot',[0,.15,0],[.95,.55,.95],p.stem)];
    return [F('trunk',[0,.95,0],[.24,.24],[.42,.38],1.9,p.stem), E('crown',[0,2.25,0],[1.05,1.15,1.0],p.leaf), E('crown_left',[-.68,2.05,.1],[.7,.75,.7],p.light), E('crown_right',[.68,2.08,-.1],[.7,.8,.7],p.leaf)];
  }

  function artifact(p = palettes.sciFi, variant = 'portal') {
    if (variant === 'portal') return [E('ring_outer',[0,1.45,0],[1.2,1.2,.18],p.accent,[Math.PI/2,0,0]), E('ring_inner',[0,1.45,0],[.78,.78,.2],p.glass,[Math.PI/2,0,0]), B('base',[0,.22,0],[1.6,.35,.9],p.dark), B('energy_core',[0,1.45,.05],[.65,.65,.12],p.accent)];
    if (variant === 'lamp') return [B('base',[0,.18,0],[.9,.25,.9],p.dark), C('stem',[0,1.0,0],.1,1.7,p.body), E('shade',[0,1.9,0],[.62,.38,.62],p.accent), E('bulb',[0,1.88,.1],[.25,.25,.25],p.light)];
    if (variant === 'satellite') return [B('core',[0,1.2,0],[.65,.65,.65],p.body), B('panel_left',[-.9,1.2,0],[1.0,.08,.65],p.accent,[0,.1,0]), B('panel_right',[.9,1.2,0],[1.0,.08,.65],p.accent,[0,-.1,0]), C('antenna',[0,1.95,0],.06,1.2,p.glass), E('dish',[0,2.4,0],[.4,.16,.4],p.light)];
    return [B('base',[0,.2,0],[1.1,.4,1.1],p.dark), F('obelisk',[0,1.35,0],[.18,.18],[.62,.62],2.3,p.body), T('signal',[0,2.75,0],[.32,.7,.32],p.accent), E('halo',[0,2.75,0],[.5,.08,.5],p.accent,[Math.PI/2,0,0])];
  }

  const definitions = [
    ['human-explorer','Humano Explorador','humanos','Humano táctico con equipo de exploración','human','walk',() => human(palettes.human,'explorer')],
    ['human-pilot','Humana Piloto','humanos','Piloto futurista con visor energético','human','wave',() => human(palettes.astronaut,'pilot')],
    ['human-guardian','Guardián Neon','humanos','Guardián humano con hombreras luminosas','human','breathe',() => human(palettes.android,'guardian')],
    ['human-mage','Tecnomaga','humanos','Personaje arcano con bastón y núcleo brillante','human','cast',() => human(palettes.mage,'mage')],
    ['human-ninja','Ninja Sintético','humanos','Humano ágil con silueta de combate','human','dance',() => human(palettes.android,'ninja')],
    ['android-scout','Android Scout','robots','Robot bípedo de reconocimiento','robot','scan',() => human(palettes.android,'guardian')],
    ['robot-worker','Robot Worker','robots','Robot industrial de carga','robot','walk',() => human(palettes.astronaut,'explorer')],
    ['mech-commander','Mech Commander','robots','Mecha compacto de mando','robot','pulse',() => human(palettes.sciFi,'guardian')],
    ['cat-cyber','Gato Cyber','criaturas','Felino low-poly con cola articulada','animal','idle',() => quadruped(palettes.cat,'cat')],
    ['dog-companion','Perro Companion','criaturas','Compañero canino con collar luminoso','animal','walk',() => quadruped(palettes.dog,'dog')],
    ['fox-runner','Zorro Runner','criaturas','Zorro veloz de cola esponjosa','animal','walk',() => quadruped(palettes.fox,'fox')],
    ['wolf-guardian','Lobo Guardián','criaturas','Lobo robusto con melena oscura','animal','breath',() => quadruped(palettes.dog,'wolf')],
    ['dragon-green','Dragón Verde','criaturas','Dragón con alas y cuernos low-poly','animal','fly',() => dragon(palettes.dragon)],
    ['sky-bird','Ave Sky','criaturas','Ave estilizada con alas móviles','criaturas','fly',() => bird(palettes.fox)],
    ['raptor-mini','Raptor Mini','criaturas','Dinosaurio corredor compacto','criaturas','walk',() => quadruped(palettes.dragon,'wolf')],
    ['hovercar-neon','Hovercar Neon','vehiculos','Auto volador con cabina de cristal','vehiculo','hover',() => hovercar(palettes.vehicle,'hovercar')],
    ['rover-explorer','Rover Explorer','vehiculos','Rover de exploración planetaria','vehiculo','drive',() => hovercar(palettes.sciFi,'rover')],
    ['aero-bike','Aero Bike','vehiculos','Moto flotante de carreras','vehiculo','hover',() => hovercar(palettes.vehicle,'bike')],
    ['space-shuttle','Space Shuttle','vehiculos','Nave espacial compacta','vehiculo','fly',() => spaceship(palettes.sciFi,'ship')],
    ['rocket-lander','Rocket Lander','vehiculos','Cohete reutilizable','vehiculo','launch',() => spaceship(palettes.vehicle,'rocket')],
    ['drone-guardian','Drone Guardian','vehiculos','Dron de vigilancia con rotores','vehiculo','spin',() => spaceship(palettes.sciFi,'drone')],
    ['submarine-glider','Submarine Glider','vehiculos','Submarino futurista de exploración','vehiculo','float',() => hovercar(palettes.sciFi,'rover')],
    ['sky-tower','Sky Tower','estructuras','Torre de comunicaciones neon','estructura','pulse',() => tower(palettes.sciFi,'tower')],
    ['habitat-house','Habitat House','estructuras','Hábitat modular con techo angular','estructura','idle',() => tower(palettes.vehicle,'house')],
    ['neon-lighthouse','Neon Lighthouse','estructuras','Faro tecnológico de señal','estructura','scan',() => tower(palettes.vehicle,'tower')],
    ['crystal-cluster','Crystal Cluster','naturaleza','Clúster de cristales energéticos','naturaleza','pulse',() => nature(palettes.nature,'crystal')],
    ['ancient-tree','Ancient Tree','naturaleza','Árbol estilizado de copa múltiple','naturaleza','sway',() => nature(palettes.nature,'tree')],
    ['neon-cactus','Neon Cactus','naturaleza','Cactus luminoso en maceta','naturaleza','breathe',() => nature(palettes.nature,'cactus')],
    ['mushroom-lab','Mushroom Lab','naturaleza','Hongo de laboratorio bioluminiscente','naturaleza','pulse',() => nature(palettes.nature,'mushroom')],
    ['portal-gate','Portal Gate','artefactos','Portal energético para marcar zonas','artefacto','spin',() => artifact(palettes.sciFi,'portal')],
    ['quantum-lamp','Quantum Lamp','artefactos','Lámpara de energía cuántica','artefacto','pulse',() => artifact(palettes.vehicle,'lamp')],
    ['orbital-satellite','Orbital Satellite','artefactos','Satélite de paneles solares','artefacto','orbit',() => artifact(palettes.sciFi,'satellite')],
    ['signal-obelisk','Signal Obelisk','artefactos','Obelisco de señal interdimensional','artefacto','float',() => artifact(palettes.mage,'obelisk')],
    ['holo-terminal','Holo Terminal','artefactos','Terminal holográfica de control','artefacto','scan',() => artifact(palettes.android,'terminal')],
    ['energy-reactor','Energy Reactor','artefactos','Reactor compacto para escenarios sci-fi','artefacto','pulse',() => artifact(palettes.dragon,'reactor')],
    ['quantum-clock','Quantum Clock','artefactos','Reloj cuántico para salas de control','artefacto','spin',() => artifact(palettes.vehicle,'portal')],
    ['bio-drone','Bio Drone','vehiculos','Dron biomimético de vigilancia','vehiculo','orbit',() => spaceship(palettes.dragon,'drone')],
  ];

  const catalog = definitions.map(([id, name, category, description, kind, animation, build]) => ({
    id, name, category, description, kind, animation, build,
    palette: kind === 'human' || kind === 'robot' ? 'humanoide' : kind,
    tags: [category, kind, animation],
  }));

  function get(id) { return catalog.find(item => item.id === id) || null; }

  function renderThumbnail(canvas, id, tint) {
    if (!canvas || !canvas.getContext) return;
    const item = get(id); if (!item) return;
    const size = Math.max(96, Math.min(180, canvas.clientWidth || 132));
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(size * ratio); canvas.height = Math.round(size * ratio);
    const ctx = canvas.getContext('2d'); ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    const w = size, h = size;
    const bg = ctx.createLinearGradient(0, 0, w, h); bg.addColorStop(0, '#09151e'); bg.addColorStop(1, '#05070d');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(101,245,214,.12)'; ctx.lineWidth = 1;
    for (let i = -2; i <= 6; i++) { ctx.beginPath(); ctx.moveTo(i * 24, h); ctx.lineTo(w / 2 + (i - 2) * 10, h * .57); ctx.stroke(); }
    const parts = item.build();
    const all = parts.flatMap(p => p.vertices || []);
    if (!all.length) return;
    const project = v => ({ x: v[0] * .78 - v[2] * .55, y: -v[1] + v[0] * .18 + v[2] * .18, d: v[0] + v[2] + v[1] * .05 });
    const projected = all.map(project);
    const minX = Math.min(...projected.map(p => p.x)), maxX = Math.max(...projected.map(p => p.x));
    const minY = Math.min(...projected.map(p => p.y)), maxY = Math.max(...projected.map(p => p.y));
    const scale = Math.min((w * .72) / Math.max(1, maxX - minX), (h * .72) / Math.max(1, maxY - minY));
    const ox = w / 2 - ((minX + maxX) / 2) * scale, oy = h * .66 - ((minY + maxY) / 2) * scale;
    const toScreen = p => [p.x * scale + ox, p.y * scale + oy];
    let offset = 0; const triangles = [];
    parts.forEach(partData => {
      const verts = (partData.vertices || []).map(project);
      (partData.faces || []).forEach(face => {
        if (!Array.isArray(face) || face.length < 3) return;
        const ids = face.slice(0, 3);
        if (ids.some(index => !verts[index])) return;
        triangles.push({ verts: ids.map(index => verts[index]), color: partData.color, depth: ids.reduce((sum, index) => sum + verts[index].d, 0) / ids.length });
      });
      offset += (partData.vertices || []).length;
    });
    triangles.sort((a, b) => a.depth - b.depth).forEach((triangle, index) => {
      const points = triangle.verts.map(toScreen); const base = color(tint || triangle.color);
      const amount = .78 + ((index % 5) * .055);
      const hex = base.replace('#', ''); const rgb = [0, 2, 4].map(i => Math.min(255, Math.round(parseInt(hex.slice(i, i + 2), 16) * amount)));
      ctx.beginPath(); ctx.moveTo(points[0][0], points[0][1]); points.slice(1).forEach(p => ctx.lineTo(p[0], p[1])); ctx.closePath();
      ctx.fillStyle = `rgb(${rgb.join(',')})`; ctx.fill(); ctx.strokeStyle = 'rgba(210,255,242,.18)'; ctx.stroke();
    });
    ctx.strokeStyle = 'rgba(100,255,214,.7)'; ctx.shadowColor = 'rgba(51,255,119,.5)'; ctx.shadowBlur = 8; ctx.strokeRect(5, 5, w - 10, h - 10); ctx.shadowBlur = 0;
  }

  function instantiate(id, overrides = {}) {
    const item = get(id);
    if (!item) return null;
    const parts = item.build().map(partData => ({ ...partData, color: color(overrides.color || partData.color) }));
    return {
      catalogId: item.id,
      name: overrides.name || item.name,
      type: 'catalog_lowpoly',
      parts,
      color: overrides.color || null,
      animation: overrides.animation || item.animation || 'idle',
      animationSpeed: clamp(overrides.animationSpeed == null ? 1 : overrides.animationSpeed, .15, 3),
      animationPlaying: overrides.animationPlaying !== false,
      catalogCategory: item.category,
      catalogDescription: item.description,
    };
  }

  window.CutRealCatalog = { version: 'catalog-37-lowpoly-20260823', items: catalog, get, instantiate, renderThumbnail, count: catalog.length };
})();
/* end sandbox-catalog.js */

// @source-note: las definiciones son activos de catálogo colocables; no son
// fallback de create_lowpoly_object. La geometría enviada por la IA continúa
// pasando por la validación de meshes del Sandbox.
