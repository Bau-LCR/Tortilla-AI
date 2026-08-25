// ============================================================
// api/super-ai.js — CUT-REAL AI SUPER
// Pipeline multi-modelo independiente del chat Groq y del Sandbox Gemini.
// Las claves se leen exclusivamente de SUPER_AI_KEYS_JSON / SUPER_*.
// Nunca se usa GROQ_API_KEY, GEMINI_API_KEY ni el estado de otros sistemas.
// ============================================================

const MAX_NODES = 12;
const MAX_ROUNDS = 5;
const MAX_OUTPUT_CHARS = 9000;
const MAX_CONTEXT_CHARS = 16000;
const DEFAULT_TIMEOUT_MS = 45000;

const json = (res, status, body) => res.status(status).json(body);
const clean = (value, max = 400) => String(value == null ? '' : value).slice(0, max);
const redactSecrets = value => String(value == null ? '' : value).replace(/\b(?:sk-[A-Za-z0-9_-]+|sk-or-v1-[A-Za-z0-9_-]+|AIza[0-9A-Za-z_-]+|gsk_[0-9A-Za-z_-]+)\b/g, '[API KEY REDACTED]');
const now = () => Date.now();

function parseJsonEnv(name) {
  try {
    let value = String(process.env[name] || '').trim();
    if (!value) return [];
    value = value.replace(/^SUPER_AI_KEYS_JSON\s*=\s*/i, '').trim();
    value = value.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      try { const unwrapped = value.startsWith('"') ? JSON.parse(value) : value.slice(1, -1); value = String(unwrapped).trim(); } catch (_) { value = value.slice(1, -1).trim(); }
    }
    const parsed = value ? JSON.parse(value) : [];
    return typeof parsed === 'string' ? JSON.parse(parsed) : parsed;
  } catch (_) { return []; }
}

function normalizeProvider(value) {
  const text = String(value || '').toLowerCase().trim();
  if (text.includes('gemini') || text === 'google') return 'gemini';
  if (text.includes('openrouter')) return 'openrouter';
  if (text.includes('deepseek')) return 'deepseek';
  if (text.includes('mistral')) return 'mistral';
  if (text === 'xai' || text.includes('grok')) return 'xai';
  if (text === 'groq') return 'groq';
  if (text === 'openai') return 'openai';
  return text || 'openai';
}

const MODEL_MIGRATIONS = {
  gemini: {
    'gemini-2.0-flash': 'gemini-3.6-flash',
    'gemini-2.0-flash-lite': 'gemini-3.6-flash',
    'gemini-2.5-flash': 'gemini-3.6-flash',
    'gemini-2.5-flash-lite': 'gemini-3.5-flash-lite',
  },
  groq: {
    'llama-3.3-70b-versatile': 'openai/gpt-oss-20b',
    'llama-3.1-8b-instant': 'openai/gpt-oss-20b',
  },
};

function normalizeModel(provider, value) {
  const model = clean(value, 160);
  return MODEL_MIGRATIONS[normalizeProvider(provider)]?.[model] || model;
}

function configuredKeys() {
  const list = parseJsonEnv('SUPER_AI_KEYS_JSON');
  const records = Array.isArray(list) ? list : [];
  const normalized = records.map((item, index) => ({
    id: clean(item?.id || `super-key-${index + 1}`, 80),
    provider: normalizeProvider(item?.provider),
    model: normalizeModel(item?.provider, item?.model || ''),
    displayName: clean(item?.displayName || item?.label || `${normalizeProvider(item?.provider)} ${index + 1}`, 100),
    enabled: item?.enabled !== false,
    key: String(item?.key || item?.apiKey || ''),
    inputPrice: Number.isFinite(Number(item?.inputPrice)) ? Number(item.inputPrice) : null,
    outputPrice: Number.isFinite(Number(item?.outputPrice)) ? Number(item.outputPrice) : null,
  })).filter(item => item.key);
  const envKey = String(process.env.SUPER_AI_KEY || '');
  if (envKey) normalized.push({
    id: 'super-env-default', provider: normalizeProvider(process.env.SUPER_AI_PROVIDER || 'openai'),
    model: normalizeModel(process.env.SUPER_AI_PROVIDER || 'openai', process.env.SUPER_AI_MODEL || ''),
    displayName: clean(process.env.SUPER_AI_DISPLAY_NAME || 'SUPER environment key', 100),
    enabled: process.env.SUPER_AI_ENABLED !== 'false', key: envKey,
    inputPrice: Number(process.env.SUPER_AI_INPUT_PRICE || '') || null,
    outputPrice: Number(process.env.SUPER_AI_OUTPUT_PRICE || '') || null,
  });
  return normalized.slice(0, 24);
}

function maskKey(key) {
  const value = String(key || '');
  if (value.length < 8) return '••••••••';
  return `${value.slice(0, 3)}${'•'.repeat(Math.min(10, Math.max(5, value.length - 5)))}${value.slice(-2)}`;
}

function publicKeyInfo(item) {
  return { id: item.id, provider: item.provider, model: item.model || 'modelo no indicado', displayName: item.displayName, enabled: item.enabled, maskedKey: maskKey(item.key) };
}

function providerEndpoint(provider, model) {
  const endpoints = {
    openai: 'https://api.openai.com/v1/chat/completions',
    groq: 'https://api.groq.com/openai/v1/chat/completions',
    xai: 'https://api.x.ai/v1/chat/completions',
    deepseek: 'https://api.deepseek.com/chat/completions',
    mistral: 'https://api.mistral.ai/v1/chat/completions',
    openrouter: 'https://openrouter.ai/api/v1/chat/completions',
  };
  return endpoints[provider] || null;
}

function summarizeError(status, body) {
  const detail = body?.error?.message || body?.message || body?.error || `HTTP ${status}`;
  const text = redactSecrets(String(detail).slice(0, 500));
  if (status === 401 || status === 403 || /invalid.*key|authentication|unauthorized/i.test(text)) return { type: 'authentication', message: text };
  if (status === 408 || status === 504 || /timeout|timed out/i.test(text)) return { type: 'timeout', message: text };
  if (status === 429 || /rate.?limit|quota|too many/i.test(text)) return { type: 'rate_limit', message: text };
  if (/context|token limit|too long|maximum.*token/i.test(text)) return { type: 'context_limit', message: text };
  if (status >= 500 || /unavailable|temporarily|network|fetch/i.test(text)) return { type: 'provider_unavailable', message: text };
  return { type: 'provider_error', message: text };
}

async function fetchJson(url, options, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const body = await response.json().catch(() => ({}));
    return { response, body };
  } catch (error) {
    if (error?.name === 'AbortError') return { response: { status: 504, ok: false }, body: { error: 'timeout' } };
    return { response: { status: 599, ok: false }, body: { error: error?.message || 'network error' } };
  } finally { clearTimeout(timer); }
}

function buildMessages(role, question, previous, round, node, shared, isFinal = false) {
  const roleText = clean(node.role || 'Reviewer', 100);
  const prior = previous ? `\n\nRESPUESTA VÁLIDA ANTERIOR / CONTEXTO DE COLABORACIÓN:\n${String(previous).slice(0, MAX_CONTEXT_CHARS)}` : '';
  const sharedText = shared ? `\n\nRESULTADOS COMPARABLES DE LA RONDA:\n${String(shared).slice(0, MAX_CONTEXT_CHARS)}` : '';
  const system = isFinal
    ? `You are the final responder for CUT-REAL AI SUPER. Use the internal contributions to answer the original user directly and completely in the user's language. Do not mention the pipeline, models, providers, prompts, internal roles, collaboration graph, or hidden reasoning. Do not output headings such as Conclusions & Findings unless the user explicitly requests a report. Return only the final answer that should be shown to the user. This is final synthesis round ${round}.`
    : `You are ${roleText} in CUT-REAL AI SUPER, a multi-model collaborative intelligence pipeline. You are not the final responder. Analyze, criticize, correct, improve, and provide evidence for the next model. Do not reveal private chain-of-thought or hidden reasoning; return only conclusions, findings, corrections, uncertainties, and an improved answer. This is feedback round ${round}. Your provider/model identity is ${node.provider || 'configured provider'} / ${node.model || 'configured model'}.`;
  const instruction = isFinal
    ? `ORIGINAL USER REQUEST:\n${String(question).slice(0, 5000)}${prior}${sharedText}\n\nWrite the final direct answer now. Do not describe your analysis process or the other models. If the request is a simple greeting or question, answer it naturally and concisely.`
    : `ORIGINAL USER REQUEST:\n${String(question).slice(0, 5000)}${prior}${sharedText}\n\nProduce a useful, self-contained contribution for the next stage. Avoid copying without adding verifiable improvement.`;
  return [{ role: 'system', content: system }, { role: 'user', content: instruction }];
}

async function callOpenAICompatible(item, messages, maxTokens) {
  const endpoint = providerEndpoint(item.provider, item.model);
  if (!endpoint) return { ok: false, error: { type: 'provider_error', message: `Proveedor no compatible: ${item.provider}` } };
  const started = now();
  const headers = { Authorization: `Bearer ${item.key}`, 'Content-Type': 'application/json' };
  if (item.provider === 'openrouter') { headers['HTTP-Referer'] = process.env.SUPER_APP_URL || 'https://cut-real-ai.vercel.app'; headers['X-Title'] = 'CUT-REAL AI SUPER'; }
  const result = await fetchJson(endpoint, { method: 'POST', headers, body: JSON.stringify({ model: item.model, messages, temperature: 0.35, max_tokens: maxTokens }) });
  if (!result.response.ok) return { ok: false, error: summarizeError(result.response.status, result.body), latencyMs: now() - started };
  const message = result.body?.choices?.[0]?.message?.content;
  if (!message) return { ok: false, error: { type: 'provider_error', message: 'El proveedor no devolvió contenido.' }, latencyMs: now() - started };
  const usage = result.body?.usage || {};
  return { ok: true, text: String(message).slice(0, MAX_OUTPUT_CHARS), latencyMs: now() - started, tokens: Number(usage.total_tokens || 0), promptTokens: Number(usage.prompt_tokens || 0), completionTokens: Number(usage.completion_tokens || 0), rawModel: result.body?.model || item.model };
}

async function callGemini(item, messages, maxTokens) {
  const model = encodeURIComponent(item.model);
  const contents = messages.filter(message => message.role !== 'system').map(message => ({ role: message.role === 'assistant' ? 'model' : 'user', parts: [{ text: message.content }] }));
  const system = messages.filter(message => message.role === 'system').map(message => message.content).join('\n\n');
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const result = await fetchJson(endpoint, { method: 'POST', headers: { 'x-goog-api-key': item.key, 'Content-Type': 'application/json' }, body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents, generationConfig: { temperature: 0.35, maxOutputTokens: maxTokens } }) });
  if (!result.response.ok) return { ok: false, error: summarizeError(result.response.status, result.body) };
  const text = result.body?.candidates?.flatMap(candidate => candidate?.content?.parts || []).filter(part => typeof part?.text === 'string').map(part => part.text).join('\n');
  if (!text) return { ok: false, error: { type: 'provider_error', message: 'Gemini no devolvió contenido.' } };
  const usage = result.body?.usageMetadata || {};
  return { ok: true, text: String(text).slice(0, MAX_OUTPUT_CHARS), latencyMs: 0, tokens: Number(usage.totalTokenCount || 0), promptTokens: Number(usage.promptTokenCount || 0), completionTokens: Number(usage.candidatesTokenCount || 0), rawModel: item.model };
}

async function callProvider(item, messages, maxTokens) {
  if (item.provider === 'gemini') return callGemini(item, messages, maxTokens);
  return callOpenAICompatible(item, messages, maxTokens);
}

function findKey(keyId, provider, model) {
  const keys = configuredKeys().filter(item => item.enabled);
  const normalized = normalizeProvider(provider);
  const requestedModel = normalizeModel(normalized, model);
  return keys.find(item => keyId && item.id === keyId)
    || keys.find(item => provider && item.provider === normalized && (!requestedModel || item.model === requestedModel))
    || keys.find(item => provider && item.provider === normalized)
    || null;
}

async function testConnection({ provider, model, apiKey }) {
  const item = { provider: normalizeProvider(provider), model: clean(model, 160), key: String(apiKey || '') };
  if (!item.key || !item.model) return { ok: false, error: 'Proveedor, modelo y clave son obligatorios.' };
  const result = await callProvider(item, [{ role: 'system', content: 'Respondé únicamente con CONNECTION_OK.' }, { role: 'user', content: 'Test connection.' }], 24);
  return result.ok ? { ok: true, provider: item.provider, model: item.model, message: 'Connection successful' } : { ok: false, provider: item.provider, model: item.model, type: result.error?.type, error: result.error?.message };
}

function normalizeNodes(input) {
  if (!Array.isArray(input)) return [];
  return input.slice(0, MAX_NODES).map((node, index) => ({
    id: clean(node?.id || `ai-${index + 1}`, 80), role: clean(node?.role || `AI ${index + 1}`, 100), provider: normalizeProvider(node?.provider), model: normalizeModel(node?.provider, node?.model), keyId: clean(node?.keyId, 80), enabled: node?.enabled !== false,
  })).filter(node => node.enabled);
}

function jaccard(a, b) {
  const words = text => new Set(String(text || '').toLowerCase().normalize('NFKD').replace(/[^a-záéíóúüñ0-9 ]/gi, ' ').split(/\s+/).filter(word => word.length > 3));
  const left = words(a), right = words(b); if (!left.size || !right.size) return 0;
  let same = 0; left.forEach(word => { if (right.has(word)) same += 1; });
  return same / (left.size + right.size - same);
}

function analyzeAgreement(outputs) {
  const valid = outputs.filter(item => item?.text);
  if (valid.length < 2) return { label: 'Qualitative consensus', score: null, disagreements: [] };
  const pairs = [];
  for (let i = 0; i < valid.length; i += 1) for (let j = i + 1; j < valid.length; j += 1) pairs.push({ a: valid[i].nodeId, b: valid[j].nodeId, similarity: jaccard(valid[i].text, valid[j].text) });
  const score = Math.round((pairs.reduce((sum, pair) => sum + pair.similarity, 0) / Math.max(1, pairs.length)) * 100);
  const disagreements = pairs.filter(pair => pair.similarity < 0.12).map(pair => ({ ...pair, label: 'Material difference detected from low lexical overlap; review content.' }));
  return { label: `Consensus aproximado por coincidencia textual (${score}%)`, score, disagreements };
}

function compressContext(text) {
  const value = String(text || '');
  if (value.length <= MAX_CONTEXT_CHARS) return value;
  return `${value.slice(0, Math.floor(MAX_CONTEXT_CHARS * 0.72))}\n\n[CONTEXT COMPRESSED: intermediate material truncated to stay within the configured limit]\n\n${value.slice(-Math.floor(MAX_CONTEXT_CHARS * 0.2))}`;
}

async function runNode(node, question, previous, round, shared, settings, emit, fallbackNode, isFinal = false) {
  const item = findKey(node.keyId, node.provider, node.model);
  const activeNode = item ? { ...node, provider: item.provider, model: item.model, keyId: item.id } : node;
  const start = now();
  emit({ type: 'AI_STARTED', nodeId: node.id, status: 'processing', at: start });
  if (!item) {
    const error = { type: 'configuration', message: `No hay una SUPER API key habilitada para ${node.provider}/${node.model || 'modelo indicado'}. Revisá SUPER_AI_KEYS_JSON y el SUPER key ID ${node.keyId || '(vacío)'}.` };
    emit({ type: 'AI_ERROR', nodeId: node.id, status: 'error', error: error.message, errorType: error.type, at: now() });
    return { nodeId: node.id, role: node.role, provider: node.provider, model: node.model, status: 'error', error, latencyMs: now() - start, retries: 0 };
  }
  const maxTokens = Math.min(3000, Math.max(128, Number(settings.maxTokens) || 900));
  let attempt = 0; let result = null;
  const maxRetries = Math.min(3, Math.max(0, Number(settings.maxRetries) || 1));
  while (attempt <= maxRetries) {
    result = await callProvider(item, buildMessages(activeNode.role, question, previous, round, activeNode, shared, isFinal), maxTokens);
    if (result.ok) break;
    const retryable = ['rate_limit', 'timeout', 'provider_unavailable', 'network'].includes(result.error?.type);
    if (!retryable || attempt >= maxRetries) break;
    attempt += 1;
    emit({ type: 'AI_RETRY', nodeId: node.id, status: 'retrying', attempt, error: result.error?.message, at: now() });
    await new Promise(resolve => setTimeout(resolve, Math.min(4000, 650 * attempt)));
  }
  if ((!result || !result.ok) && fallbackNode) {
    emit({ type: 'AI_FALLBACK', nodeId: node.id, status: 'retrying', fallback: fallbackNode.id, at: now() });
    const fallbackItem = findKey(fallbackNode.keyId, fallbackNode.provider, fallbackNode.model);
    if (fallbackItem) {
      result = await callProvider(fallbackItem, buildMessages(node.role, question, previous, round, { ...node, provider: fallbackNode.provider, model: fallbackNode.model }, shared, isFinal), maxTokens);
      if (result.ok) { node = { ...node, provider: fallbackNode.provider, model: fallbackNode.model }; }
    }
  }
  if (!result?.ok) {
    emit({ type: 'AI_ERROR', nodeId: node.id, status: 'error', error: result?.error?.message || 'provider error', errorType: result?.error?.type || 'provider_error', at: now() });
    return { nodeId: node.id, role: node.role, provider: item?.provider || node.provider, model: item?.model || node.model, status: 'error', error: result?.error || { type: 'provider_error', message: 'provider error' }, latencyMs: result?.latencyMs || now() - start, retries: attempt };
  }
  emit({ type: 'AI_COMPLETED', nodeId: node.id, status: 'completed', tokens: result.tokens || null, latencyMs: result.latencyMs || now() - start, at: now() });
  const estimatedCost = item.inputPrice == null || item.outputPrice == null ? null : (Number(result.promptTokens || 0) / 1000) * item.inputPrice + (Number(result.completionTokens || 0) / 1000) * item.outputPrice;
  return { nodeId: node.id, role: node.role, provider: item.provider, model: item.model, status: 'completed', text: result.text, tokens: result.tokens || null, promptTokens: result.promptTokens || null, completionTokens: result.completionTokens || null, estimatedCost, latencyMs: result.latencyMs || now() - start, retries: attempt };
}

async function collaborate(body) {
  const question = clean(body?.question, 6000);
  if (!question) throw Object.assign(new Error('La pregunta no puede estar vacía.'), { status: 400 });
  const nodes = normalizeNodes(body?.nodes);
  if (nodes.length < 2) throw Object.assign(new Error('CUT-REAL AI SUPER requiere al menos 2 modelos habilitados.'), { status: 400 });
  const mode = ['sequential', 'parallel', 'hybrid'].includes(body?.mode) ? body.mode : 'sequential';
  const rounds = Math.min(MAX_ROUNDS, Math.max(1, Number(body?.rounds) || 1));
  const maxBudget = body?.maxBudget == null || body.maxBudget === '' ? null : Math.max(0, Number(body.maxBudget));
  const events = []; const emit = event => events.push(event);
  const steps = []; let previous = ''; let synthesis = '';
  const startedAt = now();
  const fallbackNode = nodes.find(node => node.role.toLowerCase().includes('fallback')) || nodes.find(node => node.role.toLowerCase().includes('expert')) || null;
  const activeNodes = nodes.filter(node => !Array.isArray(body?.skipNodeIds) || !body.skipNodeIds.includes(node.id));
  for (let round = 1; round <= rounds; round += 1) {
    const results = [];
    const shared = mode === 'parallel' || mode === 'hybrid' ? '' : previous;
    const synthesisNode = activeNodes.length > 2 ? activeNodes.at(-1) : null;
    const contributors = synthesisNode ? activeNodes.slice(0, -1) : activeNodes;
    if (mode === 'parallel' || (mode === 'hybrid' && round === 1)) {
      const parallelResults = await Promise.all(contributors.map(node => runNode(node, question, previous, round, shared, body, emit, body?.fallbackEnabled ? fallbackNode : null)));
      results.push(...parallelResults);
      if (synthesisNode) {
        const synthesisContext = compressContext(parallelResults.filter(result => result.text).map(result => `[${result.role}]\\n${result.text}`).join('\\n\\n'));
        results.push(await runNode({ ...synthesisNode, role: synthesisNode.role || 'FINAL SYNTHESIZER' }, question, previous, round, synthesisContext, body, emit, body?.fallbackEnabled ? fallbackNode : null, true));
        emit({ type: 'AI_SYNTHESIS', nodeId: synthesisNode.id, status: 'completed', at: now() });
      }
    } else {
      for (const [index, node] of activeNodes.entries()) results.push(await runNode(node, question, previous, round, shared, body, emit, body?.fallbackEnabled ? fallbackNode : null, index === activeNodes.length - 1));
    }
    const valid = results.filter(result => result.status === 'completed' && result.text);
    steps.push({ round, mode, results });
    if (valid.length) previous = compressContext(valid.map(result => `[${result.role} · ${result.provider}/${result.model}]\\n${result.text}`).join('\\n\\n'));
    if (!valid.length) break;
    synthesis = valid[valid.length - 1].text;
    const spentTokens = steps.flatMap(step => step.results).reduce((sum, result) => sum + Number(result.tokens || 0), 0);
    const estimatedCost = steps.flatMap(step => step.results).reduce((sum, result) => sum + (Number.isFinite(result.estimatedCost) ? result.estimatedCost : 0), 0);
    if (Number.isFinite(maxBudget) && estimatedCost > maxBudget) { emit({ type: 'MAX_BUDGET_REACHED', status: 'paused', at: now(), estimatedCost, maxBudget }); break; }
    if (Number.isFinite(maxBudget) && maxBudget === 0) break;
    if (spentTokens > Number(body?.maxTokensTotal || 14000)) break;
  }
  const allResults = steps.flatMap(step => step.results);
  const agreement = analyzeAgreement(allResults);
  const finalResult = allResults.filter(result => result.status === 'completed' && result.text).slice(-1)[0];
  const failureDetails = allResults.filter(result => result.status === 'error').map(result => `${result.provider || 'proveedor'} / ${result.model || 'modelo'}: ${clean(result.error?.message || 'fallo sin detalle', 260)}`).slice(0, 6);
  const failureMessage = finalResult ? null : failureDetails.length ? `SUPER no pudo completar la sesión. ${failureDetails.join(' | ')}` : 'SUPER no pudo producir una respuesta final válida; revisá la configuración de los nodos.';
  const final = finalResult?.text || synthesis || failureMessage;
  const partialWarning = finalResult && failureDetails.length ? `Síntesis parcial: ${failureDetails.length} proveedor(es) fallaron antes de completar.` : null;
  emit({ type: finalResult ? 'PIPELINE_COMPLETED' : 'PIPELINE_FAILED', status: finalResult ? 'completed' : 'error', error: failureMessage || undefined, at: now(), final: Boolean(finalResult) });
  return {
    ok: Boolean(finalResult), error: failureMessage, failureDetails, mode, rounds, final, steps, events, consensus: agreement.label, consensusScore: agreement.score, disagreements: agreement.disagreements,
    metrics: { durationMs: now() - startedAt, totalTokens: allResults.reduce((sum, result) => sum + Number(result.tokens || 0), 0), estimatedCost: allResults.some(result => result.estimatedCost == null) ? null : allResults.reduce((sum, result) => sum + Number(result.estimatedCost || 0), 0), completed: allResults.filter(result => result.status === 'completed').length, failed: allResults.filter(result => result.status === 'error').length, skipped: nodes.length - activeNodes.length },
    warnings: ['La salida no incluye streaming simulado ni razonamiento privado.', maxBudget == null ? 'Cost unavailable: no hay precios configurados para todas las SUPER keys.' : 'El presupuesto se controla por configuración declarada; el coste real depende del proveedor.', partialWarning, failureMessage ? 'Revisá proveedor, modelo, SUPER key ID, cuota y permisos de las APIs.' : null].filter(Boolean),
  };
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const keys = configuredKeys();
    return json(res, 200, { ok: true, providers: keys.map(publicKeyInfo), isolated: true, provider: 'SUPER_CONFIGURED_PROVIDERS', message: keys.length ? 'SUPER providers available.' : 'No SUPER keys configured. Add SUPER_AI_KEYS_JSON or SUPER_AI_* environment variables.' });
  }
  if (req.method !== 'POST') return json(res, 405, { error: 'Método no permitido.' });
  const body = req.body || {};
  try {
    if (body.action === 'test-connection') return json(res, 200, await testConnection(body));
    if (body.action === 'collaborate') return json(res, 200, await collaborate(body));
    return json(res, 400, { error: 'Acción SUPER no reconocida.' });
  } catch (error) {
    return json(res, error.status || 500, { ok: false, error: clean(error.message || 'Error en CUT-REAL AI SUPER', 700), isolated: true });
  }
  
}
