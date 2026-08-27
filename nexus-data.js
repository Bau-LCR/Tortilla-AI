// api/nexus-data.js — CUT-REAL NEXUS
// Datos públicos y legítimos únicamente. No realiza escaneos ni accede a sistemas privados.
// NEXUS no consume GROQ_API_KEY, GEMINI_API_KEY ni SUPER_AI_*.

const DEFAULT_TIMEOUT_MS = 12000;
const DEFAULT_SOURCE = 'https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=tle';
const DATASETS = {
  satellites: process.env.NEXUS_CELESTRAK_URL || DEFAULT_SOURCE,
  stations: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=tle',
  weather: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=weather&FORMAT=tle',
};

const clean = (value, max = 120) => String(value == null ? '' : value).slice(0, max);
const json = (res, status, body) => res.status(status).json(body);

function parseTle(text, source) {
  const lines = String(text || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const satellites = [];
  for (let index = 0; index < lines.length;) {
    const name = lines[index];
    const lineOne = lines[index + 1];
    const lineTwo = lines[index + 2];
    if (lineOne?.startsWith('1 ') && lineTwo?.startsWith('2 ')) {
      satellites.push({
        id: clean(lineOne.slice(2, 7).trim() || `tle-${satellites.length + 1}`, 32),
        name: clean(name, 120),
        tle1: clean(lineOne, 90),
        tle2: clean(lineTwo, 90),
        type: 'PUBLIC TLE',
        source,
        dataType: 'PUBLIC ORBITAL ELEMENTS',
        lastUpdated: new Date().toISOString(),
      });
      index += 3;
    } else index += 1;
  }
  return satellites.slice(0, 120);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'METHOD NOT ALLOWED' });
  const dataset = String(req.query?.dataset || 'satellites').toLowerCase();
  const source = DATASETS[dataset] || DATASETS.satellites;
  const timeout = Math.max(3000, Math.min(20000, Number(process.env.NEXUS_DATA_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(source, { signal: controller.signal, headers: { Accept: 'text/plain' } });
    if (!response.ok) return json(res, 200, { ok: false, error: 'DATA SOURCE UNAVAILABLE', status: response.status, source, dataType: 'PUBLIC TLE' });
    const body = await response.text();
    const satellites = parseTle(body, source);
    if (!satellites.length) return json(res, 200, { ok: false, error: 'UNKNOWN', source, dataType: 'PUBLIC TLE' });
    return json(res, 200, { ok: true, dataset, source, dataType: 'PUBLIC TLE', lastUpdated: new Date().toISOString(), satellites });
  } catch (error) {
    return json(res, 200, { ok: false, error: error?.name === 'AbortError' ? 'DATA SOURCE TIMEOUT' : 'DATA SOURCE UNAVAILABLE', source, dataType: 'PUBLIC TLE' });
  } finally {
    clearTimeout(timer);
  }
}
