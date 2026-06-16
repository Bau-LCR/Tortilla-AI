// ============================================================
//  orb.js  —  Cut-real AI  |  Esfera 3D animada (estilo Xbox)
//  Renderiza una esfera con gradientes y la anima al ritmo
//  de la voz de la IA (controlada desde loquendo.js).
// ============================================================

(function () {
    'use strict';

    // ── ESTADO GLOBAL DE LA ESFERA ──────────────────────────
    window.CutRealOrb = {
        isSpeaking: false,
        volume:     0,      // 0..1 — amplitud de voz actual
        _canvas:    null,
        _ctx:       null,
        _animId:    null,
        _phase:     0,
        _idlePhase: 0,
        _visible:   false,
    };

    const ORB = window.CutRealOrb;

    // ── CREAR EL CONTENEDOR Y EL CANVAS ────────────────────
    function createOrbDOM() {
        // Contenedor principal (posicionado sobre el chat)
        const wrap = document.createElement('div');
        wrap.id = 'orb-wrap';
        wrap.innerHTML = `
            <div id="orb-container">
                <canvas id="orb-canvas" width="260" height="260"></canvas>
                <div id="orb-rings">
                    <div class="orb-ring orb-ring-1"></div>
                    <div class="orb-ring orb-ring-2"></div>
                    <div class="orb-ring orb-ring-3"></div>
                </div>
                <div id="orb-glow"></div>
            </div>
        `;
        // Insertar después del chat, antes del input
        const chat = document.getElementById('chat');
        if (chat && chat.parentNode) {
            chat.parentNode.insertBefore(wrap, chat.nextSibling);
        } else {
            document.body.appendChild(wrap);
        }

        const canvas = document.getElementById('orb-canvas');
        const ctx    = canvas.getContext('2d');
        ORB._canvas  = canvas;
        ORB._ctx     = ctx;

        startAnimation();
    }

    // ── LOOP DE ANIMACIÓN ───────────────────────────────────
    function startAnimation() {
        if (ORB._animId) cancelAnimationFrame(ORB._animId);
        drawFrame();
    }

    function drawFrame() {
        ORB._animId = requestAnimationFrame(drawFrame);

        const canvas = ORB._canvas;
        const ctx    = ORB._ctx;
        const W = canvas.width;
        const H = canvas.height;
        const cx = W / 2;
        const cy = H / 2;

        ctx.clearRect(0, 0, W, H);

        // Avanzar fase
        if (ORB.isSpeaking) {
            ORB._phase += 0.06 + ORB.volume * 0.12;
        } else {
            ORB._phase     += 0.018;
            ORB._idlePhase += 0.008;
        }

        const vol  = ORB.isSpeaking ? ORB.volume : 0;
        const idle = Math.sin(ORB._idlePhase) * 0.5 + 0.5;  // 0..1 suave

        // Radio base: 90px, se infla con la voz
        const baseR   = 90;
        const inflateR = baseR + idle * 6 + vol * 22;

        // ── SOMBRA EXTERIOR (glow) ──────────────────────────
        const glowColor1 = ORB.isSpeaking
            ? `rgba(100,255,180,${0.25 + vol * 0.4})`
            : `rgba(80,200,160,${0.15 + idle * 0.12})`;
        const glowColor2 = ORB.isSpeaking
            ? `rgba(60,180,255,${0.2 + vol * 0.3})`
            : `rgba(50,120,200,${0.1 + idle * 0.08})`;

        const glow = ctx.createRadialGradient(cx, cy, inflateR * 0.5, cx, cy, inflateR * 1.6);
        glow.addColorStop(0, glowColor1);
        glow.addColorStop(0.5, glowColor2);
        glow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(cx, cy, inflateR * 1.6, 0, Math.PI * 2);
        ctx.fill();

        // ── CUERPO PRINCIPAL DE LA ESFERA ──────────────────
        // Gradiente radial descentrado para dar sensación 3D
        const lightX = cx - inflateR * 0.28;
        const lightY = cy - inflateR * 0.28;

        const sphere = ctx.createRadialGradient(
            lightX, lightY, inflateR * 0.05,
            cx,     cy,     inflateR
        );

        if (ORB.isSpeaking) {
            // Colores activos: verde-azulado vibrante
            const t = (Math.sin(ORB._phase * 1.3) + 1) / 2;
            const r1 = lerpColor('#a0ffe0', '#50e8ff', t);
            const r2 = lerpColor('#1ad4a0', '#0090e0', t);
            const r3 = lerpColor('#003355', '#001a30', t);
            sphere.addColorStop(0.0, '#ffffff');
            sphere.addColorStop(0.1, r1);
            sphere.addColorStop(0.5, r2);
            sphere.addColorStop(0.85, r3);
            sphere.addColorStop(1.0, '#000a18');
        } else {
            // Colores idle: azul-verde oscuro suave
            const t = (Math.sin(ORB._idlePhase * 2) + 1) / 2;
            const r1 = lerpColor('#60e0c0', '#40b8e8', t);
            const r2 = lerpColor('#0888b0', '#0560a0', t);
            sphere.addColorStop(0.0, 'rgba(200,255,240,0.95)');
            sphere.addColorStop(0.12, r1);
            sphere.addColorStop(0.55, r2);
            sphere.addColorStop(0.88, '#002244');
            sphere.addColorStop(1.0, '#000a18');
        }

        ctx.fillStyle = sphere;
        ctx.beginPath();
        ctx.arc(cx, cy, inflateR, 0, Math.PI * 2);
        ctx.fill();

        // ── SEGUNDA CAPA: blob deformado (sensación orgánica) ──
        if (ORB.isSpeaking || idle > 0.3) {
            const blobAlpha = ORB.isSpeaking ? (0.18 + vol * 0.25) : (idle * 0.1);
            ctx.save();
            ctx.globalAlpha = blobAlpha;
            ctx.translate(cx, cy);

            const blobColor = ORB.isSpeaking
                ? `rgba(150,255,230,1)`
                : `rgba(100,200,200,1)`;

            const blobGrd = ctx.createRadialGradient(-inflateR * 0.2, -inflateR * 0.2, 0, 0, 0, inflateR * 0.85);
            blobGrd.addColorStop(0, blobColor);
            blobGrd.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = blobGrd;

            ctx.beginPath();
            const pts = 7;
            for (let i = 0; i <= pts; i++) {
                const ang = (i / pts) * Math.PI * 2;
                const wobble = ORB.isSpeaking
                    ? Math.sin(ORB._phase * 2.1 + ang * 2.3) * vol * inflateR * 0.18
                    : Math.sin(ORB._idlePhase * 1.5 + ang * 1.8) * idle * inflateR * 0.06;
                const r = inflateR * 0.72 + wobble;
                const x = Math.cos(ang) * r;
                const y = Math.sin(ang) * r;
                i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
            }
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }

        // ── REFLEJO ESPECULAR (luz superior izquierda) ──────
        const specR = inflateR * 0.38;
        const spec  = ctx.createRadialGradient(
            cx - inflateR * 0.3, cy - inflateR * 0.3, 0,
            cx - inflateR * 0.1, cy - inflateR * 0.1, specR
        );
        spec.addColorStop(0, `rgba(255,255,255,${0.55 + vol * 0.25})`);
        spec.addColorStop(0.5, `rgba(200,255,240,${0.18 + vol * 0.1})`);
        spec.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = spec;
        ctx.beginPath();
        ctx.ellipse(
            cx - inflateR * 0.28, cy - inflateR * 0.28,
            specR * 0.55, specR * 0.38,
            -Math.PI * 0.2, 0, Math.PI * 2
        );
        ctx.fill();

        // ── REFLEJO INFERIOR DERECHO (secundario) ──────────
        const spec2 = ctx.createRadialGradient(
            cx + inflateR * 0.35, cy + inflateR * 0.35, 0,
            cx + inflateR * 0.35, cy + inflateR * 0.35, inflateR * 0.25
        );
        spec2.addColorStop(0, `rgba(100,255,220,${0.12 + vol * 0.08})`);
        spec2.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = spec2;
        ctx.beginPath();
        ctx.arc(cx + inflateR * 0.35, cy + inflateR * 0.35, inflateR * 0.25, 0, Math.PI * 2);
        ctx.fill();

        // ── ANILLOS ORBITALES CSS (activados via clase) ─────
        updateRings(vol, idle);
    }

    // ── ACTUALIZAR ANILLOS CSS ──────────────────────────────
    function updateRings(vol, idle) {
        const rings = document.querySelectorAll('.orb-ring');
        rings.forEach((ring, i) => {
            const scale = 1 + idle * 0.04 + vol * (0.08 + i * 0.04);
            const alpha = ORB.isSpeaking
                ? (0.4 + vol * 0.5 - i * 0.08)
                : (0.15 + idle * 0.12 - i * 0.04);
            ring.style.transform = `scale(${scale}) rotateX(${70 + i * 8}deg) rotateZ(${ORB._phase * (8 + i * 4)}deg)`;
            ring.style.opacity   = Math.max(0, alpha);
        });

        // Glow del contenedor
        const glowEl = document.getElementById('orb-glow');
        if (glowEl) {
            const intensity = ORB.isSpeaking ? (0.5 + vol * 0.8) : (0.2 + idle * 0.15);
            const color     = ORB.isSpeaking
                ? `rgba(80,220,180,${intensity})`
                : `rgba(40,160,140,${intensity * 0.6})`;
            glowEl.style.boxShadow = `0 0 ${30 + vol * 60}px ${color}`;
        }
    }

    // ── API PÚBLICA ─────────────────────────────────────────
    /**
     * Llama a esto cuando la IA empieza a hablar
     * @param {number} volume  0..1
     */
    window.CutRealOrb.setVolume = function (volume) {
        ORB.volume     = Math.max(0, Math.min(1, volume));
        ORB.isSpeaking = ORB.volume > 0.02;
        const container = document.getElementById('orb-container');
        if (container) {
            container.classList.toggle('orb-speaking', ORB.isSpeaking);
        }
    };

    /** Muestra / oculta la esfera con animación */
    window.CutRealOrb.show = function () {
        const wrap = document.getElementById('orb-wrap');
        if (wrap) {
            wrap.classList.add('orb-visible');
            ORB._visible = true;
        }
    };

    window.CutRealOrb.hide = function () {
        const wrap = document.getElementById('orb-wrap');
        if (wrap) {
            wrap.classList.remove('orb-visible');
            ORB._visible = false;
        }
    };

    window.CutRealOrb.isVisible = function () { return ORB._visible; };

    // ── HELPERS ─────────────────────────────────────────────
    function hexToRgb(hex) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return [r, g, b];
    }

    function lerpColor(hex1, hex2, t) {
        const [r1, g1, b1] = hexToRgb(hex1);
        const [r2, g2, b2] = hexToRgb(hex2);
        const r = Math.round(r1 + (r2 - r1) * t);
        const g = Math.round(g1 + (g2 - g1) * t);
        const b = Math.round(b1 + (b2 - b1) * t);
        return `rgb(${r},${g},${b})`;
    }

    // ── INICIALIZACIÓN ──────────────────────────────────────
    function init() {
        if (document.getElementById('orb-wrap')) return; // ya existe
        createOrbDOM();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        // DOMContentLoaded ya disparó, pero esperamos un tick
        setTimeout(init, 0);
    }

})();
