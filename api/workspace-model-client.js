// ============================================================
//  api/workspace-model-client.js — Cut-real AI · WORKSPACE
//
//  Cliente de modelo INDEPENDIENTE del chat principal (que sigue
//  usando groq-client.js sin cambios). Lo usa exclusivamente el
//  agente unificado de Sandbox 3D + Workspace (api/sandbox-agent.js),
//  para que nunca compita por tokens/rate-limit con el chat normal.
//
//  El Sandbox actual queda fijado a OpenRouter:
//   - Usa el endpoint compatible con OpenAI:
//       https://openrouter.ai/api/v1/chat/completions
//   - Conserva el formato choices[0].message.tool_calls que ya parsea
//     api/sandbox-agent.js.
//   - El fallback entre modelos se envía en una única solicitud mediante
//     el parámetro `models`, sin cambiar el proveedor del chat normal.
//
//  La variable histórica de proveedor se conserva por compatibilidad documental,
//  pero el transporte del Sandbox no la utiliza y permanece aislado en OpenRouter.
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
    defaultModel: "z-ai/glm-5.2:free",   // modelo avanzado de código/razonamiento con tool calling
    fallbackModel: "cohere/north-mini-code:free",  // respaldo orientado a programación
    extraHeaders: {
      "HTTP-Referer": "https://cut-real-ai.vercel.app",
      "X-Title": "Cut-real AI Sandbox",
    },
    // Límites documentados actualmente por OpenRouter para modelos :free.
    // Sin créditos suficientes, el límite diario puede ser 50; el límite
    // local conservador evita seguir reintentando después de un 429 diario.
    rpm: 20,
    rpd: 50,
  },
};

const PROVIDER = "openrouter";
const PRESET   = PROVIDER_PRESETS[PROVIDER] || PROVIDER_PRESETS.openrouter;
const MODEL_NAME      = process.env.WORKSPACE_MODEL_NAME || PRESET.defaultModel;
const FALLBACK_MODEL  = process.env.WORKSPACE_MODEL_FALLBACK || PRESET.fallbackModel || MODEL_NAME;
const RPM_LIMIT       = parseInt(process.env.WORKSPACE_MODEL_RPM || "", 10) || PRESET.rpm;
const RPD_LIMIT       = parseInt(process.env.WORKSPACE_MODEL_RPD || "", 10) || PRESET.rpd;
const BLOCK_COOLDOWN_MS = parseInt(process.env.WORKSPACE_MODEL_BLOCK_COOLDOWN_MS || "60000", 10);
const DAILY_LIMIT_COOLDOWN_MS = 24 * 60 * 60 * 1000;

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
        blockedUntil: 0, lastStatus: null,
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
  if (k.blockedUntil > now) return false;
  if (k.blockedUntil) k.blockedUntil = 0;
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
  if (!key) {
    const nextRetryAt = Math.min(...store.map(k => k.blockedUntil || (Date.now() + BLOCK_COOLDOWN_MS)));
    return {
      limited: true,
      provider: PROVIDER,
      retryAfterMs: Math.max(1000, nextRetryAt - Date.now()),
      message: "OpenRouter está limitando temporalmente las claves configuradas.",
    };
  }

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
    const retryAfterHeader = response.headers?.get?.("retry-after");
    const retryAfterSeconds = Number(retryAfterHeader);
    const data = await response.json().catch(() => ({}));
    const upstreamMessage = data?.error?.message || "OpenRouter devolvió HTTP 429.";
    const looksDaily = /daily|per day|por d[ií]a|day limit|cuota diaria/i.test(upstreamMessage);
    const retryAfterMs = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
      ? retryAfterSeconds * 1000
      : (looksDaily ? DAILY_LIMIT_COOLDOWN_MS : BLOCK_COOLDOWN_MS);
    key.blockedUntil = Date.now() + retryAfterMs;
    key.lastStatus = 429;
    return {
      limited: true,
      provider: PROVIDER,
      retryAfterMs,
      message: upstreamMessage,
      data,
    };
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    // Errores como 401/402/404 no son un rate limit: se devuelven
    // al agente para que muestre el motivo real y no quede esperando.
    key.lastStatus = response.status;
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
