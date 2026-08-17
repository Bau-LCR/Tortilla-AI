// ============================================================
//  api/keys-status.js — Cut-real AI
//  Devuelve el estado de TODAS las API Keys detectadas (sin
//  límite fijo de 5). Nunca expone el valor real de ninguna key.
// ============================================================

import { getStatusSummary } from "./groq-client.js";

export default async function handler(req, res) {
    if (req.method !== "GET") {
        return res.status(405).json({ error: "Método no permitido" });
    }
    try {
        const data = getStatusSummary();
        return res.status(200).json(data);
    } catch (e) {
        return res.status(500).json({ error: e.message || "Error al obtener el estado de las keys." });
    }
}
