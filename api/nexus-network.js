// api/nexus-network.js — RANDAR / NEXUS public network intelligence
// Solo consulta registros públicos agregados de PeeringDB.
// No realiza port scanning, descubrimiento de hosts ni acceso a servidores privados.

const DEFAULT_TIMEOUT_MS = 8000;
const BASE = 'https://www.peeringdb.com/api';
const clean = (value, max = 180) => String(value == null ? '' : value).slice(0, max);
const json = (res, status, body) => res.status(status).json(body);

function withTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { signal: controller.signal, headers: { Accept: 'application/json', 'User-Agent': 'RANDAR-public-observatory/1.0' } })
    .then(async response => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .finally(() => clearTimeout(timer));
}

function normalize(type, item) {
  const common = { id: `${type}-${item.id}`, type, name: clean(item.name || item.name_long || `${type}-${item.id}`), city: clean(item.city), country: clean(item.country, 8), region: clean(item.region_continent), source: 'https://www.peeringdb.com/', updated: item.updated || item.created || null };
  if (type === 'ix') return { ...common, website: clean(item.website, 300), networks: Number(item.net_count) || 0, facilities: Number(item.fac_count) || 0, lat: Number.isFinite(Number(item.latitude)) ? Number(item.latitude) : null, lon: Number.isFinite(Number(item.longitude)) ? Number(item.longitude) : null };
  if (type === 'facility') return { ...common, organization: clean(item.org_name), website: clean(item.website, 300), networks: Number(item.net_count) || 0, exchanges: Number(item.ix_count) || 0, state: clean(item.state), lat: Number.isFinite(Number(item.latitude)) ? Number(item.latitude) : null, lon: Number.isFinite(Number(item.longitude)) ? Number(item.longitude) : null };
  return { ...common, asn: Number(item.asn) || null, scope: clean(item.info_scope), infoType: clean(item.info_type), prefixes4: Number(item.info_prefixes4) || 0, prefixes6: Number(item.info_prefixes6) || 0, networks: Number(item.ix_count) || 0, facilities: Number(item.fac_count) || 0 };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'METHOD NOT ALLOWED' });
  const timeout = Math.max(2500, Math.min(12000, Number(process.env.NEXUS_NETWORK_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS));
  const limit = Math.max(20, Math.min(800, Number(req.query?.limit) || 400));
  const endpoints = [
    ['ix', `${BASE}/ix?limit=${limit}`],
    ['network', `${BASE}/net?limit=${limit}`],
    ['facility', `${BASE}/fac?limit=${limit}`],
  ];
  const results = await Promise.allSettled(endpoints.map(([, url]) => withTimeout(url, timeout)));
  const records = { ix: [], networks: [], facilities: [] };
  const sourceStates = {};
  results.forEach((result, index) => {
    const [type] = endpoints[index];
    const key = type === 'ix' ? 'ix' : type === 'network' ? 'networks' : 'facilities';
    if (result.status === 'fulfilled') {
      const data = Array.isArray(result.value?.data) ? result.value.data : [];
      records[key] = data.map(item => normalize(type === 'network' ? 'network' : type, item)).filter(item => item.name);
      sourceStates[key] = { status: records[key].length ? 'RECENT' : 'EMPTY', count: records[key].length, source: `${BASE}/${type === 'network' ? 'net' : type}` };
    } else sourceStates[key] = { status: result.reason?.name === 'AbortError' ? 'TIMEOUT' : 'UNAVAILABLE', count: 0, source: `${BASE}/${type === 'network' ? 'net' : type}` };
  });
  const total = records.ix.length + records.networks.length + records.facilities.length;
  res.setHeader?.('Cache-Control', 's-maxage=300, stale-while-revalidate=900');
  return json(res, 200, { ok: total > 0, dataset: 'public-network-intelligence', dataType: 'PUBLIC PUBLISHED REGISTRY', source: 'https://www.peeringdb.com/', lastUpdated: new Date().toISOString(), coverage: 'Published PeeringDB networks, IXPs and facilities; not a server inventory', records, sourceStates, counts: { networks: records.networks.length, asn: records.networks.filter(item => item.asn).length, ix: records.ix.length, dataCenters: records.facilities.length, cdn: records.networks.filter(item => /cdn|cloud|content|hosting|compute/i.test(`${item.name} ${item.infoType}`)).length, publicInfrastructure: total } });
}
