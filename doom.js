// ===== DOOM RAYCASTER ENGINE =====
// Motor de raycasting inspirado en Doom (1993) — completamente en canvas

let doomRunning = false;
let doomAnimFrame = null;
let doomKeys = {};

function startDoom() {
    doomRunning = true;
    doomKeys = {};

    const canvas = document.getElementById("doom-canvas");
    if (!canvas) return;

    const ctx = canvas.getContext("2d");

    // Ajustar tamaño del canvas — importante: llamar DESPUÉS de que el overlay sea visible
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

    // ===== MAPA (1 = pared, 0 = pasillo) =====
    const MAP = [
        [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
        [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
        [1,0,1,1,0,1,1,1,0,1,1,1,0,1,0,1],
        [1,0,1,0,0,0,0,1,0,1,0,0,0,1,0,1],
        [1,0,0,0,1,0,0,0,0,0,0,1,0,0,0,1],
        [1,0,1,0,1,0,1,1,1,1,0,1,0,1,0,1],
        [1,0,1,0,0,0,0,0,0,0,0,0,0,1,0,1],
        [1,0,1,1,1,1,0,1,1,0,1,1,1,1,0,1],
        [1,0,0,0,0,0,0,1,1,0,0,0,0,0,0,1],
        [1,0,1,1,1,1,0,1,1,0,1,1,1,1,0,1],
        [1,0,1,0,0,0,0,0,0,0,0,0,0,1,0,1],
        [1,0,1,0,1,0,1,1,1,1,0,1,0,1,0,1],
        [1,0,0,0,1,0,0,0,0,0,0,1,0,0,0,1],
        [1,0,1,0,0,0,0,1,0,1,0,0,0,1,0,1],
        [1,0,1,1,0,1,1,1,0,1,1,1,0,1,0,1],
        [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
        [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
    ];
    const MAP_W = MAP[0].length;
    const MAP_H = MAP.length;

    // ===== JUGADOR =====
    let player = {
        x: 1.5, y: 1.5,
        angle: 0,
        speed: 0.05,
        rotSpeed: 0.04,
        health: 100,
        ammo: 50,
        score: 0,
    };

    // ===== ENEMIGOS =====
    let enemies = [
        { x: 8.5,  y: 4.5,  alive: true, health: 3, angle: 0 },
        { x: 4.5,  y: 8.5,  alive: true, health: 3, angle: 0 },
        { x: 12.5, y: 8.5,  alive: true, health: 3, angle: 0 },
        { x: 8.5,  y: 12.5, alive: true, health: 3, angle: 0 },
        { x: 3.5,  y: 12.5, alive: true, health: 2, angle: 0 },
        { x: 13.5, y: 3.5,  alive: true, health: 2, angle: 0 },
    ];

    // ===== DISPAROS =====
    let shooting    = false;
    let shootTimer  = 0;
    let flashTimer  = 0;

    // ===== RAYCASTING =====
    function castRays() {
        const W     = canvas.width;
        const H     = canvas.height;
        const FOV   = Math.PI / 3;
        const halfH = H / 2;

        // Cielo
        const skyGrad = ctx.createLinearGradient(0, 0, 0, halfH);
        skyGrad.addColorStop(0, "#080000");
        skyGrad.addColorStop(1, "#1a0000");
        ctx.fillStyle = skyGrad;
        ctx.fillRect(0, 0, W, halfH);

        // Suelo
        const floorGrad = ctx.createLinearGradient(0, halfH, 0, H);
        floorGrad.addColorStop(0, "#1a0000");
        floorGrad.addColorStop(1, "#040000");
        ctx.fillStyle = floorGrad;
        ctx.fillRect(0, halfH, W, halfH);

        const zBuffer = new Float32Array(W);

        for (let i = 0; i < W; i++) {
            const rayAngle = player.angle - FOV / 2 + (i / W) * FOV;
            const cosA = Math.cos(rayAngle);
            const sinA = Math.sin(rayAngle);

            // DDA algorithm
            const deltaDistX = Math.abs(1 / cosA);
            const deltaDistY = Math.abs(1 / sinA);

            let mapX = Math.floor(player.x);
            let mapY = Math.floor(player.y);

            let stepX, stepY, sideDistX, sideDistY;

            if (cosA < 0) { stepX = -1; sideDistX = (player.x - mapX) * deltaDistX; }
            else          { stepX =  1; sideDistX = (mapX + 1.0 - player.x) * deltaDistX; }

            if (sinA < 0) { stepY = -1; sideDistY = (player.y - mapY) * deltaDistY; }
            else          { stepY =  1; sideDistY = (mapY + 1.0 - player.y) * deltaDistY; }

            let hit  = false;
            let side = 0;
            let dist = 0;

            for (let depth = 0; depth < 32; depth++) {
                if (sideDistX < sideDistY) {
                    sideDistX += deltaDistX;
                    mapX      += stepX;
                    side       = 0;
                } else {
                    sideDistY += deltaDistY;
                    mapY      += stepY;
                    side       = 1;
                }
                if (mapY >= 0 && mapY < MAP_H && mapX >= 0 && mapX < MAP_W && MAP[mapY][mapX] > 0) {
                    hit = true;
                    // Corrección de ojo de pez
                    dist = side === 0
                        ? (mapX - player.x + (1 - stepX) / 2) / cosA
                        : (mapY - player.y + (1 - stepY) / 2) / sinA;
                    break;
                }
            }

            if (!hit || dist <= 0) { zBuffer[i] = 999; continue; }

            zBuffer[i] = dist;

            // ── CALCULAR altura ANTES de usarla ──
            const wallH      = H / dist;
            const wallTop    = Math.max(0, halfH - wallH / 2);
            const wallBottom = Math.min(H, halfH + wallH / 2);
            const wallHeight = wallBottom - wallTop;   // declarada AQUÍ ✓

            // Sombreado: paredes laterales más oscuras + niebla por distancia
            const shade = side === 1 ? 0.55 : 1.0;
            const fog   = Math.max(0, 1 - dist / 14);
            const r     = Math.floor(160 * shade * fog);

            // Degradado vertical para dar sensación de textura
            const gradient = ctx.createLinearGradient(i, wallTop, i, wallBottom);
            gradient.addColorStop(0,   `rgb(${Math.floor(r * 0.35)},0,0)`);
            gradient.addColorStop(0.25,`rgb(${r},0,0)`);
            gradient.addColorStop(0.75,`rgb(${r},0,0)`);
            gradient.addColorStop(1,   `rgb(${Math.floor(r * 0.35)},0,0)`);

            ctx.fillStyle = gradient;
            ctx.fillRect(i, wallTop, 1, wallHeight);   // ← usa wallHeight ✓
        }

        return zBuffer;
    }

    // ===== RENDERIZAR ENEMIGOS (sprites) =====
    function renderEnemies(zBuffer) {
        const W   = canvas.width;
        const H   = canvas.height;
        const FOV = Math.PI / 3;

        const living = enemies.filter(e => e.alive);

        // Ordenar por distancia (más lejanos primero)
        living.sort((a, b) => {
            const dA = (a.x - player.x) ** 2 + (a.y - player.y) ** 2;
            const dB = (b.x - player.x) ** 2 + (b.y - player.y) ** 2;
            return dB - dA;
        });

        for (const enemy of living) {
            const dx   = enemy.x - player.x;
            const dy   = enemy.y - player.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            const enemyAngle = Math.atan2(dy, dx);
            let angleDiff    = enemyAngle - player.angle;
            while (angleDiff >  Math.PI) angleDiff -= 2 * Math.PI;
            while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

            if (Math.abs(angleDiff) > FOV * 0.7) continue;

            const screenX  = Math.floor((0.5 + angleDiff / FOV) * W);
            const spriteH  = Math.min(H * 1.2, H / dist);
            const spriteW  = spriteH * 0.6;
            const spriteTop = H / 2 - spriteH / 2;

            const startX = screenX - spriteW / 2;
            const endX   = screenX + spriteW / 2;

            const fog   = Math.max(0, 1 - dist / 12);
            const alpha = fog * 0.9;

            for (let x = Math.floor(startX); x < Math.ceil(endX); x++) {
                if (x < 0 || x >= W) continue;
                if (zBuffer[x] < dist) continue;

                const tx = (x - startX) / spriteW;

                // Cabeza
                if (tx > 0.25 && tx < 0.75) {
                    ctx.fillStyle = `rgba(190,60,60,${alpha})`;
                    ctx.fillRect(x, spriteTop, 1, spriteH * 0.25);
                }
                // Cuerpo
                ctx.fillStyle = `rgba(120,30,30,${alpha})`;
                ctx.fillRect(x, spriteTop + spriteH * 0.25, 1, spriteH * 0.6);

                // Ojos
                if (tx > 0.3 && tx < 0.45) {
                    ctx.fillStyle = `rgba(255,50,50,${alpha})`;
                    ctx.fillRect(x, spriteTop + spriteH * 0.08, 1, spriteH * 0.07);
                }
                if (tx > 0.55 && tx < 0.7) {
                    ctx.fillStyle = `rgba(255,50,50,${alpha})`;
                    ctx.fillRect(x, spriteTop + spriteH * 0.08, 1, spriteH * 0.07);
                }
            }
        }
    }

    // ===== HUD =====
    function drawHUD() {
        const W = canvas.width;
        const H = canvas.height;

        // Fondo HUD
        ctx.fillStyle = "rgba(0,0,0,0.72)";
        ctx.fillRect(0, H - 60, W, 60);
        ctx.strokeStyle = "#8B0000";
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, H - 60); ctx.lineTo(W, H - 60); ctx.stroke();

        ctx.font = "bold 14px 'Courier New', monospace";

        // Salud
        const hpColor = player.health > 50 ? "#ff3b3b" : player.health > 25 ? "#ff8800" : "#ff0000";
        ctx.fillStyle = hpColor;
        ctx.fillText(`\u2665 ${player.health}%`, 20, H - 30);

        // Munición
        ctx.fillStyle = "#ffaa00";
        ctx.fillText(`AMMO: ${player.ammo}`, W / 2 - 40, H - 30);

        // Puntuación
        ctx.fillStyle = "#ff7070";
        ctx.fillText(`SCORE: ${player.score}`, W - 120, H - 30);

        // Mira central
        ctx.strokeStyle = "rgba(255,59,59,0.85)";
        ctx.lineWidth = 1.5;
        const cx = W / 2, cy = H / 2;
        const s  = 12;
        ctx.beginPath();
        ctx.moveTo(cx - s, cy); ctx.lineTo(cx - 4, cy);
        ctx.moveTo(cx + 4, cy); ctx.lineTo(cx + s, cy);
        ctx.moveTo(cx, cy - s); ctx.lineTo(cx, cy - 4);
        ctx.moveTo(cx, cy + 4); ctx.lineTo(cx, cy + s);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(255,59,59,0.6)";
        ctx.stroke();

        // Arma
        const gunOffsetY = shooting ? -18 : 0;
        const gunX = W / 2 - 40;
        const gunY = H - 115 + gunOffsetY;

        ctx.fillStyle = "#2a2a2a";
        ctx.fillRect(gunX + 32, gunY,      6,  22); // cañón
        ctx.fillStyle = "#3c3c3c";
        ctx.fillRect(gunX + 14, gunY + 18, 44, 28); // cuerpo
        ctx.fillStyle = "#2a2a2a";
        ctx.fillRect(gunX + 24, gunY + 42, 22, 18); // empuñadura
        ctx.fillStyle = "#555";
        ctx.fillRect(gunX + 18, gunY + 20, 30, 5);  // detalle

        // Flash de disparo
        if (flashTimer > 0) {
            const alpha = flashTimer / 8;
            const radius = 22 * alpha;
            const grad = ctx.createRadialGradient(gunX + 35, gunY - 2, 0, gunX + 35, gunY - 2, radius);
            grad.addColorStop(0, `rgba(255,220,80,${alpha})`);
            grad.addColorStop(1, "rgba(255,80,0,0)");
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(gunX + 35, gunY - 2, radius, 0, Math.PI * 2);
            ctx.fill();
        }

        // ── Mensajes de victoria / derrota ──
        const aliveEnemies = enemies.filter(e => e.alive).length;

        if (aliveEnemies === 0) {
            ctx.fillStyle = "rgba(0,0,0,0.55)";
            ctx.fillRect(W / 2 - 160, H / 2 - 55, 320, 90);
            ctx.fillStyle = "#ff3b3b";
            ctx.font      = "bold 30px 'Courier New'";
            ctx.textAlign = "center";
            ctx.fillText("\u00a1VICTORIA!", W / 2, H / 2);
            ctx.font      = "14px 'Courier New'";
            ctx.fillStyle = "#aaa";
            ctx.fillText("Todos los enemigos eliminados", W / 2, H / 2 + 30);
            ctx.textAlign = "left";
        }

        if (player.health <= 0) {
            ctx.fillStyle = "rgba(140,0,0,0.65)";
            ctx.fillRect(0, 0, W, H);
            ctx.fillStyle = "#ff0000";
            ctx.font      = "bold 42px 'Courier New'";
            ctx.textAlign = "center";
            ctx.fillText("HAS MUERTO", W / 2, H / 2);
            ctx.font      = "16px 'Courier New'";
            ctx.fillStyle = "#ccc";
            ctx.fillText("Cerra el juego y volvé a intentarlo", W / 2, H / 2 + 44);
            ctx.textAlign = "left";
        }
    }

    // ===== MOVIMIENTO Y FÍSICA =====
    function update() {
        if (player.health <= 0) return;

        const cos = Math.cos(player.angle);
        const sin = Math.sin(player.angle);
        const sp  = player.speed;

        if (doomKeys["ArrowUp"]    || doomKeys["KeyW"]) {
            const nx = player.x + cos * sp;
            const ny = player.y + sin * sp;
            if (MAP[Math.floor(player.y)][Math.floor(nx)] === 0) player.x = nx;
            if (MAP[Math.floor(ny)][Math.floor(player.x)] === 0) player.y = ny;
        }
        if (doomKeys["ArrowDown"]  || doomKeys["KeyS"]) {
            const nx = player.x - cos * sp;
            const ny = player.y - sin * sp;
            if (MAP[Math.floor(player.y)][Math.floor(nx)] === 0) player.x = nx;
            if (MAP[Math.floor(ny)][Math.floor(player.x)] === 0) player.y = ny;
        }
        if (doomKeys["ArrowLeft"]  || doomKeys["KeyA"]) player.angle -= player.rotSpeed;
        if (doomKeys["ArrowRight"] || doomKeys["KeyD"]) player.angle += player.rotSpeed;

        // Disparo
        if (doomKeys["Space"] || doomKeys["ShiftLeft"]) {
            if (shootTimer <= 0 && player.ammo > 0) {
                shooting   = true;
                flashTimer = 8;
                shootTimer = 15;
                player.ammo--;

                for (const enemy of enemies) {
                    if (!enemy.alive) continue;
                    const dx   = enemy.x - player.x;
                    const dy   = enemy.y - player.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist > 9) continue;

                    const eAngle = Math.atan2(dy, dx);
                    let diff     = eAngle - player.angle;
                    while (diff >  Math.PI) diff -= 2 * Math.PI;
                    while (diff < -Math.PI) diff += 2 * Math.PI;

                    if (Math.abs(diff) < 0.28) {
                        enemy.health--;
                        if (enemy.health <= 0) {
                            enemy.alive  = false;
                            player.score += 100;
                        }
                        break;
                    }
                }
            }
        }

        if (shootTimer > 0)  shootTimer--;
        if (flashTimer > 0) { flashTimer--; } else { shooting = false; }

        // IA enemigos
        for (const enemy of enemies) {
            if (!enemy.alive) continue;
            const dx   = player.x - enemy.x;
            const dy   = player.y - enemy.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < 6 && dist > 0.65) {
                const speed = 0.009;
                const nx = enemy.x + (dx / dist) * speed;
                const ny = enemy.y + (dy / dist) * speed;
                if (MAP[Math.floor(enemy.y)][Math.floor(nx)] === 0) enemy.x = nx;
                if (MAP[Math.floor(ny)][Math.floor(enemy.x)] === 0) enemy.y = ny;
            }
            if (dist < 0.7 && Math.random() < 0.012) {
                player.health = Math.max(0, player.health - 2);
            }
        }
    }

    // ===== LOOP PRINCIPAL =====
    function loop() {
        if (!doomRunning) return;
        resizeCanvas();
        update();
        const zBuffer = castRays();
        renderEnemies(zBuffer);
        drawHUD();
        doomAnimFrame = requestAnimationFrame(loop);
    }

    // ===== CONTROLES =====
    function onKeyDown(e) {
        doomKeys[e.code] = true;
        if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Space"].includes(e.code)) {
            e.preventDefault();
        }
    }
    function onKeyUp(e) { doomKeys[e.code] = false; }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup",   onKeyUp);

    window._doomCleanup = () => {
        document.removeEventListener("keydown", onKeyDown);
        document.removeEventListener("keyup",   onKeyUp);
        window.removeEventListener("resize", resizeCanvas);
    };

    // ===== CONTROLES TÁCTILES =====
    const overlay = document.getElementById("doom-overlay");
    let touchBar = document.getElementById("doom-touch-controls");
    if (!touchBar) {
        touchBar = document.createElement("div");
        touchBar.id = "doom-touch-controls";
        touchBar.innerHTML = `
            <div class="doom-touch-row">
                <button class="doom-touch-btn" data-key="ArrowLeft">&#9664;</button>
                <div class="doom-touch-col">
                    <button class="doom-touch-btn" data-key="ArrowUp">&#9650;</button>
                    <button class="doom-touch-btn" data-key="ArrowDown">&#9660;</button>
                </div>
                <button class="doom-touch-btn" data-key="ArrowRight">&#9654;</button>
                <button class="doom-touch-btn doom-fire-btn" data-key="Space">&#128299;</button>
            </div>
        `;
        overlay.appendChild(touchBar);
    }

    touchBar.querySelectorAll(".doom-touch-btn").forEach(btn => {
        const key = btn.dataset.key;
        btn.addEventListener("touchstart", e => { e.preventDefault(); doomKeys[key] = true;  }, { passive: false });
        btn.addEventListener("touchend",   e => { e.preventDefault(); doomKeys[key] = false; }, { passive: false });
        btn.addEventListener("mousedown",  () => { doomKeys[key] = true;  });
        btn.addEventListener("mouseup",    () => { doomKeys[key] = false; });
    });

    loop();
}

function stopDoom() {
    doomRunning = false;
    if (doomAnimFrame) cancelAnimationFrame(doomAnimFrame);
    doomAnimFrame = null;
    doomKeys = {};

    if (typeof window._doomCleanup === "function") {
        window._doomCleanup();
        window._doomCleanup = null;
    }

    const tc = document.getElementById("doom-touch-controls");
    if (tc) tc.remove();

    const canvas = document.getElementById("doom-canvas");
    if (canvas) {
        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
}

// Exponemos en window para que main.js los use
window.openDoom = () => {
    const overlay = document.getElementById("doom-overlay");
    if (overlay) overlay.style.display = "flex";
    // Esperar un frame para que el browser pinte el overlay y el canvas tenga dimensiones
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            if (typeof startDoom === "function") startDoom();
        });
    });
};

window.closeDoom = () => {
    const overlay = document.getElementById("doom-overlay");
    if (overlay) overlay.style.display = "none";
    if (typeof stopDoom === "function") stopDoom();
};
