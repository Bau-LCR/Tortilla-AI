// ===== CUT-REAL VIVO — Embed de YouTube =====
// Se activa escribiendo "VIVO" en el chat (mismo patrón que "doom 1993").
// En vez de compilar un motor, simplemente embebe el reproductor OFICIAL
// de YouTube vía iframe — es la forma que YouTube habilita para insertar
// videos en sitios de terceros, así que no hay tema de reproducir el
// contenido "por afuera" del reproductor original.
//
// API pública: window.openVivo(), window.closeVivo()

'use strict';

const VIVO_VIDEO_ID = 'zcWXboTnous';

window.openVivo = function () {
    const overlay = document.getElementById('vivo-overlay');
    const iframe  = document.getElementById('vivo-iframe');
    if (!overlay || !iframe) return;
    // autoplay=1 arranca el video solo al abrir el overlay.
    // rel=0 evita que al terminar sugiera videos de otros canales.
    // modestbranding=1 reduce el logo de YouTube en la esquina.
    iframe.src = `https://www.youtube.com/embed/${VIVO_VIDEO_ID}?autoplay=1&rel=0&modestbranding=1`;
    overlay.style.display = 'flex';
};

window.closeVivo = function () {
    const overlay = document.getElementById('vivo-overlay');
    const iframe  = document.getElementById('vivo-iframe');
    if (overlay) overlay.style.display = 'none';
    // Vaciar el src detiene la reproducción y corta el audio.
    // Si solo ocultáramos el overlay con display:none, el video seguiría
    // sonando de fondo aunque no se vea (bug clásico de estos embeds).
    if (iframe) iframe.src = '';
};
