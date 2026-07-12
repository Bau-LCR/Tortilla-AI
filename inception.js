// ===== CUT-REAL INCEPTION — La web adentro de sí misma =====
// Se activa escribiendo "INCEPTION" en el chat (mismo patrón que
// "doom 1993" y "VIVO").
//
// Como estamos embebiendo el MISMO dominio, no hay bloqueo de
// X-Frame-Options / CSP frame-ancestors — esa protección existe para
// evitar que OTROS sitios te embeban sin permiso, no aplica cuando el
// padre y el hijo son el mismo origen.
//
// El único riesgo real es la recursión infinita: si la copia embebida
// también pudiera disparar "INCEPTION", se generarían iframes dentro
// de iframes hasta colgar el navegador. Por eso el trigger se
// desactiva automáticamente en cualquier instancia que detecte que
// ya está corriendo DENTRO de un iframe — ver window.IS_EMBEDDED_INSTANCE
// en main.js, que se calcula con window.top !== window.self.
//
// API pública: window.openInception(), window.closeInception()

'use strict';

// Ajustá esta URL si tu dominio cambia. El parámetro ?embedded=1 es
// solo informativo (queda en la URL de la copia anidada); la guarda
// real contra la recursión es window.top !== window.self, no este
// parámetro — así que aunque alguien lo saque manualmente de la URL,
// la protección sigue funcionando.
const SELF_URL = 'https://cut-real-ai.vercel.app/?embedded=1';

window.openInception = function () {
    const overlay = document.getElementById('inception-overlay');
    const iframe  = document.getElementById('inception-iframe');
    if (!overlay || !iframe) return;
    iframe.src = SELF_URL;
    overlay.style.display = 'flex';
};

window.closeInception = function () {
    const overlay = document.getElementById('inception-overlay');
    const iframe  = document.getElementById('inception-iframe');
    if (overlay) overlay.style.display = 'none';
    // Vaciar el src destruye por completo la instancia anidada: corta
    // cualquier listener de Firestore, timer o audio que haya abierto
    // esa copia de la app. Si solo ocultáramos el overlay, la copia
    // seguiría corriendo (y consumiendo recursos) en segundo plano.
    if (iframe) iframe.src = '';
};
