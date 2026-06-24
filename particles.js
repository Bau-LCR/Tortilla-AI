document.addEventListener("DOMContentLoaded", () => {
    const container = document.getElementById("particles");
    if (!container) return;

    // ===== PARTÍCULAS MEJORADAS =====
    // Más densidad, distintos tipos, conexiones entre partículas cercanas

    const PARTICLE_COUNT = 130; // Más partículas
    const particles = [];

    for (let i = 0; i < PARTICLE_COUNT; i++) {
        const p = document.createElement("div");
        p.className = "particle";

        const size = 1.5 + Math.random() * 5;
        const duration = 4 + Math.random() * 12;
        const delay = Math.random() * -15;
        const startX = Math.random() * 100;
        const startY = Math.random() * 100;

        // Partículas más grandes y brillantes (menor frecuencia)
        const isBright = Math.random() < 0.15;
        const isGlow   = Math.random() < 0.08;

        p.style.cssText = `
            left: ${startX}%;
            bottom: ${startY}%;
            width: ${isBright ? size * 2 : size}px;
            height: ${isBright ? size * 2 : size}px;
            animation-duration: ${duration}s;
            animation-delay: ${delay}s;
            opacity: 0;
            filter: ${isGlow
                ? `blur(2px) drop-shadow(0 0 ${size * 3}px rgba(68,136,255,0.9))`
                : isBright
                    ? `drop-shadow(0 0 ${size}px rgba(68,136,255,0.7))`
                    : 'none'
            };
            background: ${isBright
                ? 'radial-gradient(circle, #8ab4ff 0%, #4488ff 60%, transparent 100%)'
                : '#4488ff'
            };
        `;

        container.appendChild(p);
        particles.push({ el: p, x: startX, y: startY });
    }

    // ===== CANVAS PARA CONEXIONES Y EFECTOS EXTRA =====
    const canvas = document.createElement("canvas");
    canvas.style.cssText = `
        position: fixed;
        inset: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 0;
    `;
    container.appendChild(canvas);

    let W = 0, H = 0;
    function resize() {
        W = canvas.width  = window.innerWidth;
        H = canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener("resize", resize);

    // Nodos flotantes para conexiones (distintos de las partículas CSS)
    const NODES = Array.from({ length: 45 }, () => ({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        vx: (Math.random() - 0.5) * 0.35,
        vy: (Math.random() - 0.5) * 0.35,
        r: 1 + Math.random() * 2.5,
        alpha: 0.2 + Math.random() * 0.6,
        pulse: Math.random() * Math.PI * 2,
        pulseSpeed: 0.02 + Math.random() * 0.04,
    }));

    // Pulsos de onda (círculos que se expanden)
    const waves = [];
    function spawnWave() {
        if (waves.length < 5) {
            waves.push({
                x: Math.random() * W,
                y: Math.random() * H,
                r: 0,
                maxR: 80 + Math.random() * 120,
                alpha: 0.25,
            });
        }
        setTimeout(spawnWave, 1800 + Math.random() * 2200);
    }
    setTimeout(spawnWave, 1000);

    const MAX_CONN_DIST = 130;

    function draw() {
        if (!doomRunning) { // No dibujar si Doom está activo
            const ctx = canvas.getContext("2d");
            ctx.clearRect(0, 0, W, H);

            // Actualizar nodos
            for (const node of NODES) {
                node.x  += node.vx;
                node.y  += node.vy;
                node.pulse += node.pulseSpeed;
                const pulseAlpha = node.alpha * (0.6 + Math.sin(node.pulse) * 0.4);

                // Rebote en bordes
                if (node.x < 0 || node.x > W) node.vx *= -1;
                if (node.y < 0 || node.y > H) node.vy *= -1;
                node.x = Math.max(0, Math.min(W, node.x));
                node.y = Math.max(0, Math.min(H, node.y));

                // Dibujar nodo
                const grd = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, node.r * 3);
                grd.addColorStop(0, `rgba(100,170,255,${pulseAlpha})`);
                grd.addColorStop(1, 'rgba(68,136,255,0)');
                ctx.fillStyle = grd;
                ctx.beginPath();
                ctx.arc(node.x, node.y, node.r * 3, 0, Math.PI * 2);
                ctx.fill();
            }

            // Conexiones entre nodos cercanos
            for (let i = 0; i < NODES.length; i++) {
                for (let j = i + 1; j < NODES.length; j++) {
                    const a = NODES[i], b = NODES[j];
                    const dx = b.x - a.x, dy = b.y - a.y;
                    const dist = Math.sqrt(dx*dx + dy*dy);
                    if (dist < MAX_CONN_DIST) {
                        const alpha = (1 - dist / MAX_CONN_DIST) * 0.10;
                        const grd2 = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
                        grd2.addColorStop(0, `rgba(68,136,255,${alpha})`);
                        grd2.addColorStop(0.5, `rgba(120,180,255,${alpha * 1.5})`);
                        grd2.addColorStop(1, `rgba(68,136,255,${alpha})`);
                        ctx.strokeStyle = grd2;
                        ctx.lineWidth = (1 - dist / MAX_CONN_DIST) * 1.2;
                        ctx.beginPath();
                        ctx.moveTo(a.x, a.y);
                        ctx.lineTo(b.x, b.y);
                        ctx.stroke();
                    }
                }
            }

            // Ondas expansivas
            for (let i = waves.length - 1; i >= 0; i--) {
                const wave = waves[i];
                wave.r += 1.2;
                wave.alpha *= 0.985;
                if (wave.r >= wave.maxR || wave.alpha < 0.005) {
                    waves.splice(i, 1);
                    continue;
                }
                const a = wave.alpha * (1 - wave.r / wave.maxR);
                ctx.strokeStyle = `rgba(68,136,255,${a})`;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.arc(wave.x, wave.y, wave.r, 0, Math.PI * 2);
                ctx.stroke();
                // Onda secundaria más pequeña
                if (wave.r > 20) {
                    ctx.strokeStyle = `rgba(120,180,255,${a * 0.4})`;
                    ctx.lineWidth = 0.5;
                    ctx.beginPath();
                    ctx.arc(wave.x, wave.y, wave.r * 0.6, 0, Math.PI * 2);
                    ctx.stroke();
                }
            }

            // Viñeta roja en los bordes
            const vignette = ctx.createRadialGradient(W/2, H/2, H*0.3, W/2, H/2, H*0.9);
            vignette.addColorStop(0, 'rgba(255,255,255,0)');
            vignette.addColorStop(1, 'rgba(70,120,255,0.08)');
            ctx.fillStyle = vignette;
            ctx.fillRect(0, 0, W, H);
        }

        requestAnimationFrame(draw);
    }

    draw();
});

// Variable global para saber si Doom está corriendo (evitar partículas encima)
// (doomRunning ya está en doom.js como var global)
if (typeof doomRunning === 'undefined') var doomRunning = false;
