// api/nexus-data.js — CUT-REAL NEXUS
// Datos públicos y legítimos únicamente. No realiza escaneos ni accede a sistemas privados.
// NEXUS no consume GROQ_API_KEY, GEMINI_API_KEY ni SUPER_AI_*.

const DEFAULT_TIMEOUT_MS = 6000;
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
  const uniqueCandidates = [...new Set(candidates.filter(Boolean))];
  const controllers = uniqueCandidates.map(() => new AbortController());
  let winner = -1;
  const timer = setTimeout(() => controllers.forEach(controller => controller.abort()), timeout);
  try {
    const requests = uniqueCandidates.map(async (candidate, index) => {
      const response = await fetch(candidate, { signal: controllers[index].signal, headers: { Accept: 'text/plain', 'User-Agent': 'CUT-REAL-NEXUS/1.0 public-TLE-observatory' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await response.text();
      const satellites = parseTle(body, candidate);
      if (!satellites.length) throw new Error('EMPTY_OR_INVALID_PUBLIC_TLE');
      winner = index;
      return { source: candidate, satellites };
    });
    return await Promise.any(requests);
  } catch (error) {
    const errors = Array.isArray(error?.errors) ? error.errors : [];
    throw errors.find(item => item?.name === 'AbortError') || errors[0] || error || new Error('DATA SOURCE UNAVAILABLE');
  } finally {
    clearTimeout(timer);
    controllers.forEach((controller, index) => { if (index !== winner) controller.abort(); });
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'METHOD NOT ALLOWED' });
  const dataset = String(req.query?.dataset || 'satellites').toLowerCase();
  const source = DATASETS[dataset] || DATASETS.satellites;
  const timeout = Math.max(2500, Math.min(8000, Number(process.env.NEXUS_DATA_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS));
  res.setHeader?.('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
  try {
    const candidates = [source, source === DEFAULT_SOURCE ? FALLBACK_SOURCE : DEFAULT_SOURCE];
    const fetched = await fetchPublicTle(candidates, timeout);
    const activeSource = fetched.source;
    const satellites = fetched.satellites;
    if (!satellites.length) return json(res, 200, { ok: false, error: 'UNKNOWN', source: activeSource, dataType: 'PUBLIC TLE' });
    return json(res, 200, { ok: true, dataset, source: activeSource, dataType: 'PUBLIC TLE', lastUpdated: new Date().toISOString(), satellites });
  } catch (error) {
    return json(res, 200, { ok: false, error: error?.name === 'AbortError' ? 'DATA SOURCE TIMEOUT' : 'DATA SOURCE UNAVAILABLE', source, dataType: 'PUBLIC TLE' });
  }
}
