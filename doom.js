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
//
// ── CORRECCIONES APLICADAS ──────────────────────────────────────────────
// 1) dispatchKey() ahora fuerza keyCode/which con Object.defineProperty.
//    Los eventos creados con `new KeyboardEvent(...)` SIEMPRE devuelven
//    keyCode = 0 en todos los navegadores (limitación de la spec, no del
//    código anterior). Si el motor lee keyCode para mapear teclas (algo
//    típico en ports SDL/Emscripten), los botones táctiles nunca hacían
//    nada aunque el evento se disparara. Ahora se sobreescribe el getter.
// 2) El botón de disparo ahora envía TANTO Ctrl COMO Espacio, porque sin
//    acceso al binario no podemos saber con certeza cuál de las dos usa
//    el motor como "fire". Enlazando ambas, funciona sin importar cuál sea.
// 3) Se agregó reenvío del teclado físico: si el jugador aprieta Espacio
//    en PC, también se simula un Ctrl (y viceversa), por la misma razón
//    del punto 2 — así "disparar" funciona sin importar el bind real.
// 4) Se agregó Pointer Lock + click del mouse como disparo alternativo,
//    que es el control más intuitivo en PC para un shooter.
// ==========================================================================

'use strict';

const DOOM_SCREEN_W = 640;
const DOOM_SCREEN_H = 400;

let doomInstance = null;   // se crea UNA sola vez por sesión y se reutiliza
let doomLoading  = false;
let doomCtx      = null;
let doomPaintOn  = false;  // gatea el pintado del canvas mientras el overlay está oculto
let doomListenersAttached = false; // evita attachear listeners más de una vez

// Códigos numéricos estándar (necesarios porque `new KeyboardEvent()` no
// setea keyCode/which automáticamente — hay que forzarlos a mano).
const KEY_CODES = {
    ArrowUp: 38,
    ArrowDown: 40,
    ArrowLeft: 37,
    ArrowRight: 39,
    Space: 32,
    ControlLeft: 17,
    ControlRight: 17,
};

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

// ===== DISPATCH DE TECLADO SINTÉTICO (CORREGIDO) ============================
// `new KeyboardEvent(type, {...})` NO permite fijar keyCode/which de forma
// nativa — siempre quedan en 0. Muchos motores (incluido probablemente este)
// leen esos campos para saber qué tecla fue. Acá los forzamos manualmente
// sobreescribiendo el getter de la instancia del evento.
function dispatchKey(type, code, key) {
    const canvas = document.getElementById('doom-canvas');
    if (!canvas) return;
    const keyCode = KEY_CODES[code] || 0;
    const event = new KeyboardEvent(type, { code, key, bubbles: true, cancelable: true });
    try {
        Object.defineProperty(event, 'keyCode', { get: () => keyCode });
        Object.defineProperty(event, 'which',   { get: () => keyCode });
    } catch (e) {
        // Algunos navegadores viejos no dejan redefinir estas props; en ese
        // caso seguimos igual, no rompe nada.
    }
    canvas.dispatchEvent(event);
}

// Dispara un keydown+keyup "fantasma" para una tecla que el jugador no
// apretó realmente, usado para el doble-bind de disparo (Ctrl <-> Espacio).
function ghostKeyDown(code, key) { dispatchKey('keydown', code, key); }
function ghostKeyUp(code, key)   { dispatchKey('keyup',   code, key); }

// ===== DOBLE-BIND DE DISPARO (Ctrl <-> Espacio) =============================
// No sabemos con certeza si el motor usa Ctrl o Espacio como "fire", así
// que cuando el jugador aprieta uno de los dos en el teclado físico,
// simulamos también el otro. Se filtra por event.isTrusted para no entrar
// en loop con los eventos sintéticos que generamos nosotros mismos.
function attachFireKeyForwarding(canvas) {
    if (doomListenersAttached) return;
    doomListenersAttached = true;

    canvas.addEventListener('keydown', (e) => {
        if (!e.isTrusted) return; // evita reenviar nuestros propios eventos fantasma
        if (e.code === 'Space') ghostKeyDown('ControlLeft', 'Control');
        else if (e.code === 'ControlLeft' || e.code === 'ControlRight') ghostKeyDown('Space', ' ');
    });
    canvas.addEventListener('keyup', (e) => {
        if (!e.isTrusted) return;
        if (e.code === 'Space') ghostKeyUp('ControlLeft', 'Control');
        else if (e.code === 'ControlLeft' || e.code === 'ControlRight') ghostKeyUp('Space', ' ');
    });

    // ── Disparo con click del mouse + Pointer Lock ──────────────────────
    // Control más natural en PC para un shooter. Al primer click se pide
    // pointer lock (para look/aim); cada click adicional también dispara.
    canvas.addEventListener('click', () => {
        if (canvas.requestPointerLock) canvas.requestPointerLock();
    });
    canvas.addEventListener('mousedown', (e) => {
        if (!e.isTrusted) return;
        ghostKeyDown('ControlLeft', 'Control');
        ghostKeyDown('Space', ' ');
    });
    canvas.addEventListener('mouseup', (e) => {
        if (!e.isTrusted) return;
        ghostKeyUp('ControlLeft', 'Control');
        ghostKeyUp('Space', ' ');
    });
}

async function startDoom() {
    const canvas = document.getElementById('doom-canvas');
    if (!canvas) return;
    styleCanvas(canvas);
    doomCtx = canvas.getContext('2d');
    doomPaintOn = true;
    attachFireKeyForwarding(canvas);

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
            <button class="dtb" data-fire="1" style="width:72px;height:72px;font-size:22px;border-color:rgba(255,59,59,0.65);background:rgba(255,59,59,0.14);">💥</button>
        </div>`;
    overlay.appendChild(tb);

    if (!document.getElementById('doom-btn-style')) {
        const style = document.createElement('style');
        style.id = 'doom-btn-style';
        style.textContent = '.dtb{background:rgba(0,0,0,0.72);border:1px solid rgba(255,59,59,0.38);color:#ff8888;width:54px;height:54px;border-radius:10px;font-size:15px;cursor:pointer;display:flex;align-items:center;justify-content:center;-webkit-tap-highlight-color:transparent;user-select:none;touch-action:manipulation;}.dtb:active{background:rgba(255,59,59,0.28);}';
        document.head.appendChild(style);
    }

    tb.querySelectorAll('.dtb').forEach(btn => {
        if (btn.dataset.fire) {
            // Botón de disparo: manda Ctrl Y Espacio juntos (ver comentario
            // de "DOBLE-BIND DE DISPARO" más arriba).
            const down = e => { e.preventDefault(); dispatchKey('keydown', 'ControlLeft', 'Control'); dispatchKey('keydown', 'Space', ' '); };
            const up   = e => { e.preventDefault(); dispatchKey('keyup', 'ControlLeft', 'Control'); dispatchKey('keyup', 'Space', ' '); };
            btn.addEventListener('touchstart', down, { passive: false });
            btn.addEventListener('touchend', up, { passive: false });
            btn.addEventListener('mousedown', down);
            btn.addEventListener('mouseup', up);
            return;
        }
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
// ÚNICA definición de openDoom/closeDoom. Antes existía una segunda copia
// al final de main.js que pisaba esta (usando display:"block" en vez de
// "flex"), rompiendo el layout centrado del overlay — por eso el canvas
// se veía corrido a la izquierda. Esa copia duplicada debe borrarse de
// main.js (ver instrucciones).
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
