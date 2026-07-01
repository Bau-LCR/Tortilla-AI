// ===== CUT-REAL DOOM — DOOM 1993 ORIGINAL (WebAssembly) =====
// Reemplaza el raycaster casero por el motor real de DOOM, compilado a
// WebAssembly por el proyecto wasm-doom (github.com/iam-medvedev/wasm-doom),
// cargado directo desde jsdelivr — sin npm install ni build step, compatible
// con este sitio de HTML + JS plano.
//
// Usa el WAD shareware oficial (Episodio 1: "Knee-Deep in the Dead"), que
// id Software autorizó a distribuir gratis. La versión completa (registrada)
// sigue siendo propiedad de id Software/Bethesda y no se redistribuye acá.
//
// Mantiene exactamente la misma API pública que la versión anterior:
// window.startDoom(), window.stopDoom(), window.openDoom(), window.closeDoom()
// — así que main.js e index.html no necesitan tocarse.

'use strict';

const DOOM_SCREEN_W = 640;
const DOOM_SCREEN_H = 400;

let doomInstance = null;   // se crea UNA sola vez por sesión y se reutiliza
let doomLoading  = false;
let doomCtx      = null;
let doomPaintOn  = false;  // gatea el pintado del canvas mientras el overlay está oculto

function styleCanvas(canvas) {
    canvas.width  = DOOM_SCREEN_W;
    canvas.height = DOOM_SCREEN_H;
    canvas.style.width          = '100%';
    canvas.style.height         = 'auto';
    canvas.style.maxWidth       = '960px';
    canvas.style.margin         = '0 auto';
    canvas.style.display        = 'block';
    canvas.style.background     = '#000';
    canvas.style.imageRendering = 'pixelated';
    canvas.tabIndex = 0; // para que pueda recibir foco y por lo tanto el teclado
}

function drawMessage(ctx, canvas, lines, color) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.textAlign = 'center';
    lines.forEach((line, i) => {
        ctx.fillStyle = color;
        ctx.font = i === 0 ? 'bold 20px monospace' : '12px monospace';
        ctx.fillText(line, canvas.width / 2, canvas.height / 2 + i * 22 - (lines.length - 1) * 11);
    });
    ctx.textAlign = 'left';
}

async function startDoom() {
    const canvas = document.getElementById('doom-canvas');
    if (!canvas) return;
    styleCanvas(canvas);
    doomCtx = canvas.getContext('2d');
    doomPaintOn = true;

    if (doomInstance) {
        // Ya estaba cargado de una apertura anterior: retomamos donde quedó.
        canvas.focus();
        return;
    }
    if (doomLoading) return;
    doomLoading = true;

    drawMessage(doomCtx, canvas, ['CARGANDO DOOM 1993...'], '#ff3b3b');

    try {
        const { DOOM } = await import('https://cdn.jsdelivr.net/npm/wasm-doom/+esm');
        doomInstance = new DOOM({
            screenWidth: DOOM_SCREEN_W,
            screenHeight: DOOM_SCREEN_H,
            keyboardTarget: canvas,
            onFrameRender: ({ screen }) => {
                if (!doomPaintOn || !doomCtx) return;
                doomCtx.putImageData(new ImageData(screen, DOOM_SCREEN_W, DOOM_SCREEN_H), 0, 0);
            },
        });
        await doomInstance.start();
        canvas.focus();
        buildTouchControls();
    } catch (err) {
        console.error('Error cargando DOOM (wasm-doom):', err);
        drawMessage(doomCtx, canvas, ['NO SE PUDO CARGAR DOOM 😢', 'Revisá la consola del navegador'], '#ff5555');
        doomInstance = null; // permite reintentar la próxima vez
    } finally {
        doomLoading = false;
    }
}

function stopDoom() {
    // wasm-doom no expone un método público de destrucción. En vez de tirar
    // la instancia y volver a bajar el .wasm cada vez, dejamos de pintar el
    // canvas y le sacamos el foco. El progreso (nivel, vida, munición) queda
    // intacto para la próxima vez que se diga "doom 1993".
    doomPaintOn = false;
    const canvas = document.getElementById('doom-canvas');
    if (canvas) canvas.blur();
}

// ===== CONTROLES TÁCTILES (para el wrapper móvil / Capacitor) ==============
function dispatchKey(type, code, key) {
    const canvas = document.getElementById('doom-canvas');
    if (!canvas) return;
    canvas.dispatchEvent(new KeyboardEvent(type, { code, key, bubbles: true, cancelable: true }));
}

function buildTouchControls() {
    if (document.getElementById('doom-touch-controls')) return; // ya existen
    const overlay = document.getElementById('doom-overlay');
    if (!overlay) return;

    const tb = document.createElement('div');
    tb.id = 'doom-touch-controls';
    tb.style.cssText = 'position:absolute;bottom:12px;left:0;right:0;display:flex;justify-content:space-between;padding:0 18px;z-index:99200;pointer-events:auto;';
    tb.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:6px;align-items:center;">
            <button class="dtb" data-code="ArrowUp" data-key="ArrowUp">▲</button>
            <div style="display:flex;gap:6px;">
                <button class="dtb" data-code="ArrowLeft" data-key="ArrowLeft">◄</button>
                <button class="dtb" data-code="ArrowDown" data-key="ArrowDown">▼</button>
                <button class="dtb" data-code="ArrowRight" data-key="ArrowRight">►</button>
            </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;align-items:center;">
            <button class="dtb" data-code="Space" data-key=" ">USAR</button>
            <button class="dtb" data-code="ControlLeft" data-key="Control" style="width:72px;height:72px;font-size:22px;border-color:rgba(255,59,59,0.65);background:rgba(255,59,59,0.14);">💥</button>
        </div>`;
    overlay.appendChild(tb);

    if (!document.getElementById('doom-btn-style')) {
        const style = document.createElement('style');
        style.id = 'doom-btn-style';
        style.textContent = '.dtb{background:rgba(0,0,0,0.72);border:1px solid rgba(255,59,59,0.38);color:#ff8888;width:54px;height:54px;border-radius:10px;font-size:15px;cursor:pointer;display:flex;align-items:center;justify-content:center;-webkit-tap-highlight-color:transparent;user-select:none;touch-action:manipulation;}.dtb:active{background:rgba(255,59,59,0.28);}';
        document.head.appendChild(style);
    }

    tb.querySelectorAll('.dtb').forEach(btn => {
        const code = btn.dataset.code, key = btn.dataset.key;
        const down = e => { e.preventDefault(); dispatchKey('keydown', code, key); };
        const up   = e => { e.preventDefault(); dispatchKey('keyup', code, key); };
        btn.addEventListener('touchstart', down, { passive: false });
        btn.addEventListener('touchend', up, { passive: false });
        btn.addEventListener('mousedown', down);
        btn.addEventListener('mouseup', up);
    });
}

window.startDoom = startDoom;
window.stopDoom  = stopDoom;

// ===== APERTURA / CIERRE DEL OVERLAY ========================================
window.openDoom = function () {
    const overlay = document.getElementById('doom-overlay');
    if (overlay) {
        overlay.style.display = 'flex';
        requestAnimationFrame(() => requestAnimationFrame(() => startDoom()));
    }
};
window.closeDoom = function () {
    const overlay = document.getElementById('doom-overlay');
    if (overlay) overlay.style.display = 'none';
    stopDoom();
};
