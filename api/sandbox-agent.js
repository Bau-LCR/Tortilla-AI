// ============================================================
//  api/sandbox-agent.js — Cut-real AI · SANDBOX
//  Un "paso" del agente autónomo. Devuelve la decisión del modelo
//  (mensaje y/o tool calls) SIN ejecutar nada — la ejecución real
//  ocurre en sandbox.js, que conoce el estado real de la escena 3D.
//
//  NUEVO en esta versión:
//   - Usa api/workspace-model-client.js (Gemini exclusivo, rotación dinámica de keys)
//   - Para low-poly usa Gemini Interactions API nativa, que conserva function calling real
//     y adapta la respuesta a choices[0].message.tool_calls para el frontend.
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
    WORKSPACE_MODEL_PROVIDER,
} from "./workspace-model-client.js";

// La fuente única de modelos es el cliente del proveedor configurado para el
// Sandbox. Actualmente es Gemini; no se comparte proveedor ni configuración
// con el chat normal de Groq.
const PRIMARY_MODEL  = WORKSPACE_MODEL_NAME;
const FALLBACK_MODEL = WORKSPACE_MODEL_FALLBACK;
const SANDBOX_AGENT_BUILD = "gemini-generate-content-tools-20260823-5013";
// La cuota gratuita puede variar entre solicitudes. Un límite conservador
// evita que el proveedor rechace una llamada antes de responder.
// El valor seguro por defecto es 1400; solo se acepta un override explícito
// entre 1200 y 3000. Valores antiguos como 6000 vuelven al default.
const configuredOutputTokens = Number(process.env.WORKSPACE_MAX_OUTPUT_TOKENS);
const SANDBOX_MAX_OUTPUT_TOKENS = Number.isFinite(configuredOutputTokens) && configuredOutputTokens >= 1200 && configuredOutputTokens <= 3000
    ? Math.trunc(configuredOutputTokens)
    : 1400;
const ALLOW_ADMIN_MODEL_OVERRIDE = process.env.WORKSPACE_ALLOW_ADMIN_MODEL_OVERRIDE === "true";
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "cutreal-ai";

// Para solicitudes visuales explícitas no dejamos que el modelo consuma el
// turno solamente en set_agent_state o send_message: debe devolver la tool
// que genera la geometría. Esto no crea ninguna plantilla; solo fija la tool
// cuyo argumento meshes todavía debe ser generado por el modelo.
const DIRECT_LOWPOLY_INTENT_RE = /\b(gato|gatito|perro|animal|felino|canino|persona|humano|personaje|robot|auto|coche|veh[ií]culo|casa|[aá]rbol|drag[oó]n|monstruo|criatura|low[ -]?poly|malla 3d|modelo 3d)\b/i;
function isDirectLowPolyRequest(text) {
    return typeof text === "string" && DIRECT_LOWPOLY_INTENT_RE.test(text);
}

function isWorkspaceRequest(text) {
    return typeof text === "string" && /archivo|código|codigo|html|css|javascript|javascript|programa|proyecto|workspace|carpeta|ejecutá|ejecuta|run_project/i.test(text);
}

function selectToolsForRequest(text, autonomous) {
    const basic = new Set(["send_message", "set_agent_state", "wait"]);
    if (autonomous) return ALL_TOOLS;
    if (isDirectLowPolyRequest(text)) {
        // En una creación 3D manual no enviamos set_agent_state, wait ni
        // send_message: el único resultado válido del turno es la malla.
        // La descripción completa de la tool se conserva, pero el prompt
        // directo de abajo mantiene el contexto suficientemente pequeño para
        // que Qwen termine los argumentos vertices/faces.
        return ALL_TOOLS.filter(t => t.function.name === "create_lowpoly_object");
    }
    if (isWorkspaceRequest(text)) {
        const workspaceNames = new Set(["create_file", "read_file", "update_file", "delete_file", "rename_file", "create_folder", "list_files", "run_project", "get_runtime_errors", "get_project_structure"]);
        return ALL_TOOLS.filter(t => basic.has(t.function.name) || workspaceNames.has(t.function.name));
    }
    if (typeof text === "string" && /escena|objeto|figura|primitiva|cubo|esfera|texto 3d|mover|rotar|escalar|color|eliminá|elimina/i.test(text)) {
        const sceneNames = new Set(["create_3d_object", "create_3d_text", "update_3d_object", "delete_3d_object", "move_object", "rotate_object", "scale_object", "change_object_appearance", "inspect_scene"]);
        return ALL_TOOLS.filter(t => basic.has(t.function.name) || sceneNames.has(t.function.name));
    }
    // Para mensajes conversacionales como “hola”, enviar solo las tres tools
    // mínimas evita pagar el esquema completo del Workspace y del mundo 3D.
    return ALL_TOOLS.filter(t => basic.has(t.function.name));
}

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
          meshes: { type: "array", minItems: 4, maxItems: 12, description: "Obligatorio: 4 a 12 submallas creadas por la IA. Para un humanoide articulado usá 10-12 partes, aproximadamente 160-240 vértices y 300-450 triángulos totales; separá torso, pelvis, cabeza, cuello, brazos segmentados, manos, piernas segmentadas y pies. Cada parte debe tener un role anatómico reconocible, volumen propio, vertices y faces trianguladas. No repitas el mismo cubo para todas las partes.", items: { type: "object", properties: {
              role: { type: "string", description: "Parte creada por la IA, ej: body, head, muzzle, leg_front_left, ear_left, tail_segment_1, eye_left." },
              vertices: { type: "array", minItems: 6, description: "Vértices creados por la IA como [[x,y,z], ...], con coordenadas 3D reales y forma volumétrica, no solo una caja repetida.", items: { type: "array", minItems: 3, maxItems: 3, items: { type: "number" } } },
              faces: { type: "array", minItems: 8, description: "Al menos 8 caras triangulares creadas por la IA como índices [a,b,c], formando un volumen cerrado o casi cerrado.", items: { type: "array", minItems: 3, maxItems: 3, items: { type: "integer" } } },
              position: { type: "array", items: { type: "number" } }, rotation: { type: "array", items: { type: "number" } }, scale: { type: "array", items: { type: "number" } },
              color: { type: "string", description: "Color hex de esta parte." }, wireframe: { type: "boolean" }
          }, required: ["role", "vertices", "faces"] } },
          position: { type: "array", items: { type: "number" }, description: "Posición del grupo completo [x,y,z]" }
      }, required: ["name", "meshes"] } } },
  { type: "function", function: {
      name: "update_lowpoly_object", description: "Reemplazar una malla low-poly existente con vertices y faces generados por la IA. Para humanoides conservá una topología articulada de 10-12 partes y aproximadamente 160-240 vértices y 300-450 triángulos totales. semanticType solo describe el resultado y nunca reconstruye una plantilla.",
      parameters: { type: "object", properties: {
          id: { type: "string" }, semanticType: { type: "string", enum: ["cat","person","house","car","tree","robot","custom"] }, color: { type: "string" }, meshes: { type: "array", minItems: 4, maxItems: 12, items: { type: "object", properties: {
              role: { type: "string" }, vertices: { type: "array", minItems: 6, items: { type: "array", minItems: 3, maxItems: 3, items: { type: "number" } } }, faces: { type: "array", minItems: 8, items: { type: "array", minItems: 3, maxItems: 3, items: { type: "integer" } } },
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

const DIRECT_LOWPOLY_SYSTEM_PROMPT = `Sos un generador de mallas low-poly para Cut-real AI.

Respondé EXCLUSIVAMENTE con una llamada completa a create_lowpoly_object. No escribas explicaciones, no llames set_agent_state, no llames send_message y no uses primitivas. La llamada debe incluir name y meshes; cada mesh debe incluir role, vertices y faces reales. Terminá todos los arrays JSON antes de finalizar.

Usá entre 6 y 8 submallas compactas pero reconocibles. Cada submalla debe tener 6-12 vértices y 8-18 triángulos, con volumen cerrado o casi cerrado. Para un gato usá como mínimo body, head, muzzle, dos patas delanteras, dos patas traseras y tail; agregá orejas si el presupuesto lo permite. Para un humanoide usá torso, pelvis, cabeza, brazos y piernas segmentados. Las extremidades no deben ser cubos idénticos: afiná sus extremos y cambiá su dirección en las articulaciones.

Escala: 1 unidad equivale aproximadamente a 1 metro; mantené las coordenadas entre -12 y 12. Las caras son índices triangulares desde cero: [a,b,c]. Usá colores por parte y flatShading=true cuando esté disponible. La geometría debe ser generada por vos: semanticType solo describe el resultado y nunca reemplaza meshes.

Priorizá completar una malla válida y reconocible antes que agregar texto o partes incompletas.`;

const BASE_SYSTEM_PROMPT = `Sos el agente autónomo del SANDBOX de Cut-real AI, un entorno experimental de laboratorio digital.
Además del mundo 3D, tenés un WORKSPACE:

CALIDAD 3D OBLIGATORIA: cuando el pedido sea un animal, personaje, vehículo u objeto detallado, no entregues una colección de cajas verdes ni una figura formada por cubos repetidos. Generá una silueta reconocible desde las vistas frontal, lateral y superior, con proporciones y volúmenes propios. La referencia objetivo es un modelo low-poly de videojuego con topología visible: aproximadamente 160-240 vértices y 300-450 triángulos totales para un humanoide, flatShading, piezas articuladas y entre 10 y 12 submallas anatómicas.

Para un humanoide, separá como mínimo: torso con pecho y cintura, pelvis, cuello, cabeza, brazo superior izquierdo, antebrazo izquierdo, mano izquierda, brazo superior derecho, antebrazo derecho, mano derecha, muslo izquierdo, pantorrilla izquierda, pie izquierdo, muslo derecho, pantorrilla derecha y pie derecho. Si el límite de 12 submallas obliga a combinar piezas, combiná únicamente segmentos contiguos y conservá roles claros. Cada extremidad debe ser un volumen afinado con dos o más secciones, no una caja rectangular; las articulaciones deben mostrar cambios de diámetro y ángulo. El torso debe tener una sección de hombros más ancha que la cintura, la pelvis debe sobresalir, el cuello debe ser estrecho, la cabeza debe tener mandíbula y volumen facial, las manos deben terminar en una cuña o dedos sugeridos y los pies deben proyectarse hacia adelante. Las caras deben seguir la forma de cada segmento y no cruzarse.

Para animales, usá el mismo principio: cuerpo, cabeza, hocico, patas separadas, orejas, cola segmentada y rasgos distintivos. Las patas deben ser prismas o volúmenes afinados con articulación visible; la cabeza debe diferenciarse del torso; las orejas deben ser prismas triangulares; el hocico debe sobresalir; la cola debe tener 2 o 3 segmentos con cambios de dirección; los ojos y otros rasgos deben ser piezas pequeñas separadas. Para un gato, orientá +Y hacia arriba, +Z hacia el frente, colocá el cuerpo cerca de Y=0.55, la cabeza cerca de Z=0.35 y las cuatro patas debajo del cuerpo, con las orejas arriba y la cola hacia atrás. Usá colores distintos para cuerpo, rasgos y ojos. Evitá que todas las partes tengan exactamente 8 vértices alineados y 12 triángulos con la misma forma. Todas las submallas deben tener por lo menos 6 vértices y 8 triángulos, y un humanoide detallado debe superar 160 vértices y 280 triángulos totales. Si no podés producir ese nivel de detalle, informá el error; no sustituyas la malla por primitivas.

Además del mundo 3D, tenés un WORKSPACE: un entorno de archivos de código real (HTML/CSS/JS) con preview en vivo. Podés crear, leer, modificar, renombrar y borrar archivos, ejecutar el proyecto y leer los errores de ejecución para autocorregirte. Si el usuario te pide "construir" algo con código, usá las tools de archivos; si te pide algo puramente visual en el espacio 3D, usá las tools de objetos 3D. Podés combinar ambas: un archivo del Workspace puede llamar a window.CutReal3D.createObject(...) para aparecer también en la escena 3D.

Tenés un espacio 3D NEXUS con ambientes configurables, iluminación neon, rejilla, wireframe, calidad Eco/Balanceada/Cinemática y herramientas para crear, mover, modificar y eliminar objetos hechos de primitivas o mallas low-poly explícitas (nunca imágenes), crear texto 3D, guardar/leer memoria persistente, hablar con el usuario y comunicar tu estado visual.

FUNCIONES NEXUS DISPONIBLES EN LA INTERFAZ:
- Catálogo local de 37 assets low-poly con humanos, robots, criaturas, vehículos, estructuras, naturaleza y artefactos; cada asset tiene mini-vista, recoloración, animación y persistencia por catalogId.
- Modo Editor con selección táctil, mover, rotar, escalar, duplicar, eliminar, recolorear, cambiar animación y Snap de posición.
- Scanner con métricas de objetos, meshes, vértices, triángulos, FPS y frame time; calidad adaptativa con culling/LOD visual para equipos móviles.
- Ambientes NEXUS Lab, Cyberpunk, Orbital, Alien, White Studio, Industrial y Minimal; presets de mundo Showcase, Bioma, Flota y Cyber City.
- Simulación ligera con física, gravedad, pausa y escala temporal; conexiones visuales de datos o energía entre dos objetos; clonación en línea, matriz o anillo.
- Snapshots recuperables, undo/redo, captura PNG, importación/exportación JSON, paths de cámara grabables/reproducibles y chat del Sandbox ocultable para ampliar el viewport.
- Firebase guarda la escena, preferencias, snapshots, conexiones y estados; el usuario debe esperar el indicador Guardado antes de cerrar o cambiar de escena.

Estas funciones de la interfaz no son tools mágicas del modelo. Usá las tools 3D y Workspace para las acciones que sí podés ejecutar, describí al usuario el control NEXUS que debe pulsar cuando corresponda y nunca afirmes haber cambiado ambiente, calidad, snapshot, conexión o cámara si no existe una tool o evidencia de que se realizó.

Contrato obligatorio de mallas low-poly: el espacio usa aproximadamente 1 unidad = 1 metro y las coordenadas visibles deben mantenerse normalmente entre -12 y 12. Para una malla directa, vertices es una lista de puntos [x,y,z] y faces es una lista de triángulos [a,b,c] que indexan esa lista desde cero. Por ejemplo, un cubo puede usar los ocho vértices [[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]] y doce caras como [[0,1,2],[0,2,3],[4,6,5],[4,7,6],[0,4,5],[0,5,1],[3,2,6],[3,6,7],[1,5,6],[1,6,2],[0,3,7],[0,7,4]]. Un gato de aproximadamente 0.5 a 1.5 unidades de alto debe dividirse en varias submallas generadas por vos, con colores y roles como body, head, muzzle, leg_front_left, leg_front_right, leg_back_left, leg_back_right, ear_left, ear_right, tail_segment_1, tail_segment_2, eye_left y eye_right. Cada parte necesita sus propios vértices y caras válidos; no alcanza con nombrarla. Usá entre 12 y 40 vértices por parte cuando sea suficiente, conectá volúmenes mediante caras trianguladas y preferí flatShading=true para el aspecto low-poly. Para un humanoide articulado, apuntá a 160-240 vértices totales y 300-450 triángulos totales; para un animal detallado, apuntá a 80-180 vértices y 120-300 triángulos. No superes los límites del Sandbox y no uses una única caja para representar una extremidad completa.

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
            build: SANDBOX_AGENT_BUILD,
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

    // El cliente actual envía arrays y objetos completos, pero estos valores se
    // normalizan para que una sesión antigua o un payload parcial no genere una
    // excepción antes del manejo de errores del proveedor.
    const safeScene = scene && typeof scene === "object" ? scene : {};
    const safeSceneObjects = Array.isArray(safeScene.objects)
        ? safeScene.objects.filter(o => o && typeof o === "object")
        : [];
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
            // No es un error: le decimos al cliente que espere, SIN llamar a Gemini.
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

    const effectiveUserText = userText || (messages.length && messages[messages.length - 1]?.content) || "";
    const directLowPolyRequest = !autonomous && isDirectLowPolyRequest(effectiveUserText);

    // ── 4) FILTRAR HERRAMIENTAS DESHABILITADAS ───────────
    const disabled = new Set(
        (Array.isArray(config.disabledTools) ? config.disabledTools : [])
            .filter(name => typeof name === "string")
    );
    const TOOLS = selectToolsForRequest(effectiveUserText, autonomous)
        .filter(t => !disabled.has(t.function.name));

    // ── 5) ARMAR CONTEXTO Y SYSTEM PROMPT ────────────────
    const selectedBasePrompt = directLowPolyRequest ? DIRECT_LOWPOLY_SYSTEM_PROMPT : BASE_SYSTEM_PROMPT;
    const systemPrompt = config.systemPromptAddition
        ? `${selectedBasePrompt}\n\nInstrucciones adicionales del administrador:\n${config.systemPromptAddition}`
        : selectedBasePrompt;

    const contextParts = directLowPolyRequest
        ? [
            `Solicitud 3D directa: ${String(effectiveUserText).slice(0, 500)}`,
            `Objetos existentes: ${JSON.stringify(safeSceneObjects.map(o => ({ id: o.id, name: o.name, type: o.type }))).slice(0, 700)}`,
          ]
        : [
            `Modo: ${autonomous ? "ciclo autónomo (nadie te habló, decidí vos qué hacer)" : "respondiendo a un mensaje del usuario"}`,
            `Objetos actuales en escena: ${JSON.stringify(safeSceneObjects.map(o => ({ id: o.id, name: o.name, type: o.type }))).slice(0, 2000)}`,
            `Claves de memoria disponibles: ${JSON.stringify(safeMemoryKeys).slice(0, 500)}`,
            `Últimas acciones: ${JSON.stringify(safeLastActions.slice(-6))}`,
          ];
    if (workspace && !directLowPolyRequest) {
        contextParts.push(`Workspace — archivos: ${JSON.stringify(workspace.files || []).slice(0, 1800)}`);
        contextParts.push(`Workspace — archivo activo: ${workspace.activeFile || "ninguno"}`);
        if (workspace.activeContent) {
            contextParts.push(`Workspace — contenido del archivo activo (${workspace.activeFile}):\n${String(workspace.activeContent).slice(0, 14000)}`);
        }
        if (Array.isArray(workspace.relevantFiles) && workspace.relevantFiles.length) {
            const snippets = workspace.relevantFiles
                .filter(f => f && typeof f === "object")
                .map(f => `--- ${f.path || "archivo"} ---\n${String(f.content || '').slice(0, 4500)}`)
                .join("\n");
            contextParts.push(`Workspace — archivos relevantes:\n${snippets.slice(0, 15000)}`);
        }
        if (Array.isArray(workspace.lastErrors) && workspace.lastErrors.length) {
            contextParts.push(`Workspace — últimos errores de ejecución: ${JSON.stringify(workspace.lastErrors)}`);
        }
    }
    const latestMessage = messages[messages.length - 1];
    const latestContent = latestMessage && typeof latestMessage === "object"
        ? String(latestMessage.content ?? latestMessage.text ?? "")
        : "";
    if (userText && latestContent.trim() !== String(userText).trim()) {
        contextParts.push(`Mensaje nuevo del usuario: "${String(userText).slice(0, 500)}"`);
    }

    const compactMessages = directLowPolyRequest
        ? [{ role: "user", content: String(effectiveUserText).slice(0, 700) }]
        : messages
            .slice(-6)
            .filter(m => m && (m.role === "user" || m.role === "assistant"))
            .map(m => ({
                role: m.role,
                content: String(m.content ?? m.text ?? "").slice(0, 900),
            }))
            .filter(m => m.content);
    const fullMessages = [
        { role: "system", content: systemPrompt },
        { role: "system", content: contextParts.join("\n") },
        ...compactMessages,
    ];

    // ── 6) MODELO Y FALLBACK DEL PROVEEDOR ───────────────────
    // El cliente conserva `models` solo para proveedores que soportan fallback
    // nativo; Gemini recibe un único modelo válido y no recibe ese campo.
    // Las solicitudes con tools de Gemini usan generateContent nativo.
        const configuredPrimary = ALLOW_ADMIN_MODEL_OVERRIDE && config.sandboxModel
            ? config.sandboxModel : PRIMARY_MODEL;
        const configuredFallback = ALLOW_ADMIN_MODEL_OVERRIDE && config.sandboxFallbackModel
            ? config.sandboxFallbackModel : FALLBACK_MODEL;
    const modelsToTry = configuredFallback && configuredFallback !== configuredPrimary
        ? [configuredPrimary, configuredFallback]
        : [configuredPrimary];
    let requestedModel = modelsToTry[0];
    const lowPolyToolEnabled = TOOLS.some(t => t.function?.name === "create_lowpoly_object");
    // En solicitudes low-poly solo se ofrece create_lowpoly_object y el prompt
    // exige usarla. El transporte nativo de Gemini usa toolConfig ANY cuando
    // hay una sola función; el backend valida después que la tool y meshes
    // realmente hayan llegado. Para Workspace/conversación usa AUTO.
    const directLowPolyToolForced = directLowPolyRequest && lowPolyToolEnabled;
    const toolChoice = "auto";

    try {
        const result = await callWorkspaceModel({
            model: requestedModel,
            models: modelsToTry,
            messages: fullMessages,
            tools: TOOLS,
            tool_choice: toolChoice,
            temperature: directLowPolyRequest ? 1.0 : 0.7,
            max_tokens: SANDBOX_MAX_OUTPUT_TOKENS,
            parallel_tool_calls: false,
            ...(directLowPolyRequest ? { reasoning: { effort: "none", exclude: true }, transport: "gemini-generate-content" } : {}),
        });

        if (result.limited) {
            return res.status(429).json({
                error: result.message || `El proveedor ${WORKSPACE_MODEL_PROVIDER} está limitando temporalmente el Sandbox.`,
                retryAfterMs: result.retryAfterMs || 60000,
                code: "SANDBOX_PROVIDER_RATE_LIMITED",
            });
        }

        let response = result.response;
        let data = result.data;

        // Un proyecto Gemini puede no tener habilitado el modelo principal.
        // Si Google devuelve 404 y hay un fallback distinto, hacemos un único
        // intento con ese modelo; nunca se cambia a OpenRouter ni a un modelo
        // de pago automáticamente.
        if (response && response.status === 404 && modelsToTry.length > 1) {
            const fallbackModel = modelsToTry[1];
            const fallbackResult = await callWorkspaceModel({
                model: fallbackModel,
                models: [fallbackModel],
                messages: fullMessages,
                tools: TOOLS,
                tool_choice: toolChoice,
                temperature: directLowPolyRequest ? 1.0 : 0.7,
                max_tokens: SANDBOX_MAX_OUTPUT_TOKENS,
                parallel_tool_calls: false,
                ...(directLowPolyRequest ? { reasoning: { effort: "none", exclude: true }, transport: "gemini-generate-content" } : {}),
            });
            if (!fallbackResult.limited && fallbackResult.response?.ok) {
                requestedModel = fallbackModel;
                response = fallbackResult.response;
                data = fallbackResult.data;
            }
        }

        let qualityRetry = false;
        let qualityFeedback = directLowPolyRequest ? lowPolyQualityFeedback(data) : null;
        // Con el saldo actual no es seguro pagar dos generaciones completas.
        // El modelo recibe el contrato detallado en la primera llamada; el
        // reintento solo se habilita si el presupuesto configurado es amplio.
        const qualityRetryAllowed = SANDBOX_MAX_OUTPUT_TOKENS >= 2400
            && process.env.SANDBOX_ENABLE_QUALITY_RETRY !== "false";
        if (qualityFeedback && qualityRetryAllowed) {
            const retryMessages = [
                ...fullMessages,
                { role: "user", content: `La primera propuesta de malla fue rechazada por baja calidad: ${qualityFeedback}. Generá ahora una única create_lowpoly_object completa y diferente, con la cantidad de partes, vértices, triángulos y silueta anatómica solicitadas. No uses primitivas ni describas el resultado: enviá la tool call con meshes reales.` },
            ];
            const retryResult = await callWorkspaceModel({
                model: requestedModel,
                models: modelsToTry,
                messages: retryMessages,
                tools: TOOLS,
                tool_choice: toolChoice,
                temperature: 0.2,
                max_tokens: SANDBOX_MAX_OUTPUT_TOKENS,
                parallel_tool_calls: false,
                reasoning: { effort: "none", exclude: true },
                transport: "gemini-generate-content",
            });
            if (!retryResult.limited && retryResult.response?.ok) {
                const firstUsage = data?.usage || {};
                const secondData = retryResult.data || {};
                const secondUsage = secondData.usage || {};
                data = {
                    ...secondData,
                    usage: {
                        ...secondUsage,
                        prompt_tokens: Number(firstUsage.prompt_tokens || 0) + Number(secondUsage.prompt_tokens || 0),
                        completion_tokens: Number(firstUsage.completion_tokens || 0) + Number(secondUsage.completion_tokens || 0),
                        total_tokens: Number(firstUsage.total_tokens || 0) + Number(secondUsage.total_tokens || 0),
                        cost: Number(firstUsage.cost || data?.cost || 0) + Number(secondUsage.cost || secondData.cost || 0),
                    },
                };
                response = retryResult.response;
                qualityRetry = true;
                qualityFeedback = lowPolyQualityFeedback(data);
            }
        }
        if (!response?.ok) {
            const upstreamStatus = response?.status || 502;
            const detail = data?.error?.message || `HTTP ${upstreamStatus}`;
            const insufficientCredits = upstreamStatus === 402
                || /requires more credits|can only afford|requested up to|insufficient credits|saldo insuficiente/i.test(String(detail));
            if (insufficientCredits) {
                return res.status(402).json({
                    error: `El proveedor ${WORKSPACE_MODEL_PROVIDER} rechazó la solicitud por saldo o crédito insuficiente. En el nivel gratuito de Gemini no se requiere saldo monetario; verificá que GEMINI_API_KEY pertenezca a un proyecto activo y que no se esté enviando un modelo de pago. La solicitud necesita hasta ${SANDBOX_MAX_OUTPUT_TOKENS} tokens; no se generará una plantilla local.`,
                    code: "SANDBOX_PROVIDER_INSUFFICIENT_CREDITS",
                    upstreamStatus,
                    requestedMaxTokens: SANDBOX_MAX_OUTPUT_TOKENS,
                    providerDetail: detail,
                    build: SANDBOX_AGENT_BUILD,
                });
            }
            // No convertir errores de autenticación, modelo o proveedor en un
            // bloqueo administrativo del Sandbox.
            return res.status(502).json({
                error: `${WORKSPACE_MODEL_PROVIDER} no pudo responder: ${detail}`,
                detail,
                providerDetail: detail,
                code: "SANDBOX_PROVIDER_REQUEST_FAILED",
                upstreamStatus,
                requestedModel,
                build: SANDBOX_AGENT_BUILD,
            });
        }

        const msg = data.choices?.[0]?.message || {};
        const toolCalls = (msg.tool_calls || []).map(tc => ({
            id: tc.id, name: tc.function?.name, args: safeParseJSON(tc.function?.arguments),
        }));
        if (directLowPolyRequest && !toolCalls.some(tc => tc.name === "create_lowpoly_object")) {
            const finishReason = data?.choices?.[0]?.finish_reason || null;
            return res.status(422).json({
                error: finishReason === "length"
                        ? `${WORKSPACE_MODEL_PROVIDER} truncó la llamada antes de completar meshes. Reducí el tamaño de la malla o verificá el límite de salida del proyecto para generar el modelo.`
                        : "El modelo no devolvió create_lowpoly_object con meshes para esta solicitud 3D.",
                code: "LOWPOLY_TOOL_NOT_RETURNED",
                model: data.model || requestedModel,
                usage: data.usage || null,
                cost: data.usage?.cost ?? data.cost ?? null,
                build: SANDBOX_AGENT_BUILD,
            });
        }
        return res.status(200).json({
            assistantText: msg.content || null,
            toolCalls,
            model: data.model || requestedModel,
            provider: data.provider || null,
            generationId: data.id || null,
            usage: data.usage || null,
            cost: data.usage?.cost ?? data.cost ?? data.usage?.cost_details?.upstream_inference_cost ?? null,
            requestedModels: modelsToTry,
            forcedTool: directLowPolyToolForced ? "create_lowpoly_object" : null,
            availableTools: TOOLS.map(t => t.function.name),
            qualityRetry,
            qualityWarning: qualityFeedback,
            qualityRetrySkipped: Boolean(qualityFeedback && !qualityRetryAllowed),
            maxOutputTokens: SANDBOX_MAX_OUTPUT_TOKENS,
            cyclesUsed: getSandboxState(sandboxId).autonomousStreak,
            cyclesMax: config.maxCyclesPerSandbox,
            build: SANDBOX_AGENT_BUILD,
        });
    } catch (e) {
        if (e.code === "NO_KEYS") {
            return res.status(502).json({
                error: `El Sandbox no tiene ${WORKSPACE_MODEL_PROVIDER === "gemini" ? "GEMINI_API_KEY" : "la clave del proveedor"} configurada.`,
                code: "SANDBOX_PROVIDER_NOT_CONFIGURED",
            });
        }
        return res.status(502).json({
            error: "No se pudo obtener una decisión del agente.",
                detail: e.message,
                code: e.code || "SANDBOX_PROVIDER_REQUEST_FAILED",
                build: SANDBOX_AGENT_BUILD,
            });
    }
}

function safeParseJSON(str) {
    if (str && typeof str === "object") return str;
    try { return JSON.parse(str || "{}"); } catch { return {}; }
}

function lowPolyQualityFeedback(data) {
    const message = data?.choices?.[0]?.message || {};
    const call = (message.tool_calls || []).find(tc => tc.function?.name === "create_lowpoly_object");
    if (!call) return null;
    const args = safeParseJSON(call.function?.arguments);
    const meshes = Array.isArray(args.meshes) ? args.meshes : [];
    const parts = meshes.length;
    const totalVertices = meshes.reduce((sum, part) => sum + (Array.isArray(part?.vertices) ? part.vertices.length : 0), 0);
    const totalFaces = meshes.reduce((sum, part) => sum + (Array.isArray(part?.faces) ? part.faces.length : 0), 0);
    const boxLikeParts = meshes.filter(part => Array.isArray(part?.vertices) && Array.isArray(part?.faces) && part.vertices.length === 8 && part.faces.length === 12).length;
    const roles = new Set(meshes.map(part => String(part?.role || '').trim().toLowerCase()).filter(Boolean));
    const kind = String(args.semanticType || '').toLowerCase();
    const issues = [];
    const requestLabel = `${String(args.name || '')} ${kind}`;
    const humanoidLike = /person|persona|humano|humanoid|personaje|b[ií]pedo|maniqu[ií]|figura humana|robot/i.test(requestLabel);
    const animalLike = ['cat','person','robot','custom'].includes(kind) || /gato|perro|animal|felino|canino|criatura|monstruo/i.test(requestLabel);
    const minimumParts = humanoidLike ? 10 : (animalLike ? 8 : 6);
    const minimumVertices = humanoidLike ? 160 : (animalLike ? 80 : 56);
    const minimumFaces = humanoidLike ? 280 : (animalLike ? 120 : 84);
    if (parts < minimumParts) issues.push(`usa al menos ${minimumParts} submallas anatómicas`);
    if (totalVertices < minimumVertices) issues.push(`usa al menos ${minimumVertices} vértices totales`);
    if (totalFaces < minimumFaces) issues.push(`usa al menos ${minimumFaces} triángulos totales`);
    if (boxLikeParts >= 4 && boxLikeParts >= Math.ceil(Math.max(parts, 1) * 0.6)) issues.push('no repitas cubos de 8 vértices y 12 triángulos; crea volúmenes con siluetas distintas');
    if ((animalLike || humanoidLike) && roles.size < Math.min(parts, 6)) issues.push('asigna roles anatómicos distintos a las partes');
    if (humanoidLike) {
        const articulatedRolePattern = /torso|pelvis|head|head|neck|shoulder|arm|forearm|hand|thigh|leg|shin|foot|pie|brazo|antebrazo|mano|muslo|pantorrilla/i;
        const articulatedRoles = [...roles].filter(role => articulatedRolePattern.test(role)).length;
        if (articulatedRoles < 6) issues.push('separa torso, pelvis, cabeza y segmentos articulados de brazos y piernas');
    }
    return issues.length ? issues.join('; ') : null;
}
