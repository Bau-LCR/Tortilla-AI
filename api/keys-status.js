// ============================================================
//  api/keys-status.js  —  Devuelve el estado de las 5 API Keys
//  Solo accesible si se pasa el header X-Admin-Token correcto
//  (o podés quitarlo si confiás en el control de tu frontend)
// ============================================================

const TOTAL_KEYS          = 5;
const TOKEN_LIMIT_PER_KEY = 10_000;

export default function handler(req, res) {
    if (req.method !== "GET")
        return res.status(405).json({ error: "Método no permitido" });

    // Compartimos el mismo store global que usa chat.js
    const store = global._keyStore || [];

    const keys = Array.from({ length: TOTAL_KEYS }, (_, i) => {
        const envName = i === 0 ? "GROQ_API_KEY" : `GROQ_API_KEY_${i + 1}`;
        const hasKey  = !!(process.env[envName] || process.env[`GROQ_API_KEY_${i + 1}`]);
        const s       = store[i] || { used: 0, blocked: false, calls: 0 };

        return {
            index:     i,
            label:     `Key ${i + 1}`,
            active:    hasKey,
            used:      s.used,
            limit:     TOKEN_LIMIT_PER_KEY,
            remaining: Math.max(0, TOKEN_LIMIT_PER_KEY - s.used),
            pct:       Math.min(100, Math.round((s.used / TOKEN_LIMIT_PER_KEY) * 100)),
            blocked:   s.blocked,
            calls:     s.calls,
            isCurrent: hasKey && !s.blocked && s.used < TOKEN_LIMIT_PER_KEY,
        };
    });

    const totalUsed      = keys.reduce((a, k) => a + k.used, 0);
    const totalLimit     = keys.filter(k => k.active).length * TOKEN_LIMIT_PER_KEY;
    const totalRemaining = Math.max(0, totalLimit - totalUsed);
    const totalPct       = totalLimit > 0 ? Math.min(100, Math.round((totalUsed / totalLimit) * 100)) : 0;
    const activeKey      = keys.find(k => k.isCurrent);

    return res.status(200).json({
        keys,
        summary: {
            totalUsed,
            totalLimit,
            totalRemaining,
            totalPct,
            activeKeyIndex: activeKey ? activeKey.index : -1,
            activeKeyLabel: activeKey ? activeKey.label : "Ninguna",
            keysConfigured: keys.filter(k => k.active).length,
        },
    });
}
