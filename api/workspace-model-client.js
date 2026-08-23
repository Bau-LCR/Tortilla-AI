// ============================================================
//  api/workspace-model-client.js — Cut-real AI · WORKSPACE
//
//  Cliente de modelo INDEPENDIENTE del chat principal (que sigue
//  usando groq-client.js sin cambios). Lo usa exclusivamente el
//  agente unificado de Sandbox 3D + Workspace (api/sandbox-agent.js),
//  para que nunca compita por tokens/rate-limit con el chat normal.
//
//  El Sandbox queda fijado a Google Gemini, independiente de Groq:
//   - Las conversaciones sin tools usan el endpoint compatible con OpenAI.
//   - Las solicitudes con tools usan el endpoint REST nativo
//       https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent
//     para evitar incompatibilidades del adaptador OpenAI en function calling.
//   - Ambas rutas se normalizan al formato choices[0].message.tool_calls que
//     ya parsea api/sandbox-agent.js.
//   - Los campos exclusivos de OpenRouter (por ejemplo `models`,
//     `reasoning` como objeto y headers HTTP-Referer) no se envían a Gemini.
//
//  OpenRouter se conserva como preset histórico de compatibilidad, pero no es
//  el proveedor activo del Sandbox y nunca se comparte con el chat normal.
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
    defaultModel: "gemini-3.7-flash",
    fallbackModel: "gemini-3.5-flash-lite",
    // Guardia local conservadora para el nivel Free. Google aplica los
    // límites por proyecto y modelo; la cifra activa debe verificarse en
    // AI Studio y puede cambiar. Ajustá WORKSPACE_MODEL_RPM/RPD si tu panel
    // muestra otros valores. El RPD del proveedor se reinicia a medianoche
    // del Pacífico, según la documentación oficial de Google.
    rpm: 10,
    rpd: 500,
  },
  openrouter: {
    baseURL: "https://openrouter.ai/api/v1/chat/completions",
    keyPrefix: "OPENROUTER_API_KEY",
    defaultModel: "openrouter/free",       // router gratuito oficial con selección de modelos compatibles
    fallbackModel: "openrouter/free",      // segunda referencia al router gratuito, sin modelo pago
    extraHeaders: {
      "HTTP-Referer": "https://cut-real-ai.vercel.app",
      "X-Title": "Cut-real AI Sandbox",
    },
    // El router gratuito selecciona modelos disponibles sin precio por token.
    // Sin créditos suficientes, el límite diario puede ser 50; el límite
    // local conservador evita seguir reintentando después de un 429 diario.
    rpm: 20,
    rpd: 50,
  },
};

// Fijado deliberadamente a Gemini para que el Sandbox no comparta proveedor
// ni cuota con el chat normal, que continúa usando Groq.
const PROVIDER = "gemini";
const PRESET   = PROVIDER_PRESETS[PROVIDER] || PROVIDER_PRESETS.openrouter;
const configuredModel = process.env.WORKSPACE_MODEL_NAME;
const configuredFallbackModel = process.env.WORKSPACE_MODEL_FALLBACK;
// Ignorar valores antiguos como openrouter/free y Gemini 2.5 evita que una
// variable de Vercel olvidada dirija una petición a un modelo que el proyecto
// nuevo no tiene habilitado. Los modelos Gemini 3 activos son estables y
// soportan function calling.
const isLegacyGeminiModel = (value) => /^gemini-(?:2\.0|2\.5)(?:-|$)/i.test(String(value || ""));
const shouldUseGeminiDefault = (value) => !value
  || String(value).startsWith("openrouter/")
  || isLegacyGeminiModel(value);
const MODEL_NAME = PROVIDER === "gemini" && shouldUseGeminiDefault(configuredModel)
  ? PRESET.defaultModel
  : (configuredModel || PRESET.defaultModel);
const FALLBACK_MODEL = PROVIDER === "gemini" && shouldUseGeminiDefault(configuredFallbackModel)
  ? (PRESET.fallbackModel || MODEL_NAME)
  : (configuredFallbackModel || PRESET.fallbackModel || MODEL_NAME);
const RPM_LIMIT       = parseInt(process.env.WORKSPACE_MODEL_RPM || "", 10) || PRESET.rpm;
const RPD_LIMIT       = parseInt(process.env.WORKSPACE_MODEL_RPD || "", 10) || PRESET.rpd;
const BLOCK_COOLDOWN_MS = parseInt(process.env.WORKSPACE_MODEL_BLOCK_COOLDOWN_MS || "60000", 10);
const DAILY_LIMIT_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export const WORKSPACE_MODEL_PROVIDER = PROVIDER;
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
      message: `El proveedor ${PROVIDER} está limitando temporalmente las claves configuradas.`,
    };
  }

  const apiKeyValue = process.env[key.envName];
  const headers = {
    Authorization: `Bearer ${apiKeyValue}`,
    "Content-Type": "application/json",
    ...(PRESET.extraHeaders || {}),
  };

  // Normalizar el payload por proveedor. Gemini usa generateContent nativo
  // cuando hay tools y OpenAI-compatible para mensajes sin tools; nunca
  // acepta los campos de fallback/router de OpenRouter.
  const { models: requestedModels, reasoning, parallel_tool_calls, transport, ...providerPayload } = payload || {};
  const requestedModel = typeof providerPayload.model === "string" ? providerPayload.model : MODEL_NAME;
  const safeRequestedModel = PROVIDER === "gemini" && requestedModel.startsWith("openrouter/")
    ? MODEL_NAME
    : requestedModel;
  const body = { ...providerPayload, model: safeRequestedModel };
  if (PROVIDER === "openrouter" && Array.isArray(requestedModels) && requestedModels.length) {
    body.models = requestedModels;
  }
  if (PROVIDER === "gemini") {
    // No trasladar tool_choice ni reasoning_effort al cuerpo nativo: Gemini
    // recibe toolConfig/generationConfig en sus nombres REST propios.
    if (body.tool_choice && typeof body.tool_choice === "object") body.tool_choice = "auto";
    // Gemini 3 no acepta reasoning_effort="none" (solo low/medium/high).
    // Mantener low reduce el razonamiento oculto sin enviar un campo inválido;
    // Gemini 2.5 sí conserva la opción none por compatibilidad.
    if (reasoning?.effort === "none") {
      if (/^gemini-2\.5(?:-|$)/i.test(safeRequestedModel)) {
        body.reasoning_effort = "none";
      } else if (/^gemini-3(?:\.|-|$)/i.test(safeRequestedModel)) {
        body.reasoning_effort = "low";
      }
    }
    // parallel_tool_calls no es necesario: la solicitud low-poly ofrece solo
    // create_lowpoly_object y omitir el campo mejora compatibilidad Gemini.
  } else if (parallel_tool_calls !== undefined) {
    body.parallel_tool_calls = parallel_tool_calls;
  }

  let response;
  let data;
  try {
    if (PROVIDER === "gemini" && Array.isArray(body.tools) && body.tools.length) {
      const nativeResult = await callGeminiGenerateContent({
        apiKey: apiKeyValue,
        model: safeRequestedModel,
        messages: body.messages,
        tools: body.tools,
        maxOutputTokens: body.max_tokens,
      });
      response = nativeResult.response;
      data = nativeResult.data;
    } else {
      response = await fetch(PRESET.baseURL, { method: "POST", headers, body: JSON.stringify(body) });
      data = await response.json().catch(() => ({}));
    }
  } catch (networkErr) {
    const err = new Error(`No se pudo contactar al modelo del Workspace (${PROVIDER}): ${networkErr.message}`);
    err.code = "NETWORK_ERROR";
    throw err;
  }

  if (response.status === 429) {
    const retryAfterHeader = response.headers?.get?.("retry-after");
    const retryAfterSeconds = Number(retryAfterHeader);
    const upstreamMessage = data?.error?.message || `${PROVIDER} devolvió HTTP 429.`;
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

  if (!response.ok) {
    // Errores como 401/402/404 no son un rate limit: se devuelven
    // al agente para que muestre el motivo real y no quede esperando.
    key.lastStatus = response.status;
    return { response, data };
  }

  key.callTimestamps.push(Date.now());
  return { response, data };
}

function nativeGeminiText(messages) {
  return (Array.isArray(messages) ? messages : [])
    .filter(m => m && m.role !== "system")
    .map(m => `${String(m.role || "user").toUpperCase()}: ${String(m.content ?? "")}`)
    .join("\n\n")
    .trim();
}

function nativeGeminiSystemInstruction(messages) {
  return (Array.isArray(messages) ? messages : [])
    .filter(m => m && m.role === "system")
    .map(m => String(m.content ?? ""))
    .join("\n\n")
    .trim();
}

function nativeGeminiTools(tools) {
  return (Array.isArray(tools) ? tools : []).map(tool => ({
    type: "function",
    name: tool?.function?.name,
    description: tool?.function?.description || "",
    parameters: tool?.function?.parameters || { type: "object", properties: {} },
  })).filter(tool => tool.name);
}

function normalizeGeminiInteractionResponse(raw, model) {
  const steps = Array.isArray(raw?.steps) ? raw.steps : [];
  const toolCalls = steps
    .filter(step => step && (step.type === "function_call" || step.type === "tool_call"))
    .map((step, index) => ({
      id: step.id || step.call_id || `gemini-function-call-${index + 1}`,
      type: "function",
      function: {
        name: step.name || step.function?.name,
        arguments: typeof step.arguments === "string"
          ? step.arguments
          : JSON.stringify(step.arguments || step.function?.arguments || {}),
      },
    }))
    .filter(call => call.function.name);
  const outputText = raw?.output_text || steps
    .filter(step => step && (step.type === "model_output" || step.type === "text"))
    .map(step => typeof step.text === "string" ? step.text : step.content?.[0]?.text || "")
    .filter(Boolean)
    .join("\n") || null;
  const usage = raw?.usage || raw?.usage_metadata || null;
  return {
    id: raw?.id || null,
    model: raw?.model || model,
    choices: [{
      message: { role: "assistant", content: outputText, tool_calls: toolCalls },
      finish_reason: toolCalls.length ? "tool_calls" : "stop",
    }],
    usage,
    nativeSteps: steps,
  };
}

function normalizeGeminiInteractionError(raw, status) {
  const candidate = raw?.error?.message || raw?.message || raw?.detail || raw?.error;
  const detail = typeof candidate === "string" ? candidate : JSON.stringify(candidate || raw || `HTTP ${status}`);
  return { error: { message: detail }, nativeError: raw };
}

async function callGeminiInteractions({ apiKey, model, messages, tools, maxOutputTokens }) {
  const nativeTools = nativeGeminiTools(tools);
  const requestBody = {
    model,
    input: nativeGeminiText(messages) || "Generá la respuesta solicitada.",
    system_instruction: nativeGeminiSystemInstruction(messages) || undefined,
    tools: nativeTools,
    tool_choice: nativeTools.length ? "any" : "none",
    generation_config: {
      max_output_tokens: Math.max(256, Number(maxOutputTokens) || 1400),
      thinking_level: "low",
    },
    store: false,
  };
  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });
  const raw = await response.json().catch(() => ({}));
  return {
    response,
    data: response.ok ? normalizeGeminiInteractionResponse(raw, model) : normalizeGeminiInteractionError(raw, response.status),
    requestBody,
  };
}

function nativeGeminiGenerateContents(messages) {
  const contents = [];
  for (const message of Array.isArray(messages) ? messages : []) {
    if (!message || message.role === "system") continue;
    const text = String(message.content ?? "").trim();
    if (!text) continue;
    contents.push({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text }],
    });
  }
  return contents.length ? contents : [{ role: "user", parts: [{ text: "Generá la respuesta solicitada." }] }];
}

function nativeGeminiGenerateTools(tools) {
  const declarations = nativeGeminiTools(tools).map(({ type, ...declaration }) => declaration);
  return declarations.length ? [{ functionDeclarations: declarations }] : undefined;
}

function normalizeGeminiGenerateContentResponse(raw, model) {
  const candidates = Array.isArray(raw?.candidates) ? raw.candidates : [];
  const parts = candidates.flatMap(candidate => Array.isArray(candidate?.content?.parts) ? candidate.content.parts : []);
  const toolCalls = parts
    .filter(part => part && part.functionCall?.name)
    .map((part, index) => ({
      id: part.functionCall.id || `gemini-function-call-${index + 1}`,
      type: "function",
      function: {
        name: part.functionCall.name,
        arguments: typeof part.functionCall.args === "string"
          ? part.functionCall.args
          : JSON.stringify(part.functionCall.args || {}),
      },
    }));
  const text = parts
    .filter(part => typeof part?.text === "string")
    .map(part => part.text)
    .join("\\n") || null;
  const usageMetadata = raw?.usageMetadata || null;
  return {
    id: raw?.responseId || null,
    model,
    choices: [{
      message: { role: "assistant", content: text, tool_calls: toolCalls },
      finish_reason: toolCalls.length ? "tool_calls" : (candidates[0]?.finishReason || "stop").toLowerCase(),
    }],
    usage: usageMetadata ? {
      prompt_tokens: Number(usageMetadata.promptTokenCount || 0),
      completion_tokens: Number(usageMetadata.candidatesTokenCount || 0),
      total_tokens: Number(usageMetadata.totalTokenCount || 0),
      thoughts_tokens: Number(usageMetadata.thoughtsTokenCount || 0),
    } : null,
  };
}

async function callGeminiGenerateContent({ apiKey, model, messages, tools, maxOutputTokens }) {
  const nativeTools = nativeGeminiTools(tools);
  const requestBody = {
    contents: nativeGeminiGenerateContents(messages),
    systemInstruction: nativeGeminiSystemInstruction(messages)
      ? { parts: [{ text: nativeGeminiSystemInstruction(messages) }] }
      : undefined,
    tools: nativeGeminiGenerateTools(tools),
    toolConfig: nativeTools.length === 1
      ? { functionCallingConfig: { mode: "ANY", allowedFunctionNames: nativeTools.map(tool => tool.name) } }
      : { functionCallingConfig: { mode: "AUTO" } },
    generationConfig: {
      maxOutputTokens: Math.max(256, Number(maxOutputTokens) || 1400),
      thinkingConfig: { thinkingLevel: "LOW" },
    },
  };
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });
  const raw = await response.json().catch(() => ({}));
  return {
    response,
    data: response.ok ? normalizeGeminiGenerateContentResponse(raw, model) : normalizeGeminiInteractionError(raw, response.status),
    requestBody,
  };
}

/** Info de diagnóstico (proveedor/modelo/keys activas, sin exponer las keys). */
export function workspaceModelInfo() {
  return {
    provider: PROVIDER, model: MODEL_NAME, fallbackModel: FALLBACK_MODEL,
    keysConfigured: discoverKeys().length, rpm: RPM_LIMIT, rpd: RPD_LIMIT,
  };
}
