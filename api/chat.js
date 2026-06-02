// ============================================================
//  api/chat.js  —  Cut-real AI  |  v2.2.0
//  - Rotación de 5 API Keys
//  - Rate limiting real por usuario (lee config de Firestore)
//  - System prompt dinámico (lee de Firestore)
//  - Feature flags (lee de Firestore)
// ============================================================

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore }                 from "firebase-admin/firestore";

// ── FIREBASE ADMIN (para leer config en tiempo real) ────────
function getDb() {
    if (!getApps().length) {
        // Podés configurar credenciales via variable de entorno FIREBASE_SERVICE_ACCOUNT
        // Si no está configurado, omite la lectura de Firestore y usa defaults.
        try {
            const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT
                ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
                : null;
            if (serviceAccount) {
                initializeApp({ credential: cert(serviceAccount) });
            } else {
                initializeApp({ projectId: "cutreal-ai" });
            }
        } catch(e) {
            console.warn("Firebase Admin init warning:", e.message);
        }
    }
    try { return getFirestore(); } catch(e) { return null; }
}

// ── CONFIGURACIÓN DE API KEYS ────────────────────────────────
const TOKEN_LIMIT_PER_KEY = 10_000;
const TOTAL_KEYS          = 5;

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
// Estructura: { uid: { min: [], hour: [], day: [] } }
if (!global._rateLimitStore) global._rateLimitStore = {};
const rateLimitStore = global._rateLimitStore;

function checkRateLimit(uid, limits) {
    const now   = Date.now();
    const store = rateLimitStore[uid] || (rateLimitStore[uid] = { min: [], hour: [], day: [] });

    // Limpiar timestamps viejos
    store.min  = store.min.filter(t  => now - t < 60_000);
    store.hour = store.hour.filter(t => now - t < 3_600_000);
    store.day  = store.day.filter(t  => now - t < 86_400_000);

    if (store.min.length  >= limits.perMin)  return { blocked: true, reason: "minute",  current: store.min.length,  limit: limits.perMin  };
    if (store.hour.length >= limits.perHour) return { blocked: true, reason: "hour",    current: store.hour.length, limit: limits.perHour };
    if (store.day.length  >= limits.perDay)  return { blocked: true, reason: "day",     current: store.day.length,  limit: limits.perDay  };

    // Registrar esta request
    store.min.push(now);
    store.hour.push(now);
    store.day.push(now);

    return { blocked: false };
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
        const s = keyStore[i];
        if (!s.blocked && s.used < TOKEN_LIMIT_PER_KEY) return i;
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

// ── LEER CONFIG DE FIRESTORE ─────────────────────────────────
// Cache en memoria para no hacer demasiadas lecturas
if (!global._configCache) global._configCache = { ts: 0, data: {} };

async function getConfig() {
    const now  = Date.now();
    const cache = global._configCache;

    // Refrescar cada 30 segundos
    if (now - cache.ts < 30_000 && cache.ts > 0) return cache.data;

    try {
        const db = getDb();
        if (!db) return cache.data;

        const [promptSnap, rateLimitSnap, flagsSnap] = await Promise.all([
            db.collection("config").doc("system_prompt").get().catch(() => null),
            db.collection("config").doc("rate_limits").get().catch(() => null),
            db.collection("config").doc("feature_flags").get().catch(() => null),
        ]);

        cache.data = {
            systemPrompt: promptSnap?.exists ? (promptSnap.data()?.prompt || null)      : null,
            rateLimits:   rateLimitSnap?.exists ? rateLimitSnap.data()                  : null,
            featureFlags: flagsSnap?.exists ? flagsSnap.data()                          : null,
        };
        cache.ts = now;
    } catch(e) {
        console.warn("Config read error:", e.message);
    }
    return cache.data;
}

// ── HANDLER PRINCIPAL ────────────────────────────────────────
export default async function handler(req, res) {
    if (req.method !== "POST")
        return res.status(405).json({ error: "Método no permitido" });

    const { mensajes, hasImage, model: modelPref, userId } = req.body;

    if (!mensajes || !Array.isArray(mensajes))
        return res.status(400).json({ error: "El campo 'mensajes' es inválido." });

    // ── LEER CONFIG DINÁMICA ─────────────────────────────────
    const config = await getConfig();

    // ── RATE LIMITING ────────────────────────────────────────
    const defaultLimits = { perMin: 5, perHour: 100, perDay: 500, maxTokens: 2048 };
    const limits = config.rateLimits
        ? {
            perMin:    config.rateLimits.perMin    || defaultLimits.perMin,
            perHour:   config.rateLimits.perHour   || defaultLimits.perHour,
            perDay:    config.rateLimits.perDay    || defaultLimits.perDay,
            maxTokens: config.rateLimits.maxTokens || defaultLimits.maxTokens,
          }
        : defaultLimits;

    if (userId) {
        const rl = checkRateLimit(userId, limits);
        if (rl.blocked) {
            const messages = {
                minute: `⏱️ Límite por minuto alcanzado (${rl.limit} mensajes/min). Esperá un momento.`,
                hour:   `⏳ Límite por hora alcanzado (${rl.limit} mensajes/hora). Podés enviar ${limits.perDay - rateLimitStore[userId]?.day?.length ?? 0} mensajes más hoy.`,
                day:    `📵 Límite diario alcanzado (${rl.limit} mensajes/día). Volvé mañana.`,
            };
            return res.status(429).json({
                error: messages[rl.reason] || "Límite de mensajes alcanzado.",
                rateLimitInfo: {
                    reason:   rl.reason,
                    perMin:   limits.perMin,
                    perHour:  limits.perHour,
                    perDay:   limits.perDay,
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

    // ── SYSTEM PROMPT (dinámico desde Firestore si existe) ───
    const defaultSystemContent = `Eres Cut-real AI, una Inteligencia Artificial desarrollada por Bautista utilizando servicios y proveedores gratuitos. Eres impulsada por el modelo ${modelName} a través de los servicios de Groq.

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

DATOS ESPECIALES (solo respondé si te preguntan directamente sobre estos temas):
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

    // Si hay un prompt personalizado en Firestore, usarlo y agregar el modelo actual
    const systemContent = config.systemPrompt
        ? config.systemPrompt.replace(/\$\{modelName\}/g, modelName) + `\n\n[Modelo activo: ${modelName}]`
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

                // Incluir info de rate limit en la respuesta
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

    return res.status(500).json({ error: lastError?.message || "Error interno del servidor." });
}
