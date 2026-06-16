// ============================================================
//  loquendo.js  —  Cut-real AI  |  Voz Loquendo + Orb Sync
//
//  Usa la Web Speech API (SpeechSynthesis) con ajustes para
//  imitar el sonido robótico característico de Loquendo:
//  tono bajo, velocidad moderada, voz en español.
//
//  Sincroniza la amplitud estimada con CutRealOrb.setVolume()
//  para que la esfera se mueva al ritmo de la voz.
// ============================================================

(function () {
    'use strict';

    // ── CONFIGURACIÓN LOQUENDO ──────────────────────────────
    const LOQUENDO_CONFIG = {
        rate:   0.82,   // Velocidad (1 = normal). Loquendo suena un poco más lento
        pitch:  0.55,   // Tono bajo (~0.5) = robótico
        volume: 1.0,
        // Preferencias de voz (en orden de prioridad)
        voicePrefs: [
            'Microsoft Pablo',      // Windows es-ES masculino
            'Microsoft Jorge',
            'Google español',
            'es-',                  // cualquier voz en español
            'es_',
        ],
    };

    // ── ESTADO ─────────────────────────────────────────────
    const STATE = {
        synth:        window.speechSynthesis || null,
        voices:       [],
        selectedVoice: null,
        isSpeaking:   false,
        isPaused:     false,
        currentUtter: null,
        _volumeTimer: null,
        _volumePhase: 0,
        enabled:      true,   // el usuario puede desactivarlo
    };

    // ── CARGA DE VOCES ──────────────────────────────────────
    function loadVoices() {
        if (!STATE.synth) return;
        STATE.voices = STATE.synth.getVoices();
        STATE.selectedVoice = chooseBestVoice(STATE.voices);
    }

    function chooseBestVoice(voices) {
        if (!voices || voices.length === 0) return null;

        // Intentar cada preferencia en orden
        for (const pref of LOQUENDO_CONFIG.voicePrefs) {
            const match = voices.find(v =>
                v.name.toLowerCase().includes(pref.toLowerCase()) ||
                v.lang.toLowerCase().startsWith(pref.toLowerCase())
            );
            if (match) return match;
        }

        // Fallback: cualquier voz en español
        const esVoice = voices.find(v => v.lang.startsWith('es'));
        if (esVoice) return esVoice;

        // Último recurso: primera voz disponible
        return voices[0] || null;
    }

    if (STATE.synth) {
        // Chrome carga las voces de forma asíncrona
        STATE.synth.addEventListener('voiceschanged', loadVoices);
        loadVoices();
    }

    // ── LIMPIAR TEXTO PARA TTS ──────────────────────────────
    function cleanTextForTTS(text) {
        return text
            // Eliminar bloques de código
            .replace(/```[\s\S]*?```/g, '. Bloque de código omitido.')
            // Eliminar código inline
            .replace(/`[^`]+`/g, '')
            // Eliminar markdown
            .replace(/\*\*(.*?)\*\*/g, '$1')
            .replace(/\*(.*?)\*/g, '$1')
            .replace(/#{1,6}\s/g, '')
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
            // Eliminar URLs
            .replace(/https?:\/\/[^\s]+/g, '')
            // Eliminar HTML
            .replace(/<[^>]+>/g, '')
            // Eliminar emoji (aproximado)
            .replace(/[\u{1F300}-\u{1FFFF}]/gu, '')
            .replace(/[\u{2600}-\u{26FF}]/gu, '')
            .replace(/[\u{2700}-\u{27BF}]/gu, '')
            // Eliminar caracteres especiales repetidos
            .replace(/[*_~|>]{2,}/g, '')
            // Comprimir espacios
            .replace(/\s+/g, ' ')
            .trim();
    }

    // ── SIMULACIÓN DE AMPLITUD (Web Speech API no da audio real) ──
    // Usamos una onda simulada sincronizada con los fonemas estimados
    // basándonos en el texto y la duración esperada.
    function startVolumeSimulation(text, expectedDurationMs) {
        if (!window.CutRealOrb) return;

        const wordsPerMs  = (text.split(/\s+/).length) / expectedDurationMs;
        const syllables   = estimateSyllables(text);
        const syllableMs  = expectedDurationMs / Math.max(syllables, 1);

        STATE._volumePhase = 0;
        let elapsed = 0;
        const interval = 40; // ms entre updates

        clearInterval(STATE._volumeTimer);
        STATE._volumeTimer = setInterval(() => {
            elapsed += interval;
            if (elapsed >= expectedDurationMs + 300) {
                clearInterval(STATE._volumeTimer);
                STATE._volumeTimer = null;
                window.CutRealOrb.setVolume(0);
                return;
            }

            // Modulación: combina una onda base con pulsos de sílabas
            STATE._volumePhase += interval / syllableMs * Math.PI * 2;
            const base   = 0.35 + Math.sin(STATE._volumePhase * 0.8) * 0.15;
            const pulse  = Math.abs(Math.sin(STATE._volumePhase * 2.5)) * 0.45;
            // Fade in/out
            const fadeIn  = Math.min(1, elapsed / 300);
            const fadeOut = elapsed > expectedDurationMs - 400
                ? Math.max(0, (expectedDurationMs - elapsed) / 400)
                : 1;
            const volume = (base + pulse) * fadeIn * fadeOut;

            window.CutRealOrb.setVolume(Math.min(1, volume));
        }, interval);
    }

    function estimateSyllables(text) {
        // Estimación rápida por vocales en español
        const vowels = (text.match(/[aeiouáéíóúüAEIOUÁÉÍÓÚÜ]/g) || []).length;
        return Math.max(vowels * 0.6, text.split(/\s+/).length);
    }

    function estimateDuration(text, rate) {
        // ~150 palabras por minuto en Loquendo a rate=1, ajustado por rate
        const words   = text.split(/\s+/).length;
        const wpm     = 150 * rate;
        const minutes = words / wpm;
        return minutes * 60 * 1000; // en ms
    }

    // ── HABLAR ─────────────────────────────────────────────
    /**
     * Sintetiza `text` con voz Loquendo.
     * @param {string} text  Texto a hablar (puede incluir markdown, se limpia)
     * @param {function} [onEnd]  Callback al terminar
     */
    window.LoquendoSpeak = function (text, onEnd) {
        if (!STATE.synth || !STATE.enabled) {
            if (onEnd) onEnd();
            return;
        }

        // Cancelar síntesis anterior
        STATE.synth.cancel();
        clearInterval(STATE._volumeTimer);

        const cleanText = cleanTextForTTS(text);
        if (!cleanText || cleanText.length < 2) {
            if (onEnd) onEnd();
            return;
        }

        // Mostrar orb si no está visible
        if (window.CutRealOrb && !window.CutRealOrb.isVisible()) {
            window.CutRealOrb.show();
        }

        const utter = new SpeechSynthesisUtterance(cleanText);

        // Aplicar voz seleccionada
        if (STATE.selectedVoice) {
            utter.voice = STATE.selectedVoice;
        }
        utter.lang   = 'es-AR';  // español argentino como fallback
        utter.rate   = LOQUENDO_CONFIG.rate;
        utter.pitch  = LOQUENDO_CONFIG.pitch;
        utter.volume = LOQUENDO_CONFIG.volume;

        STATE.currentUtter = utter;
        STATE.isSpeaking   = true;

        // Estimar duración para simular la amplitud
        const estimatedMs = estimateDuration(cleanText, LOQUENDO_CONFIG.rate);

        utter.onstart = () => {
            STATE.isSpeaking = true;
            startVolumeSimulation(cleanText, estimatedMs);
        };

        utter.onend = () => {
            STATE.isSpeaking   = false;
            STATE.currentUtter = null;
            clearInterval(STATE._volumeTimer);
            if (window.CutRealOrb) window.CutRealOrb.setVolume(0);
            if (onEnd) onEnd();
        };

        utter.onerror = (e) => {
            // 'interrupted' es normal cuando se cancela, no es un error real
            if (e.error !== 'interrupted' && e.error !== 'canceled') {
                console.warn('[Loquendo] Error TTS:', e.error);
            }
            STATE.isSpeaking   = false;
            STATE.currentUtter = null;
            clearInterval(STATE._volumeTimer);
            if (window.CutRealOrb) window.CutRealOrb.setVolume(0);
            if (onEnd) onEnd();
        };

        utter.onboundary = (e) => {
            // Cada vez que se pronuncia una palabra/sílaba, pulsamos el orb
            if (e.name === 'word' && window.CutRealOrb) {
                // Pequeño pulso extra en cada palabra
                const currentVol = window.CutRealOrb.volume || 0.3;
                window.CutRealOrb.setVolume(Math.min(1, currentVol + 0.15));
            }
        };

        STATE.synth.speak(utter);

        // Safari fix: a veces speechSynthesis se "congela"
        if (navigator.userAgent.includes('Safari') && !navigator.userAgent.includes('Chrome')) {
            setTimeout(() => {
                if (STATE.synth.speaking && !STATE.synth.pending) {
                    STATE.synth.resume();
                }
            }, 100);
        }
    };

    /** Detener la voz inmediatamente */
    window.LoquendoStop = function () {
        if (!STATE.synth) return;
        STATE.synth.cancel();
        clearInterval(STATE._volumeTimer);
        STATE.isSpeaking   = false;
        STATE.currentUtter = null;
        if (window.CutRealOrb) window.CutRealOrb.setVolume(0);
    };

    /** ¿Está hablando? */
    window.LoquendoIsSpeaking = function () {
        return STATE.isSpeaking || (STATE.synth && STATE.synth.speaking);
    };

    // ── BOTÓN DE SILENCIO / HABILITAR TTS ──────────────────
    function createToggleButton() {
        const existing = document.getElementById('loquendo-toggle');
        if (existing) return;

        const btn = document.createElement('button');
        btn.id = 'loquendo-toggle';
        btn.title = 'Activar/desactivar voz de la IA';
        btn.innerHTML = '🔊';
        btn.setAttribute('aria-label', 'Toggle voz IA');

        // Insertar junto a los controles laterales
        const sideControls = document.querySelector('.side-controls');
        if (sideControls) {
            sideControls.insertBefore(btn, sideControls.firstChild);
        } else {
            document.body.appendChild(btn);
        }

        btn.addEventListener('click', () => {
            STATE.enabled = !STATE.enabled;
            btn.innerHTML = STATE.enabled ? '🔊' : '🔇';
            btn.classList.toggle('loquendo-muted', !STATE.enabled);
            if (!STATE.enabled) {
                window.LoquendoStop();
            }
            // Mostrar toast
            if (window.showToast) {
                window.showToast(
                    STATE.enabled ? 'Voz activada' : 'Voz desactivada',
                    STATE.enabled ? '#4caf50' : '#ff6060',
                    STATE.enabled ? '🔊' : '🔇'
                );
            }
        });
    }

    // ── BOTÓN DE PARAR HABLA ────────────────────────────────
    function createStopButton() {
        const existing = document.getElementById('loquendo-stop');
        if (existing) return;

        const btn = document.createElement('button');
        btn.id = 'loquendo-stop';
        btn.title = 'Detener la voz';
        btn.innerHTML = '⏹';
        btn.setAttribute('aria-label', 'Detener voz IA');
        btn.style.display = 'none';

        const sideControls = document.querySelector('.side-controls');
        if (sideControls) {
            sideControls.insertBefore(btn, sideControls.firstChild);
        } else {
            document.body.appendChild(btn);
        }

        btn.addEventListener('click', () => {
            window.LoquendoStop();
            btn.style.display = 'none';
        });

        // Mostrar botón stop mientras habla
        const observer = setInterval(() => {
            const speaking = window.LoquendoIsSpeaking();
            btn.style.display = speaking ? 'block' : 'none';
        }, 300);
    }

    // ── INIT ────────────────────────────────────────────────
    function init() {
        loadVoices();
        createToggleButton();
        createStopButton();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        setTimeout(init, 0);
    }

    // ── EXPONER CONFIG para ajustes desde consola ───────────
    window.LoquendoConfig = LOQUENDO_CONFIG;

})();
