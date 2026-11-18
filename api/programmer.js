import { callWorkspaceModel, WORKSPACE_MODEL_NAME } from "./workspace-model-client.js";

const MAX_FILES = 18;
const MAX_FILE_CHARS = 180000;
const MAX_CONTEXT_CHARS = 30000;

function parseJSON(text) {
  let cleaned = String(text || "").replace("\uFEFF", "").trim();
  if (cleaned.startsWith("```json")) cleaned = cleaned.slice(7).trim();
  else if (cleaned.startsWith("```")) cleaned = cleaned.slice(3).trim();
  if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, -3).trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Gemini no devolvió el formato de proyecto esperado.");
  return JSON.parse(cleaned.slice(start, end + 1));
}
function validPath(path) {
  return typeof path === "string" && path.length <= 100 && !path.startsWith("/") && !path.includes("..") && [...path].every(ch => "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_./-".includes(ch));
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido." });
  const prompt = typeof req.body?.prompt === "string" ? req.body.prompt.trim() : "";
  const files = req.body?.files && typeof req.body.files === "object" && !Array.isArray(req.body.files) ? req.body.files : {};
  if (!prompt) return res.status(400).json({ error: "Escribí qué querés crear o modificar." });
  if (prompt.length > 5000) return res.status(413).json({ error: "La instrucción es demasiado larga (máximo 5000 caracteres)." });

  const safeFiles = Object.entries(files).filter(([path, value]) => validPath(path) && typeof value === "string" && value.length <= MAX_FILE_CHARS).slice(0, MAX_FILES);
  const fileContext = JSON.stringify(Object.fromEntries(safeFiles)).slice(0, MAX_CONTEXT_CHARS);
  const system = `Sos Programador IA 2.0 de Cut-real AI. Trabajás sobre proyectos web reales en HTML, CSS y JavaScript. Respondé SIEMPRE con un único objeto JSON válido, sin Markdown ni bloques de código, con esta forma exacta: {"message":"resumen breve en español","files":{"ruta/archivo.ext":"contenido completo del archivo"}}. En files incluí únicamente los archivos que deban crearse o modificarse, pero cada valor debe ser el contenido COMPLETO del archivo. Conservá los archivos existentes y no elimines funcionalidades no relacionadas. No inventes que ejecutaste el proyecto: el navegador lo ejecutará en una vista previa aislada después de recibir los archivos. Si faltan datos, hacé una pregunta en message y devolvé files vacío. No incluyas rutas absolutas, rutas con .., credenciales, tokens ni secretos. Mantené los archivos pequeños, funcionales, accesibles y responsive. Evitá dependencias externas salvo que sean imprescindibles.`;
  const history = Array.isArray(req.body?.history) ? req.body.history.slice(-8).filter(item => item && ["user","assistant"].includes(item.role) && typeof item.content === "string").map(item => ({ role: item.role, content: item.content.slice(0, 1600) })) : [];
  const historyText = history.map(item => `${item.role === "user" ? "USUARIO" : "ASISTENTE"}: ${item.content}`).join("\\n");
  const user = `PEDIDO ACTUAL DEL USUARIO:\\n${prompt}\\n\\nCONTEXTO RECIENTE DE LA CONVERSACIÓN:\\n${historyText || "Sin mensajes previos."}\\n\\nARCHIVOS ACTUALES (JSON):\\n${fileContext || "{}"}\\n\\nARCHIVO ACTIVO: ${String(req.body?.activeFile || "index.html").slice(0,100)}\\n\\nDevolvé el objeto JSON solicitado. Cuando modifiques archivos, asegurate de que el HTML, CSS y JavaScript sean coherentes entre sí.`;

  try {
    const result = await callWorkspaceModel({
      model: WORKSPACE_MODEL_NAME,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      temperature: 0.25,
      max_tokens: 8192
    });
    if (result.limited) return res.status(429).json({ error: result.message || "Gemini está temporalmente limitado.", code: "PROGRAMMER_RATE_LIMITED", retryAfterMs: result.retryAfterMs || 60000 });
    if (!result.response?.ok) {
      const detail = result.data?.error?.message || `HTTP ${result.response?.status || 502}`;
      return res.status(502).json({ error: `Gemini no pudo generar el proyecto: ${detail}`, code: "PROGRAMMER_PROVIDER_FAILED" });
    }
    const raw = result.data?.choices?.[0]?.message?.content || "";
    const output = parseJSON(raw);
    const changed = {};
    if (output.files && typeof output.files === "object" && !Array.isArray(output.files)) {
      for (const [path, value] of Object.entries(output.files).slice(0, MAX_FILES)) {
        if (!validPath(path) || typeof value !== "string" || value.length > MAX_FILE_CHARS) continue;
        changed[path] = value;
      }
    }
    return res.status(200).json({
      message: typeof output.message === "string" ? output.message.slice(0, 4000) : "Respuesta recibida.",
      files: changed,
      provider: "Gemini",
      model: result.data?.model || WORKSPACE_MODEL_NAME
    });
  } catch (error) {
    return res.status(502).json({ error: error.message || "No se pudo completar la solicitud.", code: error.code || "PROGRAMMER_REQUEST_FAILED" });
  }
}
