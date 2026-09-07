const ALLOWED_METHOD = 'POST';

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  if (req.method !== ALLOWED_METHOD) return json(res, 405, { ok: false, error: 'Método no permitido.' });
  const prompt = String(req.body?.prompt || '').trim();
  if (!prompt) return json(res, 400, { ok: false, error: 'Falta el prompt de imagen.' });
  if (prompt.length > 4000) return json(res, 400, { ok: false, error: 'El prompt de imagen es demasiado largo.' });

  const baseUrl = String(process.env.IMAGE_API_BASE_URL || '').replace(/\/$/, '');
  const apiKey = process.env.IMAGE_API_KEY;
  const model = process.env.IMAGE_MODEL;
  if (!baseUrl || !apiKey || !model) {
    return json(res, 503, { ok: false, error: 'La generación de imágenes no está configurada en el servidor. Faltan IMAGE_API_BASE_URL, IMAGE_API_KEY o IMAGE_MODEL.' });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.IMAGE_TIMEOUT_MS || 120000));
  try {
    const upstream = await fetch(`${baseUrl}/images/generations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, prompt, size: process.env.IMAGE_SIZE || '1024x1024', n: 1, response_format: 'url' }),
      signal: controller.signal
    });
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) return json(res, upstream.status, { ok: false, error: data.error?.message || 'El proveedor de imágenes rechazó la solicitud.' });
    const item = Array.isArray(data.data) ? data.data[0] : null;
    const source = item?.url || (item?.b64_json ? `data:image/png;base64,${item.b64_json}` : null);
    if (!source) return json(res, 502, { ok: false, error: 'El proveedor respondió sin una imagen utilizable.' });
    return json(res, 200, { ok: true, url: source, provider: 'configured-image-provider', model });
  } catch (error) {
    return json(res, error.name === 'AbortError' ? 504 : 502, { ok: false, error: error.name === 'AbortError' ? 'El proveedor agotó el tiempo de espera.' : 'No se pudo contactar al proveedor de imágenes.' });
  } finally { clearTimeout(timeout); }
}
