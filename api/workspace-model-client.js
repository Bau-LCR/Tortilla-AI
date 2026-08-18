// ============================================================
//  api/workspace-model-client.js — Cut-real AI · WORKSPACE
//
//  Cliente de modelo INDEPENDIENTE del chat principal (que sigue
//  usando groq-client.js sin cambios). Lo usa exclusivamente el
//  agente unificado de Sandbox 3D + Workspace (api/sandbox-agent.js),
//  para que nunca compita por tokens/rate-limit con el chat normal.
//
//  Por qué Gemini por defecto:
//   - Free tier sin tarjeta, con RPD/TPM mucho más altos que el
//     free tier de Groq (esto es lo que resuelve "que no se
//     inutilice tan rápido").
//   - Expone un endpoint COMPATIBLE CON OPENAI:
//       https://generativelanguage.googleapis.com/v1beta/openai/chat/completions
//     que devuelve choices[0].message.tool_calls en el MISMO
//     formato que ya parsea api/sandbox-agent.js — no hace falta
//     tocar el parseo de la respuesta, solo el transporte.
//
//  Cambiar de proveedor es un env var, no un redeploy de código:
//      WORKSPACE_MODEL_PROVIDER = gemini | openrouter
//
//  Rotación de keys (mismo patrón que groq-client.js):
//      GEMINI_API_KEY, GEMINI_API_KEY_2, GEMINI_API_KEY_3, ...
//      OPENROUTER_API_KEY, OPENROUTER_API_KEY_2, ...
//
//  A diferencia de groq-client.js (que limita por TOKENS acumulados,
//  un valor inventado por nosotros), acá se respeta el límite REAL
//  del free tier de cada proveedor: peticiones por minuto (RPM) y
//  por día (RPD), con ventana deslizante por key.
// ============================================================

const PROVIDER_PRESETS = {
  gemini: {
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    keyPrefix: "GEMINI_API_KEY",
    defaultModel: "gemini-2.5-flash",
    fallbackModel: "gemini-2.0-flash",
    // Límites free tier reales (Google AI Studio, modelos Flash).
    // Verificalos en ai.google.dev/gemini-api/docs/rate-limits — si
    // Google los cambia, ajustalos con WORKSPACE_MODEL_RPM/RPD, sin tocar código.
    rpm: 15,
    rpd: 1500,
  },
  openrouter: {
    baseURL: "https://openrouter.ai/api/v1/chat/completions",
    keyPrefix: "OPENROUTER_API_KEY",
    defaultModel: "meta-llama/llama-3.3-70b-instruct:free",
    // "openrouter/free" es el auto-router de OpenRouter: elige solo
    // entre los modelos :free disponibles que soporten tool calling.
    // Buen fallback cuando el modelo principal está caído/removido.
    fallbackModel: "openrouter/free",
    extraHeaders: {
      "HTTP-Referer": "https://cut-real-ai.vercel.app",
      "X-Title": "Cut-real AI Workspace",
    },
    // Free tier típico de OpenRouter (compartido entre todos los
    // modelos :free de una misma key).
    rpm: 20,
    rpd: 200,
  },
};

const PROVIDER      = (process.env.WORKSPACE_MODEL_PROVIDER || "gemini").toLowerCase();
const PRESET         = PROVIDER_PRESETS[PROVIDER] || PROVIDER_PRESETS.gemini;
const MODEL_NAME      = process.env.WORKSPACE_MODEL_NAME || PRESET.defaultModel;
const FALLBACK_MODEL  = process.env.WORKSPACE_MODEL_FALLBACK || PRESET.fallbackModel || MODEL_NAME;
const RPM_LIMIT       = parseInt(process.env.WORKSPACE_MODEL_RPM || "", 10) || PRESET.rpm;
const RPD_LIMIT       = parseInt(process.env.WORKSPACE_MODEL_RPD || "", 10) || PRESET.rpd;
const BLOCK_COOLDOWN_MS = parseInt(process.env.WORKSPACE_MODEL_BLOCK_COOLDOWN_MS || "60000", 10);

export const WORKSPACE_MODEL_NAME     = MODEL_NAME;
export const WORKSPACE_MODEL_FALLBACK = FALLBACK_MODEL;

// ── DESCUBRIMIENTO DINÁMICO DE KEYS (mismo patrón que groq-client.js) ──
function discoverKeys() {
  const keys = [];
  if (process.env[PRESET.keyPrefix]) keys.push({ envName: PRESET.keyPrefix });
  let i = 2;
  while (process.env[`${PRESET.keyPrefix}_${i}`]) {
    keys.push({ envName: `${PRESET.keyPrefix}_${i}` });
    i++;
  }
  return keys;
}

function ensureStore() {
  const discovered = discoverKeys();
  const stale = !global._workspaceModelStore
    || global._workspaceModelStore.provider !== PROVIDER
    || global._workspaceModelStore.keys.length !== discovered.length;
  if (stale) {
    global._workspaceModelStore = {
      provider: PROVIDER,
      keys: discovered.map((k, idx) => ({
        index: idx, envName: k.envName,
        callTimestamps: [],   // ventana deslizante de 24h, para RPM (60s) y RPD (24h)
        blocked: false, lastBlockedAt: 0,
      })),
    };
  }
  return global._workspaceModelStore.keys;
}

function pruneTimestamps(k) {
  const now = Date.now();
  k.callTimestamps = k.callTimestamps.filter(t => now - t < 24 * 60 * 60 * 1000);
}

function keyIsAvailable(k) {
  const now = Date.now();
  if (k.blocked && (now - k.lastBlockedAt) < BLOCK_COOLDOWN_MS) return false;
  if (k.blocked) k.blocked = false;
  pruneTimestamps(k);
  const lastMinuteCalls = k.callTimestamps.filter(t => now - t < 60000).length;
  if (lastMinuteCalls >= RPM_LIMIT) return false;
  if (k.callTimestamps.length >= RPD_LIMIT) return false;
  return true;
}

function pickKey(store) {
  for (const k of store) if (keyIsAvailable(k)) return k;
  return null;
}

/**
 * Llama al modelo del Workspace/Sandbox, rotando entre todas las
 * keys del proveedor configurado, respetando RPM/RPD reales (no
 * un límite de tokens inventado). Si TODAS las keys están al tope,
 * devuelve { limited: true } en vez de tirar un 429 agresivo — el
 * caller (api/sandbox-agent.js) ya sabe convertir eso en un
 * "skipped: global_rate_limit" como hace con los demás límites.
 *
 * payload acepta { model } opcional para forzar un modelo puntual
 * (ej. el que fuerza el admin desde config/sandbox_control).
 */
export async function callWorkspaceModel(payload) {
  const store = ensureStore();
  if (store.length === 0) {
    const err = new Error(`No hay ninguna ${PRESET.keyPrefix} configurada en Vercel (proveedor: ${PROVIDER}).`);
    err.code = "NO_KEYS";
    throw err;
  }

  const key = pickKey(store);
  if (!key) return { limited: true, provider: PROVIDER, retryAfterMs: 60000 };

  const apiKeyValue = process.env[key.envName];
  const headers = {
    Authorization: `Bearer ${apiKeyValue}`,
    "Content-Type": "application/json",
    ...(PRESET.extraHeaders || {}),
  };

  const body = { model: MODEL_NAME, ...payload }; // payload.model (si viene) pisa el default

  let response;
  try {
    response = await fetch(PRESET.baseURL, { method: "POST", headers, body: JSON.stringify(body) });
  } catch (networkErr) {
    const err = new Error(`No se pudo contactar al modelo del Workspace (${PROVIDER}): ${networkErr.message}`);
    err.code = "NETWORK_ERROR";
    throw err;
  }

  if (response.status === 429) {
    key.blocked = true; key.lastBlockedAt = Date.now();
    return { limited: true, provider: PROVIDER, retryAfterMs: BLOCK_COOLDOWN_MS };
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    // Error real (modelo inválido, 400, etc.) — no cuenta como uso de cuota.
    return { response, data };
  }

  key.callTimestamps.push(Date.now());
  return { response, data };
}

/** Info de diagnóstico (proveedor/modelo/keys activas), sin exponer las keys. */
export function workspaceModelInfo() {
  return {
    provider: PROVIDER, model: MODEL_NAME, fallbackModel: FALLBACK_MODEL,
    keysConfigured: discoverKeys().length, rpm: RPM_LIMIT, rpd: RPD_LIMIT,
  };
}
