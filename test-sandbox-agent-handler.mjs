import assert from 'node:assert/strict';

process.env.OPENROUTER_API_KEY = 'test-key';
process.env.WORKSPACE_MODEL_NAME = 'qwen/qwen3-coder';
process.env.WORKSPACE_MODEL_FALLBACK = 'qwen/qwen3-coder-next';

const calls = [];
globalThis.fetch = async (url, options = {}) => {
  calls.push({ url, options });
  if (String(url).includes('firestore.googleapis.com')) {
    return { ok: false, status: 404, json: async () => ({}) };
  }
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => ({
      id: 'test-generation',
      model: 'qwen/qwen3-coder',
      choices: [{ message: { content: 'respuesta de prueba', tool_calls: [] } }],
      usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
    }),
  };
};

const { default: handler } = await import('./api/sandbox-agent.js?handler-test=1');

const response = {
  statusCode: 200,
  payload: null,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.payload = body; return body; },
};

await handler({
  method: 'POST',
  body: {
    messages: [{ role: 'user', content: 'Creá un gato 3D' }],
    scene: null,
    memoryKeys: null,
    lastActions: null,
    userText: 'Creá un gato 3D',
    sandboxId: 'handler-test',
  },
}, response);

assert.equal(response.statusCode, 200);
assert.equal(response.payload.assistantText, 'respuesta de prueba');
const openRouterCall = calls.find(c => String(c.url).includes('openrouter.ai'));
assert.ok(openRouterCall, 'debe existir una llamada simulada a OpenRouter');
const requestBody = JSON.parse(openRouterCall.options.body);
assert.deepEqual(requestBody.tool_choice, {
  type: 'function',
  function: { name: 'create_lowpoly_object' },
});
assert.equal(response.payload.forcedTool, 'create_lowpoly_object');
assert.equal(calls.filter(c => String(c.url).includes('openrouter.ai')).length, 1);
console.log('OK: el handler tolera payload parcial y responde correctamente con OpenRouter simulado.');
