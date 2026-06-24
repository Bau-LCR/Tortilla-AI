// ============================================================
//  orb.js  —  Cut-real AI  |  Esfera estilo Xbox (azules)
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
    };

    const ORB = window.CutRealOrb;

    // ── Crear DOM del orb ───────────────────────────────────
    function createOrbDOM() {
        const old = document.getElementById('orb-wrap');
        if (old) old.remove();

        const wrap = document.createElement('div');
        wrap.id = 'orb-wrap';
        wrap.innerHTML = `
            <div id="orb-container">
                <canvas id="orb-canvas" width="200" height="200"></canvas>
            </div>
            <div id="orb-label">Cut-real AI</div>
        `;

        const chat = document.getElementById('chat');
        if (chat && chat.parentNode) {
            chat.parentNode.insertBefore(wrap, chat);
        } else {
            document.body.insertBefore(wrap, document.body.firstChild);
        }

        ORB._canvas = document.getElementById('orb-canvas');
        ORB._ctx    = ORB._canvas.getContext('2d');
        startAnimation();
    }

    // ── Loop principal ──────────────────────────────────────
    function startAnimation() {
        if (ORB._animId) cancelAnimationFrame(ORB._animId);
        function loop() {
            ORB._animId = requestAnimationFrame(loop);
            ORB._t += ORB.isSpeaking ? (0.018 + ORB.volume * 0.030) : 0.009;
            drawOrb();
        }
        loop();
    }

    // ── Dibujar la esfera estilo Xbox ───────────────────────
    function drawOrb() {
        const canvas = ORB._canvas;
        const ctx    = ORB._ctx;
        const W  = canvas.width;
        const H  = canvas.height;
        const cx = W / 2;
        const cy = H / 2;
        const t  = ORB._t;
        const vol = ORB.isSpeaking ? ORB.volume : 0;
        const R  = W * 0.40;

        ctx.clearRect(0, 0, W, H);

        // ── 1. FONDO OSCURO CIRCULAR (panel estilo Xbox) ────
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, W * 0.495, 0, Math.PI * 2);
        const bgGrd = ctx.createRadialGradient(cx * 0.65, cy * 0.55, 0, cx, cy, W * 0.495);
        bgGrd.addColorStop(0,   '#071428');
        bgGrd.addColorStop(0.5, '#030b18');
        bgGrd.addColorStop(1,   '#010406');
        ctx.fillStyle = bgGrd;
        ctx.fill();
        ctx.restore();

        // ── 2. BRILLO AMBIENTAL INTERIOR ────────────────────
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        const ambGrd = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.35);
        ambGrd.addColorStop(0, `rgba(25, 70, 180, ${0.22 + vol * 0.28})`);
        ambGrd.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = ambGrd;
        ctx.beginPath();
        ctx.arc(cx, cy, R * 1.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // ── 3. BLOBS ORGÁNICOS (multi-esfera estilo Xbox) ───
        const breathe = Math.sin(t * 0.48) * 0.030;
        const mainR   = R * (0.76 + breathe + vol * 0.13);

        // Blob 1 — principal (más grande, centrado)
        const b1x = cx + Math.sin(t * 0.33) * R * 0.10;
        const b1y = cy + Math.cos(t * 0.27) * R * 0.07;
        _drawSphere(ctx, b1x, b1y, mainR, t, vol, 0.0,
            '#cce0ff', '#4488ff', '#0a2299', '#000918');

        // Blob 2 — secundario (arriba-derecha)
        const b2x = cx + Math.cos(t * 0.50 + 1.05) * R * 0.21;
        const b2y = cy + Math.sin(t * 0.43 + 1.05) * R * 0.18;
        _drawSphere(ctx, b2x, b2y, mainR * 0.74, t, vol, 2.1,
            '#b8ccff', '#3366dd', '#061daa', '#000716');

        // Blob 3 — acento (abajo-izquierda)
        const b3x = cx + Math.sin(t * 0.63 + 2.55) * R * 0.25;
        const b3y = cy + Math.cos(t * 0.57 + 2.55) * R * 0.22;
        _drawSphere(ctx, b3x, b3y, mainR * 0.58, t, vol, 4.3,
            '#ddeeff', '#66aaff', '#1150cc', '#000b20');

        // ── 4. ONDAS DE VOZ al hablar ────────────────────────
        if (ORB.isSpeaking && vol > 0.06) {
            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            const speakGrd = ctx.createRadialGradient(cx, cy, mainR * 0.88, cx, cy, W * 0.46);
            speakGrd.addColorStop(0, `rgba(68,136,255,${vol * 0.38})`);
            speakGrd.addColorStop(1, 'rgba(10,30,100,0)');
            ctx.fillStyle = speakGrd;
            ctx.beginPath();
            ctx.arc(cx, cy, W * 0.46, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
            _drawSoundRings(ctx, cx, cy, W * 0.42, vol, t);
        }

        // ── 5. VIÑETA OSCURA en el borde (efecto panel) ─────
        ctx.save();
        const vigGrd = ctx.createRadialGradient(cx, cy, W * 0.30, cx, cy, W * 0.495);
        vigGrd.addColorStop(0,   'rgba(0,0,0,0)');
        vigGrd.addColorStop(0.55,'rgba(0,0,0,0.10)');
        vigGrd.addColorStop(1,   'rgba(0,0,0,0.72)');
        ctx.fillStyle = vigGrd;
        ctx.beginPath();
        ctx.arc(cx, cy, W * 0.495, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        _updateOrbLabel(vol);
    }

    // ── Renderiza una esfera orgánica individual ─────────────
    function _drawSphere(ctx, cx, cy, r, t, vol, ph, cLight, cMid, cDark, cEdge) {
        const N = 9;
        const verts = [];
        for (let i = 0; i < N; i++) {
            const ang = (i / N) * Math.PI * 2;
            const n1  = Math.sin(t * 0.82 + i * 1.28 + ph) * 0.10;
            const n2  = Math.cos(t * 1.18 + i * 0.72 + ph + 1.6) * 0.07;
            const vb  = vol * Math.sin(t * 2.8 + i * 1.55 + ph) * 0.14;
            const rr  = r * (1 + n1 + n2 + vb);
            verts.push({ x: cx + Math.cos(ang) * rr, y: cy + Math.sin(ang) * rr });
        }

        ctx.save();
        ctx.beginPath();
        for (let i = 0; i < verts.length; i++) {
            const curr = verts[i];
            const next = verts[(i + 1) % verts.length];
            const mx = (curr.x + next.x) / 2;
            const my = (curr.y + next.y) / 2;
            i === 0 ? ctx.moveTo(mx, my) : ctx.quadraticCurveTo(curr.x, curr.y, mx, my);
        }
        ctx.closePath();

        // Gradiente radial 3D — fuente de luz arriba-izquierda
        const lx  = cx - r * 0.28;
        const ly  = cy - r * 0.28;
        const grd = ctx.createRadialGradient(lx, ly, r * 0.02, cx, cy, r * 1.08);
        grd.addColorStop(0.00, '#ffffff');
        grd.addColorStop(0.07, cLight);
        grd.addColorStop(0.36, cMid);
        grd.addColorStop(0.76, cDark);
        grd.addColorStop(1.00, cEdge);

        ctx.globalCompositeOperation = 'screen';
        ctx.fillStyle = grd;
        ctx.fill();
        ctx.restore();
    }

    // ── Anillos de onda de sonido ───────────────────────────
    function _drawSoundRings(ctx, cx, cy, baseR, vol, t) {
        for (let i = 0; i < 3; i++) {
            const phase = ((t * 1.6 + i * 0.55) % 1);
            const ringR = baseR * (1.04 + phase * 0.72);
            const alpha = vol * (1 - phase) * 0.32;
            if (alpha < 0.01) continue;
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.strokeStyle = 'rgba(100,160,255,1)';
            ctx.lineWidth   = 1.4 * (1 - phase);
            ctx.beginPath();
            ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }
    }

    // ── Label del orb ────────────────────────────────────────
    function _updateOrbLabel(vol) {
        const label = document.getElementById('orb-label');
        if (!label) return;
        if (ORB.isSpeaking && vol > 0.05) {
            label.textContent = 'Hablando…';
            label.style.opacity = '0.90';
            label.style.color   = '#88bbff';
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

    // ── Init ─────────────────────────────────────────────────
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', createOrbDOM);
    } else {
        setTimeout(createOrbDOM, 0);
    }

})();
