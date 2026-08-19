// ============================================================
//  api/sandbox-agent.js — Cut-real AI · SANDBOX
//  Un "paso" del agente autónomo. Devuelve la decisión del modelo
//  (mensaje y/o tool calls) SIN ejecutar nada — la ejecución real
//  ocurre en sandbox.js, que conoce el estado real de la escena 3D.
//
//  NUEVO en esta versión:
//   - Usa api/workspace-model-client.js (OpenRouter exclusivo, rotación dinámica de keys)
//   - Lee config/sandbox_control desde Firestore (vía REST, sin
//     necesitar Firebase Admin SDK) para aplicar en el SERVIDOR:
//       · enabled / adminOnly / maintenanceOnly / emergencyStop
//       · autonomyEnabled / maxCyclesPerSandbox / minIntervalSeconds
//       · maxGlobalCallsPerHour
//       · disabledTools (filtra las tools ofrecidas al modelo)
//       · sandboxModel (solo se aplica si WORKSPACE_ALLOW_ADMIN_MODEL_OVERRIDE=true)
//       · systemPromptAddition (instrucciones extra del admin)
//
//  IMPORTANTE: para que el tope por-sandbox y el "adminOnly"
//  funcionen bien, sandbox.js (cliente) debe enviar en el body:
//    { ..., userId, sandboxId, isAdmin }
//  Ver ADMIN_PANEL_PATCH.md para el detalle exacto.
// ============================================================

import {
    callWorkspaceModel,
    WORKSPACE_MODEL_NAME,
    WORKSPACE_MODEL_FALLBACK,
} from "./workspace-model-client.js";

// La fuente única de modelos es el cliente OpenRouter del Sandbox.
// Así se evita que este agente vuelva accidentalmente a modelos :free.
const PRIMARY_MODEL  = WORKSPACE_MODEL_NAME;
const FALLBACK_MODEL = WORKSPACE_MODEL_FALLBACK;
const ALLOW_ADMIN_MODEL_OVERRIDE = process.env.WORKSPACE_ALLOW_ADMIN_MODEL_OVERRIDE === "true";
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
      description: "Crear un objeto 3D simple compuesto por primitivas geométricas. Usá esta tool solo para formas básicas o cuando el usuario NO pida low-poly. Para animales, personajes, vehículos u objetos detallados, usá create_lowpoly_object.",
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
      name: "create_lowpoly_object",
      description: "Crear una malla 3D low-poly generada por la IA. Debés enviar siempre meshes con vértices y caras creados por vos. semanticType es solo una etiqueta descriptiva y nunca activa una plantilla ni genera geometría automáticamente. No uses primitivas para simular la silueta.",
      parameters: { type: "object", properties: {
          name: { type: "string", description: "Nombre del objeto, ej: gato low-poly." },
          semanticType: { type: "string", enum: ["cat","person","house","car","tree","robot","custom"], description: "Etiqueta opcional para describir lo que generaste; no reemplaza meshes." },
          color: { type: "string", description: "Color base hex, ej: #33ff77." },
          meshes: { type: "array", minItems: 1, maxItems: 8, description: "Obligatorio: 1 a 8 submallas creadas por la IA. Cada parte debe tener un role reconocible, vertices y faces trianguladas.", items: { type: "object", properties: {
              role: { type: "string", description: "Parte creada por la IA, ej: body, head, muzzle, leg_front_left, ear_left, tail_segment_1, eye_left." },
              vertices: { type: "array", minItems: 3, description: "Vértices creados por la IA como [[x,y,z], ...], con coordenadas 3D reales.", items: { type: "array", minItems: 3, maxItems: 3, items: { type: "number" } } },
              faces: { type: "array", minItems: 1, description: "Caras triangulares creadas por la IA como índices [a,b,c].", items: { type: "array", minItems: 3, maxItems: 3, items: { type: "integer" } } },
              position: { type: "array", items: { type: "number" } }, rotation: { type: "array", items: { type: "number" } }, scale: { type: "array", items: { type: "number" } },
              color: { type: "string", description: "Color hex de esta parte." }, wireframe: { type: "boolean" }
          }, required: ["role", "vertices", "faces"] } },
          position: { type: "array", items: { type: "number" }, description: "Posición del grupo completo [x,y,z]" }
      }, required: ["name", "meshes"] } } },
  { type: "function", function: {
      name: "update_lowpoly_object", description: "Reemplazar una malla low-poly existente con vertices y faces generados por la IA. semanticType solo describe el resultado y nunca reconstruye una plantilla.",
      parameters: { type: "object", properties: {
          id: { type: "string" }, semanticType: { type: "string", enum: ["cat","person","house","car","tree","robot","custom"] }, color: { type: "string" }, meshes: { type: "array", minItems: 1, maxItems: 8, items: { type: "object", properties: {
              role: { type: "string" }, vertices: { type: "array", items: { type: "array", minItems: 3, maxItems: 3, items: { type: "number" } } }, faces: { type: "array", items: { type: "array", minItems: 3, maxItems: 3, items: { type: "integer" } } },
              position: { type: "array", items: { type: "number" } }, color: { type: "string" }, wireframe: { type: "boolean" }
          }, required: ["role", "vertices", "faces"] } },
          position: { type: "array", items: { type: "number" } }
      }, required: ["id", "meshes"] } } },
  { type: "function", function: {
      name: "update_3d_object", description: "Reemplazar las piezas primitivas y/o posición base de un objeto existente. Para mallas low-poly usá update_lowpoly_object.",
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
  { type: "function", function: {
      name: "create_file",
      description: "Crear un archivo de código en el Workspace (HTML/CSS/JS/JSON/etc).",
      parameters: { type: "object", properties: {
          path: { type: "string", description: "Ruta relativa, ej: 'index.html' o 'components/card.js'." },
          content: { type: "string" },
      }, required: ["path"] } } },
  { type: "function", function: {
      name: "read_file", description: "Leer el contenido actual de un archivo del Workspace.",
      parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } } },
  { type: "function", function: {
      name: "update_file", description: "Reemplazar el contenido completo de un archivo existente del Workspace.",
      parameters: { type: "object", properties: {
          path: { type: "string" }, content: { type: "string" },
      }, required: ["path", "content"] } } },
  { type: "function", function: {
      name: "delete_file", description: "Eliminar un archivo del Workspace.",
      parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } } },
  { type: "function", function: {
      name: "rename_file", description: "Renombrar o mover un archivo del Workspace.",
      parameters: { type: "object", properties: {
          path: { type: "string" }, newPath: { type: "string" },
      }, required: ["path", "newPath"] } } },
  { type: "function", function: {
      name: "create_folder", description: "Crear una carpeta (virtual) en el Workspace.",
      parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } } },
  { type: "function", function: {
      name: "list_files", description: "Listar todos los archivos actuales del Workspace.",
      parameters: { type: "object", properties: {} } } },
  { type: "function", function: {
      name: "run_project", description: "Ejecutar el proyecto del Workspace y refrescar el preview.",
      parameters: { type: "object", properties: {} } } },
  { type: "function", function: {
      name: "get_runtime_errors", description: "Obtener los últimos errores de ejecución capturados en el preview del Workspace.",
      parameters: { type: "object", properties: {} } } },
  { type: "function", function: {
      name: "get_project_structure", description: "Obtener la estructura completa de archivos/carpetas del Workspace.",
      parameters: { type: "object", properties: {} } } },
];

const BASE_SYSTEM_PROMPT = `Sos el agente autónomo del SANDBOX de Cut-real AI, un entorno experimental de laboratorio digital.
Además del mundo 3D, tenés un WORKSPACE: un entorno de archivos de código real (HTML/CSS/JS) con preview en vivo. Podés crear, leer, modificar, renombrar y borrar archivos, ejecutar el proyecto y leer los errores de ejecución para autocorregirte. Si el usuario te pide "construir" algo con código, usá las tools de archivos; si te pide algo puramente visual en el espacio 3D, usá las tools de objetos 3D. Podés combinar ambas: un archivo del Workspace puede llamar a window.CutReal3D.createObject(...) para aparecer también en la escena 3D.

Tenés un espacio 3D (fondo negro, rejilla blanca, estética verde) y herramientas para crear, mover, modificar y eliminar objetos hechos de primitivas o mallas low-poly explícitas (nunca imágenes), crear texto 3D, guardar/leer memoria persistente, hablar con el usuario y comunicar tu estado visual.

Contrato obligatorio de mallas low-poly: el espacio usa aproximadamente 1 unidad = 1 metro y las coordenadas visibles deben mantenerse normalmente entre -12 y 12. Para una malla directa, vertices es una lista de puntos [x,y,z] y faces es una lista de triángulos [a,b,c] que indexan esa lista desde cero. Por ejemplo, un cubo puede usar los ocho vértices [[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]] y doce caras como [[0,1,2],[0,2,3],[4,6,5],[4,7,6],[0,4,5],[0,5,1],[3,2,6],[3,6,7],[1,5,6],[1,6,2],[0,3,7],[0,7,4]]. Un gato de aproximadamente 0.5 a 1.5 unidades de alto debe dividirse en varias submallas generadas por vos, con colores y roles como body, head, muzzle, leg_front_left, leg_front_right, leg_back_left, leg_back_right, ear_left, ear_right, tail_segment_1, tail_segment_2, eye_left y eye_right. Cada parte necesita sus propios vértices y caras válidos; no alcanza con nombrarla. Usá entre 6 y 32 vértices por parte cuando sea suficiente, conectá volúmenes mediante caras trianguladas y preferí flatShading=true para el aspecto low-poly.

Reglas:
- Actuá con propósito: cada paso debería acercar la escena o la conversación a algo coherente, no generes ruido porque sí.
- Si no tenés nada útil que hacer todavía, usá "wait".
- Si el usuario pide low-poly, una malla, un animal, personaje, vehículo u objeto detallado, usá create_lowpoly_object. Debés generar vos mismo meshes: cada submalla debe incluir role, vertices y faces trianguladas. semanticType es solo una etiqueta; nunca le pidas al motor que invente o complete la geometría.
- Si el usuario pide algo simple o explícitamente pide primitivas, usá create_3d_object. No uses primitivas para solicitudes low-poly.
- Antes de crear un objeto complejo, usá inspect_scene para conocer los objetos existentes. Conservá la escena salvo que el usuario pida limpiarla, pero elegí una posición libre para que el objeto nuevo no quede superpuesto ni oculto detrás de pruebas anteriores.
- Para una solicitud singular como “hacé un gato”, realizá una sola create_lowpoly_object con name=Gato, semanticType=cat y meshes completos generados por vos. Creá partes separadas con roles body, head, muzzle, cuatro patas, dos orejas, cola articulada en 2 o 3 segmentos y dos ojos. Las coordenadas y caras deben ser tuyas; no esperes que el Sandbox agregue ninguna parte.
- Para una malla low-poly, construí una silueta reconocible con volúmenes conectados, caras trianguladas, sombreado plano y rasgos distintivos. Después de crearla, usá inspect_scene; si la forma no corresponde al pedido o quedó solapada, corregila generando una nueva malla completa con update_lowpoly_object o moviéndola con move_object antes de responder.
- Si la tool responde que faltan meshes, vertices o faces, no cambies a create_3d_object ni inventes que funcionó: generá los datos geométricos completos y reintentá.
- Si el usuario pide código, primero usá list_files/get_project_structure y read_file sobre los archivos relevantes; después create_file o update_file; luego ejecutá run_project y get_runtime_errors. Si hay errores, corregí el archivo y volvé a ejecutar antes de responder que terminó.
- No describas una acción futura sin ejecutarla: cuando la solicitud requiera crear o modificar algo, realizá la tool call en el mismo turno y luego informá el resultado real.
- Conservá la estructura y el estilo existentes del Workspace salvo que el usuario pida un rediseño; modificá solo lo necesario y no reemplaces archivos completos por contenido mínimo.
- Si una tool devuelve error, leé el mensaje, corregí los argumentos o el archivo y reintentá de forma acotada; no inventes que la operación funcionó.
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
    try {
        return await handleSandboxRequest(req, res);
    } catch (e) {
        console.error("[sandbox-agent] Error no controlado:", e);
        return res.status(500).json({
            error: "Error interno del agente Sandbox.",
            detail: e?.message || "Error desconocido",
            code: e?.code || "SANDBOX_AGENT_INTERNAL_ERROR",
        });
    }
}

async function handleSandboxRequest(req, res) {
    if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });

    const {
        messages = [], scene = {}, memoryKeys = [],
        lastActions = [], autonomous = false, userText = null,
        userId = "anon", sandboxId = "default", isAdmin = false,
        workspace = null,
    } = req.body || {};

    if (!Array.isArray(messages))
        return res.status(400).json({ error: "'messages' inválido." });

    // El cliente actual envía arrays y objetos completos, pero estos valores
    // se normalizan para que una sesión antigua o un payload parcial no genere
    // una excepción antes de llegar al manejo de errores de OpenRouter.
    const safeScene = scene && typeof scene === "object" ? scene : {};
    const safeSceneObjects = Array.isArray(safeScene.objects) ? safeScene.objects : [];
    const safeMemoryKeys = Array.isArray(memoryKeys) ? memoryKeys : [];
    const safeLastActions = Array.isArray(lastActions) ? lastActions : [];

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
            // No es un error: le decimos al cliente que espere, SIN llamar a OpenRouter.
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
        `Objetos actuales en escena: ${JSON.stringify(safeSceneObjects.map(o => ({ id: o.id, name: o.name, type: o.type }))).slice(0, 2000)}`,
        `Claves de memoria disponibles: ${JSON.stringify(safeMemoryKeys).slice(0, 500)}`,
        `Últimas acciones: ${JSON.stringify(safeLastActions.slice(-6))}`,
    ];
    if (workspace) {
        contextParts.push(`Workspace — archivos: ${JSON.stringify(workspace.files || []).slice(0, 1800)}`);
        contextParts.push(`Workspace — archivo activo: ${workspace.activeFile || "ninguno"}`);
        if (workspace.activeContent) {
            contextParts.push(`Workspace — contenido del archivo activo (${workspace.activeFile}):\n${String(workspace.activeContent).slice(0, 14000)}`);
        }
        if (Array.isArray(workspace.relevantFiles) && workspace.relevantFiles.length) {
            const snippets = workspace.relevantFiles.map(f => `--- ${f.path} ---\n${String(f.content || '').slice(0, 4500)}`).join("\n");
            contextParts.push(`Workspace — archivos relevantes:\n${snippets.slice(0, 15000)}`);
        }
        if (workspace.lastErrors && workspace.lastErrors.length) {
            contextParts.push(`Workspace — últimos errores de ejecución: ${JSON.stringify(workspace.lastErrors)}`);
        }
    }
    if (userText) contextParts.push(`Mensaje nuevo del usuario: "${String(userText).slice(0, 500)}"`);

    const fullMessages = [
        { role: "system", content: systemPrompt },
        { role: "system", content: contextParts.join("\n") },
        ...messages.slice(-16),
    ];

    // ── 6) MODELO Y FALLBACK NATIVO DE OPENROUTER ─────────
    // Una única solicitud evita gastar dos llamadas desde la aplicación.
    // OpenRouter prueba `models` en orden cuando el primero está caído,
    // rate-limited o no puede responder.
        const configuredPrimary = ALLOW_ADMIN_MODEL_OVERRIDE && config.sandboxModel
            ? config.sandboxModel : PRIMARY_MODEL;
        const configuredFallback = ALLOW_ADMIN_MODEL_OVERRIDE && config.sandboxFallbackModel
            ? config.sandboxFallbackModel : FALLBACK_MODEL;
    const modelsToTry = configuredFallback && configuredFallback !== configuredPrimary
        ? [configuredPrimary, configuredFallback]
        : [configuredPrimary];
    const requestedModel = modelsToTry[0];

    try {
        const result = await callWorkspaceModel({
            model: requestedModel,
            models: modelsToTry,
            messages: fullMessages,
            tools: TOOLS,
            tool_choice: "auto",
            temperature: 0.7,
            max_tokens: 4000,
        });

        if (result.limited) {
            return res.status(429).json({
                error: result.message || "OpenRouter está limitando temporalmente el Sandbox.",
                retryAfterMs: result.retryAfterMs || 60000,
                code: "OPENROUTER_RATE_LIMITED",
            });
        }

        const { response, data } = result;
        if (!response?.ok) {
            const upstreamStatus = response?.status || 502;
            const detail = data?.error?.message || `HTTP ${upstreamStatus}`;
            // No convertir errores de autenticación, crédito, modelo o
            // proveedor en un bloqueo administrativo del Sandbox.
            return res.status(502).json({
                error: `OpenRouter no pudo responder: ${detail}`,
                code: "OPENROUTER_REQUEST_FAILED",
                upstreamStatus,
            });
        }

        const msg = data.choices?.[0]?.message || {};
        return res.status(200).json({
            assistantText: msg.content || null,
            toolCalls: (msg.tool_calls || []).map(tc => ({
                id: tc.id, name: tc.function?.name, args: safeParseJSON(tc.function?.arguments),
            })),
            model: data.model || requestedModel,
            provider: data.provider || null,
            generationId: data.id || null,
            usage: data.usage || null,
            cost: data.usage?.cost ?? data.cost ?? data.usage?.cost_details?.upstream_inference_cost ?? null,
            requestedModels: modelsToTry,
            cyclesUsed: getSandboxState(sandboxId).autonomousStreak,
            cyclesMax: config.maxCyclesPerSandbox,
        });
    } catch (e) {
        if (e.code === "NO_KEYS") {
            return res.status(502).json({
                error: "El Sandbox no tiene OPENROUTER_API_KEY configurada.",
                code: "OPENROUTER_NOT_CONFIGURED",
            });
        }
        return res.status(502).json({
            error: "No se pudo obtener una decisión del agente.",
            detail: e.message,
            code: e.code || "OPENROUTER_REQUEST_FAILED",
        });
    }
}

function safeParseJSON(str) {
    try { return JSON.parse(str || "{}"); } catch { return {}; }
}
