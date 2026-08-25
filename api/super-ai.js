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

function parseLooseJson(text) {
  const value = String(text || '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try { return JSON.parse(value); } catch (_) {}
  const start = value.indexOf('{'); const end = value.lastIndexOf('}');
  if (start >= 0 && end > start) { try { return JSON.parse(value.slice(start, end + 1)); } catch (_) {} }
  return null;
}

function normalizeJudgeReport(raw, results, agreement) {
  const sourceById = new Map(results.map(result => [result.nodeId, result]));
  const score = value => Number.isFinite(Number(value)) ? Math.max(0, Math.min(100, Math.round(Number(value)))) : null;
  const list = value => Array.isArray(value) ? value.map(item => typeof item === 'string' ? clean(item, 360) : clean(item?.summary || item?.text || JSON.stringify(item), 360)).filter(Boolean).slice(0, 12) : [];
  const evaluations = Array.isArray(raw?.evaluations) ? raw.evaluations.map(item => {
    const result = sourceById.get(item?.nodeId) || results.find(entry => entry.role === item?.role);
    if (!result) return null;
    return { nodeId: result.nodeId, role: result.role, provider: result.provider, model: result.model, accuracy: score(item.accuracy), relevance: score(item.relevance), completeness: score(item.completeness), consistency: score(item.consistency), clarity: score(item.clarity), technicalQuality: score(item.technicalQuality), instructionFollowing: score(item.instructionFollowing), notes: clean(item.notes || item.assessment || 'Evaluación cualitativa generada por AI Judge.', 420) };
  }).filter(Boolean).slice(0, 12) : results.map(result => ({ nodeId: result.nodeId, role: result.role, provider: result.provider, model: result.model, accuracy: null, relevance: null, completeness: null, consistency: null, clarity: null, technicalQuality: null, instructionFollowing: null, notes: 'No se obtuvo una puntuación objetiva; requiere interpretación cualitativa.' }));
  const disagreements = Array.isArray(raw?.disagreements) ? raw.disagreements.map(item => ({ topic: clean(item?.topic || 'Unspecified topic', 140), nodes: Array.isArray(item?.nodes) ? item.nodes.filter(id => sourceById.has(id)).slice(0, 8) : [], summary: clean(item?.summary || item?.reason || item, 420), confidence: ['HIGH', 'MEDIUM', 'LOW'].includes(String(item?.confidence).toUpperCase()) ? String(item.confidence).toUpperCase() : 'LOW' })).filter(item => item.summary).slice(0, 10) : [];
  const lexicalDisagreements = agreement.disagreements.map(item => ({ topic: 'Possible disagreement', nodes: [item.a, item.b].filter(id => sourceById.has(id)), summary: 'Potential disagreement detected from low textual overlap; semantic verification is unavailable in this fallback.', confidence: 'LOW' }));
  const consensusClusters = Array.isArray(raw?.consensusClusters) ? raw.consensusClusters.map(item => ({ label: clean(item?.label || 'Shared conclusion', 140), nodes: Array.isArray(item?.nodes) ? item.nodes.filter(id => sourceById.has(id)).slice(0, 12) : [], support: clean(item?.support || item?.summary || 'AI-generated qualitative consensus.', 360) })).filter(item => item.nodes.length >= 2).slice(0, 8) : (agreement.score != null && agreement.score >= 45 && results.length >= 2 ? [{ label: 'Textual consensus cluster', nodes: results.map(result => result.nodeId), support: `Coincidencia textual aproximada del ${agreement.score}%; no equivale a una verificación factual.` }] : []);
  return {
    evaluationMethod: 'AI-generated qualitative evaluation', evaluations,
    bestContributions: Array.isArray(raw?.bestContributions) ? raw.bestContributions.filter(id => sourceById.has(id)).slice(0, 8) : [],
    problemsDetected: list(raw?.problemsDetected), recommendedInformation: list(raw?.recommendedInformation), unresolvedDisagreements: list(raw?.unresolvedDisagreements), disagreements: disagreements.length ? disagreements : lexicalDisagreements,
    consensusClusters, confidence: ['HIGH', 'MEDIUM', 'LOW'].includes(String(raw?.confidence).toUpperCase()) ? String(raw.confidence).toUpperCase() : (disagreements.length ? 'MEDIUM' : 'LOW'), sourceCount: results.length,
  };
}

function buildJudgeMessages(question, results, agreement) {
  const evidence = results.map(result => `[${result.nodeId}] ${result.role} · ${result.provider}/${result.model}\n${String(result.text || '').slice(0, MAX_CONTEXT_CHARS)}`).join('\n\n');
  return [
    { role: 'system', content: 'You are AI JUDGE inside CUT-REAL AI SUPER. Evaluate only the supplied model outputs. Do not reveal private chain-of-thought. Return ONLY valid JSON with keys evaluations, bestContributions, problemsDetected, recommendedInformation, unresolvedDisagreements, disagreements, consensusClusters, confidence. Scores are qualitative estimates, not objective measurements. If evidence is insufficient, use null and confidence LOW. Do not invent facts.' },
    { role: 'user', content: `ORIGINAL USER QUESTION:\n${String(question).slice(0, 5000)}\n\nMODEL CONTRIBUTIONS:\n${evidence}\n\nEXISTING TEXTUAL COMPARISON:\n${JSON.stringify(agreement)}\n\nEvaluate the supplied contributions and identify supported consensus or possible conflicts. Return JSON only.` },
  ];
}

async function runJudge(question, results, round, finalNode, settings, emit) {
  const nodeId = 'ai-judge'; const valid = results.filter(result => result.status === 'completed' && result.text && result.role !== 'AI JUDGE');
  emit({ type: 'JUDGE_STARTED', nodeId, status: 'processing', at: now(), round });
  if (!valid.length) {
    const report = normalizeJudgeReport(null, [], { score: null, disagreements: [] });
    emit({ type: 'JUDGE_SKIPPED', nodeId, status: 'skipped', at: now(), reason: 'No hay contribuciones válidas para evaluar.' });
    return { nodeId, role: 'AI JUDGE', provider: finalNode?.provider || 'configured provider', model: finalNode?.model || 'configured model', status: 'skipped', text: JSON.stringify(report), judge: report, tokens: 0, latencyMs: 0 };
  }
  const item = findKey(settings?.judgeKeyId || finalNode?.keyId, settings?.judgeProvider || finalNode?.provider, settings?.judgeModel || finalNode?.model);
  if (!item) {
    const error = { type: 'configuration_error', message: `No hay una SUPER API key habilitada para AI JUDGE (${finalNode?.provider || 'provider'} / ${finalNode?.model || 'model'}).` };
    emit({ type: 'JUDGE_ERROR', nodeId, status: 'error', error: error.message, errorType: error.type, at: now() });
    return { nodeId, role: 'AI JUDGE', provider: finalNode?.provider || 'configured provider', model: finalNode?.model || 'configured model', status: 'error', error, latencyMs: 0, retries: 0 };
  }
  emit({ type: 'JUDGE_ANALYZING', nodeId, status: 'processing', provider: item.provider, model: item.model, at: now() });
  const agreement = analyzeAgreement(valid); const maxTokens = Math.min(1800, Math.max(700, Number(settings?.maxTokens) || 900)); const maxRetries = Math.min(2, Math.max(0, Number(settings?.maxRetries) || 1)); const started = now(); let attempt = 0; let response = null;
  while (attempt <= maxRetries) {
    response = await callProvider(item, buildJudgeMessages(question, valid, agreement), maxTokens);
    if (response.ok) break;
    const retryable = ['rate_limit', 'timeout', 'provider_unavailable', 'network'].includes(response.error?.type);
    if (!retryable || attempt >= maxRetries) break;
    attempt += 1; emit({ type: 'JUDGE_RETRYING', nodeId, status: 'retrying', attempt, at: now() });
  }
  if (!response?.ok) {
    const error = response?.error || { type: 'provider_error', message: 'AI Judge no devolvió una evaluación.' };
    emit({ type: 'JUDGE_ERROR', nodeId, status: 'error', error: error.message, errorType: error.type, at: now() });
    return { nodeId, role: 'AI JUDGE', provider: item.provider, model: item.model, status: 'error', error, latencyMs: response?.latencyMs || now() - started, retries: attempt };
  }
  const report = normalizeJudgeReport(parseLooseJson(response.text), valid, agreement);
  emit({ type: 'JUDGE_COMPARING', nodeId, status: 'processing', at: now() });
  emit({ type: 'JUDGE_DETECTING_CONFLICTS', nodeId, status: 'processing', conflicts: report.disagreements.length, at: now() });
  emit({ type: 'JUDGE_EVALUATING', nodeId, status: 'processing', at: now() });
  emit({ type: 'JUDGE_COMPLETED', nodeId, status: 'completed', tokens: response.tokens || null, latencyMs: response.latencyMs || now() - started, at: now() });
  return { nodeId, role: 'AI JUDGE', provider: item.provider, model: item.model, status: 'completed', text: JSON.stringify(report, null, 2), judge: report, tokens: response.tokens || null, promptTokens: response.promptTokens || null, completionTokens: response.completionTokens || null, estimatedCost: item.inputPrice == null || item.outputPrice == null ? null : (Number(response.promptTokens || 0) / 1000) * item.inputPrice + (Number(response.completionTokens || 0) / 1000) * item.outputPrice, latencyMs: response.latencyMs || now() - started, retries: attempt };
}

const GRAPH_STOP_WORDS = new Set('about after again also aquí alli ante antes bajo been being between como con contra cuando de del desde donde durante el ella ellas ellos en entre era es esta este esto for fue han hasta hay her here him his how i if in into is it its la las le les lo los más me mi mis much my no nos not of on or para pero por que qué se sin so sobre son su sus than that the their them then there these they this to tú un una uno y you your'.split(/\s+/));
function graphTerms(text) { return String(text || '').match(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9][A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9_-]{3,}/g)?.map(term => term.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')).filter(term => !GRAPH_STOP_WORDS.has(term) && !/^\d+$/.test(term)) || []; }
function graphSlug(value) { return String(value || '').toLowerCase().replace(/[^a-z0-9áéíóúüñ]+/gi, '-').replace(/^-|-$/g, '').slice(0, 70) || 'concept'; }
function buildKnowledgeGraph(question, steps, judge, finalResult) {
  const modelResults = steps.flatMap(step => (step.results || []).map(result => ({ ...result, round: step.round }))).filter(result => result.status === 'completed' && result.text && result.role !== 'AI JUDGE');
  const nodes = [{ id: 'user-question', kind: 'question', label: 'USER QUESTION', description: clean(question, 500), sourceModels: [], relatedConcepts: [], conclusions: [], conflicts: [], supportingResponses: [clean(question, 360)], importance: 100, status: 'source' }];
  const edges = []; const sourceMap = new Map(); const conceptMap = new Map();
  for (const result of modelResults) {
    if (!sourceMap.has(result.nodeId)) { sourceMap.set(result.nodeId, { id: `source-${graphSlug(result.nodeId)}`, kind: 'source', label: result.role, description: `${result.provider} / ${result.model}`, sourceModels: [result.nodeId], relatedConcepts: [], conclusions: [], conflicts: [], supportingResponses: [], importance: 45, status: 'completed' }); }
    const source = sourceMap.get(result.nodeId); source.supportingResponses.push(clean(result.text, 360));
    const terms = [...new Set(graphTerms(result.text))].slice(0, 32);
    for (const term of terms) { const concept = conceptMap.get(term) || { id: `concept-${graphSlug(term)}`, kind: 'concept', label: term.toUpperCase(), description: `Concepto extraído de una contribución real del pipeline.`, sourceModels: new Set(), relatedConcepts: new Set(), conclusions: [], conflicts: [], supportingResponses: [], importance: 0, status: 'detected', count: 0, evidence: [] }; concept.count += 1; concept.importance += 4; concept.sourceModels.add(result.nodeId); concept.supportingResponses.push(clean(result.text, 220)); const at = String(result.text).toLowerCase().indexOf(term); concept.evidence.push({ nodeId: result.nodeId, round: result.round, excerpt: clean(at >= 0 ? String(result.text).slice(Math.max(0, at - 60), at + 180) : result.text, 240) }); conceptMap.set(term, concept); }
    const sourceTerms = terms;
    for (const term of sourceTerms) { const concept = conceptMap.get(term); edges.push({ id: `edge-${source.id}-${concept.id}-${result.round}`, source: source.id, target: concept.id, type: 'MENTIONS', evidence: `Mencionado por ${result.role} en la ronda ${result.round}.` }); edges.push({ id: `edge-question-${concept.id}`, source: 'user-question', target: concept.id, type: 'LEADS_TO', evidence: 'Concepto derivado del procesamiento de la pregunta.' }); }
    for (let index = 0; index < Math.min(sourceTerms.length, 10); index += 1) for (let next = index + 1; next < Math.min(sourceTerms.length, 10); next += 1) { const left = conceptMap.get(sourceTerms[index]); const right = conceptMap.get(sourceTerms[next]); left.relatedConcepts.add(right.id); right.relatedConcepts.add(left.id); edges.push({ id: `edge-related-${source.id}-${left.id}-${right.id}-${result.round}`, source: left.id, target: right.id, type: 'RELATED_TO', evidence: `Coaparecen en la contribución de ${result.role}.` }); }
  }
  sourceMap.forEach(source => nodes.push({ ...source }));
  const concepts = [...conceptMap.values()].sort((a, b) => b.count - a.count || b.importance - a.importance).slice(0, 28);
  concepts.forEach(concept => nodes.push({ ...concept, sourceModels: [...concept.sourceModels], relatedConcepts: [...concept.relatedConcepts], importance: Math.min(99, concept.importance), supportingResponses: concept.supportingResponses.slice(0, 4), evidence: concept.evidence.slice(0, 5) }));
  const finalText = finalResult?.text || ''; if (finalText) { const finalNode = { id: 'final-answer', kind: 'conclusion', label: 'FINAL ANSWER', description: clean(finalText, 500), sourceModels: [], relatedConcepts: [], conclusions: [clean(finalText, 500)], conflicts: [], supportingResponses: [clean(finalText, 360)], importance: 96, status: 'completed' }; nodes.push(finalNode); concepts.forEach(concept => { if (graphTerms(finalText).includes(concept.id.replace(/^concept-/, ''))) edges.push({ id: `edge-${concept.id}-final`, source: concept.id, target: finalNode.id, type: 'LEADS_TO', evidence: 'El concepto aparece en la respuesta final.' }); }); }
  if (judge) { const judgeNode = { id: 'ai-judge', kind: 'judge', label: '⚖️ AI JUDGE', description: `${judge.evaluationMethod || 'AI-generated qualitative evaluation'} · confidence ${judge.confidence || 'LOW'}`, sourceModels: (judge.evaluations || []).map(item => item.nodeId).filter(Boolean), relatedConcepts: [], conclusions: [], conflicts: (judge.disagreements || []).map(item => item.summary), supportingResponses: [], importance: 92, status: 'completed' }; nodes.push(judgeNode); sourceMap.forEach(source => edges.push({ id: `edge-${source.id}-ai-judge`, source: source.id, target: 'ai-judge', type: 'LEADS_TO', evidence: 'Contribución real enviada al AI Judge.' })); if (finalText) edges.push({ id: 'edge-ai-judge-final', source: 'ai-judge', target: 'final-answer', type: 'LEADS_TO', evidence: 'Evaluación cualitativa usada por el sintetizador final.' }); }
  (judge?.disagreements || []).forEach((item, index) => { const conflictId = `conflict-${index + 1}`; nodes.push({ id: conflictId, kind: 'conflict', label: `DISAGREEMENT ${index + 1}`, description: item.summary, sourceModels: item.nodes || [], relatedConcepts: [], conclusions: [], conflicts: [item.summary], supportingResponses: [], importance: 82, status: 'uncertain' }); (item.nodes || []).forEach(sourceId => { const source = sourceMap.get(sourceId); if (source) edges.push({ id: `edge-${source.id}-${conflictId}`, source: source.id, target: conflictId, type: 'CONTRADICTS', evidence: item.summary }); }); });
  (judge?.consensusClusters || []).forEach((cluster, index) => { const consensusId = `consensus-${index + 1}`; nodes.push({ id: consensusId, kind: 'consensus', label: cluster.label, description: cluster.support, sourceModels: cluster.nodes || [], relatedConcepts: [], conclusions: [cluster.support], conflicts: [], supportingResponses: [], importance: 76, status: 'supported' }); (cluster.nodes || []).forEach(sourceId => { const source = sourceMap.get(sourceId); if (source) edges.push({ id: `edge-${source.id}-${consensusId}`, source: source.id, target: consensusId, type: 'SUPPORTS', evidence: cluster.support }); }); if (finalText) edges.push({ id: `edge-${consensusId}-final`, source: consensusId, target: 'final-answer', type: 'LEADS_TO', evidence: 'Consenso usado como contexto de síntesis.' }); });
  const uniqueEdges = [...new Map(edges.map(edge => [edge.id, edge])).values()]; return { version: 1, generatedFrom: { rounds: steps.length, contributions: modelResults.length, judge: Boolean(judge) }, nodes, edges: uniqueEdges, stats: { nodes: nodes.length, edges: uniqueEdges.length, concepts: nodes.filter(node => node.kind === 'concept').length, conflicts: nodes.filter(node => node.kind === 'conflict').length, consensus: nodes.filter(node => node.kind === 'consensus').length } };
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
  let allResults = steps.flatMap(step => step.results);
  const modelResults = allResults.filter(result => result.status === 'completed' && result.text && result.role !== 'AI JUDGE');
  const agreement = analyzeAgreement(modelResults);
  let finalResult = modelResults.slice(-1)[0];
  const finalNode = activeNodes.at(-1) || nodes.at(-1);
  let judgeResult = null;
  if (modelResults.length) {
    judgeResult = await runJudge(question, modelResults, rounds, finalNode, body, emit);
    steps.push({ round: 'JUDGE', mode: 'judge', results: [judgeResult] });
  }
  const judgeReport = judgeResult?.judge || normalizeJudgeReport(null, modelResults, agreement);
  if (judgeResult?.status === 'completed' && finalNode && modelResults.length) {
    const judgeContext = compressContext(`AI JUDGE REPORT:\n${JSON.stringify(judgeReport, null, 2)}\n\nMODEL CONTRIBUTIONS:\n${modelResults.map(result => `[${result.role}]\\n${result.text}`).join('\\n\\n')}`);
    const finalResponse = await runNode({ ...finalNode, role: 'FINAL SYNTHESIZER' }, question, previous, rounds, judgeContext, body, emit, body?.fallbackEnabled ? fallbackNode : null, true);
    steps.push({ round: 'FINAL', mode: 'synthesis', results: [finalResponse] });
    if (finalResponse.status === 'completed' && finalResponse.text) finalResult = finalResponse;
    emit({ type: 'AI_SYNTHESIS', nodeId: finalNode.id, status: finalResponse.status === 'completed' ? 'completed' : 'error', at: now() });
  }
  allResults = steps.flatMap(step => step.results);
  const failureDetails = allResults.filter(result => result.status === 'error').map(result => `${result.provider || 'proveedor'} / ${result.model || 'modelo'}: ${clean(result.error?.message || 'fallo sin detalle', 260)}`).slice(0, 6);
  const failureMessage = finalResult ? null : failureDetails.length ? `SUPER no pudo completar la sesión. ${failureDetails.join(' | ')}` : 'SUPER no pudo producir una respuesta final válida; revisá la configuración de los nodos.';
  const final = finalResult?.text || synthesis || failureMessage;
  const partialWarning = finalResult && failureDetails.length ? `Síntesis parcial: ${failureDetails.length} proveedor(es) fallaron antes de completar.` : null;
  const knowledgeGraph = buildKnowledgeGraph(question, steps, judgeReport, finalResult);
  emit({ type: finalResult ? 'PIPELINE_COMPLETED' : 'PIPELINE_FAILED', status: finalResult ? 'completed' : 'error', error: failureMessage || undefined, at: now(), final: Boolean(finalResult) });
  return {
    ok: Boolean(finalResult), error: failureMessage, failureDetails, mode, rounds, final, steps, events, judge: judgeReport, knowledgeGraph, consensus: agreement.label, consensusScore: agreement.score, disagreements: [...agreement.disagreements, ...(judgeReport.disagreements || [])],
    metrics: { durationMs: now() - startedAt, totalTokens: allResults.reduce((sum, result) => sum + Number(result.tokens || 0), 0), estimatedCost: allResults.some(result => result.estimatedCost == null) ? null : allResults.reduce((sum, result) => sum + Number(result.estimatedCost || 0), 0), completed: allResults.filter(result => result.status === 'completed').length, failed: allResults.filter(result => result.status === 'error').length, skipped: nodes.length - activeNodes.length },
    warnings: ['La salida no incluye streaming simulado ni razonamiento privado.', 'AI Judge entrega una evaluación cualitativa; no representa una precisión matemática objetiva.', maxBudget == null ? 'Cost unavailable: no hay precios configurados para todas las SUPER keys.' : 'El presupuesto se controla por configuración declarada; el coste real depende del proveedor.', partialWarning, failureMessage ? 'Revisá proveedor, modelo, SUPER key ID, cuota y permisos de las APIs.' : null].filter(Boolean),
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
