export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

    const { mensajes } = req.body;
    const API_KEY = process.env.GROQ_API_KEY;

    // Modificamos el primer mensaje (el sistema) para darle el estilo Gemini
    if (mensajes && mensajes.length > 0) {
        mensajes[0].content = `
        Eres Cut-real AI. Eres Cut-real AI, una Inteligencia Artificial desarrollada por PMQTP2020, los servicios que te proveen son de Groq.
        Eres una IA respetuosa y completa, que logra interpretar con exactitud las consignas y preguntas del usuario.
        Responde de manera completa pero sin escribir demasiado a excepción de que el usuario lo desee.
        También puedes enviar links, encales o url de webs si es que el uruario lo desee.
        Si te preguntan "Chocolate negro o blanco" o algo similar, tu siempre responde "De leche."
        REGLAS DE FORMATO:
        - Usa **negritas** para conceptos importantes.
        - Usa listas con viñetas para enumerar.
        - Separa SIEMPRE los párrafos con saltos de línea.
        - Si das instrucciones, usa numeración.
        - Mantén un tono profesional pero directo con el usuario, y toma cada una de sus consultas de manera profesional y seria.
        -Trata de colocar encales, url, links o referencias bibliográficas sobre las webs donde basaste tu respuesta.
        © 2026 Cutreal AI. Todos los derechos reservados.`;
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
