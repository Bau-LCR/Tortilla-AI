// ============================================================
//  api/groq-client.js — Cut-real AI
//  Módulo CENTRALIZADO de rotación de API Keys de Groq.
//
//  Detecta automáticamente CUALQUIER cantidad de variables de
//  entorno que sigan el patrón:
//      GROQ_API_KEY
//      GROQ_API_KEY_2
//      GROQ_API_KEY_3
//      ...
//      GROQ_API_KEY_N
//
//  No hace falta tocar código para agregar una key nueva: alcanza
//  con crear GROQ_API_KEY_6 (o la que siga) en Vercel y redesplegar.
//
//  Usado por: api/chat.js y api/sandbox-agent.js
// ============================================================

const TOKEN_LIMIT_PER_KEY = parseInt(process.env.GROQ_TOKEN_LIMIT_PER_KEY || "10000", 10);
const BLOCK_COOLDOWN_MS   = parseInt(process.env.GROQ_BLOCK_COOLDOWN_MS   || "60000", 10);

// ── DESCUBRIMIENTO DINÁMICO DE KEYS ─────────────────────────
function discoverKeys() {
    const keys = [];
    if (process.env.GROQ_API_KEY) {
        keys.push({ envName: "GROQ_API_KEY", value: process.env.GROQ_API_KEY });
    }
    let i = 2;
    // Sigue buscando GROQ_API_KEY_2, _3, _4... hasta que falte una.
    // (si borrás una key del medio, las siguientes no se detectan —
    // es preferible dejar las variables en Vercel sin huecos)
    while (process.env[`GROQ_API_KEY_${i}`]) {
        keys.push({ envName: `GROQ_API_KEY_${i}`, value: process.env[`GROQ_API_KEY_${i}`] });
        i++;
    }
    return keys;
}

// ── STORE EN MEMORIA (vive mientras la instancia serverless esté caliente) ──
function ensureStore() {
    const discovered = discoverKeys();
    if (!global._groqKeyStore || global._groqKeyStore.length !== discovered.length) {
        global._groqKeyStore = discovered.map((k, idx) => ({
            index: idx,
            envName: k.envName,
            used: 0,
            calls: 0,
            blocked: false,
            lastBlockedAt: 0,
        }));
    }
    return global._groqKeyStore;
}

function resetExpiredBlocks(store) {
    const now = Date.now();
    store.forEach(k => {
        if (k.blocked && (now - k.lastBlockedAt) > BLOCK_COOLDOWN_MS) k.blocked = false;
    });
}

function pickKeyIndex(store) {
    resetExpiredBlocks(store);
    // 1) primera key libre (no bloqueada, con margen de tokens)
    for (const k of store) {
        if (!k.blocked && k.used < TOKEN_LIMIT_PER_KEY) return k.index;
    }
    // 2) si todas están bloqueadas/llenas, usar la de menor uso
    //    (mejor degradar que romper del todo)
    let best = -1, bestUsed = Infinity;
    store.forEach(k => { if (k.used < bestUsed) { bestUsed = k.used; best = k.index; } });
    return best;
}

/**
 * Llama a Groq rotando automáticamente entre TODAS las keys detectadas.
 * - Nunca hace más intentos que keys existentes → evita loops infinitos.
 * - Un 429 bloquea esa key por BLOCK_COOLDOWN_MS y rota a la siguiente,
 *   sin reintentar inmediatamente sobre la misma key.
 */
export async function callGroqWithRotation(payload) {
    const keys = discoverKeys();
    if (keys.length === 0) {
        const err = new Error("No hay ninguna GROQ_API_KEY configurada en Vercel.");
        err.code = "NO_KEYS";
        throw err;
    }

    const store = ensureStore();
    const maxAttempts = keys.length;
    let lastRateLimited = false;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const keyIndex = pickKeyIndex(store);
        if (keyIndex === -1 || !keys[keyIndex]) break;

        const apiKey = keys[keyIndex].value;
        let response;
        try {
            response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
        } catch (networkErr) {
            // Error de red: probamos la siguiente key en vez de morir acá
            lastRateLimited = false;
            continue;
        }

        if (response.status === 429) {
            store[keyIndex].blocked       = true;
            store[keyIndex].lastBlockedAt = Date.now();
            lastRateLimited = true;
            continue;
        }

        const data = await response.json();

        if (!response.ok) {
            // Error que no es 429 (ej: modelo inválido, 400, 500 de Groq):
            // no tiene sentido rotar infinitamente, se devuelve tal cual.
            return { response, data, keyIndex, keyLabel: `Key ${keyIndex + 1}` };
        }

        store[keyIndex].used  += data.usage?.total_tokens || 0;
        store[keyIndex].calls += 1;
        return { response, data, keyIndex, keyLabel: `Key ${keyIndex + 1}` };
    }

    const err = new Error(
        lastRateLimited
            ? "⚠️ Todas las API Keys de Groq alcanzaron su límite (429). Esperá unos minutos."
            : "No se pudo contactar a Groq con ninguna key disponible."
    );
    err.code = lastRateLimited ? "ALL_RATE_LIMITED" : "GROQ_ERROR";
    throw err;
}

/** Estado de todas las keys, para /api/keys-status */
export function getStatusSummary() {
    const store = ensureStore();
    resetExpiredBlocks(store);
    const currentIndex = pickKeyIndex(store);

    const keyList = store.map((k) => ({
        index: k.index,
        label: `Key ${k.index + 1}`,
        envName: k.envName,
        active: true, // si está en el store, es porque la variable existe
        blocked: k.blocked,
        isCurrent: k.index === currentIndex,
        used: k.used,
        limit: TOKEN_LIMIT_PER_KEY,
        remaining: Math.max(0, TOKEN_LIMIT_PER_KEY - k.used),
        pct: Math.min(100, Math.round((k.used / TOKEN_LIMIT_PER_KEY) * 100)),
        calls: k.calls,
    }));

    const totalUsed  = keyList.reduce((a, k) => a + k.used, 0);
    const totalLimit = keyList.length * TOKEN_LIMIT_PER_KEY;

    return {
        keys: keyList,
        summary: {
            keysConfigured: keyList.length,
            totalUsed,
            totalLimit,
            totalRemaining: Math.max(0, totalLimit - totalUsed),
            totalPct: totalLimit ? Math.min(100, Math.round((totalUsed / totalLimit) * 100)) : 0,
            activeKeyLabel: currentIndex >= 0 ? `Key ${currentIndex + 1}` : "—",
            timestamp: Date.now(),
        },
    };
}

export function keyCount() {
    return discoverKeys().length;
}
