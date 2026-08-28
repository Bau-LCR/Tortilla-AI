// api/nexus-ai.js — NEXUS AI independiente
// Solo utiliza la configuración propia de RANDAR AI; nunca lee credenciales de otros módulos.
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
  if (!config.key) return json(res, 200, { ok: false, error: 'RANDAR AI · NO DISPONIBLE · NEXUS_AI_KEY no está configurada.' });
  const body = req.body || {};
  const question = clean(body.question, 900).trim();
  if (!question) return json(res, 400, { ok: false, error: 'Escribí una pregunta para RANDAR AI.' });
  const rawSelected = body.selected && typeof body.selected === 'object' ? body.selected : null;
  const rawPosition = rawSelected?.position && typeof rawSelected.position === 'object' ? rawSelected.position : null;
  const selected = rawSelected ? { name: clean(rawSelected.name, 120), type: clean(rawSelected.type, 120), source: clean(rawSelected.source, 300), position: rawPosition ? { disponible: true, confianza: 'DERIVED', altitudDisponible: Number.isFinite(Number(rawPosition.altitude)), velocidadDisponible: Number.isFinite(Number(rawPosition.velocity)) } : null, status: rawPosition ? 'DERIVED' : 'UNKNOWN' } : null;
  const counts = body.counts && typeof body.counts === 'object' ? { satellites: clean(body.counts.satellites, 30), networks: clean(body.counts.networks, 30), asn: clean(body.counts.asn, 30), ix: clean(body.counts.ix, 30), dataCenters: clean(body.counts.dataCenters, 30), cdn: clean(body.counts.cdn, 30) } : {};
  const rawSources = body.sources && typeof body.sources === 'object' ? body.sources : {};
  const sources = Object.entries(rawSources).slice(0, 12).map(([key, value]) => ({ dataset: clean(key, 80), status: clean(value?.status || 'UNKNOWN', 40), source: clean(value?.source || '', 300), lastUpdated: clean(value?.lastUpdated || '', 80), confidence: value?.status === 'RECENT' ? 'VERIFIED' : value?.status === 'UNAVAILABLE' ? 'UNAVAILABLE' : 'STALE' }));
  const system = 'Sos RANDAR AI, un intérprete de observatorio tecnológico. Respondé en español y usa solamente los datos públicos incluidos en el mensaje. Separa DATOS de INTERPRETACIÓN. Etiquetá cada afirmación como VERIFIED (fuente cargada), OBSERVED (observación pública), DERIVED (cálculo desde TLE), ESTIMATED (estimación explícita), SIMULATED (solo simulación de interfaz), STALE (fuente antigua) o UNAVAILABLE (sin dato). No inventes satélites, posiciones, ASN, servidores, centros de datos, usuarios ni alertas. Si falta un dato escribí DESCONOCIDO o NO DISPONIBLE. Nunca solicites ni infieras coordenadas exactas, identidades o ubicaciones individuales. No hagas escaneos, port scanning, acceso a sistemas ni vigilancia. No uses claves ni contexto de otros módulos.';
  const user = JSON.stringify({ question, selectedPublicObject: selected, availableCounts: counts, sourceStates: sources });
  try {
    const response = await timeoutFetch(`${config.baseUrl}/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.key}` }, body: JSON.stringify({ model: config.model, temperature: 0.1, max_tokens: 700, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return json(res, 200, { ok: false, error: `RANDAR AI · NO DISPONIBLE · HTTP ${response.status}` });
    const answer = payload.choices?.[0]?.message?.content || '';
    if (!answer) return json(res, 200, { ok: false, error: 'RANDAR AI · DESCONOCIDO · respuesta vacía' });
    return json(res, 200, { ok: true, data: `Estado de los datos: ${sources.length ? sources.map(item => `${item.dataset}=${item.confidence}`).join(' · ') : 'DESCONOCIDO'}. Contexto público recibido: ${JSON.stringify({ selected, counts }).slice(0, 1500)}`, interpretation: clean(answer, 6000), confidence: { data: sources.length ? 'VERIFIED' : 'UNKNOWN', selected: selected?.status || 'UNKNOWN', position: selected?.position ? 'DERIVED' : 'UNKNOWN' }, provider: 'NEXUS_AI_CONFIGURED', model: config.model, source: 'PUBLIC DATA CONTEXT' });
  } catch (error) {
    return json(res, 200, { ok: false, error: error?.name === 'AbortError' ? 'RANDAR AI · TIEMPO AGOTADO' : 'RANDAR AI · NO DISPONIBLE' });
  }
}
