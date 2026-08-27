// api/nexus-data.js — CUT-REAL NEXUS
// Datos públicos y legítimos únicamente. No realiza escaneos ni accede a sistemas privados.
// NEXUS no consume GROQ_API_KEY, GEMINI_API_KEY ni SUPER_AI_*.

const DEFAULT_TIMEOUT_MS = 12000;
const DEFAULT_SOURCE = 'https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=tle';
const FALLBACK_SOURCE = 'https://www.amsat.org/tle/dailytle.txt';
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

async function fetchPublicTle(candidates, timeout) {
  let lastError = null;
  for (const candidate of [...new Set(candidates.filter(Boolean))]) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(candidate, { signal: controller.signal, headers: { Accept: 'text/plain', 'User-Agent': 'CUT-REAL-NEXUS/1.0 public-TLE-observatory' } });
      if (response.ok) return { response, source: candidate };
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError || new Error('DATA SOURCE UNAVAILABLE');
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'METHOD NOT ALLOWED' });
  const dataset = String(req.query?.dataset || 'satellites').toLowerCase();
  const source = DATASETS[dataset] || DATASETS.satellites;
  const timeout = Math.max(3000, Math.min(20000, Number(process.env.NEXUS_DATA_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS));
  res.setHeader?.('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
  try {
    const candidates = [source, source === DEFAULT_SOURCE ? FALLBACK_SOURCE : DEFAULT_SOURCE];
    const fetched = await fetchPublicTle(candidates, timeout);
    const response = fetched.response;
    const activeSource = fetched.source;
    const body = await response.text();
    const satellites = parseTle(body, activeSource);
    if (!satellites.length) return json(res, 200, { ok: false, error: 'UNKNOWN', source: activeSource, dataType: 'PUBLIC TLE' });
    return json(res, 200, { ok: true, dataset, source: activeSource, dataType: 'PUBLIC TLE', lastUpdated: new Date().toISOString(), satellites });
  } catch (error) {
    return json(res, 200, { ok: false, error: error?.name === 'AbortError' ? 'DATA SOURCE TIMEOUT' : 'DATA SOURCE UNAVAILABLE', source, dataType: 'PUBLIC TLE' });
  }
}
