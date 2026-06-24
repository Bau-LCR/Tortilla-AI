// ============================================================
//  orb.js  —  Cut-real AI  |  Esfera 3D tipo Xbox
//  Renderiza una esfera orgánica animada con Canvas 2D.
//  Se posiciona a la izquierda del chat.
//  Sincroniza con loquendo.js mediante CutRealOrb.setVolume()
// ============================================================

(function () {
    'use strict';

    window.CutRealOrb = {
        isSpeaking: false,
        volume:     0,
        _canvas:    null,
        _ctx:       null,
        _animId:    null,
        _t:         0,
        _visible:   false,
        _blobPoints: [],
    };

    const ORB = window.CutRealOrb;

    // ── Número de puntos del blob orgánico ─────────────────
    const NUM_BLOB_POINTS = 8;

    function initBlobPoints() {
        ORB._blobPoints = [];
        for (let i = 0; i < NUM_BLOB_POINTS; i++) {
            ORB._blobPoints.push({
                angle:  (i / NUM_BLOB_POINTS) * Math.PI * 2,
                phase:  Math.random() * Math.PI * 2,
                speed:  0.012 + Math.random() * 0.008,
                amp:    0.06 + Math.random() * 0.08,
            });
        }
    }

    // ── Crear DOM del orb ───────────────────────────────────
    function createOrbDOM() {
        // Eliminar si ya existe
        const old = document.getElementById('orb-wrap');
        if (old) old.remove();

        const wrap = document.createElement('div');
        wrap.id = 'orb-wrap';
        wrap.innerHTML = `
            <div id="orb-container">
                <canvas id="orb-canvas" width="220" height="220"></canvas>
                <div id="orb-label">Cut-real AI</div>
            </div>
        `;

        // Insertar ANTES del chat (lado izquierdo gestionado por CSS flex)
        const chat = document.getElementById('chat');
        if (chat && chat.parentNode) {
            chat.parentNode.insertBefore(wrap, chat);
        } else {
            document.body.insertBefore(wrap, document.body.firstChild);
        }

        ORB._canvas = document.getElementById('orb-canvas');
        ORB._ctx    = ORB._canvas.getContext('2d');
        initBlobPoints();
        startAnimation();
    }

    // ── Loop principal ──────────────────────────────────────
    function startAnimation() {
        if (ORB._animId) cancelAnimationFrame(ORB._animId);

        function loop() {
            ORB._animId = requestAnimationFrame(loop);
            ORB._t += ORB.isSpeaking ? (0.025 + ORB.volume * 0.04) : 0.012;
            drawOrb();
        }
        loop();
    }

    // ── Dibujar la esfera ───────────────────────────────────
    function drawOrb() {
        const canvas = ORB._canvas;
        const ctx    = ORB._ctx;
        const W = canvas.width;
        const H = canvas.height;
        const cx = W / 2;
        const cy = H / 2;
        const t  = ORB._t;
        const vol = ORB.isSpeaking ? ORB.volume : 0;

        ctx.clearRect(0, 0, W, H);

        // Radio base que "respira"
        const breathe = Math.sin(t * 0.7) * 0.04;
        const baseR   = 80 * (1 + breathe + vol * 0.18);

        // ── 1. GLOW exterior ────────────────────────────────
        const glowR = baseR * 1.9;
        const glow  = ctx.createRadialGradient(cx, cy, baseR * 0.3, cx, cy, glowR);
        const glowA = ORB.isSpeaking ? (0.30 + vol * 0.45) : (0.14 + Math.sin(t * 0.5) * 0.05);

        if (ORB.isSpeaking) {
            glow.addColorStop(0, `rgba(120,180,255,${glowA})`);
            glow.addColorStop(0.4, `rgba(68,136,255,${glowA * 0.6})`);
            glow.addColorStop(1,   'rgba(0,0,0,0)');
        } else {
            glow.addColorStop(0,   `rgba(60, 180, 200, ${glowA})`);
            glow.addColorStop(0.4, `rgba(30, 120, 180, ${glowA * 0.5})`);
            glow.addColorStop(1,   'rgba(0,0,0,0)');
        }
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(cx, cy, glowR, 0, Math.PI * 2);
        ctx.fill();

        // ── 2. CUERPO: blob orgánico ────────────────────────
        // Calculamos los puntos del contorno deformado
        const blobVerts = [];
        for (let i = 0; i < NUM_BLOB_POINTS * 2; i++) {
            const angle = (i / (NUM_BLOB_POINTS * 2)) * Math.PI * 2;
            const bp    = ORB._blobPoints[i % NUM_BLOB_POINTS];

            // Avanzar fase del punto
            if (i < NUM_BLOB_POINTS) bp.phase += bp.speed;

            const wobble = Math.sin(bp.phase) * bp.amp;
            const voiceWobble = vol * Math.sin(bp.phase * 2.3 + angle * 3) * 0.22;
            const r = baseR * (1 + wobble + voiceWobble);

            blobVerts.push({ x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r });
        }

        // Trazar path suavizado con curvas de Bezier
        ctx.save();
        ctx.beginPath();
        for (let i = 0; i < blobVerts.length; i++) {
            const curr = blobVerts[i];
            const next = blobVerts[(i + 1) % blobVerts.length];
            const midX = (curr.x + next.x) / 2;
            const midY = (curr.y + next.y) / 2;
            if (i === 0) ctx.moveTo(midX, midY);
            else ctx.quadraticCurveTo(curr.x, curr.y, midX, midY);
        }
        ctx.closePath();

        // Gradiente radial 3D (luz superior izquierda)
        const lightX = cx - baseR * 0.30;
        const lightY = cy - baseR * 0.30;
        const sphere = ctx.createRadialGradient(lightX, lightY, baseR * 0.02, cx, cy, baseR * 1.05);

        if (ORB.isSpeaking) {
            // Paleta vibrante cuando habla
            const pulse = (Math.sin(t * 3.5) + 1) / 2;
            sphere.addColorStop(0.00, '#ffffff');
            sphere.addColorStop(0.08, `rgba(${lerp(180, 140, pulse)}, 255, ${lerp(220, 255, pulse)}, 1)`);
            sphere.addColorStop(0.35, `rgba(${lerp(20, 10, pulse)}, ${lerp(190, 160, pulse)}, ${lerp(180, 220, pulse)}, 1)`);
            sphere.addColorStop(0.70, `rgba(${lerp(5, 15, pulse)}, ${lerp(80, 60, pulse)}, ${lerp(150, 180, pulse)}, 1)`);
            sphere.addColorStop(0.90, '#020a1a');
            sphere.addColorStop(1.00, '#000000');
        } else {
            // Paleta suave idle
            const s = (Math.sin(t * 0.8) + 1) / 2;
            sphere.addColorStop(0.00, 'rgba(210, 255, 245, 0.97)');
            sphere.addColorStop(0.10, `rgba(${lerp(60,40,s)}, ${lerp(200,180,s)}, ${lerp(200,220,s)}, 1)`);
            sphere.addColorStop(0.45, `rgba(${lerp(10,5,s)}, ${lerp(100,80,s)}, ${lerp(160,180,s)}, 1)`);
            sphere.addColorStop(0.80, '#021525');
            sphere.addColorStop(1.00, '#000000');
        }

        ctx.fillStyle = sphere;
        ctx.fill();
        ctx.restore();

        // ── 3. CAPA INTERIOR: brillo difuso ─────────────────
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = ORB.isSpeaking ? (0.18 + vol * 0.28) : 0.08;

        const inner = ctx.createRadialGradient(
            cx - baseR * 0.15, cy - baseR * 0.20, 0,
            cx, cy, baseR * 0.9
        );
        inner.addColorStop(0, ORB.isSpeaking ? '#80ffcc' : '#40c8b0');
        inner.addColorStop(1, 'transparent');
        ctx.fillStyle = inner;
        ctx.beginPath();
        ctx.arc(cx, cy, baseR * 0.9, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // ── 4. ONDAS de voz (anillos de sonido) ─────────────
        if (ORB.isSpeaking && vol > 0.08) {
            drawSoundRings(ctx, cx, cy, baseR, vol, t);
        }

        // ── 5. REFLEJO especular superior ───────────────────
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        const specX  = cx - baseR * 0.28;
        const specY  = cy - baseR * 0.28;
        const specRx = baseR * 0.38;
        const specRy = baseR * 0.22;
        const specGrd = ctx.createRadialGradient(specX, specY, 0, specX, specY, specRx);
        specGrd.addColorStop(0, `rgba(255,255,255,${0.70 + vol * 0.25})`);
        specGrd.addColorStop(0.5, `rgba(200,255,240,${0.25 + vol * 0.1})`);
        specGrd.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = specGrd;
        ctx.save();
        ctx.translate(specX, specY);
        ctx.rotate(-0.4);
        ctx.scale(1, specRy / specRx);
        ctx.beginPath();
        ctx.arc(0, 0, specRx, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        ctx.restore();

        // ── 6. BRILLO sutil inferior derecho ────────────────
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = 0.12 + vol * 0.08;
        const spec2 = ctx.createRadialGradient(
            cx + baseR * 0.3, cy + baseR * 0.3, 0,
            cx + baseR * 0.3, cy + baseR * 0.3, baseR * 0.28
        );
        spec2.addColorStop(0, 'rgba(80, 220, 200, 1)');
        spec2.addColorStop(1, 'transparent');
        ctx.fillStyle = spec2;
        ctx.beginPath();
        ctx.arc(cx + baseR * 0.3, cy + baseR * 0.3, baseR * 0.28, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // ── 7. Indicador "hablando" ──────────────────────────
        updateOrbLabel(vol);
    }

    // ── Anillos de onda de sonido ───────────────────────────
    function drawSoundRings(ctx, cx, cy, baseR, vol, t) {
        const numRings = 3;
        for (let i = 0; i < numRings; i++) {
            const phase = ((t * 1.8 + i * 0.6) % 1);
            const ringR = baseR * (1.05 + phase * 0.75);
            const alpha = vol * (1 - phase) * 0.35;
            if (alpha < 0.01) continue;
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.strokeStyle = ORB.isSpeaking
                ? `rgba(100, 255, 200, 1)`
                : `rgba(60, 200, 180, 1)`;
            ctx.lineWidth = 1.5 * (1 - phase);
            ctx.beginPath();
            ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }
    }

    // ── Label del orb ────────────────────────────────────────
    function updateOrbLabel(vol) {
        const label = document.getElementById('orb-label');
        if (!label) return;
        if (ORB.isSpeaking && vol > 0.05) {
            label.textContent = 'Hablando…';
            label.style.opacity = '0.85';
            label.style.color   = '#50e8c0';
        } else {
            label.textContent = 'Cut-real AI';
            label.style.opacity = '0.35';
            label.style.color   = '#aaa';
        }
    }

    // ── API pública ─────────────────────────────────────────
    window.CutRealOrb.setVolume = function (volume) {
        ORB.volume     = Math.max(0, Math.min(1, volume));
        ORB.isSpeaking = ORB.volume > 0.02;
        const container = document.getElementById('orb-container');
        if (container) container.classList.toggle('orb-speaking', ORB.isSpeaking);
    };

    window.CutRealOrb.show = function () {
        const wrap = document.getElementById('orb-wrap');
        if (wrap) { wrap.classList.add('orb-visible'); ORB._visible = true; }
    };

    window.CutRealOrb.hide = function () {
        const wrap = document.getElementById('orb-wrap');
        if (wrap) { wrap.classList.remove('orb-visible'); ORB._visible = false; }
    };

    window.CutRealOrb.isVisible = function () { return ORB._visible; };

    // ── Helpers ─────────────────────────────────────────────
    function lerp(a, b, t) { return Math.round(a + (b - a) * t); }

    // ── Init ─────────────────────────────────────────────────
    function init() {
        createOrbDOM();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        setTimeout(init, 0);
    }

})();
