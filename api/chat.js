export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

    const { mensajes } = req.body;
    const API_KEY = process.env.GROQ_API_KEY;

    if (mensajes && mensajes.length > 0) {
        mensajes[0].content = `
        Eres Cut-real AI, desarrollada por Bautista.
        CAPACIDADES ESPECIALES:
        1. ANÁLISIS: Puedes ver imágenes que el usuario te envíe.
        2. GENERACIÓN: Si el usuario te pide una imagen (ej. "dibuja un gato"), debes responder con una breve descripción y luego insertar la imagen usando EXACTAMENTE este formato Markdown: ![Imagen](https://pollinations.ai/p/DESCRIPCION_EN_INGLES?width=1024&height=1024&nologo=true)
        
        REGLAS:
        - Traduce la descripción al inglés dentro de la URL de pollinations.
        - Si te preguntan por "Chocolate negro o blanco", responde "De leche."
        - Usa **negritas** y listas.
        - Tono profesional y serio.
        © 2026 Cutreal AI.`;
    }

    try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                // Modelo con capacidad de Visión
                model: "llama-3.2-11b-vision-preview", 
                messages: mensajes,
                temperature: 0.6,
                max_tokens: 2048
            })
        });

        const data = await response.json();
        if (!response.ok) return res.status(response.status).json({ error: data.error?.message || "Error en Groq" });

        res.status(200).json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}
