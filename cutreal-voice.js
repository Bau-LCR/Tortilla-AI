/* CUT-REAL AI · GEMINI VOICE CENTER + Puck TTS */
(function () {
  'use strict';
  const STORAGE = 'cutreal_voice_settings_v2';
  const defaults = { provider: 'gemini', voice: 'Puck', languageCode: 'es-US', localFallback: true };
  const state = { settings: { ...defaults }, context: null, source: null, abort: null, speaking: false, enabled: true, sequence: 0 };
  const $ = id => document.getElementById(id);
  function load() { try { state.settings = { ...defaults, ...JSON.parse(localStorage.getItem(STORAGE) || '{}') }; } catch (_) {} }
  function save() { try { localStorage.setItem(STORAGE, JSON.stringify(state.settings)); } catch (_) {} }
  function setStatus(message, error) {
    ['voice-center-status','voice-call-modal-status'].forEach(id => { const el = $(id); if (el) el.textContent = message; });
    const el = $('voice-center-status'); if (el) el.dataset.tone = error ? 'error' : 'ready';
  }
  function getContext() {
    if (!state.context) state.context = new (window.AudioContext || window.webkitAudioContext)();
    return state.context;
  }
  async function unlock() {
    try { const context = getContext(); if (context.state === 'suspended') await context.resume(); return true; }
    catch (_) { return false; }
  }
  function splitText(text) {
    const clean = String(text || '').replace(/\s+/g, ' ').trim();
    if (clean.length <= 2400) return [clean];
    const sentences = clean.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [clean];
    const chunks = []; let current = '';
    for (const sentence of sentences) {
      if ((current + ' ' + sentence).trim().length > 2400 && current) { chunks.push(current.trim()); current = ''; }
      current += (current ? ' ' : '') + sentence;
    }
    if (current) chunks.push(current.trim());
    return chunks;
  }
  function pcmToBuffer(base64, sampleRate) {
    const raw = atob(base64);
    const samples = new Int16Array(raw.length / 2);
    for (let i = 0; i < samples.length; i++) samples[i] = (raw.charCodeAt(i * 2) | (raw.charCodeAt(i * 2 + 1) << 8));
    const audio = getContext().createBuffer(1, samples.length, sampleRate || 24000);
    const channel = audio.getChannelData(0);
    for (let i = 0; i < samples.length; i++) channel[i] = samples[i] / 32768;
    return audio;
  }
  async function playChunk(text, signal) {
    const response = await fetch('/api/voice-tts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice: state.settings.voice, languageCode: state.settings.languageCode }),
      signal
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Gemini no pudo generar el audio.');
    const context = getContext();
    if (context.state === 'suspended') await context.resume();
    const buffer = pcmToBuffer(data.audio, data.sampleRate);
    await new Promise((resolve, reject) => {
      if (signal.aborted) return resolve();
      const source = context.createBufferSource();
      state.source = source; source.buffer = buffer; source.connect(context.destination);
      source.onended = () => { if (state.source === source) state.source = null; resolve(); };
      try { source.start(); } catch (error) { reject(error); }
      signal.addEventListener('abort', () => { try { source.stop(); } catch (_) {} resolve(); }, { once: true });
    });
  }
  async function speak(text, onEnd) {
    if (!state.enabled) { onEnd?.(); return; }
    const chunks = splitText(text).filter(Boolean);
    if (!chunks.length) { onEnd?.(); return; }
    stop();
    const sequence = ++state.sequence;
    const controller = new AbortController(); state.abort = controller; state.speaking = true;
    try {
      await unlock();
      for (let i = 0; i < chunks.length; i++) {
        if (controller.signal.aborted || sequence !== state.sequence) return;
        setStatus('Gemini · voz ' + state.settings.voice + ' · reproduciendo ' + (i + 1) + '/' + chunks.length);
        await playChunk(chunks[i], controller.signal);
      }
      if (sequence === state.sequence) { state.speaking = false; state.abort = null; setStatus('Gemini · ' + state.settings.voice + ' · listo'); onEnd?.(); }
    } catch (error) {
      if (controller.signal.aborted) return;
      state.speaking = false; state.abort = null;
      if (state.settings.localFallback && window.LoquendoSpeak) {
        setStatus('Gemini no disponible · usando voz local de respaldo: ' + error.message, true);
        window.LoquendoSpeak(text, onEnd);
      } else {
        setStatus('Error de voz Gemini: ' + error.message, true);
        onEnd?.();
      }
    }
  }
  function stop() {
    state.sequence++;
    if (state.abort) state.abort.abort();
    state.abort = null; state.speaking = false;
    if (state.source) { try { state.source.stop(); } catch (_) {} state.source = null; }
    if (window.LoquendoStop) window.LoquendoStop();
  }
  function isSpeaking() { return state.speaking || !!window.LoquendoIsSpeaking?.(); }
  function setEnabled(enabled) { state.enabled = Boolean(enabled); if (!state.enabled) stop(); return state.enabled; }
  function renderSettings() {
    const provider = $('voice-center-provider'); if (provider) provider.value = state.settings.provider;
    const voice = $('voice-center-voice'); if (voice) voice.value = state.settings.voice;
    const language = $('voice-center-language'); if (language) language.value = state.settings.languageCode;
    const fallback = $('voice-center-fallback'); if (fallback) fallback.checked = !!state.settings.localFallback;
  }
  function open() {
    const panel = $('voice-center-panel'); if (!panel) return false;
    panel.hidden = false; panel.setAttribute('aria-hidden', 'false');
    document.body.classList.add('voice-center-open'); renderSettings();
    setStatus('Proveedor predeterminado: Gemini · voz Puck');
    return true;
  }
  function close() {
    stop();
    const panel = $('voice-center-panel'); if (panel) { panel.hidden = true; panel.setAttribute('aria-hidden', 'true'); }
    document.body.classList.remove('voice-center-open'); return true;
  }
  function bind() {
    $('voice-center-close')?.addEventListener('click', close);
    $('voice-center-provider')?.addEventListener('change', event => { state.settings.provider = event.target.value; save(); });
    $('voice-center-voice')?.addEventListener('change', event => { state.settings.voice = event.target.value; save(); });
    $('voice-center-language')?.addEventListener('change', event => { state.settings.languageCode = event.target.value; save(); });
    $('voice-center-fallback')?.addEventListener('change', event => { state.settings.localFallback = event.target.checked; save(); });
    $('voice-center-test')?.addEventListener('click', async () => {
      const text = $('voice-center-test-text')?.value.trim() || 'Hola, soy Cut-real AI. Esta es una prueba de la voz Gemini Puck.';
      await unlock(); speak(text);
    });
    $('voice-center-stop')?.addEventListener('click', () => { stop(); setStatus('Reproducción detenida'); });
    $('voice-center-call')?.addEventListener('click', () => { close(); $('voice-call-btn')?.click(); });
  }
  load();
  window.CutRealVoice = { speak, stop, unlock, isSpeaking, setEnabled, open, close, getSettings: () => ({ ...state.settings }) };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once: true }); else bind();
})();
