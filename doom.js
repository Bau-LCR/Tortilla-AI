// ===== DOOM 1993 — RAYCASTER ENGINE MEJORADO =====
// Motor de raycasting fiel al Doom original con texturas procedurales,
// sprites animados, sonidos, múltiples armas y más.

let doomRunning = false;
let doomAnimFrame = null;
let doomKeys = {};
let doomAudioCtx = null;

// ===== AUDIO ENGINE =====
function getDoomAudio() {
    if (!doomAudioCtx) {
        try { doomAudioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {}
    }
    return doomAudioCtx;
}

function playSound(type) {
    const ac = getDoomAudio();
    if (!ac) return;
    try {
        const o = ac.createOscillator();
        const g = ac.createGain();
        o.connect(g); g.connect(ac.destination);
        if (type === 'shoot') {
            o.type = 'sawtooth';
            o.frequency.setValueAtTime(320, ac.currentTime);
            o.frequency.exponentialRampToValueAtTime(40, ac.currentTime + 0.18);
            g.gain.setValueAtTime(0.28, ac.currentTime);
            g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.18);
            o.start(); o.stop(ac.currentTime + 0.18);
        } else if (type === 'hit') {
            o.type = 'square';
            o.frequency.setValueAtTime(180, ac.currentTime);
            o.frequency.exponentialRampToValueAtTime(60, ac.currentTime + 0.12);
            g.gain.setValueAtTime(0.2, ac.currentTime);
            g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.12);
            o.start(); o.stop(ac.currentTime + 0.12);
        } else if (type === 'death') {
            o.type = 'sawtooth';
            o.frequency.setValueAtTime(400, ac.currentTime);
            o.frequency.exponentialRampToValueAtTime(20, ac.currentTime + 0.6);
            g.gain.setValueAtTime(0.35, ac.currentTime);
            g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.6);
            o.start(); o.stop(ac.currentTime + 0.6);
        } else if (type === 'step') {
            o.type = 'sine';
            o.frequency.setValueAtTime(80, ac.currentTime);
            o.frequency.exponentialRampToValueAtTime(40, ac.currentTime + 0.08);
            g.gain.setValueAtTime(0.08, ac.currentTime);
            g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.08);
            o.start(); o.stop(ac.currentTime + 0.08);
        } else if (type === 'pickup') {
            o.type = 'sine';
            o.frequency.setValueAtTime(660, ac.currentTime);
            o.frequency.setValueAtTime(880, ac.currentTime + 0.08);
            g.gain.setValueAtTime(0.2, ac.currentTime);
            g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.2);
            o.start(); o.stop(ac.currentTime + 0.2);
        }
    } catch(e) {}
}

// ===== GENERADOR DE TEXTURAS PROCEDURALES =====
function generateTextures() {
    const size = 64;
    const textures = {};

    // Textura: ladrillo rojo (pared principal)
    textures.wall1 = (() => {
        const data = new Uint8Array(size * size * 4);
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const idx = (y * size + x) * 4;
                const brickY = Math.floor(y / 12);
                const offsetX = (brickY % 2) * 16;
                const brickX = Math.floor((x + offsetX) / 32);
                const localX = (x + offsetX) % 32;
                const localY = y % 12;
                const isMortar = localX < 2 || localY < 2;
                if (isMortar) {
                    data[idx] = 60; data[idx+1] = 50; data[idx+2] = 40;
                } else {
                    const noise = (Math.sin(x * 7.3 + y * 3.1) * 0.5 + 0.5) * 25;
                    const darkEdge = Math.min(localX, 30 - localX, localY, 10 - localY) < 3 ? 0.75 : 1;
                    data[idx]   = Math.min(255, (140 + noise) * darkEdge);
                    data[idx+1] = Math.min(255, (35 + noise * 0.3) * darkEdge);
                    data[idx+2] = Math.min(255, (20 + noise * 0.2) * darkEdge);
                }
                data[idx+3] = 255;
            }
        }
        return data;
    })();

    // Textura: piedra gris (pared alternativa)
    textures.wall2 = (() => {
        const data = new Uint8Array(size * size * 4);
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const idx = (y * size + x) * 4;
                const n = Math.sin(x * 0.8) * Math.cos(y * 0.6) * 20;
                const n2 = Math.sin(x * 3.1 + y * 2.7) * 15;
                const base = 85 + n + n2;
                data[idx] = base; data[idx+1] = base; data[idx+2] = base + 10;
                data[idx+3] = 255;
            }
        }
        return data;
    })();

    // Textura: metal (pared especial)
    textures.wall3 = (() => {
        const data = new Uint8Array(size * size * 4);
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const idx = (y * size + x) * 4;
                const stripe = (y % 8 < 2) ? 0.6 : 1.0;
                const base = 70 * stripe;
                const rust = (Math.sin(x * 2.1 + y * 1.7) > 0.7) ? 40 : 0;
                data[idx] = base + rust; data[idx+1] = base * 0.7; data[idx+2] = base * 0.5;
                data[idx+3] = 255;
            }
        }
        return data;
    })();

    // Textura: suelo (piedra desgastada)
    textures.floor = (() => {
        const data = new Uint8Array(size * size * 4);
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const idx = (y * size + x) * 4;
                const n = Math.sin(x * 1.4 + y * 0.9) * Math.cos(x * 0.5 - y * 1.2) * 20;
                const base = 55 + n;
                data[idx] = base * 0.8; data[idx+1] = base * 0.7; data[idx+2] = base * 0.5;
                data[idx+3] = 255;
            }
        }
        return data;
    })();

    // Textura: techo
    textures.ceil = (() => {
        const data = new Uint8Array(size * size * 4);
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const idx = (y * size + x) * 4;
                const n = Math.sin(x * 2.1) * Math.cos(y * 1.8) * 12;
                const base = 30 + n;
                data[idx] = base; data[idx+1] = base * 0.5; data[idx+2] = base * 0.3;
                data[idx+3] = 255;
            }
        }
        return data;
    })();

    // Crear ImageData para cada textura
    const result = {};
    for (const [name, data] of Object.entries(textures)) {
        result[name] = { data, size };
    }
    return result;
}

function sampleTexture(tex, tx, ty) {
    const xi = Math.floor(((tx % 1) + 1) % 1 * tex.size) % tex.size;
    const yi = Math.floor(((ty % 1) + 1) % 1 * tex.size) % tex.size;
    const idx = (yi * tex.size + xi) * 4;
    return [tex.data[idx], tex.data[idx+1], tex.data[idx+2]];
}

// ===== ENGINE PRINCIPAL =====
function startDoom() {
    doomRunning = true;
    doomKeys = {};

    const canvas = document.getElementById("doom-canvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    // ===== MAPA DOOM-ESTILO =====
    // 0=vacío, 1=ladrillo, 2=piedra, 3=metal, 9=puerta
    const MAP = [
        [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
        [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
        [1,0,2,2,2,0,0,0,2,2,0,0,0,2,2,2,0,0,0,0,0,0,0,1],
        [1,0,2,0,0,0,0,0,2,0,0,0,0,0,2,0,0,0,0,0,0,0,0,1],
        [1,0,0,0,3,3,0,0,0,0,0,0,0,0,0,0,2,0,0,0,0,0,0,1],
        [1,0,2,0,3,0,0,0,0,0,0,2,2,0,0,0,2,0,0,0,0,0,0,1],
        [1,0,2,0,0,0,0,0,0,0,0,2,2,0,0,0,0,0,0,0,0,0,0,1],
        [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
        [1,0,0,0,0,1,1,1,0,0,1,1,1,0,0,0,0,0,1,1,1,1,0,1],
        [1,0,0,0,0,1,0,0,0,0,0,0,1,0,0,0,0,0,1,0,0,1,0,1],
        [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,1,0,1],
        [1,0,0,0,0,1,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,1],
        [1,0,0,0,0,1,1,1,0,0,1,1,1,0,0,0,0,0,0,0,0,0,0,1],
        [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
        [1,0,3,0,0,0,0,0,0,0,0,0,0,0,0,0,3,3,0,0,0,0,0,1],
        [1,0,3,3,3,0,0,0,0,0,0,0,0,0,0,0,3,3,0,0,0,0,0,1],
        [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
        [1,0,0,0,0,0,0,0,2,2,2,0,0,2,2,2,0,0,0,0,0,0,0,1],
        [1,0,0,0,0,0,0,0,2,0,2,0,0,2,0,2,0,0,0,0,0,0,0,1],
        [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
        [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
        [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
        [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
        [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
    ];
    const MAP_W = MAP[0].length;
    const MAP_H = MAP.length;

    // Texturas procedurales
    const TEXTURES = generateTextures();
    const WALL_TEX = [null, TEXTURES.wall1, TEXTURES.wall2, TEXTURES.wall3];

    // ===== JUGADOR =====
    let player = {
        x: 1.5, y: 1.5,
        angle: Math.PI / 4,
        speed: 0.065,
        rotSpeed: 0.048,
        health: 100,
        armor: 0,
        ammo: { pistol: 50, shotgun: 20, rocket: 5 },
        weapon: 'pistol', // pistol | shotgun | rocket
        score: 0,
        kills: 0,
        bobPhase: 0,
        stepTimer: 0,
        dead: false,
        invincible: 0,
        faceAnim: 0, // 0=neutral 1=shoot 2=pain 3=evil
        faceTimer: 0,
    };

    // ===== ARMAS =====
    const WEAPONS = {
        pistol:  { name: 'PISTOLA', damage: 20, spread: 0.04, fireRate: 15, ammoKey: 'pistol',  ammoPerShot: 1 },
        shotgun: { name: 'ESCOPETA', damage: 15, spread: 0.18, fireRate: 35, pellets: 7, ammoKey: 'shotgun', ammoPerShot: 1 },
        rocket:  { name: 'LANZACOHETES', damage: 80, spread: 0.01, fireRate: 50, ammoKey: 'rocket', ammoPerShot: 1, splash: true },
    };

    // ===== ITEMS EN EL MAPA =====
    let items = [
        { x: 3.5, y: 3.5, type: 'health',  value: 25, alive: true, bobOffset: 0 },
        { x: 10.5, y: 5.5, type: 'ammo',    value: 10, ammoKey: 'pistol', alive: true, bobOffset: 0.5 },
        { x: 6.5, y: 10.5, type: 'armor',   value: 25, alive: true, bobOffset: 1.0 },
        { x: 15.5, y: 8.5, type: 'shotgun', value: 1,  alive: true, bobOffset: 1.5 },
        { x: 8.5,  y: 18.5, type: 'ammo',  value: 5,  ammoKey: 'shotgun', alive: true, bobOffset: 0.2 },
        { x: 20.5, y: 3.5, type: 'rocket',  value: 1,  alive: true, bobOffset: 0.7 },
        { x: 20.5, y: 11.5, type: 'ammo',  value: 3, ammoKey: 'rocket', alive: true, bobOffset: 0.3 },
        { x: 12.5, y: 20.5, type: 'health', value: 50, alive: true, bobOffset: 0.9 },
    ];

    // ===== ENEMIGOS MEJORADOS =====
    let enemies = [
        { x:8.5,  y:4.5,  type:'imp',    alive:true, health:40, maxHealth:40, angle:0, state:'idle', stateTimer:0, attackTimer:0, moveTimer:0, animFrame:0, alertTimer:0 },
        { x:4.5,  y:8.5,  type:'zombie', alive:true, health:25, maxHealth:25, angle:0, state:'idle', stateTimer:0, attackTimer:0, moveTimer:0, animFrame:0, alertTimer:0 },
        { x:15.5, y:8.5,  type:'imp',    alive:true, health:40, maxHealth:40, angle:0, state:'idle', stateTimer:0, attackTimer:0, moveTimer:0, animFrame:0, alertTimer:0 },
        { x:8.5,  y:15.5, type:'demon',  alive:true, health:150,maxHealth:150,angle:0, state:'idle', stateTimer:0, attackTimer:0, moveTimer:0, animFrame:0, alertTimer:0 },
        { x:3.5,  y:17.5, type:'zombie', alive:true, health:25, maxHealth:25, angle:0, state:'idle', stateTimer:0, attackTimer:0, moveTimer:0, animFrame:0, alertTimer:0 },
        { x:20.5, y:5.5,  type:'imp',    alive:true, health:40, maxHealth:40, angle:0, state:'idle', stateTimer:0, attackTimer:0, moveTimer:0, animFrame:0, alertTimer:0 },
        { x:18.5, y:18.5, type:'demon',  alive:true, health:150,maxHealth:150,angle:0, state:'idle', stateTimer:0, attackTimer:0, moveTimer:0, animFrame:0, alertTimer:0 },
        { x:20.5, y:15.5, type:'zombie', alive:true, health:25, maxHealth:25, angle:0, state:'idle', stateTimer:0, attackTimer:0, moveTimer:0, animFrame:0, alertTimer:0 },
    ];

    const ENEMY_DATA = {
        zombie: { speed:0.012, attackRange:1.2, sightRange:8,  attackDmg:5,  fireRate:60,  color:[180,60,60],  headColor:[200,140,100], score:100 },
        imp:    { speed:0.018, attackRange:6.0, sightRange:10, attackDmg:10, fireRate:80,  color:[120,60,20],  headColor:[150,100,60],  score:200 },
        demon:  { speed:0.022, attackRange:1.0, sightRange:7,  attackDmg:20, fireRate:40,  color:[200,30,30],  headColor:[220,80,80],   score:500 },
    };

    // ===== PROYECTILES =====
    let projectiles = []; // { x, y, dx, dy, type, damage, fromEnemy }
    let explosions  = []; // { x, y, timer, maxTimer }
    let bloodSplats = []; // { x, y, size, alpha }

    // ===== ESTADO DE DISPARO =====
    let shootTimer = 0;
    let flashTimer = 0;
    let screenFlash = { r:0, g:0, b:0, a:0, timer:0 };
    let deathTimer = 0;
    let bobAmount = 0;
    let messageQueue = []; // { text, timer, color }

    // ===== RESIZE =====
    function resizeCanvas() {
        const w = canvas.offsetWidth  || window.innerWidth;
        const h = canvas.offsetHeight || window.innerHeight;
        if (canvas.width !== w || canvas.height !== h) {
            canvas.width  = w;
            canvas.height = h;
        }
    }
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    // ===== COLISIÓN =====
    function canMoveTo(x, y) {
        const mx = Math.floor(x), my = Math.floor(y);
        if (my < 0 || my >= MAP_H || mx < 0 || mx >= MAP_W) return false;
        return MAP[my][mx] === 0;
    }

    // ===== RAYCASTING AVANZADO CON TEXTURAS =====
    function castRays() {
        const W     = canvas.width;
        const H     = canvas.height;
        const FOV   = Math.PI / 2.8; // ~64° FOV fiel al Doom
        const halfH = H / 2;
        const zBuffer = new Float32Array(W);

        // Pixel buffer para rendimiento
        const imgData = ctx.createImageData(W, H);
        const buf = imgData.data;

        // --- SUELO Y TECHO CON TEXTURA ---
        for (let y = 0; y < H; y++) {
            const isFloor = y > halfH;
            const p = y - halfH;
            const rowDist = (p === 0) ? 1e10 : halfH / Math.abs(p);

            const floorX = Math.cos(player.angle) * rowDist;
            const floorY = Math.sin(player.angle) * rowDist;
            const leftX  = Math.cos(player.angle - FOV / 2) * rowDist;
            const leftY  = Math.sin(player.angle - FOV / 2) * rowDist;
            const rightX = Math.cos(player.angle + FOV / 2) * rowDist;
            const rightY = Math.sin(player.angle + FOV / 2) * rowDist;

            for (let x = 0; x < W; x++) {
                const t = x / W;
                const wx = (isFloor ? 1 : -1) * rowDist;
                const tx = player.x + (leftX + (rightX - leftX) * t);
                const ty = player.y + (leftY + (rightY - leftY) * t);
                const tex = isFloor ? TEXTURES.floor : TEXTURES.ceil;
                const [r, g, b] = sampleTexture(tex, tx, ty);
                const fog = Math.max(0, Math.min(1, rowDist / 10));
                const dark = isFloor ? 0.45 : 0.22;
                const idx = (y * W + x) * 4;
                buf[idx]   = r * dark * (1 - fog * 0.6);
                buf[idx+1] = g * dark * (1 - fog * 0.6);
                buf[idx+2] = b * dark * (1 - fog * 0.6);
                buf[idx+3] = 255;
            }
        }

        // --- PAREDES CON TEXTURAS ---
        for (let i = 0; i < W; i++) {
            const rayAngle = player.angle - FOV / 2 + (i / W) * FOV;
            const cosA = Math.cos(rayAngle);
            const sinA = Math.sin(rayAngle);

            const deltaDistX = Math.abs(1 / cosA);
            const deltaDistY = Math.abs(1 / sinA);

            let mapX = Math.floor(player.x);
            let mapY = Math.floor(player.y);
            let stepX, stepY, sideDistX, sideDistY;

            if (cosA < 0) { stepX = -1; sideDistX = (player.x - mapX) * deltaDistX; }
            else          { stepX =  1; sideDistX = (mapX + 1 - player.x) * deltaDistX; }
            if (sinA < 0) { stepY = -1; sideDistY = (player.y - mapY) * deltaDistY; }
            else          { stepY =  1; sideDistY = (mapY + 1 - player.y) * deltaDistY; }

            let hit = false, side = 0, dist = 0, wallType = 1;
            for (let depth = 0; depth < 40; depth++) {
                if (sideDistX < sideDistY) {
                    sideDistX += deltaDistX; mapX += stepX; side = 0;
                } else {
                    sideDistY += deltaDistY; mapY += stepY; side = 1;
                }
                if (mapY >= 0 && mapY < MAP_H && mapX >= 0 && mapX < MAP_W && MAP[mapY][mapX] > 0) {
                    hit = true;
                    wallType = MAP[mapY][mapX];
                    dist = side === 0
                        ? (mapX - player.x + (1 - stepX) / 2) / cosA
                        : (mapY - player.y + (1 - stepY) / 2) / sinA;
                    break;
                }
            }
            if (!hit || dist <= 0) { zBuffer[i] = 999; continue; }
            zBuffer[i] = dist;

            const wallH    = H / dist;
            const wallTop  = Math.max(0, Math.floor(halfH - wallH / 2));
            const wallBot  = Math.min(H - 1, Math.floor(halfH + wallH / 2));

            // Coordenada X de textura
            let wallX;
            if (side === 0) wallX = player.y + dist * sinA;
            else            wallX = player.x + dist * cosA;
            wallX -= Math.floor(wallX);

            const tex = WALL_TEX[Math.min(wallType, WALL_TEX.length - 1)] || TEXTURES.wall1;
            const texX = Math.floor(wallX * tex.size);
            const fog  = Math.max(0, 1 - dist / 16);
            const sideShade = side === 1 ? 0.6 : 1.0;

            for (let y = wallTop; y <= wallBot; y++) {
                const d = (y * 2 - H + wallH) * (tex.size / 2) / wallH;
                const texY = Math.floor(d) & (tex.size - 1);
                const tIdx = (Math.max(0, Math.min(tex.size - 1, texY)) * tex.size +
                              Math.max(0, Math.min(tex.size - 1, texX))) * 4;
                const bIdx = (y * W + i) * 4;
                buf[bIdx]   = tex.data[tIdx]   * sideShade * fog;
                buf[bIdx+1] = tex.data[tIdx+1] * sideShade * fog;
                buf[bIdx+2] = tex.data[tIdx+2] * sideShade * fog;
                buf[bIdx+3] = 255;
            }
        }

        ctx.putImageData(imgData, 0, 0);
        return zBuffer;
    }

    // ===== RENDERIZAR SPRITES (enemigos e items) =====
    function renderSprites(zBuffer) {
        const W   = canvas.width;
        const H   = canvas.height;
        const FOV = Math.PI / 2.8;
        const halfH = H / 2;

        const sprites = [];

        // Enemigos
        for (const e of enemies) {
            if (!e.alive) continue;
            const dx = e.x - player.x, dy = e.y - player.y;
            sprites.push({ x: e.x, y: e.y, dx, dy, dist: dx*dx+dy*dy, type: 'enemy', ref: e });
        }

        // Items
        for (const item of items) {
            if (!item.alive) continue;
            const dx = item.x - player.x, dy = item.y - player.y;
            sprites.push({ x: item.x, y: item.y, dx, dy, dist: dx*dx+dy*dy, type: 'item', ref: item });
        }

        // Explosiones
        for (const ex of explosions) {
            const dx = ex.x - player.x, dy = ex.y - player.y;
            sprites.push({ x: ex.x, y: ex.y, dx, dy, dist: dx*dx+dy*dy, type: 'explosion', ref: ex });
        }

        // Proyectiles (bolas de fuego)
        for (const p of projectiles) {
            if (!p.fromEnemy) continue;
            const dx = p.x - player.x, dy = p.y - player.y;
            sprites.push({ x: p.x, y: p.y, dx, dy, dist: dx*dx+dy*dy, type: 'projectile', ref: p });
        }

        sprites.sort((a, b) => b.dist - a.dist);

        for (const sp of sprites) {
            const dist = Math.sqrt(sp.dist);
            if (dist < 0.2) continue;

            const spAngle = Math.atan2(sp.dy, sp.dx);
            let diff = spAngle - player.angle;
            while (diff >  Math.PI) diff -= 2 * Math.PI;
            while (diff < -Math.PI) diff += 2 * Math.PI;
            if (Math.abs(diff) > FOV * 0.75) continue;

            const screenX = Math.floor((0.5 + diff / FOV) * W);
            const fog = Math.max(0, Math.min(1, 1 - dist / 14));

            if (sp.type === 'enemy') {
                drawEnemySprite(ctx, sp.ref, screenX, dist, W, H, halfH, zBuffer, fog);
            } else if (sp.type === 'item') {
                drawItemSprite(ctx, sp.ref, screenX, dist, W, H, halfH, zBuffer, fog);
            } else if (sp.type === 'explosion') {
                drawExplosionSprite(ctx, sp.ref, screenX, dist, W, H, halfH, zBuffer, fog);
            } else if (sp.type === 'projectile') {
                drawProjectileSprite(ctx, sp.ref, screenX, dist, W, H, halfH, zBuffer, fog);
            }
        }
    }

    function drawEnemySprite(ctx, enemy, sx, dist, W, H, halfH, zBuf, fog) {
        const eData = ENEMY_DATA[enemy.type];
        const [cr, cg, cb] = eData.color;
        const [hr, hg, hb] = eData.headColor;

        const scale = enemy.type === 'demon' ? 1.3 : 1.0;
        const spriteH = Math.min(H * 1.6, H / dist) * scale;
        const spriteW = spriteH * (enemy.type === 'demon' ? 0.7 : 0.55);
        const spriteTop = halfH - spriteH * 0.52;

        const startX = Math.floor(sx - spriteW / 2);
        const endX   = Math.ceil(sx + spriteW / 2);

        const alpha = fog * 0.95;
        if (alpha < 0.05) return;

        const hpRatio = enemy.health / enemy.maxHealth;
        const painFlash = (enemy.state === 'pain' && enemy.stateTimer % 4 < 2) ? 80 : 0;

        for (let x = startX; x < endX; x++) {
            if (x < 0 || x >= W || zBuf[x] < dist) continue;
            const tx = (x - startX) / spriteW;

            // Cuerpo
            if (tx > 0.1 && tx < 0.9) {
                const bodyTop = spriteTop + spriteH * 0.28;
                const bodyBot = spriteTop + spriteH * 0.88;
                for (let y = bodyTop; y < bodyBot; y++) {
                    if (y < 0 || y >= H) continue;
                    // Sombra lateral
                    const shade = (tx < 0.2 || tx > 0.8) ? 0.5 : 1.0;
                    ctx.fillStyle = `rgba(${(cr + painFlash) * shade},${cg * shade},${cb * shade},${alpha})`;
                    ctx.fillRect(x, y, 1, 1);
                }
            }
            // Cabeza
            if (tx > 0.25 && tx < 0.75) {
                const headTop = spriteTop + spriteH * 0.04;
                const headBot = spriteTop + spriteH * 0.28;
                for (let y = headTop; y < headBot; y++) {
                    if (y < 0 || y >= H) continue;
                    ctx.fillStyle = `rgba(${hr + painFlash},${hg},${hb},${alpha})`;
                    ctx.fillRect(x, y, 1, 1);
                }
                // Ojos (rojos)
                const eyeY = spriteTop + spriteH * 0.1;
                if (tx > 0.3 && tx < 0.42) {
                    ctx.fillStyle = `rgba(255,0,0,${alpha})`;
                    ctx.fillRect(x, eyeY, 1, spriteH * 0.06);
                }
                if (tx > 0.58 && tx < 0.7) {
                    ctx.fillStyle = `rgba(255,0,0,${alpha})`;
                    ctx.fillRect(x, eyeY, 1, spriteH * 0.06);
                }
            }
            // Piernas animadas
            if (tx > 0.15 && tx < 0.85) {
                const legOff = Math.sin(enemy.animFrame * 0.3) * spriteH * 0.06;
                const legY = spriteTop + spriteH * 0.88 + (tx < 0.5 ? legOff : -legOff);
                ctx.fillStyle = `rgba(${cr * 0.7},${cg * 0.7},${cb * 0.7},${alpha})`;
                ctx.fillRect(x, legY, 1, spriteH * 0.12);
            }
        }

        // Barra de vida sobre el enemigo (solo si fue atacado)
        if (enemy.health < enemy.maxHealth) {
            const barW = Math.max(20, spriteW);
            const barX = sx - barW / 2;
            const barY = spriteTop - 8;
            ctx.fillStyle = 'rgba(0,0,0,0.7)';
            ctx.fillRect(barX, barY, barW, 4);
            const hpColor = hpRatio > 0.5 ? '#44ff44' : hpRatio > 0.25 ? '#ffaa00' : '#ff2222';
            ctx.fillStyle = hpColor;
            ctx.fillRect(barX, barY, barW * hpRatio, 4);
        }
    }

    function drawItemSprite(ctx, item, sx, dist, W, H, halfH, zBuf, fog) {
        const spriteH = Math.min(H * 0.7, H / dist * 0.5);
        const spriteW = spriteH;
        const bob = Math.sin(Date.now() * 0.003 + item.bobOffset * Math.PI * 2) * spriteH * 0.05;
        const spriteTop = halfH - spriteH * 0.5 + bob;

        const startX = Math.floor(sx - spriteW / 2);
        const endX   = Math.ceil(sx + spriteW / 2);
        const alpha  = fog * 0.9;

        const ITEM_COLORS = {
            health:  { main:[220,30,30],  glow:'rgba(255,0,0,0.3)' },
            armor:   { main:[30,30,220],  glow:'rgba(0,0,255,0.3)' },
            ammo:    { main:[220,220,30], glow:'rgba(255,255,0,0.3)' },
            shotgun: { main:[180,120,60], glow:'rgba(200,150,80,0.3)' },
            rocket:  { main:[220,80,20],  glow:'rgba(255,100,0,0.3)' },
        };
        const cfg = ITEM_COLORS[item.type] || { main:[200,200,200], glow:'rgba(200,200,200,0.3)' };

        // Glow
        const grd = ctx.createRadialGradient(sx, halfH, 0, sx, halfH, spriteH * 0.5);
        grd.addColorStop(0, cfg.glow);
        grd.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grd;
        ctx.fillRect(startX - spriteW * 0.5, spriteTop - spriteH * 0.2, spriteW * 2, spriteH * 1.4);

        for (let x = startX; x < endX; x++) {
            if (x < 0 || x >= W || zBuf[x] < dist) continue;
            const tx = (x - startX) / spriteW;
            if (tx < 0.15 || tx > 0.85) continue;

            for (let y = Math.floor(spriteTop); y < Math.floor(spriteTop + spriteH * 0.9); y++) {
                if (y < 0 || y >= H) continue;
                const ty = (y - spriteTop) / spriteH;
                const cx2 = tx - 0.5, cy2 = ty - 0.45;
                if (cx2*cx2*4 + cy2*cy2*4 > 1) continue;
                const shade = 1 - cy2 * 0.5;
                const [r,g,b] = cfg.main;
                ctx.fillStyle = `rgba(${r*shade},${g*shade},${b*shade},${alpha})`;
                ctx.fillRect(x, y, 1, 1);
            }
        }
    }

    function drawExplosionSprite(ctx, ex, sx, dist, W, H, halfH, zBuf, fog) {
        const progress = ex.timer / ex.maxTimer;
        const radius   = H / dist * 0.6 * (1 - progress * 0.3);
        const alpha    = fog * progress;
        const grd = ctx.createRadialGradient(sx, halfH, 0, sx, halfH, radius);
        grd.addColorStop(0,   `rgba(255,255,200,${alpha})`);
        grd.addColorStop(0.3, `rgba(255,150,0,${alpha * 0.8})`);
        grd.addColorStop(0.7, `rgba(200,50,0,${alpha * 0.4})`);
        grd.addColorStop(1,   'rgba(0,0,0,0)');
        ctx.fillStyle = grd;
        ctx.fillRect(sx - radius, halfH - radius, radius * 2, radius * 2);
    }

    function drawProjectileSprite(ctx, proj, sx, dist, W, H, halfH, zBuf, fog) {
        const spriteH = Math.min(30, H / dist * 0.15);
        const spriteTop = halfH - spriteH * 0.5;
        const alpha = fog * 0.9;
        const grd = ctx.createRadialGradient(sx, halfH, 0, sx, halfH, spriteH);
        grd.addColorStop(0,   `rgba(255,200,50,${alpha})`);
        grd.addColorStop(0.5, `rgba(255,80,0,${alpha * 0.6})`);
        grd.addColorStop(1,   'rgba(0,0,0,0)');
        ctx.fillStyle = grd;
        ctx.fillRect(sx - spriteH, spriteTop, spriteH * 2, spriteH * 2);
    }

    // ===== HUD COMPLETO =====
    function drawHUD() {
        const W = canvas.width;
        const H = canvas.height;
        const hudH = 70;

        // Fondo HUD con gradiente
        const hudGrd = ctx.createLinearGradient(0, H - hudH, 0, H);
        hudGrd.addColorStop(0, 'rgba(0,0,0,0.85)');
        hudGrd.addColorStop(1, 'rgba(10,0,0,0.95)');
        ctx.fillStyle = hudGrd;
        ctx.fillRect(0, H - hudH, W, hudH);

        // Borde superior del HUD
        ctx.fillStyle = '#8B0000';
        ctx.fillRect(0, H - hudH, W, 2);

        // Cara del personaje (DOOM style)
        const faceX = W / 2 - 22;
        const faceY = H - hudH + 5;
        const faceW = 44, faceH = 52;
        drawFace(ctx, faceX, faceY, faceW, faceH);

        // SALUD
        const hpColor = player.health > 50 ? '#ff2222' : player.health > 25 ? '#ff8800' : '#ff0000';
        ctx.font = 'bold 9px "Courier New"';
        ctx.fillStyle = '#888';
        ctx.fillText('SALUD', 16, H - hudH + 16);
        ctx.font = 'bold 26px "Courier New"';
        ctx.fillStyle = hpColor;
        ctx.fillText(player.health + '%', 12, H - hudH + 48);

        // ARMOR
        ctx.font = 'bold 9px "Courier New"';
        ctx.fillStyle = '#888';
        ctx.fillText('ARMOR', 80, H - hudH + 16);
        ctx.font = 'bold 26px "Courier New"';
        ctx.fillStyle = '#4488ff';
        ctx.fillText(player.armor + '%', 76, H - hudH + 48);

        // ARMA + MUNICIÓN
        const wpn = WEAPONS[player.weapon];
        const ammo = player.ammo[wpn.ammoKey];
        ctx.font = 'bold 9px "Courier New"';
        ctx.fillStyle = '#888';
        ctx.fillText('ARMA', W - 140, H - hudH + 16);
        ctx.font = 'bold 11px "Courier New"';
        ctx.fillStyle = '#ffaa22';
        ctx.fillText(wpn.name, W - 142, H - hudH + 30);
        ctx.font = 'bold 9px "Courier New"';
        ctx.fillStyle = '#888';
        ctx.fillText('AMMO', W - 140, H - hudH + 44);
        ctx.font = 'bold 22px "Courier New"';
        ctx.fillStyle = '#ffdd00';
        ctx.fillText(String(ammo).padStart(3, ' '), W - 140, H - hudH + 62);

        // PUNTUACIÓN Y KILLS
        ctx.font = 'bold 9px "Courier New"';
        ctx.fillStyle = '#888';
        ctx.fillText('SCORE', W / 2 + 40, H - hudH + 16);
        ctx.font = 'bold 14px "Courier New"';
        ctx.fillStyle = '#ff9090';
        ctx.fillText(player.score, W / 2 + 38, H - hudH + 32);
        ctx.font = 'bold 9px "Courier New"';
        ctx.fillStyle = '#888';
        ctx.fillText('KILLS', W / 2 + 40, H - hudH + 46);
        ctx.font = 'bold 14px "Courier New"';
        ctx.fillStyle = '#ff6060';
        ctx.fillText(player.kills + '/' + enemies.length, W / 2 + 38, H - hudH + 60);

        // Mira mejorada
        const cx = W / 2, cy = (H - hudH) / 2;
        ctx.strokeStyle = 'rgba(255,59,59,0.9)';
        ctx.lineWidth = 1.5;
        const s = 14, gap = 5;
        ctx.beginPath();
        ctx.moveTo(cx - s, cy); ctx.lineTo(cx - gap, cy);
        ctx.moveTo(cx + gap, cy); ctx.lineTo(cx + s, cy);
        ctx.moveTo(cx, cy - s); ctx.lineTo(cx, cy - gap);
        ctx.moveTo(cx, cy + gap); ctx.lineTo(cx, cy + s);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,59,59,0.7)';
        ctx.beginPath(); ctx.arc(cx, cy, 2, 0, Math.PI * 2); ctx.fill();

        // Arma dibujada
        drawWeapon(ctx, W, H - hudH);

        // Flash de disparo
        if (flashTimer > 0) {
            const a = (flashTimer / 10) * 0.5;
            const grd2 = ctx.createRadialGradient(cx, H - hudH, 0, cx, H - hudH, 120);
            grd2.addColorStop(0, `rgba(255,220,100,${a})`);
            grd2.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = grd2;
            ctx.fillRect(cx - 120, H - hudH - 120, 240, 120);
        }

        // Screen flash (daño, pickup)
        if (screenFlash.timer > 0) {
            const fa = screenFlash.a * (screenFlash.timer / 12);
            ctx.fillStyle = `rgba(${screenFlash.r},${screenFlash.g},${screenFlash.b},${fa})`;
            ctx.fillRect(0, 0, W, H - hudH);
        }

        // Mensajes en pantalla
        const now = Date.now();
        messageQueue = messageQueue.filter(m => m.timer > 0);
        messageQueue.forEach((msg, i) => {
            const a = Math.min(1, msg.timer / 30);
            ctx.font = 'bold 14px "Courier New"';
            ctx.fillStyle = msg.color || `rgba(255,255,100,${a})`;
            ctx.globalAlpha = a;
            ctx.fillText(msg.text, W / 2 - ctx.measureText(msg.text).width / 2, 50 + i * 22);
            ctx.globalAlpha = 1;
            msg.timer--;
        });

        // Minimap
        drawMinimap(ctx, W, H, hudH);

        // ── Victoria / Derrota ──
        const aliveEnemies = enemies.filter(e => e.alive).length;
        if (aliveEnemies === 0) {
            ctx.fillStyle = 'rgba(0,0,0,0.65)';
            ctx.fillRect(0, 0, W, H - hudH);
            ctx.fillStyle = '#ffdd00';
            ctx.font = 'bold 48px "Courier New"';
            ctx.textAlign = 'center';
            ctx.fillText('¡NIVEL COMPLETADO!', W / 2, H / 2 - 20);
            ctx.font = 'bold 18px "Courier New"';
            ctx.fillStyle = '#ff9090';
            ctx.fillText(`Kills: ${player.kills} | Score: ${player.score}`, W / 2, H / 2 + 20);
            ctx.font = '14px "Courier New"';
            ctx.fillStyle = '#aaa';
            ctx.fillText('Presioná ESC para volver al chat', W / 2, H / 2 + 50);
            ctx.textAlign = 'left';
        }

        if (player.dead) {
            deathTimer++;
            const da = Math.min(0.8, deathTimer / 60);
            ctx.fillStyle = `rgba(140,0,0,${da})`;
            ctx.fillRect(0, 0, W, H - hudH);
            if (deathTimer > 30) {
                ctx.fillStyle = '#ff0000';
                ctx.font = 'bold 52px "Courier New"';
                ctx.textAlign = 'center';
                ctx.fillText('HAS MUERTO', W / 2, H / 2 - 20);
                ctx.font = '16px "Courier New"';
                ctx.fillStyle = '#ccc';
                ctx.fillText('Presioná R para reiniciar · ESC para salir', W / 2, H / 2 + 30);
                ctx.textAlign = 'left';
            }
        }

        // Indicador de cambio de arma
        ctx.font = '10px "Courier New"';
        ctx.fillStyle = 'rgba(255,200,100,0.5)';
        ctx.fillText('[1] Pistola  [2] Escopeta  [3] Cohetes', 10, H - hudH - 8);
    }

    function drawFace(ctx, x, y, w, h) {
        // Fondo cara
        ctx.fillStyle = '#c89060';
        ctx.fillRect(x, y, w, h);
        // Frente
        ctx.fillStyle = '#d4a070';
        ctx.fillRect(x + 2, y + 2, w - 4, h * 0.6);

        // Expresión según estado
        const pain = screenFlash.timer > 0 && screenFlash.r > 100;
        const shoot = flashTimer > 0;
        const dead = player.dead;
        const evil = player.score > 0 && player.score % 1000 < 50;

        // Ojos
        if (dead) {
            ctx.fillStyle = '#ff0000';
            ctx.fillRect(x + 8,  y + 14, 8, 8);
            ctx.fillRect(x + 28, y + 14, 8, 8);
            // X en los ojos
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x+8, y+14); ctx.lineTo(x+16, y+22);
            ctx.moveTo(x+16, y+14); ctx.lineTo(x+8, y+22);
            ctx.moveTo(x+28, y+14); ctx.lineTo(x+36, y+22);
            ctx.moveTo(x+36, y+14); ctx.lineTo(x+28, y+22);
            ctx.stroke();
        } else {
            ctx.fillStyle = pain ? '#ff4444' : (shoot ? '#fff' : '#ffffff');
            ctx.fillRect(x + 8,  y + 14, 9, 9);
            ctx.fillRect(x + 27, y + 14, 9, 9);
            ctx.fillStyle = '#000';
            ctx.fillRect(x + (evil ? 10 : 11), y + (evil ? 15 : 16), 5, 5);
            ctx.fillRect(x + (evil ? 29 : 30), y + (evil ? 15 : 16), 5, 5);
        }

        // Boca
        if (dead) {
            ctx.fillStyle = '#660000';
            ctx.fillRect(x + 10, y + 35, 24, 6);
        } else if (shoot) {
            ctx.fillStyle = '#000';
            ctx.beginPath(); ctx.arc(x + w/2, y + 38, 6, 0, Math.PI * 2); ctx.fill();
        } else if (pain) {
            ctx.fillStyle = '#000';
            ctx.fillRect(x + 14, y + 35, 16, 5);
        } else {
            ctx.fillStyle = '#000';
            ctx.fillRect(x + 12, y + 36, 20, 4);
            ctx.fillStyle = '#c89060';
            ctx.fillRect(x + 13, y + 37, 18, 2);
        }

        // HP bar debajo de la cara
        const hpW = w - 4;
        ctx.fillStyle = '#330000';
        ctx.fillRect(x + 2, y + h - 8, hpW, 6);
        const hpRatio = player.health / 100;
        const hpColor = hpRatio > 0.5 ? '#00ff00' : hpRatio > 0.25 ? '#ffaa00' : '#ff0000';
        ctx.fillStyle = hpColor;
        ctx.fillRect(x + 2, y + h - 8, hpW * hpRatio, 6);
    }

    function drawWeapon(ctx, W, groundY) {
        const wpn = player.weapon;
        const bobY = Math.sin(player.bobPhase) * 6;
        const bobX = Math.cos(player.bobPhase * 0.5) * 3;
        const shootKick = flashTimer > 0 ? (flashTimer / 10) * 20 : 0;
        const cx = W / 2 + bobX;
        const by = groundY - 10 + shootKick - bobY;

        ctx.save();

        if (wpn === 'pistol') {
            // Cañón
            ctx.fillStyle = '#2a2a2a';
            ctx.fillRect(cx + 26, by - 30, 8, 28);
            // Cuerpo
            ctx.fillStyle = '#3c3c3c';
            ctx.fillRect(cx + 8, by - 14, 52, 30);
            // Empuñadura
            ctx.fillStyle = '#2a2a2a';
            ctx.fillRect(cx + 22, by + 10, 22, 22);
            // Detalle
            ctx.fillStyle = '#555';
            ctx.fillRect(cx + 12, by - 10, 36, 6);
            ctx.fillRect(cx + 28, by - 24, 4, 6);
        } else if (wpn === 'shotgun') {
            // Dos cañones
            ctx.fillStyle = '#222';
            ctx.fillRect(cx + 10, by - 40, 9, 38);
            ctx.fillRect(cx + 25, by - 40, 9, 38);
            // Cuerpo
            ctx.fillStyle = '#5a3010';
            ctx.fillRect(cx, by - 14, 70, 26);
            // Culata
            ctx.fillStyle = '#3a2008';
            ctx.fillRect(cx + 48, by - 10, 20, 20);
            ctx.fillStyle = '#888';
            ctx.fillRect(cx + 4, by - 10, 44, 8);
        } else if (wpn === 'rocket') {
            // Tubo
            ctx.fillStyle = '#336633';
            ctx.fillRect(cx - 10, by - 20, 90, 16);
            // Boca
            ctx.fillStyle = '#222';
            ctx.beginPath(); ctx.arc(cx - 10, by - 12, 10, 0, Math.PI * 2); ctx.fill();
            // Agarre
            ctx.fillStyle = '#224422';
            ctx.fillRect(cx + 20, by - 2, 20, 22);
            // Mira
            ctx.fillStyle = '#88aa88';
            ctx.fillRect(cx + 30, by - 30, 4, 12);
        }

        // Flash de disparo
        if (flashTimer > 0) {
            const a = flashTimer / 12;
            const bx = wpn === 'shotgun' ? cx + 17 : cx + 30;
            const grd = ctx.createRadialGradient(bx, by - 38, 0, bx, by - 38, 30 * a);
            grd.addColorStop(0, `rgba(255,230,100,${a})`);
            grd.addColorStop(0.5, `rgba(255,100,0,${a * 0.6})`);
            grd.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = grd;
            ctx.fillRect(bx - 40, by - 80, 80, 60);
        }

        ctx.restore();
    }

    function drawMinimap(ctx, W, H, hudH) {
        const scale = 5;
        const ox = W - MAP_W * scale - 10;
        const oy = 10;
        ctx.globalAlpha = 0.7;
        for (let y = 0; y < MAP_H; y++) {
            for (let x = 0; x < MAP_W; x++) {
                if (MAP[y][x] > 0) {
                    const colors = ['', '#8B2020', '#446688', '#557744'];
                    ctx.fillStyle = colors[MAP[y][x]] || '#555';
                } else {
                    ctx.fillStyle = 'rgba(0,0,0,0.5)';
                }
                ctx.fillRect(ox + x * scale, oy + y * scale, scale - 1, scale - 1);
            }
        }
        // Jugador
        ctx.fillStyle = '#ffff00';
        ctx.fillRect(ox + player.x * scale - 2, oy + player.y * scale - 2, 4, 4);
        // Dirección
        ctx.strokeStyle = '#ffff00';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(ox + player.x * scale, oy + player.y * scale);
        ctx.lineTo(ox + (player.x + Math.cos(player.angle) * 2) * scale,
                   oy + (player.y + Math.sin(player.angle) * 2) * scale);
        ctx.stroke();
        // Enemigos en minimap
        for (const e of enemies) {
            if (!e.alive) continue;
            ctx.fillStyle = '#ff4444';
            ctx.fillRect(ox + e.x * scale - 1.5, oy + e.y * scale - 1.5, 3, 3);
        }
        ctx.globalAlpha = 1;
    }

    // ===== DISPARO JUGADOR =====
    function shoot() {
        if (player.dead) return;
        const wpn = WEAPONS[player.weapon];
        if (shootTimer > 0) return;
        if (player.ammo[wpn.ammoKey] <= 0) {
            addMessage('SIN MUNICIÓN', '#ff4444');
            return;
        }

        player.ammo[wpn.ammoKey]--;
        shootTimer  = wpn.fireRate;
        flashTimer  = 10;
        player.faceAnim = 1;
        player.faceTimer = 10;
        playSound('shoot');

        const FOV = Math.PI / 2.8;

        if (wpn.pellets) {
            // Escopeta: múltiples perdigones
            for (let p = 0; p < wpn.pellets; p++) {
                const spread = (Math.random() - 0.5) * wpn.spread;
                fireRay(player.angle + spread, wpn.damage, false);
            }
        } else if (wpn.splash) {
            // Cohete: proyectil con splash
            const speed = 0.18;
            projectiles.push({
                x: player.x, y: player.y,
                dx: Math.cos(player.angle) * speed,
                dy: Math.sin(player.angle) * speed,
                type: 'rocket', damage: wpn.damage, fromEnemy: false,
                alive: true,
            });
        } else {
            fireRay(player.angle + (Math.random() - 0.5) * wpn.spread, wpn.damage, false);
        }
    }

    function fireRay(angle, damage, fromEnemy) {
        const FOV = Math.PI / 2.8;
        let closestDist = Infinity;
        let closestEnemy = null;

        for (const enemy of enemies) {
            if (!enemy.alive) continue;
            const dx = enemy.x - player.x;
            const dy = enemy.y - player.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > 16) continue;
            const eAngle = Math.atan2(dy, dx);
            let diff = eAngle - angle;
            while (diff >  Math.PI) diff -= 2 * Math.PI;
            while (diff < -Math.PI) diff += 2 * Math.PI;
            if (Math.abs(diff) < 0.18 && dist < closestDist) {
                closestDist = dist;
                closestEnemy = enemy;
            }
        }

        if (closestEnemy) {
            closestEnemy.health -= damage;
            closestEnemy.state = 'pain';
            closestEnemy.stateTimer = 12;
            playSound('hit');
            addBlood(closestEnemy.x + (Math.random()-0.5)*0.5, closestEnemy.y + (Math.random()-0.5)*0.5);
            if (closestEnemy.health <= 0) {
                closestEnemy.alive = false;
                closestEnemy.state = 'dead';
                player.score += ENEMY_DATA[closestEnemy.type].score;
                player.kills++;
                playSound('death');
                addMessage(`+${ENEMY_DATA[closestEnemy.type].score} pts`, '#ffdd00');
                addExplosion(closestEnemy.x, closestEnemy.y, 0.3);
            }
        }
    }

    function addBlood(x, y) {
        bloodSplats.push({ x, y, size: 0.2 + Math.random() * 0.3, alpha: 0.8, decay: 0.005 });
    }

    function addExplosion(x, y, scale = 1) {
        explosions.push({ x, y, timer: 30 * scale, maxTimer: 30 * scale });
        screenFlash.r = 255; screenFlash.g = 150; screenFlash.b = 0;
        screenFlash.a = 0.4; screenFlash.timer = 10;
    }

    function addMessage(text, color) {
        messageQueue.push({ text, timer: 90, color });
    }

    // ===== UPDATE =====
    function update() {
        if (player.dead) {
            if (doomKeys['KeyR']) restartGame();
            return;
        }

        // Movimiento
        const cos = Math.cos(player.angle);
        const sin = Math.sin(player.angle);
        const sp  = player.speed;
        let moving = false;

        if (doomKeys['ArrowUp'] || doomKeys['KeyW']) {
            const nx = player.x + cos * sp, ny = player.y + sin * sp;
            if (canMoveTo(nx, player.y)) player.x = nx;
            if (canMoveTo(player.x, ny)) player.y = ny;
            moving = true;
        }
        if (doomKeys['ArrowDown'] || doomKeys['KeyS']) {
            const nx = player.x - cos * sp, ny = player.y - sin * sp;
            if (canMoveTo(nx, player.y)) player.x = nx;
            if (canMoveTo(player.x, ny)) player.y = ny;
            moving = true;
        }
        // Strafe
        if (doomKeys['KeyA']) {
            const nx = player.x + sin * sp, ny = player.y - cos * sp;
            if (canMoveTo(nx, player.y)) player.x = nx;
            if (canMoveTo(player.x, ny)) player.y = ny;
            moving = true;
        }
        if (doomKeys['KeyD']) {
            const nx = player.x - sin * sp, ny = player.y + cos * sp;
            if (canMoveTo(nx, player.y)) player.x = nx;
            if (canMoveTo(player.x, ny)) player.y = ny;
            moving = true;
        }
        if (doomKeys['ArrowLeft'])  player.angle -= player.rotSpeed;
        if (doomKeys['ArrowRight']) player.angle += player.rotSpeed;

        // Bob y pasos
        if (moving) {
            player.bobPhase += 0.15;
            bobAmount = Math.sin(player.bobPhase) * 3;
            player.stepTimer++;
            if (player.stepTimer % 28 === 0) playSound('step');
        } else {
            player.bobPhase *= 0.9;
        }

        // Disparo
        if (doomKeys['Space'] || doomKeys['ShiftLeft'] || doomKeys['MouseLeft']) shoot();

        // Cambio de arma
        if (doomKeys['Digit1']) { player.weapon = 'pistol';  addMessage('PISTOLA', '#ffaa22'); doomKeys['Digit1'] = false; }
        if (doomKeys['Digit2']) { player.weapon = 'shotgun'; addMessage('ESCOPETA', '#ffaa22'); doomKeys['Digit2'] = false; }
        if (doomKeys['Digit3']) { player.weapon = 'rocket';  addMessage('COHETES', '#ffaa22'); doomKeys['Digit3'] = false; }

        // Timers
        if (shootTimer > 0) shootTimer--;
        if (flashTimer > 0) flashTimer--;
        if (screenFlash.timer > 0) screenFlash.timer--;
        if (player.invincible > 0) player.invincible--;

        // Proyectiles
        for (const proj of projectiles) {
            if (!proj.alive) continue;
            proj.x += proj.dx;
            proj.y += proj.dy;

            if (!canMoveTo(proj.x, proj.y)) {
                proj.alive = false;
                if (proj.type === 'rocket') {
                    addExplosion(proj.x, proj.y, 1.2);
                    // Daño de splash
                    for (const enemy of enemies) {
                        if (!enemy.alive) continue;
                        const dx = enemy.x - proj.x, dy = enemy.y - proj.y;
                        const d = Math.sqrt(dx*dx+dy*dy);
                        if (d < 2) {
                            enemy.health -= proj.damage * (1 - d/2);
                            if (enemy.health <= 0) {
                                enemy.alive = false;
                                player.score += ENEMY_DATA[enemy.type].score;
                                player.kills++;
                                playSound('death');
                            }
                        }
                    }
                }
                continue;
            }

            // Impacto en jugador (proyectiles enemigos)
            if (proj.fromEnemy) {
                const dx = player.x - proj.x, dy = player.y - proj.y;
                if (Math.sqrt(dx*dx+dy*dy) < 0.6) {
                    proj.alive = false;
                    damagePlayer(proj.damage);
                }
            }

            // Impacto en enemigos (cohetes del jugador)
            if (!proj.fromEnemy && proj.type === 'rocket') {
                for (const enemy of enemies) {
                    if (!enemy.alive) continue;
                    const dx = enemy.x - proj.x, dy = enemy.y - proj.y;
                    if (Math.sqrt(dx*dx+dy*dy) < 0.5) {
                        proj.alive = false;
                        addExplosion(proj.x, proj.y);
                        enemy.health -= proj.damage;
                        if (enemy.health <= 0) {
                            enemy.alive = false;
                            player.score += ENEMY_DATA[enemy.type].score;
                            player.kills++;
                            playSound('death');
                        }
                        break;
                    }
                }
            }
        }
        projectiles = projectiles.filter(p => p.alive);

        // Explosiones
        for (const ex of explosions) ex.timer--;
        explosions = explosions.filter(e => e.timer > 0);

        // Items
        for (const item of items) {
            if (!item.alive) continue;
            const dx = player.x - item.x, dy = player.y - item.y;
            if (Math.sqrt(dx*dx+dy*dy) < 0.7) {
                pickupItem(item);
            }
        }

        // IA Enemigos
        for (const enemy of enemies) {
            if (!enemy.alive) continue;
            enemy.animFrame++;

            const dx = player.x - enemy.x, dy = player.y - enemy.y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            const eData = ENEMY_DATA[enemy.type];

            // Estados
            if (enemy.state === 'pain') {
                enemy.stateTimer--;
                if (enemy.stateTimer <= 0) enemy.state = 'chase';
            }

            if (dist < eData.sightRange) {
                if (enemy.state === 'idle') {
                    enemy.state = 'alert';
                    enemy.alertTimer = 30;
                }
            }

            if (enemy.state === 'alert') {
                enemy.alertTimer--;
                if (enemy.alertTimer <= 0) enemy.state = 'chase';
            }

            if (enemy.state === 'chase' || enemy.state === 'attack') {
                // Moverse hacia el jugador
                if (dist > eData.attackRange * 0.8 && dist > 0.7) {
                    const speed = eData.speed;
                    const nx = enemy.x + (dx / dist) * speed;
                    const ny = enemy.y + (dy / dist) * speed;
                    if (canMoveTo(nx, enemy.y)) enemy.x = nx;
                    if (canMoveTo(enemy.x, ny)) enemy.y = ny;
                }

                // Atacar
                enemy.attackTimer++;
                if (enemy.attackTimer >= eData.fireRate) {
                    enemy.attackTimer = 0;
                    if (dist <= eData.attackRange) {
                        if (enemy.type === 'zombie' || enemy.type === 'demon') {
                            // Cuerpo a cuerpo
                            if (dist < 1.2) damagePlayer(eData.attackDmg);
                        } else if (enemy.type === 'imp') {
                            // Proyectil de fuego
                            if (dist < eData.sightRange) {
                                const speed = 0.09;
                                projectiles.push({
                                    x: enemy.x, y: enemy.y,
                                    dx: (dx/dist)*speed + (Math.random()-0.5)*0.02,
                                    dy: (dy/dist)*speed + (Math.random()-0.5)*0.02,
                                    type: 'fireball', damage: eData.attackDmg,
                                    fromEnemy: true, alive: true,
                                });
                            }
                        }
                    }
                }
            }
        }
    }

    function damagePlayer(dmg) {
        if (player.invincible > 0) return;
        const armorAbsorb = Math.min(player.armor, dmg * 0.5);
        player.armor -= armorAbsorb;
        player.health -= (dmg - armorAbsorb);
        player.invincible = 20;
        screenFlash.r = 255; screenFlash.g = 0; screenFlash.b = 0;
        screenFlash.a = 0.4; screenFlash.timer = 12;
        if (player.health <= 0) {
            player.health = 0;
            player.dead = true;
            playSound('death');
        }
    }

    function pickupItem(item) {
        item.alive = false;
        playSound('pickup');
        if (item.type === 'health') {
            player.health = Math.min(100, player.health + item.value);
            addMessage(`+${item.value} SALUD`, '#44ff44');
            screenFlash.r=0; screenFlash.g=255; screenFlash.b=0; screenFlash.a=0.15; screenFlash.timer=8;
        } else if (item.type === 'armor') {
            player.armor = Math.min(100, player.armor + item.value);
            addMessage(`+${item.value} ARMOR`, '#4488ff');
        } else if (item.type === 'ammo') {
            player.ammo[item.ammoKey] += item.value;
            addMessage(`+${item.value} AMMO`, '#ffdd00');
        } else if (item.type === 'shotgun') {
            player.weapon = 'shotgun';
            player.ammo.shotgun += 8;
            addMessage('¡ESCOPETA!', '#ffaa22');
        } else if (item.type === 'rocket') {
            player.weapon = 'rocket';
            player.ammo.rocket += 3;
            addMessage('¡LANZACOHETES!', '#ff6600');
        }
    }

    function restartGame() {
        // Reiniciar estado
        player.health = 100; player.armor = 0;
        player.ammo = { pistol: 50, shotgun: 20, rocket: 5 };
        player.x = 1.5; player.y = 1.5;
        player.angle = Math.PI / 4;
        player.score = 0; player.kills = 0;
        player.dead = false; player.weapon = 'pistol';
        player.invincible = 60;
        deathTimer = 0;

        enemies.forEach(e => {
            e.alive = true;
            e.health = e.maxHealth;
            e.state = 'idle';
            e.stateTimer = 0;
            e.attackTimer = 0;
        });
        items.forEach(i => i.alive = true);
        projectiles = [];
        explosions  = [];
        bloodSplats = [];
        messageQueue = [];
        addMessage('¡INICIA DE NUEVO!', '#ffff00');
    }

    // ===== LOOP PRINCIPAL =====
    function loop() {
        if (!doomRunning) return;
        resizeCanvas();
        update();
        const zBuffer = castRays();
        renderSprites(zBuffer);
        drawHUD();
        doomAnimFrame = requestAnimationFrame(loop);
    }

    // ===== CONTROLES TECLADO =====
    function onKeyDown(e) {
        doomKeys[e.code] = true;
        if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) e.preventDefault();
        if (e.code === 'Escape') { window.closeDoom(); return; }
    }
    function onKeyUp(e) { doomKeys[e.code] = false; }

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup',   onKeyUp);

    // Click para disparar
    canvas.addEventListener('click', () => { doomKeys['MouseLeft'] = true; setTimeout(() => { doomKeys['MouseLeft'] = false; }, 50); });

    // Mouse look
    canvas.addEventListener('mousemove', (e) => {
        if (document.pointerLockElement === canvas) {
            player.angle += e.movementX * 0.003;
        }
    });
    canvas.addEventListener('click', () => { canvas.requestPointerLock && canvas.requestPointerLock(); });

    window._doomCleanup = () => {
        document.removeEventListener('keydown', onKeyDown);
        document.removeEventListener('keyup',   onKeyUp);
        window.removeEventListener('resize', resizeCanvas);
        if (document.exitPointerLock) document.exitPointerLock();
    };

    // ===== CONTROLES TÁCTILES MEJORADOS =====
    const overlay = document.getElementById('doom-overlay');
    let touchBar  = document.getElementById('doom-touch-controls');
    if (touchBar) touchBar.remove();

    touchBar = document.createElement('div');
    touchBar.id = 'doom-touch-controls';
    touchBar.innerHTML = `
        <div class="doom-touch-left">
            <div class="doom-touch-row">
                <div></div>
                <button class="doom-touch-btn" data-key="ArrowUp">▲</button>
                <div></div>
            </div>
            <div class="doom-touch-row">
                <button class="doom-touch-btn" data-key="KeyA">◄</button>
                <button class="doom-touch-btn" data-key="ArrowDown">▼</button>
                <button class="doom-touch-btn" data-key="KeyD">►</button>
            </div>
        </div>
        <div class="doom-touch-right">
            <div class="doom-touch-row">
                <button class="doom-touch-btn" data-key="ArrowLeft">↺</button>
                <button class="doom-touch-btn doom-fire-btn" data-key="Space">💥</button>
                <button class="doom-touch-btn" data-key="ArrowRight">↻</button>
            </div>
        </div>
    `;
    overlay.appendChild(touchBar);

    touchBar.querySelectorAll('.doom-touch-btn').forEach(btn => {
        const key = btn.dataset.key;
        btn.addEventListener('touchstart', e => { e.preventDefault(); doomKeys[key] = true;  }, { passive: false });
        btn.addEventListener('touchend',   e => { e.preventDefault(); doomKeys[key] = false; }, { passive: false });
        btn.addEventListener('mousedown',  () => doomKeys[key] = true);
        btn.addEventListener('mouseup',    () => doomKeys[key] = false);
    });

    addMessage('¡DOOM 1993!', '#ff3b3b');
    addMessage('[1] Pistola [2] Escopeta [3] Cohetes', '#ffaa00');
    addMessage('WASD=Mover  ←→=Girar  ESPACIO=Disparar', '#aaaaaa');
    loop();
}

function stopDoom() {
    doomRunning = false;
    if (doomAnimFrame) cancelAnimationFrame(doomAnimFrame);
    doomAnimFrame = null;
    doomKeys = {};

    if (typeof window._doomCleanup === 'function') {
        window._doomCleanup();
        window._doomCleanup = null;
    }

    const tc = document.getElementById('doom-touch-controls');
    if (tc) tc.remove();

    const canvas = document.getElementById('doom-canvas');
    if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
}

window.openDoom = () => {
    const overlay = document.getElementById('doom-overlay');
    if (overlay) overlay.style.display = 'flex';
    requestAnimationFrame(() => requestAnimationFrame(() => {
        if (typeof startDoom === 'function') startDoom();
    }));
};

window.closeDoom = () => {
    const overlay = document.getElementById('doom-overlay');
    if (overlay) overlay.style.display = 'none';
    if (typeof stopDoom === 'function') stopDoom();
};
