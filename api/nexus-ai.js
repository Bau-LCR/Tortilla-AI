// api/nexus-ai.js — NEXUS AI independiente
// Solo utiliza NEXUS_AI_*; nunca lee GROQ_API_KEY, GEMINI_API_KEY ni SUPER_AI_*.
// Interpreta datos públicos ya cargados. No realiza reconocimiento de infraestructura privada.

const clean = (value, max = 1200) => String(value == null ? '' : value).slice(0, max);
const json = (res, status, body) => res.status(status).json(body);
const timeoutFetch = async (url, options, timeoutMs = 18000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(url, { ...options, signal: controller.signal }); } finally { clearTimeout(timer); }
};

function configured() {
  return {
    key: String(process.env.NEXUS_AI_KEY || '').trim(),
    baseUrl: String(process.env.NEXUS_AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, ''),
    model: String(process.env.NEXUS_AI_MODEL || 'gpt-4o-mini').trim(),
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'METHOD NOT ALLOWED' });
  const config = configured();
  if (!config.key) return json(res, 200, { ok: false, error: 'NEXUS AI · UNAVAILABLE · NEXUS_AI_KEY no está configurada.' });
  const body = req.body || {};
  const question = clean(body.question, 900).trim();
  if (!question) return json(res, 400, { ok: false, error: 'Escribí una pregunta para NEXUS AI.' });
  const selected = body.selected && typeof body.selected === 'object' ? { name: clean(body.selected.name, 120), type: clean(body.selected.type, 120), source: clean(body.selected.source, 300) } : null;
  const counts = body.counts && typeof body.counts === 'object' ? { satellites: clean(body.counts.satellites, 30), networks: clean(body.counts.networks, 30), dataCenters: clean(body.counts.dataCenters, 30) } : {};
  const sources = Array.isArray(body.sources) ? body.sources.slice(0, 8).map(item => clean(item, 300)) : [];
  const system = 'Sos NEXUS AI, un intérprete de observatorio tecnológico. Usa solamente los datos públicos incluidos en el mensaje. Separa DATA de AI INTERPRETATION. No inventes satélites, posiciones, ASN, servidores, centros de datos, usuarios ni alertas. Si falta un dato escribe UNKNOWN o UNAVAILABLE. Nunca solicites ni infieras coordenadas exactas, identidades o ubicaciones individuales. No hagas escaneos, port scanning, acceso a sistemas ni vigilancia.';
  const user = JSON.stringify({ question, selectedPublicObject: selected, availableCounts: counts, sourceStates: sources });
  try {
    const response = await timeoutFetch(`${config.baseUrl}/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.key}` }, body: JSON.stringify({ model: config.model, temperature: 0.1, max_tokens: 700, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return json(res, 200, { ok: false, error: `NEXUS AI · UNAVAILABLE · HTTP ${response.status}` });
    const answer = payload.choices?.[0]?.message?.content || '';
    if (!answer) return json(res, 200, { ok: false, error: 'NEXUS AI · UNKNOWN · respuesta vacía' });
    return json(res, 200, { ok: true, data: `Contexto público recibido: ${JSON.stringify({ selected, counts, sources }).slice(0, 1600)}`, interpretation: clean(answer, 6000), provider: 'NEXUS_AI_CONFIGURED', model: config.model, source: 'PUBLIC DATA CONTEXT' });
  } catch (error) {
    return json(res, 200, { ok: false, error: error?.name === 'AbortError' ? 'NEXUS AI · TIMEOUT' : 'NEXUS AI · UNAVAILABLE' });
  }
}
