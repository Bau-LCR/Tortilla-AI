/* PROJECT SEARCH · opcional, aislado de Chat Normal */
function json(res, status, payload) { res.status(status).setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify(payload)); }
export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Método no permitido' });
  const query = String(req.body?.query || '').trim().slice(0, 500);
  if (!query) return json(res, 400, { error: 'Falta la consulta.' });
  const serper = process.env.PROJECTS_SEARCH_API_KEY || process.env.SERPER_API_KEY;
  const brave = process.env.PROJECTS_BRAVE_SEARCH_API_KEY || process.env.BRAVE_SEARCH_API_KEY;
  const tavily = process.env.PROJECTS_TAVILY_API_KEY || process.env.TAVILY_API_KEY;
  try {
    if (serper) {
      const response = await fetch('https://google.serper.dev/search', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-KEY': serper }, body: JSON.stringify({ q: query, num: 6 }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return json(res, response.status, { error: data.message || 'Falló Serper.' });
      return json(res, 200, { provider: 'serper', results: (data.organic || []).slice(0, 6).map(item => ({ title: item.title, url: item.link, snippet: item.snippet })) });
    }
    if (brave) {
      const response = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=6`, { headers: { Accept: 'application/json', 'X-Subscription-Token': brave } });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return json(res, response.status, { error: 'Falló Brave Search.' });
      return json(res, 200, { provider: 'brave', results: (data.web?.results || []).slice(0, 6).map(item => ({ title: item.title, url: item.url, snippet: item.description })) });
    }
    if (tavily) {
      const response = await fetch('https://api.tavily.com/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ api_key: tavily, query, search_depth: 'basic', max_results: 6, include_answer: false }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return json(res, response.status, { error: 'Falló Tavily.' });
      return json(res, 200, { provider: 'tavily', results: (data.results || []).slice(0, 6).map(item => ({ title: item.title, url: item.url, snippet: item.content })) });
    }
    return json(res, 200, { provider: null, results: [], unavailable: true, message: 'No hay una API de búsqueda configurada para Proyectos.' });
  } catch (error) { return json(res, 502, { error: error.message || 'No se pudo buscar.' }); }
}
