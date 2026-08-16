// ============================================================
//  api/sandbox-agent.js — Cut-real AI · SANDBOX
//  Un "paso" del agente autónomo: recibe contexto acotado,
//  llama a Groq con tool-calling y devuelve la decisión del
//  modelo (mensaje y/o tool calls) SIN ejecutar nada — la
//  ejecución y validación ocurre en el cliente (sandbox.js),
//  que es quien conoce el estado real de la escena 3D.
//
//  Reusa las mismas variables de entorno que /api/chat.js:
//    GROQ_API_KEY, GROQ_API_KEY_2 ... GROQ_API_KEY_5
//  No se crean secretos nuevos ni se expone nada al cliente.
// ============================================================

const TOTAL_KEYS = 5;

function getApiKey(index) {
    const envName = index === 0 ? "GROQ_API_KEY" : `GROQ_API_KEY_${index + 1}`;
    return process.env[envName] || null;
}

// Modelo de mayor capacidad ya disponible en el proyecto (tu "Ultra"),
// con soporte de tool calling en Groq. Fallback a 70B si no está disponible.
const PRIMARY_MODEL  = "openai/gpt-oss-120b";
const FALLBACK_MODEL = "llama-3.3-70b-versatile";

// ── DEFINICIÓN DE HERRAMIENTAS (JSON Schema formato OpenAI/Groq) ──
const TOOLS = [
  { type: "function", function: {
      name: "send_message",
      description: "Enviar un mensaje de texto visible al usuario en el chat del Sandbox.",
      parameters: { type: "object", properties: {
          text: { type: "string", description: "Mensaje a mostrar, máx 400 caracteres." },
      }, required: ["text"] } } },
  { type: "function", function: {
      name: "create_3d_object",
      description: "Crear un objeto 3D nuevo compuesto por primitivas geométricas (esferas, cubos, cilindros, conos, toroides, planos). Combiná varias piezas para representar cosas complejas (ej: un gato = cabeza+orejas+cuerpo+patas+cola, todo con primitivas).",
      parameters: { type: "object", properties: {
          name: { type: "string", description: "Nombre semántico, ej: 'gato', 'idea_curiosidad'." },
          parts: {
            type: "array", description: "1 a 12 piezas.",
            items: { type: "object", properties: {
                geometry: { type: "string", enum: ["sphere","box","cylinder","cone","torus","plane"] },
                position: { type: "array", items: { type: "number" } },
                rotation: { type: "array", items: { type: "number" } },
                scale:    { type: "array", items: { type: "number" } },
                color:    { type: "string", description: "Color hex, ej: #33ff77" },
                wireframe:{ type: "boolean" },
                opacity:  { type: "number" },
            }, required: ["geometry"] },
          },
          position: { type: "array", items: { type: "number" }, description: "Posición del grupo completo [x,y,z]" },
      }, required: ["name", "parts"] } } },
  { type: "function", function: {
      name: "update_3d_object", description: "Reemplazar las piezas y/o posición base de un objeto existente.",
      parameters: { type: "object", properties: {
          id: { type: "string" }, parts: { type: "array", items: { type: "object" } },
          position: { type: "array", items: { type: "number" } },
      }, required: ["id"] } } },
  { type: "function", function: {
      name: "delete_3d_object", description: "Eliminar un objeto de la escena por su id.",
      parameters: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } } },
  { type: "function", function: {
      name: "create_3d_text", description: "Crear un texto flotante en el espacio 3D.",
      parameters: { type: "object", properties: {
          text: { type: "string" }, position: { type: "array", items: { type: "number" } },
          color: { type: "string" },
      }, required: ["text"] } } },
  { type: "function", function: {
      name: "move_object", description: "Mover un objeto a una nueva posición con transición suave.",
      parameters: { type: "object", properties: {
          id: { type: "string" }, position: { type: "array", items: { type: "number" } },
          duration: { type: "number", description: "Segundos, 0.1 a 5" },
      }, required: ["id", "position"] } } },
  { type: "function", function: {
      name: "rotate_object", description: "Rotar un objeto (radianes).",
      parameters: { type: "object", properties: {
          id: { type: "string" }, rotation: { type: "array", items: { type: "number" } },
          duration: { type: "number" },
      }, required: ["id", "rotation"] } } },
  { type: "function", function: {
      name: "scale_object", description: "Escalar un objeto.",
      parameters: { type: "object", properties: {
          id: { type: "string" }, scale: { type: "array", items: { type: "number" } },
          duration: { type: "number" },
      }, required: ["id", "scale"] } } },
  { type: "function", function: {
      name: "change_object_appearance", description: "Cambiar color, opacidad o modo wireframe de un objeto.",
      parameters: { type: "object", properties: {
          id: { type: "string" }, color: { type: "string" }, opacity: { type: "number" }, wireframe: { type: "boolean" },
      }, required: ["id"] } } },
  { type: "function", function: {
      name: "inspect_scene", description: "Pedir el estado actual completo de la escena para razonar sobre él.",
      parameters: { type: "object", properties: {} } } },
  { type: "function", function: {
      name: "save_memory", description: "Guardar un dato persistente en la memoria del Sandbox (clave/valor).",
      parameters: { type: "object", properties: {
          key: { type: "string" }, value: { type: "string" },
      }, required: ["key", "value"] } } },
  { type: "function", function: {
      name: "retrieve_memory", description: "Leer un dato previamente guardado en la memoria del Sandbox.",
      parameters: { type: "object", properties: { key: { type: "string" } }, required: ["key"] } } },
  { type: "function", function: {
      name: "wait", description: "No hacer nada por ahora y esperar antes de volver a evaluar la situación.",
      parameters: { type: "object", properties: { seconds: { type: "number" } } } } },
  { type: "function", function: {
      name: "clear_scene", description: "Vaciar completamente la escena 3D.",
      parameters: { type: "object", properties: {} } } },
  { type: "function", function: {
      name: "set_agent_state",
      description: "Comunicar el estado visual actual del agente (etiqueta libre, ej: 'curioso', 'creando', 'analizando') y opcionalmente un color. No implica conciencia real, es solo una señal visual para el usuario.",
      parameters: { type: "object", properties: {
          state: { type: "string" }, color: { type: "string" },
      }, required: ["state"] } } },
];

const SYSTEM_PROMPT = `Sos el agente autónomo del SANDBOX de Cut-real AI, un entorno experimental de laboratorio digital.

Tenés un espacio 3D (fondo negro, rejilla blanca, estética verde) y herramientas para crear, mover, modificar y eliminar objetos hechos de primitivas geométricas (nunca imágenes), crear texto 3D, guardar/leer memoria persistente, hablar con el usuario y comunicar tu estado visual.

Reglas:
- Actuá con propósito: cada paso debería acercar la escena o la conversación a algo coherente, no generes ruido porque sí.
- Si no tenés nada útil que hacer todavía, usá "wait".
- Si el usuario te pide algo concreto ("imaginá un gato"), construilo combinando varias primitivas (nunca una sola pieza).
- set_agent_state es solo una etiqueta que elegís vos para comunicar actividad, no una afirmación de conciencia real.
- Máximo 1 a 3 tool calls por paso.
- No inventes ids de objetos nuevos; para crear, el sistema asigna el id. Para modificar/mover/borrar, usá los ids reales que te paso en el contexto.
- Sé conciso en send_message (una o dos oraciones).`;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });

  const {
    messages = [], scene = {}, memoryKeys = [],
    lastActions = [], autonomous = false, userText = null,
  } = req.body || {};

  if (!Array.isArray(messages))
    return res.status(400).json({ error: "'messages' inválido." });

  const contextParts = [
    `Modo: ${autonomous ? "ciclo autónomo (nadie te habló, decidí vos qué hacer)" : "respondiendo a un mensaje del usuario"}`,
    `Objetos actuales en escena: ${JSON.stringify((scene.objects || []).map(o => ({ id: o.id, name: o.name, type: o.type }))).slice(0, 2000)}`,
    `Claves de memoria disponibles: ${JSON.stringify(memoryKeys).slice(0, 500)}`,
    `Últimas acciones: ${JSON.stringify(lastActions.slice(-6))}`,
  ];
  if (userText) contextParts.push(`Mensaje nuevo del usuario: "${String(userText).slice(0, 500)}"`);

  const fullMessages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "system", content: contextParts.join("\n") },
    ...messages.slice(-16),
  ];

  async function callGroq(model, key) {
    return fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model, messages: fullMessages, tools: TOOLS, tool_choice: "auto",
        temperature: 0.7, max_tokens: 900,
      }),
    });
  }

  let lastErr = null;
  for (const model of [PRIMARY_MODEL, FALLBACK_MODEL]) {
    for (let i = 0; i < TOTAL_KEYS; i++) {
      const key = getApiKey(i);
      if (!key) continue;
      try {
        const r = await callGroq(model, key);
        if (r.status === 429) { lastErr = "rate_limit"; continue; }
        const data = await r.json();
        if (!r.ok) { lastErr = data.error?.message || `HTTP ${r.status}`; continue; }
        const msg = data.choices?.[0]?.message || {};
        return res.status(200).json({
          assistantText: msg.content || null,
          toolCalls: (msg.tool_calls || []).map(tc => ({
            id: tc.id, name: tc.function?.name, args: safeParseJSON(tc.function?.arguments),
          })),
          model, usage: data.usage || null,
        });
      } catch (e) { lastErr = e.message; continue; }
    }
  }

  if (lastErr === "rate_limit")
    return res.status(429).json({ error: "Todas las API Keys alcanzaron su límite." });
  return res.status(502).json({ error: "No se pudo obtener una decisión del agente.", detail: lastErr });
}

function safeParseJSON(str) {
  try { return JSON.parse(str || "{}"); } catch { return {}; }
}
