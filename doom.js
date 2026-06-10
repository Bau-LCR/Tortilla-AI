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

    // Ajustar tamaño del canvas
    function resizeCanvas() {
        canvas.width  = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;
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
        speed: 0.04,
        rotSpeed: 0.035,
        health: 100,
        ammo: 50,
        score: 0,
    };

    // ===== ENEMIGOS =====
    let enemies = [
        { x: 8.5, y: 4.5, alive: true, health: 3, angle: 0 },
        { x: 4.5, y: 8.5, alive: true, health: 3, angle: 0 },
        { x: 12.5, y: 8.5, alive: true, health: 3, angle: 0 },
        { x: 8.5, y: 12.5, alive: true, health: 3, angle: 0 },
        { x: 3.5, y: 12.5, alive: true, health: 2, angle: 0 },
        { x: 13.5, y: 3.5, alive: true, health: 2, angle: 0 },
    ];

    // ===== DISPAROS =====
    let shooting = false;
    let shootTimer = 0;
    let gunFrame = 0;
    let flashTimer = 0;

    // ===== COLORES DE PAREDES =====
    const WALL_COLORS = [
        null,                          // 0 = vacío
        { h: "#8B0000", l: "#5C0000" }, // 1 = rojo oscuro
    ];

    // ===== RAYCASTING =====
    function castRays() {
        const W = canvas.width;
        const H = canvas.height;
        const FOV = Math.PI / 3;
        const numRays = W;
        const halfH = H / 2;

        // Cielo
        const skyGrad = ctx.createLinearGradient(0, 0, 0, halfH);
        skyGrad.addColorStop(0, "#0a0000");
        skyGrad.addColorStop(1, "#1a0000");
        ctx.fillStyle = skyGrad;
        ctx.fillRect(0, 0, W, halfH);

        // Suelo
        const floorGrad = ctx.createLinearGradient(0, halfH, 0, H);
        floorGrad.addColorStop(0, "#1a0000");
        floorGrad.addColorStop(1, "#050000");
        ctx.fillStyle = floorGrad;
        ctx.fillRect(0, halfH, W, halfH);

        const zBuffer = new Float32Array(numRays);

        for (let i = 0; i < numRays; i++) {
            const rayAngle = player.angle - FOV / 2 + (i / numRays) * FOV;
            const cos = Math.cos(rayAngle);
            const sin = Math.sin(rayAngle);

            let x = player.x;
            let y = player.y;
            let dist = 0;
            let hit = false;
            let side = 0; // 0=horizontal, 1=vertical

            // DDA algorithm
            const deltaDistX = Math.abs(1 / cos);
            const deltaDistY = Math.abs(1 / sin);
            let mapX = Math.floor(x);
            let mapY = Math.floor(y);
            let stepX, stepY, sideDistX, sideDistY;

            if (cos < 0) { stepX = -1; sideDistX = (x - mapX) * deltaDistX; }
            else         { stepX =  1; sideDistX = (mapX + 1.0 - x) * deltaDistX; }
            if (sin < 0) { stepY = -1; sideDistY = (y - mapY) * deltaDistY; }
            else         { stepY =  1; sideDistY = (mapY + 1.0 - y) * deltaDistY; }

            for (let depth = 0; depth < 32; depth++) {
                if (sideDistX < sideDistY) {
                    sideDistX += deltaDistX; mapX += stepX; side = 0;
                } else {
                    sideDistY += deltaDistY; mapY += stepY; side = 1;
                }
                if (mapY >= 0 && mapY < MAP_H && mapX >= 0 && mapX < MAP_W && MAP[mapY][mapX] > 0) {
                    hit = true;
                    dist = side === 0
                        ? (mapX - x + (1 - stepX) / 2) / cos
                        : (mapY - y + (1 - stepY) / 2) / sin;
                    break;
                }
            }

            if (!hit) { zBuffer[i] = 999; continue; }

            zBuffer[i] = dist;

            const wallH = Math.min(H, H / dist);
            const wallTop    = halfH - wallH / 2;
            const wallBottom = halfH + wallH / 2;

            // Oscurecer paredes laterales
            const shade = side === 1 ? 0.6 : 1.0;
            const fog   = Math.max(0, 1 - dist / 12);
            const rBase = side === 1 ? 100 : 139;
            const r = Math.floor(rBase * shade * fog);
            const g = 0;
            const b = 0;

            // Efecto de textura (variación vertical de color)
            const gradient = ctx.createLinearGradient(i, wallTop, i, wallBottom);
            gradient.addColorStop(0,   `rgb(${Math.floor(r*0.4)},0,0)`);
            gradient.addColorStop(0.3, `rgb(${r},${g},${b})`);
            gradient.addColorStop(0.7, `rgb(${r},${g},${b})`);
            gradient.addColorStop(1,   `rgb(${Math.floor(r*0.4)},0,0)`);

            ctx.fillStyle = gradient;
            ctx.fillRect(i, wallTop, 1, wallHeight || wallH);

            // Línea de pared para dar efecto pixel
            const wallHeight = wallBottom - wallTop;
            ctx.fillRect(i, wallTop, 1, wallHeight);
        }

        return zBuffer;
    }

    // ===== RENDERIZAR ENEMIGOS (sprites) =====
    function renderEnemies(zBuffer) {
        const W = canvas.width;
        const H = canvas.height;
        const FOV = Math.PI / 3;

        const living = enemies.filter(e => e.alive);

        // Ordenar por distancia (los más lejanos primero)
        living.sort((a, b) => {
            const dA = (a.x - player.x)**2 + (a.y - player.y)**2;
            const dB = (b.x - player.x)**2 + (b.y - player.y)**2;
            return dB - dA;
        });

        for (const enemy of living) {
            const dx = enemy.x - player.x;
            const dy = enemy.y - player.y;
            const dist = Math.sqrt(dx*dx + dy*dy);

            const enemyAngle = Math.atan2(dy, dx);
            let angleDiff = enemyAngle - player.angle;
            while (angleDiff > Math.PI) angleDiff -= 2*Math.PI;
            while (angleDiff < -Math.PI) angleDiff += 2*Math.PI;

            if (Math.abs(angleDiff) > FOV / 1.5) continue;

            const screenX = Math.floor((0.5 + angleDiff / FOV) * W);
            const spriteH = Math.min(H * 1.2, H / dist);
            const spriteW = spriteH * 0.6;
            const spriteTop = H/2 - spriteH/2;

            const startX = screenX - spriteW/2;
            const endX   = screenX + spriteW/2;

            // Dibujar sprite del enemigo (figura estilizada)
            for (let x = Math.floor(startX); x < Math.ceil(endX); x++) {
                if (x < 0 || x >= W) continue;
                if (zBuffer[x] < dist) continue; // Detrás de una pared

                const tx = (x - startX) / spriteW;

                // Cuerpo (cuadrado rojo oscuro)
                const bodyTop    = spriteTop + spriteH * 0.2;
                const bodyBottom = spriteTop + spriteH * 0.85;
                const fog = Math.max(0, 1 - dist / 12);
                const alpha = fog * 0.9;

                // Cabeza
                if (tx > 0.25 && tx < 0.75) {
                    const headTop    = spriteTop;
                    const headBottom = spriteTop + spriteH * 0.25;
                    ctx.fillStyle = `rgba(180,60,60,${alpha})`;
                    ctx.fillRect(x, headTop, 1, headBottom - headTop);
                }
                // Cuerpo
                ctx.fillStyle = `rgba(120,30,30,${alpha})`;
                ctx.fillRect(x, bodyTop, 1, bodyBottom - bodyTop);
                // Ojos (destellos)
                if (tx > 0.3 && tx < 0.45) {
                    const eyeY = spriteTop + spriteH * 0.1;
                    ctx.fillStyle = `rgba(255,50,50,${alpha})`;
                    ctx.fillRect(x, eyeY, 1, spriteH * 0.06);
                }
                if (tx > 0.55 && tx < 0.7) {
                    const eyeY = spriteTop + spriteH * 0.1;
                    ctx.fillStyle = `rgba(255,50,50,${alpha})`;
                    ctx.fillRect(x, eyeY, 1, spriteH * 0.06);
                }
            }
        }
    }

    // ===== HUD =====
    function drawHUD() {
        const W = canvas.width;
        const H = canvas.height;

        // Fondo HUD
        ctx.fillStyle = "rgba(0,0,0,0.7)";
        ctx.fillRect(0, H - 60, W, 60);
        ctx.strokeStyle = "#8B0000";
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, H-60); ctx.lineTo(W, H-60); ctx.stroke();

        ctx.font = "bold 14px 'Courier New', monospace";

        // Salud
        const hpColor = player.health > 50 ? "#ff3b3b" : player.health > 25 ? "#ff8800" : "#ff0000";
        ctx.fillStyle = hpColor;
        ctx.fillText(`❤ ${player.health}%`, 20, H - 30);

        // Munición
        ctx.fillStyle = "#ffaa00";
        ctx.fillText(`🔫 ${player.ammo}`, W/2 - 30, H - 30);

        // Puntuación
        ctx.fillStyle = "#ff7070";
        ctx.fillText(`★ ${player.score}`, W - 100, H - 30);

        // Mira
        ctx.strokeStyle = "rgba(255,59,59,0.8)";
        ctx.lineWidth = 1.5;
        const cx = W/2, cy = H/2;
        const s = 10;
        ctx.beginPath();
        ctx.moveTo(cx-s, cy); ctx.lineTo(cx+s, cy);
        ctx.moveTo(cx, cy-s); ctx.lineTo(cx, cy+s);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx, cy, 4, 0, Math.PI*2);
        ctx.stroke();

        // Arma (pistola estilizada)
        const gunX = W/2 - 40;
        const gunY = H - 120 - (shooting ? 15 : 0);
        const gW = 80, gH = 60;

        // Cañón
        ctx.fillStyle = "#333";
        ctx.fillRect(gunX + 30, gunY, 8, 20);
        // Cuerpo del arma
        ctx.fillStyle = "#444";
        ctx.fillRect(gunX + 15, gunY + 15, 40, 30);
        // Empuñadura
        ctx.fillStyle = "#333";
        ctx.fillRect(gunX + 25, gunY + 40, 20, 20);
        // Detalles
        ctx.fillStyle = "#666";
        ctx.fillRect(gunX + 20, gunY + 18, 25, 5);

        // Flash del disparo
        if (flashTimer > 0) {
            ctx.fillStyle = `rgba(255,200,50,${flashTimer / 8})`;
            ctx.beginPath();
            ctx.arc(gunX + 34, gunY - 5, 18 * (flashTimer/8), 0, Math.PI*2);
            ctx.fill();
        }

        // Mensaje de victoria / derrota
        const aliveEnemies = enemies.filter(e => e.alive).length;
        if (aliveEnemies === 0) {
            ctx.fillStyle = "rgba(0,0,0,0.5)";
            ctx.fillRect(W/2 - 150, H/2 - 50, 300, 80);
            ctx.fillStyle = "#ff3b3b";
            ctx.font = "bold 28px 'Courier New'";
            ctx.textAlign = "center";
            ctx.fillText("¡VICTORIA!", W/2, H/2);
            ctx.font = "14px 'Courier New'";
            ctx.fillStyle = "#aaa";
            ctx.fillText("Todos los enemigos eliminados", W/2, H/2 + 28);
            ctx.textAlign = "left";
        }
        if (player.health <= 0) {
            ctx.fillStyle = "rgba(150,0,0,0.6)";
            ctx.fillRect(0, 0, W, H);
            ctx.fillStyle = "#ff0000";
            ctx.font = "bold 40px 'Courier New'";
            ctx.textAlign = "center";
            ctx.fillText("HAS MUERTO", W/2, H/2);
            ctx.font = "16px 'Courier New'";
            ctx.fillStyle = "#aaa";
            ctx.fillText("Recargá la página o cerrá el juego", W/2, H/2 + 40);
            ctx.textAlign = "left";
        }
    }

    // ===== MOVIMIENTO =====
    function update() {
        if (player.health <= 0) return;

        const cos = Math.cos(player.angle);
        const sin = Math.sin(player.angle);
        const sp  = player.speed;

        if (doomKeys["ArrowUp"] || doomKeys["KeyW"]) {
            const nx = player.x + cos * sp;
            const ny = player.y + sin * sp;
            if (MAP[Math.floor(player.y)][Math.floor(nx)] === 0) player.x = nx;
            if (MAP[Math.floor(ny)][Math.floor(player.x)] === 0) player.y = ny;
        }
        if (doomKeys["ArrowDown"] || doomKeys["KeyS"]) {
            const nx = player.x - cos * sp;
            const ny = player.y - sin * sp;
            if (MAP[Math.floor(player.y)][Math.floor(nx)] === 0) player.x = nx;
            if (MAP[Math.floor(ny)][Math.floor(player.x)] === 0) player.y = ny;
        }
        if (doomKeys["ArrowLeft"] || doomKeys["KeyA"]) {
            player.angle -= player.rotSpeed;
        }
        if (doomKeys["ArrowRight"] || doomKeys["KeyD"]) {
            player.angle += player.rotSpeed;
        }

        // Disparo
        if (doomKeys["Space"] || doomKeys["ShiftLeft"]) {
            if (shootTimer <= 0 && player.ammo > 0) {
                shooting = true;
                flashTimer = 8;
                shootTimer = 15;
                player.ammo--;

                // Detectar impacto en enemigos
                for (const enemy of enemies) {
                    if (!enemy.alive) continue;
                    const dx = enemy.x - player.x;
                    const dy = enemy.y - player.y;
                    const dist = Math.sqrt(dx*dx + dy*dy);
                    if (dist > 8) continue;

                    const enemyAngle = Math.atan2(dy, dx);
                    let diff = enemyAngle - player.angle;
                    while (diff > Math.PI) diff -= 2*Math.PI;
                    while (diff < -Math.PI) diff += 2*Math.PI;

                    if (Math.abs(diff) < 0.25) {
                        enemy.health--;
                        if (enemy.health <= 0) {
                            enemy.alive = false;
                            player.score += 100;
                        }
                        break;
                    }
                }
            }
        }

        if (shootTimer > 0) shootTimer--;
        if (flashTimer > 0) { flashTimer--; } else { shooting = false; }

        // IA básica de enemigos
        for (const enemy of enemies) {
            if (!enemy.alive) continue;
            const dx = player.x - enemy.x;
            const dy = player.y - enemy.y;
            const dist = Math.sqrt(dx*dx + dy*dy);

            if (dist < 6 && dist > 0.6) {
                const speed = 0.008;
                const nx = enemy.x + (dx/dist) * speed;
                const ny = enemy.y + (dy/dist) * speed;
                if (MAP[Math.floor(enemy.y)][Math.floor(nx)] === 0) enemy.x = nx;
                if (MAP[Math.floor(ny)][Math.floor(enemy.x)] === 0) enemy.y = ny;
            }
            // Daño al jugador si está muy cerca
            if (dist < 0.7 && Math.random() < 0.01) {
                player.health = Math.max(0, player.health - 2);
            }
        }
    }

    // ===== LOOP PRINCIPAL =====
    function loop() {
        if (!doomRunning) return;
        update();
        const zBuffer = castRays();
        renderEnemies(zBuffer);
        drawHUD();
        doomAnimFrame = requestAnimationFrame(loop);
    }

    // ===== CONTROLES =====
    function onKeyDown(e) {
        doomKeys[e.code] = true;
        // Prevenir scroll de página
        if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Space"].includes(e.code)) {
            e.preventDefault();
        }
    }
    function onKeyUp(e) { doomKeys[e.code] = false; }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);

    // Guardar referencias para cleanup
    window._doomCleanup = () => {
        document.removeEventListener("keydown", onKeyDown);
        document.removeEventListener("keyup", onKeyUp);
        window.removeEventListener("resize", resizeCanvas);
    };

    // ===== CONTROLES TÁCTILES (mobile) =====
    const overlay = document.getElementById("doom-overlay");
    const touchBar = document.createElement("div");
    touchBar.id = "doom-touch-controls";
    touchBar.innerHTML = `
        <div class="doom-touch-row">
            <button class="doom-touch-btn" data-key="ArrowLeft">◀</button>
            <div class="doom-touch-col">
                <button class="doom-touch-btn" data-key="ArrowUp">▲</button>
                <button class="doom-touch-btn" data-key="ArrowDown">▼</button>
            </div>
            <button class="doom-touch-btn" data-key="ArrowRight">▶</button>
            <button class="doom-touch-btn doom-fire-btn" data-key="Space">🔫</button>
        </div>
    `;
    overlay.appendChild(touchBar);

    touchBar.querySelectorAll(".doom-touch-btn").forEach(btn => {
        const key = btn.dataset.key;
        btn.addEventListener("touchstart", e => { e.preventDefault(); doomKeys[key] = true; });
        btn.addEventListener("touchend",   e => { e.preventDefault(); doomKeys[key] = false; });
        btn.addEventListener("mousedown",  e => { doomKeys[key] = true; });
        btn.addEventListener("mouseup",    e => { doomKeys[key] = false; });
    });

    // Iniciar loop
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
    // Limpiar controles táctiles
    const tc = document.getElementById("doom-touch-controls");
    if (tc) tc.remove();

    // Limpiar canvas
    const canvas = document.getElementById("doom-canvas");
    if (canvas) {
        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
}
