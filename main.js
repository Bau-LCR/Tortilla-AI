export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

    const { mensajes } = req.body;
    const API_KEY = process.env.GROQ_API_KEY;

    // Modificamos el primer mensaje (el sistema) para darle el estilo Gemini
    if (mensajes && mensajes.length > 0) {
        mensajes[0].content = `Eres Tortilla-AI. Responde de forma seria, precisa y estructurada. 
        REGLAS DE FORMATO:
        - Usa **negritas** para conceptos importantes.
        - Usa listas con viñetas para enumerar.
        - Separa SIEMPRE los párrafos con saltos de línea dobles.
        - Si das instrucciones, usa numeración.
        - Mantén un tono profesional pero directo.`;
    }

    try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "llama-3.3-70b-versatile",
                messages: mensajes,
                temperature: 0.6
            })
        });

        const data = await response.json();
        if (!response.ok) return res.status(response.status).json({ error: data.error?.message || "Error en Groq" });

        res.status(200).json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}
