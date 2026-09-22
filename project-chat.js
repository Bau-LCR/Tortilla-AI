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
  const attachments = Array.isArray(req.body?.adjuntos) ? req.body.adjuntos.slice(0, 8) : [];
  const webResults = Array.isArray(req.body?.resultadosWeb) ? req.body.resultadosWeb.slice(0, 8) : [];
  // El modelo del proyecto es independiente del Chat Normal. Si Vercel conserva
  // un ID antiguo o sin acceso, se prueban modelos compatibles en orden.
  const configured = String(process.env.PROJECTS_MODEL || 'llama-3.1-8b-instant').trim();
  const requested = String(req.body?.providerModel || '').trim();
  const raw = requested && !['basic', 'pro', 'ultra'].includes(requested) ? requested : configured;
  const first = raw === 'llama-3.3-70b-versatile' ? 'llama-3.1-8b-instant' : raw;
  const candidates = [...new Set([first, 'llama-3.1-8b-instant', 'openai/gpt-oss-20b', 'qwen/qwen3-32b'])];
  const timeoutMs = Number(process.env.PROJECTS_TIMEOUT_MS || 90000);
  const attachmentParts = [{ type: 'text', text: `Adjuntos disponibles para esta solicitud. No inventes su contenido. Archivos: ${attachments.map(item => `${item.name} (${item.type})`).join(', ') || 'ninguno'}. Fuentes web: ${webResults.length ? webResults.map(item => `${item.title || ''} ${item.url || ''}`).join(' | ') : 'ninguna'}.` }];
  for (const item of attachments) { if (item.type === 'image' && item.data && item.mediaType) attachmentParts.push({ type: 'image_url', image_url: { url: `data:${item.mediaType};base64,${item.data}` } }); else if (item.text) attachmentParts[0].text += `\n\n--- ${item.name} ---\n${String(item.text).slice(0, 180000)}`; }
  const enrichedMessages = [{ role: 'system', content: messages[0]?.content || '' }, ...(attachments.length || webResults.length ? [{ role: 'user', content: attachmentParts }] : []), ...messages.slice(1)];
  const body = { messages: enrichedMessages, temperature: 0.15, max_tokens: Math.max(6000, Number(process.env.PROJECTS_MAX_OUTPUT_TOKENS || 6000)) };
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
  return json(res, 403, { error: `La clave de Proyectos no tiene acceso a los modelos configurados (${candidates.join(', ')}). Revisá PROJECTS_API_BASE_URL, PROJECTS_API_KEY y PROJECTS_MODEL.` });
}
