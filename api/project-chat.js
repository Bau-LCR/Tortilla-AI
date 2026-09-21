/* PROJECT CHAT API · proveedor separado del Chat Normal */
function json(res, status, payload) { res.status(status).setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify(payload)); }
function isModelError(message) { return /model|does not exist|access|permission|not found/i.test(String(message || '')); }
async function callModel(base, key, model, body, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let upstream = await fetch(`${base}/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body: JSON.stringify({ ...body, model, response_format: { type: 'json_object' } }), signal: controller.signal });
    let data = await upstream.json().catch(() => ({}));
    // Algunos modelos compatibles no aceptan response_format; se reintenta sin perder la solicitud.
    if (!upstream.ok && /response_format|json_object|unsupported/i.test(String(data.error?.message || ''))) {
      upstream = await fetch(`${base}/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body: JSON.stringify({ ...body, model }), signal: controller.signal });
      data = await upstream.json().catch(() => ({}));
    }
    return { upstream, data };
  } finally { clearTimeout(timer); }
}
export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Método no permitido' });
  const base = String(process.env.PROJECTS_API_BASE_URL || '').replace(/\/$/, '');
  const key = process.env.PROJECTS_API_KEY;
  if (!base || !key) return json(res, 503, { error: 'Faltan PROJECTS_API_BASE_URL y PROJECTS_API_KEY en Vercel.' });
  const messages = Array.isArray(req.body?.mensajes) ? req.body.mensajes : [];
  if (!messages.length) return json(res, 400, { error: 'Faltan mensajes del proyecto.' });
  const configured = String(process.env.PROJECTS_MODEL || 'openai/gpt-oss-20b').trim();
  const requested = String(req.body?.providerModel || '').trim();
  const raw = requested && !['basic', 'pro', 'ultra'].includes(requested) ? requested : configured;
  const first = raw === 'llama-3.3-70b-versatile' ? 'openai/gpt-oss-20b' : raw;
  const candidates = [...new Set([first, 'openai/gpt-oss-20b', 'openai/gpt-oss-120b', 'llama-3.1-8b-instant'])];
  const timeoutMs = Number(process.env.PROJECTS_TIMEOUT_MS || 90000);
  const body = { messages, temperature: 0.15, max_tokens: Math.max(6000, Number(process.env.PROJECTS_MAX_OUTPUT_TOKENS || 6000)) };
  for (const model of candidates) {
    try {
      const { upstream, data } = await callModel(base, key, model, body, timeoutMs);
      if (upstream.ok) return json(res, 200, { ...data, projectProvider: true, model });
      const detail = String(data.error?.message || '');
      if (!isModelError(detail)) return json(res, upstream.status, { error: detail || `Proveedor de Proyectos HTTP ${upstream.status}` });
    } catch (error) {
      if (error.name === 'AbortError') return json(res, 504, { error: 'Tiempo agotado en el proveedor de Proyectos.' });
      if (model === candidates.at(-1)) return json(res, 502, { error: 'No se pudo contactar al proveedor de Proyectos.' });
    }
  }
  return json(res, 403, { error: 'La clave de Proyectos no tiene acceso a los modelos activos configurados. Probá openai/gpt-oss-20b en PROJECTS_MODEL.' });
}
