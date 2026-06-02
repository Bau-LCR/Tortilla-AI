// ============================================================
//  api/keys-status.js  —  Cut-real AI
//  Devuelve el estado actual de las 5 API Keys para el panel
//  de administración. Lee del mismo global._keyStore que usa
//  chat.js (comparten memoria en la misma instancia Vercel).
// ============================================================

const TOTAL_KEYS          = 5;
const TOKEN_LIMIT_PER_KEY = 10_000;

function getApiKey(index) {
    if (index === 0) return process.env.GROQ_API_KEY || process.env.GROQ_API_KEY_1 || null;
    return process.env[`GROQ_API_KEY_${index + 1}`] || null;
}

export default function handler(req, res) {
    // CORS para que el frontend pueda consumirlo
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Cache-Control", "no-store");

    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method !== "GET")     return res.status(405).json({ error: "Método no permitido" });

    // Inicializar keyStore si todavía no existe (primera llamada)
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

    // Encontrar cuál es la key activa actualmente
    let currentKeyIndex = -1;
    for (let i = 0; i < TOTAL_KEYS; i++) {
        const key = getApiKey(i);
        if (!key) continue;
        const s = keyStore[i];
        if (!s.blocked && s.used < TOKEN_LIMIT_PER_KEY) {
            currentKeyIndex = i;
            break;
        }
    }
    // Si todas bloqueadas, usar la de menor uso
    if (currentKeyIndex === -1) {
        let best = -1, bestUsed = Infinity;
        for (let i = 0; i < TOTAL_KEYS; i++) {
            if (!getApiKey(i)) continue;
            if (keyStore[i].used < bestUsed) { bestUsed = keyStore[i].used; best = i; }
        }
        currentKeyIndex = best;
    }

    // Construir respuesta
    let totalUsed  = 0;
    let totalLimit = 0;
    let keysConfigured = 0;

    const keys = Array.from({ length: TOTAL_KEYS }, (_, i) => {
        const apiKey  = getApiKey(i);
        const active  = !!apiKey;
        const store   = keyStore[i];
        const used    = active ? store.used    : 0;
        const calls   = active ? store.calls   : 0;
        const blocked = active ? store.blocked : false;
        const limit   = TOKEN_LIMIT_PER_KEY;
        const remaining = Math.max(0, limit - used);
        const pct     = active ? Math.min(100, Math.round((used / limit) * 100)) : 0;

        if (active) {
            keysConfigured++;
            totalUsed  += used;
            totalLimit += limit;
        }

        return {
            index:     i,
            label:     `Key ${i + 1}`,
            active,
            blocked,
            isCurrent: active && i === currentKeyIndex,
            used,
            remaining,
            calls,
            limit,
            pct,
            lastReset: store.lastReset,
        };
    });

    const totalPct       = totalLimit > 0 ? Math.min(100, Math.round((totalUsed / totalLimit) * 100)) : 0;
    const totalRemaining = Math.max(0, totalLimit - totalUsed);
    const activeKey      = keys.find(k => k.isCurrent);

    return res.status(200).json({
        keys,
        summary: {
            keysConfigured,
            totalUsed,
            totalLimit,
            totalRemaining,
            totalPct,
            activeKeyIndex: currentKeyIndex,
            activeKeyLabel: activeKey ? activeKey.label : "Ninguna",
            timestamp: Date.now(),
        },
    });
}
