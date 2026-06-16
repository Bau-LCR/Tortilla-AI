// ============================================================
//  loquendo.js  —  Cut-real AI  |  Voz Loquendo clásica
//  Web Speech API configurada para sonar lo más robótica
//  y masculina posible (estilo Loquendo/Carlos).
//  Sincroniza amplitud con CutRealOrb.setVolume()
// ============================================================

(function () {
    'use strict';

    // ── CONFIGURACIÓN ───────────────────────────────────────
    const CFG = {
        rate:   0.78,   // Más lento = más Loquendo
        pitch:  0.40,   // Muy bajo = robótico masculino
        volume: 1.0,
        // Preferencias de voz, de mejor a peor
        voicePrefs: [
            { name: 'Microsoft Pablo',   lang: null },
            { name: 'Microsoft Jorge',   lang: null },
            { name: 'Google español',    lang: null },
            { name: 'español',           lang: null },
            { name: null,                lang: 'es-AR' },
            { name: null,                lang: 'es-ES' },
            { name: null,                lang: 'es-MX' },
            { name: null,                lang: 'es'    },
        ],
    };

    // ── ESTADO ──────────────────────────────────────────────
    const S = {
        synth:         window.speechSynthesis || null,
        voices:        [],
        voice:         null,
        isSpeaking:    false,
        currentUtter:  null,
        _volTimer:     null,
        _volPhase:     0,
        enabled:       true,
    };

    // ── CARGA Y SELECCIÓN DE VOZ ─────────────────────────────
    function loadVoices() {
        if (!S.synth) return;
        const all = S.synth.getVoices();
        if (!all || all.length === 0) return;
        S.voices = all;
        S.voice  = pickVoice(all);
    }

    function pickVoice(voices) {
        for (const pref of CFG.voicePrefs) {
            let match;
            if (pref.name) {
                match = voices.find(v => v.name.toLowerCase().includes(pref.name.toLowerCase()));
            } else if (pref.lang) {
                match = voices.find(v => v.lang.toLowerCase().startsWith(pref.lang.toLowerCase()));
            }
            if (match) return match;
        }
        // Último recurso: primera voz disponible
        return voices[0] || null;
    }

    if (S.synth) {
        S.synth.addEventListener('voiceschanged', loadVoices);
        loadVoices();
    }

    // ── LIMPIAR TEXTO ────────────────────────────────────────
    function clean(text) {
        return text
            .replace(/```[\s\S]*?```/g, '. Bloque de código.')
            .replace(/`[^`\n]+`/g, '')
            .replace(/\*\*(.*?)\*\*/g, '$1')
            .replace(/\*(.*?)\*/g, '$1')
            .replace(/#{1,6}\s/g, '')
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
            .replace(/https?:\/\/[^\s]+/g, '')
            .replace(/<[^>]+>/g, '')
            // Quitar emojis (bloque Unicode)
            .replace(/[\u{1F000}-\u{1FFFF}]/gu, '')
            .replace(/[\u{2600}-\u{27BF}]/gu, '')
            .replace(/[*_~|>]{2,}/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    // ── SIMULACIÓN DE AMPLITUD ──────────────────────────────
    // Web Speech API no expone audio real, simulamos con onda
    function estimateDurationMs(text) {
        const words = text.split(/\s+/).length;
        const wpm   = 130 * CFG.rate; // palabras por minuto ajustadas
        return (words / wpm) * 60 * 1000;
    }

    function estimateSyllables(text) {
        return Math.max((text.match(/[aeiouáéíóúü]/gi) || []).length * 0.65, 4);
    }

    function startVolSim(text, durationMs) {
        if (!window.CutRealOrb) return;
        clearInterval(S._volTimer);
        S._volPhase = Math.random() * Math.PI * 2;

        const syllables   = estimateSyllables(text);
        const syllableMs  = durationMs / Math.max(syllables, 1);
        let elapsed = 0;
        const step  = 38;

        S._volTimer = setInterval(() => {
            elapsed += step;
            if (elapsed > durationMs + 400) {
                clearInterval(S._volTimer);
                S._volTimer = null;
                window.CutRealOrb.setVolume(0);
                return;
            }
            S._volPhase += step / syllableMs * Math.PI * 2;

            const base    = 0.38 + Math.sin(S._volPhase * 0.7) * 0.14;
            const pulse   = Math.abs(Math.sin(S._volPhase * 2.8)) * 0.42;
            const fadeIn  = Math.min(1, elapsed / 250);
            const fadeOut = elapsed > durationMs - 350
                ? Math.max(0, (durationMs - elapsed) / 350) : 1;
            const vol = Math.min(1, (base + pulse) * fadeIn * fadeOut);

            window.CutRealOrb.setVolume(vol);
        }, step);
    }

    // ── API PÚBLICA ─────────────────────────────────────────
    /**
     * Sintetiza texto con voz Loquendo robótica.
     * @param {string}   text
     * @param {function} [onEnd]
     */
    window.LoquendoSpeak = function (text, onEnd) {
        if (!S.synth || !S.enabled) { if (onEnd) onEnd(); return; }

        S.synth.cancel();
        clearInterval(S._volTimer);

        const cleanText = clean(text);
        if (!cleanText || cleanText.length < 2) { if (onEnd) onEnd(); return; }

        // Mostrar orb
        if (window.CutRealOrb && !window.CutRealOrb.isVisible()) {
            window.CutRealOrb.show();
        }

        const utter = new SpeechSynthesisUtterance(cleanText);

        // Recargar voces si aún no están
        if (!S.voice) loadVoices();
        if (S.voice) utter.voice = S.voice;

        utter.lang   = 'es-AR';
        utter.rate   = CFG.rate;
        utter.pitch  = CFG.pitch;
        utter.volume = CFG.volume;

        S.currentUtter = utter;
        S.isSpeaking   = true;

        const estMs = estimateDurationMs(cleanText);

        utter.onstart = () => {
            S.isSpeaking = true;
            startVolSim(cleanText, estMs);
            // Mostrar botón stop
            const stopBtn = document.getElementById('loquendo-stop');
            if (stopBtn) stopBtn.style.display = 'inline-flex';
        };

        utter.onend = () => {
            S.isSpeaking   = false;
            S.currentUtter = null;
            clearInterval(S._volTimer);
            if (window.CutRealOrb) window.CutRealOrb.setVolume(0);
            const stopBtn = document.getElementById('loquendo-stop');
            if (stopBtn) stopBtn.style.display = 'none';
            if (onEnd) onEnd();
        };

        utter.onerror = (e) => {
            if (e.error !== 'interrupted' && e.error !== 'canceled') {
                console.warn('[Loquendo] TTS error:', e.error);
            }
            S.isSpeaking   = false;
            S.currentUtter = null;
            clearInterval(S._volTimer);
            if (window.CutRealOrb) window.CutRealOrb.setVolume(0);
            const stopBtn = document.getElementById('loquendo-stop');
            if (stopBtn) stopBtn.style.display = 'none';
            if (onEnd) onEnd();
        };

        utter.onboundary = (e) => {
            // Pulso extra en cada palabra para mayor vivacidad
            if (e.name === 'word' && window.CutRealOrb) {
                const cur = window.CutRealOrb.volume || 0.3;
                window.CutRealOrb.setVolume(Math.min(1, cur + 0.18));
            }
        };

        S.synth.speak(utter);

        // Fix Safari
        if (/^((?!chrome|android).)*safari/i.test(navigator.userAgent)) {
            setTimeout(() => {
                if (S.synth.speaking) S.synth.resume();
            }, 120);
        }
    };

    window.LoquendoStop = function () {
        if (!S.synth) return;
        S.synth.cancel();
        clearInterval(S._volTimer);
        S.isSpeaking   = false;
        S.currentUtter = null;
        if (window.CutRealOrb) window.CutRealOrb.setVolume(0);
        const stopBtn = document.getElementById('loquendo-stop');
        if (stopBtn) stopBtn.style.display = 'none';
    };

    window.LoquendoIsSpeaking = function () {
        return S.isSpeaking || !!(S.synth && S.synth.speaking);
    };

    // ── BOTONES ─────────────────────────────────────────────
    function createButtons() {
        // Botón toggle (mute/unmute)
        if (!document.getElementById('loquendo-toggle')) {
            const btn = document.createElement('button');
            btn.id        = 'loquendo-toggle';
            btn.title     = 'Activar/desactivar voz';
            btn.innerHTML = '🔊';
            btn.setAttribute('aria-label', 'Toggle voz IA');
            btn.addEventListener('click', () => {
                S.enabled = !S.enabled;
                btn.innerHTML = S.enabled ? '🔊' : '🔇';
                btn.classList.toggle('loquendo-muted', !S.enabled);
                if (!S.enabled) window.LoquendoStop();
                if (window.showToast) {
                    window.showToast(
                        S.enabled ? 'Voz activada' : 'Voz desactivada',
                        S.enabled ? '#4caf50' : '#ff6060',
                        S.enabled ? '🔊' : '🔇'
                    );
                }
            });
            const sc = document.querySelector('.side-controls');
            if (sc) sc.insertBefore(btn, sc.firstChild);
        }

        // Botón stop
        if (!document.getElementById('loquendo-stop')) {
            const btn = document.createElement('button');
            btn.id        = 'loquendo-stop';
            btn.title     = 'Detener voz';
            btn.innerHTML = '⏹';
            btn.style.display = 'none';
            btn.setAttribute('aria-label', 'Detener voz IA');
            btn.addEventListener('click', () => window.LoquendoStop());
            const sc = document.querySelector('.side-controls');
            if (sc) sc.insertBefore(btn, sc.firstChild);
        }
    }

    // ── INIT ─────────────────────────────────────────────────
    function init() {
        loadVoices();
        createButtons();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        setTimeout(init, 0);
    }

    window.LoquendoConfig = CFG;

})();
