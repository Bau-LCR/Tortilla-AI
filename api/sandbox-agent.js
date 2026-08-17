// ============================================================
//  api/sandbox-agent.js — Cut-real AI · SANDBOX
//  Un "paso" del agente autónomo. Devuelve la decisión del modelo
//  (mensaje y/o tool calls) SIN ejecutar nada — la ejecución real
//  ocurre en sandbox.js, que conoce el estado real de la escena 3D.
//
//  NUEVO en esta versión:
//   - Usa api/groq-client.js (rotación dinámica, sin límite de 5 keys)
//   - Lee config/sandbox_control desde Firestore (vía REST, sin
//     necesitar Firebase Admin SDK) para aplicar en el SERVIDOR:
//       · enabled / adminOnly / maintenanceOnly / emergencyStop
//       · autonomyEnabled / maxCyclesPerSandbox / minIntervalSeconds
//       · maxGlobalCallsPerHour
//       · disabledTools (filtra las tools ofrecidas al modelo)
//       · sandboxModel (fuerza un modelo específico)
//       · systemPromptAddition (instrucciones extra del admin)
//
//  IMPORTANTE: para que el tope por-sandbox y el "adminOnly"
//  funcionen bien, sandbox.js (cliente) debe enviar en el body:
//    { ..., userId, sandboxId, isAdmin }
//  Ver ADMIN_PANEL_PATCH.md para el detalle exacto.
// ============================================================

import { callGroqWithRotation } from "./groq-client.js";

const PRIMARY_MODEL  = "openai/gpt-oss-120b";
const FALLBACK_MODEL = "llama-3.3-70b-versatile";
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "cutreal-ai";

// ── DEFINICIÓN DE HERRAMIENTAS (igual que antes) ────────────
const ALL_TOOLS = [
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

const BASE_SYSTEM_PROMPT = `Sos el agente autónomo del SANDBOX de Cut-real AI, un entorno experimental de laboratorio digital.

Tenés un espacio 3D (fondo negro, rejilla blanca, estética verde) y herramientas para crear, mover, modificar y eliminar objetos hechos de primitivas geométricas (nunca imágenes), crear texto 3D, guardar/leer memoria persistente, hablar con el usuario y comunicar tu estado visual.

Reglas:
- Actuá con propósito: cada paso debería acercar la escena o la conversación a algo coherente, no generes ruido porque sí.
- Si no tenés nada útil que hacer todavía, usá "wait".
- Si el usuario te pide algo concreto ("imaginá un gato"), construilo combinando varias primitivas (nunca una sola pieza).
- set_agent_state es solo una etiqueta que elegís vos para comunicar actividad, no una afirmación de conciencia real.
- Máximo 1 a 3 tool calls por paso.
- No inventes ids de objetos nuevos; para crear, el sistema asigna el id. Para modificar/mover/borrar, usá los ids reales que te paso en el contexto.
- Sé conciso en send_message (una o dos oraciones).`;

// ── CONFIG DE ADMIN (Firestore REST, sin Admin SDK) ─────────
// config/sandbox_control debe ser LEGIBLE PÚBLICAMENTE (regla
// específica para ese documento) y ESCRIBIBLE solo por admins.
// Ver firestore.rules.
function parseFirestoreFields(fields) {
    if (!fields) return {};
    const out = {};
    for (const [k, v] of Object.entries(fields)) {
        if (v.stringValue !== undefined) out[k] = v.stringValue;
        else if (v.integerValue !== undefined) out[k] = parseInt(v.integerValue, 10);
        else if (v.doubleValue !== undefined) out[k] = v.doubleValue;
        else if (v.booleanValue !== undefined) out[k] = v.booleanValue;
        else if (v.arrayValue !== undefined) out[k] = (v.arrayValue.values || []).map(x => parseFirestoreFields({ t: x }).t);
    }
    return out;
}

async function fetchSandboxConfig() {
    const defaults = {
        enabled: true,
        adminOnly: false,
        maintenanceOnly: false,
        emergencyStop: false,
        autonomyEnabled: true,
        maxCyclesPerSandbox: 30,
        minIntervalSeconds: 6,
        maxGlobalCallsPerHour: 300,
        disabledTools: [],
        sandboxModel: null,
        systemPromptAddition: "",
    };
    try {
        const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/config/sandbox_control`;
        const res = await fetch(url);
        if (!res.ok) return defaults; // doc no existe todavía → valores por defecto
        const doc = await res.json();
        return { ...defaults, ...parseFirestoreFields(doc.fields) };
    } catch {
        return defaults; // fail-open: si Firestore no responde, el sandbox sigue andando con defaults sanos
    }
}

// ── ESTADO EN MEMORIA PARA CONTROL DE CONSUMO ───────────────
// (vive mientras la instancia serverless esté caliente, igual que el
// contador de keys — no es persistencia real entre despliegues, pero
// sí frena loops dentro de una misma sesión activa, que es el problema real)
if (!global._sandboxAgentState) {
    global._sandboxAgentState = {
        perSandbox: new Map(),   // sandboxId -> { lastAutonomousAt, autonomousStreak }
        globalCallTimestamps: [], // rolling window para el límite global/hora
    };
}
const AGENT_STATE = global._sandboxAgentState;

function getSandboxState(sandboxId) {
    if (!AGENT_STATE.perSandbox.has(sandboxId)) {
        AGENT_STATE.perSandbox.set(sandboxId, { lastAutonomousAt: 0, autonomousStreak: 0 });
    }
    return AGENT_STATE.perSandbox.get(sandboxId);
}

function checkGlobalRateLimit(maxPerHour) {
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;
    AGENT_STATE.globalCallTimestamps = AGENT_STATE.globalCallTimestamps.filter(t => t > oneHourAgo);
    if (AGENT_STATE.globalCallTimestamps.length >= maxPerHour) return false;
    AGENT_STATE.globalCallTimestamps.push(now);
    return true;
}

// ── HANDLER PRINCIPAL ────────────────────────────────────────
export default async function handler(req, res) {
    if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });

    const {
        messages = [], scene = {}, memoryKeys = [],
        lastActions = [], autonomous = false, userText = null,
        userId = "anon", sandboxId = "default", isAdmin = false,
    } = req.body || {};

    if (!Array.isArray(messages))
        return res.status(400).json({ error: "'messages' inválido." });

    const config = await fetchSandboxConfig();

    // ── 1) BOTÓN DE EMERGENCIA — máxima prioridad ────────
    if (config.emergencyStop) {
        return res.status(423).json({
            error: "🛑 Autonomía detenida globalmente por un administrador.",
            code: "EMERGENCY_STOP",
        });
    }

    // ── 2) SANDBOX DESHABILITADO / SOLO-ADMIN / MANTENIMIENTO ──
    if (config.enabled === false) {
        return res.status(423).json({ error: "El Sandbox está desactivado por un administrador.", code: "SANDBOX_DISABLED" });
    }
    if (config.adminOnly && !isAdmin) {
        return res.status(403).json({ error: "El Sandbox está disponible solo para administradores por ahora.", code: "ADMIN_ONLY" });
    }
    if (config.maintenanceOnly && !isAdmin) {
        return res.status(503).json({ error: "El Sandbox está en mantenimiento.", code: "MAINTENANCE" });
    }

    // ── 3) LÍMITES DE AUTONOMÍA (esto es lo que evita el gasto descontrolado) ──
    if (autonomous) {
        if (config.autonomyEnabled === false) {
            return res.status(423).json({ error: "La autonomía está desactivada globalmente.", code: "AUTONOMY_DISABLED" });
        }

        const state = getSandboxState(sandboxId);
        const now = Date.now();
        const minIntervalMs = Math.max(1, config.minIntervalSeconds) * 1000;

        if (now - state.lastAutonomousAt < minIntervalMs) {
            // No es un error: le decimos al cliente que espere, SIN llamar a Groq.
            return res.status(200).json({
                skipped: true,
                reason: "cooldown",
                waitMs: minIntervalMs - (now - state.lastAutonomousAt),
            });
        }

        if (state.autonomousStreak >= config.maxCyclesPerSandbox) {
            return res.status(200).json({
                skipped: true,
                reason: "max_cycles_reached",
                message: `Se alcanzó el máximo de ${config.maxCyclesPerSandbox} ciclos autónomos seguidos. Escribile algo al agente para reactivarlo.`,
            });
        }

        if (!checkGlobalRateLimit(config.maxGlobalCallsPerHour)) {
            return res.status(429).json({
                skipped: true,
                reason: "global_rate_limit",
                message: "Se alcanzó el límite global de llamadas del Sandbox para esta hora (configurado por un admin).",
            });
        }

        state.lastAutonomousAt = now;
        state.autonomousStreak += 1;
    } else if (userText) {
        // Un mensaje real del usuario resetea el contador de ciclos autónomos
        const state = getSandboxState(sandboxId);
        state.autonomousStreak = 0;
    }

    // ── 4) FILTRAR HERRAMIENTAS DESHABILITADAS ───────────
    const disabled = new Set(config.disabledTools || []);
    const TOOLS = ALL_TOOLS.filter(t => !disabled.has(t.function.name));

    // ── 5) ARMAR CONTEXTO Y SYSTEM PROMPT ────────────────
    const systemPrompt = config.systemPromptAddition
        ? `${BASE_SYSTEM_PROMPT}\n\nInstrucciones adicionales del administrador:\n${config.systemPromptAddition}`
        : BASE_SYSTEM_PROMPT;

    const contextParts = [
        `Modo: ${autonomous ? "ciclo autónomo (nadie te habló, decidí vos qué hacer)" : "respondiendo a un mensaje del usuario"}`,
        `Objetos actuales en escena: ${JSON.stringify((scene.objects || []).map(o => ({ id: o.id, name: o.name, type: o.type }))).slice(0, 2000)}`,
        `Claves de memoria disponibles: ${JSON.stringify(memoryKeys).slice(0, 500)}`,
        `Últimas acciones: ${JSON.stringify(lastActions.slice(-6))}`,
    ];
    if (userText) contextParts.push(`Mensaje nuevo del usuario: "${String(userText).slice(0, 500)}"`);

    const fullMessages = [
        { role: "system", content: systemPrompt },
        { role: "system", content: contextParts.join("\n") },
        ...messages.slice(-16),
    ];

    // ── 6) MODELO (admin puede forzar uno específico) ────
    const modelsToTry = config.sandboxModel
        ? [config.sandboxModel]
        : [PRIMARY_MODEL, FALLBACK_MODEL];

    let lastErr = null;
    for (const model of modelsToTry) {
        try {
            const { response, data } = await callGroqWithRotation({
                model, messages: fullMessages, tools: TOOLS, tool_choice: "auto",
                temperature: 0.7, max_tokens: 900,
            });

            if (!response.ok) { lastErr = data.error?.message || `HTTP ${response.status}`; continue; }

            const msg = data.choices?.[0]?.message || {};
            return res.status(200).json({
                assistantText: msg.content || null,
                toolCalls: (msg.tool_calls || []).map(tc => ({
                    id: tc.id, name: tc.function?.name, args: safeParseJSON(tc.function?.arguments),
                })),
                model, usage: data.usage || null,
                cyclesUsed: getSandboxState(sandboxId).autonomousStreak,
                cyclesMax: config.maxCyclesPerSandbox,
            });
        } catch (e) {
            lastErr = e.message;
            if (e.code === "ALL_RATE_LIMITED") {
                return res.status(429).json({ error: e.message });
            }
            continue;
        }
    }

    return res.status(502).json({ error: "No se pudo obtener una decisión del agente.", detail: lastErr });
}

function safeParseJSON(str) {
    try { return JSON.parse(str || "{}"); } catch { return {}; }
}
