cat > /mnt/user-data/outputs/chat.js << 'CHATEOF'
// ============================================================
//  api/chat.js  —  Cut-real AI  |  v2.3.0
//  SIN firebase-admin (no disponible en Vercel serverless)
//  Lee system_prompt y rate_limits desde Firestore via REST
//  Rota entre 5 API Keys, aplica rate limiting en memoria
// ============================================================

const TOKEN_LIMIT_PER_KEY = 10_000;
const TOTAL_KEYS          = 5;

// ── SHARED KEY STORE (persiste en la misma instancia Vercel) ─
if (!global._keyStore) {
    global._keyStore = Array.from({ length: TOTAL_KEYS }, (_, i) => ({
        index:     i,
        used:      0,
        blocked:   false,
        lastReset: Date.now(),
        calls:     0,
    }));
}
const keyStore = global._keyStore;

// ── RATE LIMITING EN MEMORIA ─────────────────────────────────
if (!global._rateLimitStore) global._rateLimitStore = {};
const rateLimitStore = global._rateLimitStore;

function checkRateLimit(uid, limits) {
    const now   = Date.now();
    if (!rateLimitStore[uid]) rateLimitStore[uid] = { min: [], hour: [], day: [] };
    const store = rateLimitStore[uid];

    store.min  = store.min.filter(t  => now - t < 60_000);
    store.hour = store.hour.filter(t => now - t < 3_600_000);
    store.day  = store.day.filter(t  => now - t < 86_400_000);

    if (store.min.length  >= limits.perMin)  return { blocked: true, reason: "minute",  used: store.min.length,  limit: limits.perMin };
    if (store.hour.length >= limits.perHour) return { blocked: true, reason: "hour",    used: store.hour.length, limit: limits.perHour };
    if (store.day.length  >= limits.perDay)  return { blocked: true, reason: "day",     used: store.day.length,  limit: limits.perDay };

    store.min.push(now);
    store.hour.push(now);
    store.day.push(now);
    return { blocked: false };
}

// ── CACHE DE CONFIGURACIÓN (sin firebase-admin) ──────────────
// Leemos desde Firestore REST API pública (no necesita admin SDK)
if (!global._configCache) global._configCache = { ts: 0, data: {} };

async function getConfig() {
    const now   = Date.now();
    const cache = global._configCache;
    if (now - cache.ts < 30_000 && cache.ts > 0) return cache.data;

    const PROJECT_ID = "cutreal-ai";
    const baseUrl    = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/config`;

    try {
        const [promptRes, rateLimitRes, flagsRes] = await Promise.all([
            fetch(`${baseUrl}/system_prompt`).catch(() => null),
            fetch(`${baseUrl}/rate_limits`).catch(()   => null),
            fetch(`${baseUrl}/feature_flags`).catch(() => null),
        ]);

        const parseDoc = async (res) => {
            if (!res || !res.ok) return null;
            const json = await res.json().catch(() => null);
            if (!json || !json.fields) return null;
            // Convertir formato Firestore REST a objeto plano
            const obj = {};
            for (const [key, val] of Object.entries(json.fields)) {
                if      (val.stringValue  !== undefined) obj[key] = val.stringValue;
                else if (val.integerValue !== undefined) obj[key] = parseInt(val.integerValue, 10);
                else if (val.doubleValue  !== undefined) obj[key] = val.doubleValue;
                else if (val.booleanValue !== undefined) obj[key] = val.booleanValue;
            }
            return obj;
        };

        const [promptData, rateLimitData, flagsData] = await Promise.all([
            parseDoc(promptRes),
            parseDoc(rateLimitRes),
            parseDoc(flagsRes),
        ]);

        cache.data = {
            systemPrompt: promptData?.prompt  || null,
            rateLimits:   rateLimitData       || null,
            featureFlags: flagsData           || null,
        };
        cache.ts = now;
    } catch(e) {
        console.warn("Config fetch error:", e.message);
    }
    return cache.data;
}

// ── HELPERS ──────────────────────────────────────────────────
function getApiKey(index) {
    if (index === 0) return process.env.GROQ_API_KEY || process.env.GROQ_API_KEY_1 || null;
    return process.env[`GROQ_API_KEY_${index + 1}`] || null;
}

function getAvailableKeyIndex() {
    for (let i = 0; i < TOTAL_KEYS; i++) {
        const key = getApiKey(i);
        if (!key) continue;
        if (!keyStore[i].blocked && keyStore[i].used < TOKEN_LIMIT_PER_KEY) return i;
    }
    let best = -1, bestUsed = Infinity;
    for (let i = 0; i < TOTAL_KEYS; i++) {
        if (!getApiKey(i)) continue;
        if (keyStore[i].used < bestUsed) { bestUsed = keyStore[i].used; best = i; }
    }
    return best;
}

function resetBlockedKeys() {
    const now = Date.now();
    keyStore.forEach(k => {
        if (k.blocked && (now - k.lastReset) > 60_000) k.blocked = false;
    });
}

// ── HANDLER PRINCIPAL ────────────────────────────────────────
export default async function handler(req, res) {
    // CORS
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Content-Type", "application/json");

    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method !== "POST")    return res.status(405).json({ error: "Método no permitido" });

    let body = req.body;
    // Si body es string (raw), parsearlo
    if (typeof body === "string") {
        try { body = JSON.parse(body); } catch(e) { return res.status(400).json({ error: "JSON inválido" }); }
    }

    const { mensajes, hasImage, model: modelPref, userId } = body || {};

    if (!mensajes || !Array.isArray(mensajes))
        return res.status(400).json({ error: "El campo 'mensajes' es inválido." });

    // ── LEER CONFIG ──────────────────────────────────────────
    const config = await getConfig();

    // ── RATE LIMITING ────────────────────────────────────────
    const defaultLimits = { perMin: 10, perHour: 200, perDay: 1000, maxTokens: 2048 };
    const limits = config.rateLimits ? {
        perMin:    Number(config.rateLimits.perMin)    || defaultLimits.perMin,
        perHour:   Number(config.rateLimits.perHour)   || defaultLimits.perHour,
        perDay:    Number(config.rateLimits.perDay)    || defaultLimits.perDay,
        maxTokens: Number(config.rateLimits.maxTokens) || defaultLimits.maxTokens,
    } : defaultLimits;

    if (userId) {
        const rl = checkRateLimit(userId, limits);
        if (rl.blocked) {
            const msgs = {
                minute: `⏱️ Límite por minuto alcanzado (${rl.limit} msgs/min). Esperá unos segundos.`,
                hour:   `⏳ Límite por hora alcanzado (${rl.limit} msgs/hora). Volvé más tarde.`,
                day:    `📵 Límite diario alcanzado (${rl.limit} msgs/día). Volvé mañana.`,
            };
            return res.status(429).json({
                error: msgs[rl.reason] || "Límite de mensajes alcanzado.",
                rateLimitInfo: {
                    reason:    rl.reason,
                    perMin:    limits.perMin,
                    perHour:   limits.perHour,
                    perDay:    limits.perDay,
                    maxTokens: limits.maxTokens,
                },
            });
        }
    }

    // ── SELECCIÓN DE MODELO ──────────────────────────────────
    let model;
    if (hasImage)                   model = "meta-llama/llama-4-scout-17b-16e-instruct";
    else if (modelPref === "basic") model = "llama-3.1-8b-instant";
    else                            model = "llama-3.3-70b-versatile";

    const modelName = hasImage
        ? "Llama 4 Scout 17B (visión)"
        : modelPref === "basic" ? "Llama 3.1 8B Instant" : "Llama 3.3 70B Versatile";

    // ── SYSTEM PROMPT ────────────────────────────────────────
    const defaultSystemContent = buildDefaultPrompt(modelName);

    // Usar prompt personalizado si existe, reemplazando ${modelName}
    const systemContent = config.systemPrompt
        ? config.systemPrompt.replace(/\$\{modelName\}/g, modelName)
        : defaultSystemContent;

    if (mensajes.length > 0 && mensajes[0].role === "system")
        mensajes[0].content = systemContent;
    else
        mensajes.unshift({ role: "system", content: systemContent });

    const temperature = modelPref === "basic" ? 0.5 : 0.65;
    const max_tokens  = hasImage ? 1024 : Math.min(limits.maxTokens, 4096);

    // ── ROTACIÓN DE KEYS ─────────────────────────────────────
    resetBlockedKeys();
    let lastError = null;

    for (let attempt = 0; attempt < TOTAL_KEYS; attempt++) {
        const keyIndex = getAvailableKeyIndex();
        if (keyIndex === -1) break;

        const apiKey = getApiKey(keyIndex);
        if (!apiKey) break;

        try {
            const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method:  "POST",
                headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
                body:    JSON.stringify({ model, messages: mensajes, temperature, max_tokens }),
            });

            const data = await response.json();

            if (response.ok) {
                const tokensUsed = data.usage?.total_tokens || 0;
                keyStore[keyIndex].used  += tokensUsed;
                keyStore[keyIndex].calls += 1;

                data._keyInfo = {
                    keyIndex,
                    keyLabel:   `Key ${keyIndex + 1}`,
                    tokensUsed: keyStore[keyIndex].used,
                    tokenLimit: TOKEN_LIMIT_PER_KEY,
                    remaining:  Math.max(0, TOKEN_LIMIT_PER_KEY - keyStore[keyIndex].used),
                    calls:      keyStore[keyIndex].calls,
                };

                if (userId && rateLimitStore[userId]) {
                    const store = rateLimitStore[userId];
                    data._rateLimitInfo = {
                        usedToday:  store.day.length,
                        usedHour:   store.hour.length,
                        usedMinute: store.min.length,
                        limits,
                    };
                }

                return res.status(200).json(data);
            }

            if (response.status === 429) {
                keyStore[keyIndex].blocked   = true;
                keyStore[keyIndex].lastReset = Date.now();
                lastError = "rate_limit";
                continue;
            }

            const errorMsg = data.error?.message || "Error desconocido en Groq";
            if (response.status === 404 || errorMsg.includes("model"))
                return res.status(500).json({ error: "Modelo no disponible. Intentá sin adjuntos." });

            return res.status(response.status).json({ error: errorMsg });

        } catch (fetchError) {
            lastError = fetchError;
            continue;
        }
    }

    if (lastError === "rate_limit") {
        return res.status(429).json({
            error: "⚠️ Todas las API Keys alcanzaron su límite. Esperá unos minutos.",
        });
    }

    return res.status(500).json({
        error: (lastError instanceof Error ? lastError.message : String(lastError)) || "Error interno del servidor.",
    });
}

function buildDefaultPrompt(modelName) {
    return `Eres Cut-real AI, una Inteligencia Artificial desarrollada por Bautista utilizando servicios y proveedores gratuitos. Eres impulsada por el modelo ${modelName} a través de los servicios de Groq.

IDENTIDAD:
- Tu nombre es Cut-real AI.
- Fuiste desarrollada por B-LCR utilizando servicios gratuitos de Groq.
- Tu modelo actual es: ${modelName}.
- Eres profesional, respetuosa y directa.
- Podés analizar documentos (PDF, Word) e imágenes cuando te los comparten.

COMPORTAMIENTO:
- Respondé de manera completa, directa y sin dar vueltas.
- Si el usuario te envía un documento adjunto, analízalo y respondé basándote en su contenido.
- Si el usuario te envía una imagen, describila detalladamente e interpretá su contenido.
- Podés incluir links y URLs si son relevantes o si el usuario lo pide.
- Tenés capacidad crítica: podés cuestionar argumentos con base y evidencia.
- Si no sabés algo con certeza, indicalo claramente en lugar de inventar información.
- Hablá en español rioplatense (vos, usás, etc.) cuando el usuario hable en español argentino.

DATOS ESPECIALES (solo respondé si te preguntan directamente):
- "Chocolate negro o blanco": respondé "De leche."
- "Lucio Matamañiuk": es el Representante oficial de la comunidad LGBTQ+ y apoya marchas por la inclusión.
- "Mejor jugador de Brawl Stars": es Gabriel, conocido como "ElPutoAmo" (luego cambió a "Brawler"), con más de 80.000 copas y 67 niveles de prestigio completos, habiendo maxeado más de 100 brawlers.
- "Lourdes Pedaci": es profesora de Teleinformática, tiene 26 años, es fan de Jujutsu Kaisen y tiene 4 gatos.
- "Diego Sniper": respondé "Invitame maritooo. Ayiyi ayiyiyiyi ayiyiyiyi".
- "Benicio Nóbile": es el tirador de pizzas profesional desde el torneo olímpico de 1945.
- "Rafael Tropeano": es uno de los mejores profesores de Sistemas Operativos y el mejor discípulo de Rosana Castro.
- "Marcelo De Donato": es el profesor de Sistemas Operativos de 5to año en informática.

FORMATO DE RESPUESTA:
- Usá **negritas** para conceptos clave.
- Usá listas con guiones (-) para enumerar.
- Separar siempre los párrafos con saltos de línea dobles.
- Usá numeración (1. 2. 3.) para pasos o instrucciones.
- Usá encabezados (## Título) para respuestas largas y estructuradas.
- Usá bloques de código (\`\`\`lenguaje\\n...\\n\`\`\`) para código o comandos.
- Tono: profesional pero accesible, sin ser excesivamente formal.

© 2026 Cut-real AI. Todos los derechos reservados.`;
}
CHATEOF
echo "chat.js written: $(wc -l < /mnt/user-data/outputs/chat.js) lines"
