/* CUT-REAL Capability Registry · fuente central y segura de capacidades reales. */
(function () {
  'use strict';

  const definitions = {
    chat: {
      label: 'Chat normal',
      modes: ['basic', 'pro', 'ultra'],
      features: ['text', 'context', 'markdown', 'tables', 'visual-boxes', 'image-input', 'pdf-input', 'docx-input', 'voice-output', 'voice-input'],
      provider: 'configured-chat-provider',
      status: 'available'
    },
    files: {
      label: 'Archivos',
      features: ['pdf-read', 'pdf-extract', 'docx-read', 'pdf-generate', 'docx-generate', 'pptx-generate', 'xlsx-generate', 'text-generate', 'download'],
      status: 'available'
    },
    images: {
      label: 'Imágenes',
      features: ['image-upload', 'image-analysis', 'image-description', 'screenshot-analysis', 'image-generation'],
      status: 'configured-by-route'
    },
    super: {
      label: 'SUPER',
      features: ['multi-model', 'process-timeline', 'neural-map', 'knowledge-map', 'model-status', 'attachments', 'workspace-bridge', 'sandbox-bridge', 'export-response'],
      status: 'available'
    },
    sandbox: {
      label: 'Sandbox',
      features: ['three-js-scene', 'low-poly-catalog', 'scene-editor', 'object-transform', 'object-color', 'object-duplicate', 'object-delete', 'workspace-files', 'firebase-persistence'],
      models: ['configured-sandbox-provider'],
      status: 'available'
    },
    voice: {
      label: 'Voz',
      features: ['loquendo-profile', 'speech-synthesis', 'speech-recognition', 'voice-call-ui'],
      permissions: ['microphone'],
      status: 'browser-dependent'
    },
    randar: {
      label: 'RANDAR',
      features: ['public-tle', 'orbital-derived-position', 'map-2d', 'globe-3d', 'radar', 'public-network-registry', 'public-data-inspector'],
      status: 'public-data-dependent'
    },
    space: {
      label: 'SPACE',
      features: ['three-dimensional-space', 'n-body-physics', 'volumetric-curvature-grid', 'spacetime-visualization', 'celestial-catalog', 'object-inspector', 'solar-system-preset', 'scenario-export', 'orbital-analysis', 'educational-mode', 'experimental-mode'],
      status: 'available'
    },
    notifications: {
      label: 'Notificaciones',
      features: ['browser-notifications'],
      permissions: ['notifications'],
      status: 'permission-dependent'
    }
  };

  const registry = {
    version: '2026.09.07',
    product: 'CUT-REAL AI',
    definitions,
    listCapabilities(scope) {
      if (!scope) return Object.values(definitions).map(item => ({ label: item.label, status: item.status, features: [...item.features] }));
      const item = definitions[String(scope).toLowerCase()];
      return item ? { ...item, features: [...item.features], modes: item.modes ? [...item.modes] : undefined } : null;
    },
    canUse(tool, scope) {
      const item = definitions[String(scope || '').toLowerCase()];
      return Boolean(item && item.features.includes(tool) && this.getToolStatus(tool, scope).available);
    },
    getToolStatus(tool, scope) {
      const item = definitions[String(scope || '').toLowerCase()];
      if (!item || !item.features.includes(tool)) return { tool, scope: scope || null, available: false, state: 'UNAVAILABLE', reason: 'No registrado para este modo.' };
      if (tool === 'speech-recognition' && !(window.SpeechRecognition || window.webkitSpeechRecognition)) return { tool, scope, available: false, state: 'UNAVAILABLE', reason: 'El navegador no ofrece SpeechRecognition.' };
      if (tool === 'speech-synthesis' && !window.speechSynthesis) return { tool, scope, available: false, state: 'UNAVAILABLE', reason: 'El navegador no ofrece síntesis de voz.' };
      if (item.permissions?.length) return { tool, scope, available: true, state: 'PERMISSION_REQUIRED', permission: item.permissions[0] };
      return { tool, scope, available: true, state: item.status === 'available' ? 'AVAILABLE' : 'CONFIGURATION_DEPENDENT' };
    },
    getModelCapabilities(model) {
      const name = String(model || '').toLowerCase();
      const vision = /vision|gemini|gpt-4o|claude|pixtral|qwen.*vl/.test(name);
      return { model: model || 'unknown', text: true, vision, reasoning: /pro|ultra|reason|think|o[1-9]|claude|gemini/.test(name), status: model ? 'DECLARED_BY_CONFIGURATION' : 'UNKNOWN' };
    },
    getPermissionStatus(permission) {
      const key = String(permission || '').toLowerCase();
      if (key === 'microphone') return { permission: key, state: navigator.permissions?.query ? 'BROWSER_QUERY_REQUIRED' : 'USER_ACTION_REQUIRED' };
      if (key === 'notifications') return { permission: key, state: 'Notification' in window ? Notification.permission.toUpperCase() : 'UNAVAILABLE' };
      return { permission: key, state: 'UNKNOWN' };
    },
    forMode(mode) {
      const normalized = String(mode || 'chat').toLowerCase();
      const allowed = normalized === 'super' ? ['super', 'files', 'images', 'voice'] : normalized === 'sandbox' ? ['sandbox', 'files', 'images', 'voice'] : normalized === 'space' ? ['space', 'files', 'images', 'voice'] : ['chat', 'files', 'images', 'voice', 'notifications'];
      return { mode: normalized, registryVersion: this.version, capabilities: allowed.map(key => this.listCapabilities(key)).filter(Boolean) };
    }
  };

  window.CutRealCapabilities = Object.freeze(registry);
})();

// La identidad se mantiene original: presencia tecnológica, directa y segura, sin copiar personajes protegidos.
window.CutRealIdentity = Object.freeze({
  name: 'Cut-real AI',
  style: 'analítica, segura, directa, tecnológica, con humor seco moderado',
  rules: ['No afirmar acciones no ejecutadas.', 'No inventar capacidades ni datos.', 'Informar permisos, estados y errores de forma clara.', 'No exponer claves, tokens ni razonamiento privado completo.']
});

