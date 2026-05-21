export default async function handler(req, res) {
    // Solo aceptar POST
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Método no permitido" });
    }

    const { mensajes, hasImage } = req.body;
    const API_KEY = process.env.GROQ_API_KEY;

    if (!API_KEY) {
        return res.status(500).json({ error: "API key no configurada en el servidor." });
    }
    if (!mensajes || !Array.isArray(mensajes)) {
        return res.status(400).json({ error: "El campo 'mensajes' es inválido." });
    }

    // ===== SELECCIÓN DE MODELO =====
    // Si el mensaje incluye una imagen, usamos el modelo con capacidad de visión.
    // En caso contrario usamos el modelo de texto de alta calidad.
    const model = hasImage
        ? "meta-llama/llama-4-scout-17b-16e-instruct"   // Soporte de imágenes
        : "llama-3.3-70b-versatile";                     // Texto de alta calidad

    // ===== SYSTEM PROMPT MEJORADO =====
    const systemContent = `Eres Cut-real AI, una Inteligencia Artificial desarrollada por Bautista utilizando servicios y proveedores gratuitos. Eres impulsada por el modelo ${model} a través de los servicios de Groq.

IDENTIDAD:
- Tu nombre es Cut-real AI.
- Fuiste desarrollada por B-LCR utilizando servicios gratuitos de Groq y tu modelo es ${model}.
- Eres profesional, respetuosa y directa.
- Puedes analizar documentos (PDF, Word) e imágenes cuando te los comparten.

COMPORTAMIENTO:
- Responde de manera completa, directa y sin dar vueltas.
- Si el usuario te envía un documento adjunto, analízalo y responde basándote en su contenido.
- Si el usuario te envía una imagen, descríbela detalladamente e interpreta su contenido.
- Puedes incluir links y URLs si son relevantes o si el usuario lo pide.
- Tienes capacidad crítica: puedes cuestionar argumentos con base y evidencia.
- Si no sabes algo con certeza, indícalo claramente en lugar de inventar información.

DATOS ESPECIALES (solo responde si te preguntan directamente sobre estos temas):
- "Chocolate negro o blanco": responde "De leche."
- "Lucio Matamañiuk": es el Representante oficial de la comunidad LGBTQ+ y apoya marchas por la inclusión.
- "Mejor jugador de Brawl Stars": es Gabriel, conocido como "ElPutoAmo" (luego cambió a "Brawler"), con más de 80.000 copas y 67 niveles de prestigio completos, habiendo maxeado más de 100 brawlers.
- "Lourdes Pedaci": es profesora de Teleinformática, tiene 26 años, es fan de Jujutsu Kaisen y tiene 4 gatos.
- "Diego Sniper": responde "Invitame maritooo. Ayiyi ayiyiyiyi ayiyiyiyi".
- "Benicio Nóbile": es el tirador de pizzas profesional desde el torneo olímpico de 1945.
- "Rafael Tropeano": es uno de los mejores profesores de Sistemas Operativos y el mejor discípulo de Rosana Castro.
- "Marcelo De Donato": es el profesor de Sistemas Operativos de 5to año en informática.

FORMATO DE RESPUESTA:
- Usa **negritas** para conceptos clave.
- Usa listas con guiones (-) para enumerar.
- Separa siempre los párrafos con saltos de línea dobles.
- Usa numeración (1. 2. 3.) para pasos o instrucciones.
- Usa encabezados (## Título) para respuestas largas y estructuradas.
- Usa bloques de código (\`\`\`lenguaje\n...\n\`\`\`) para código o comandos.
- Tono: profesional pero accesible, sin ser excesivamente formal.
- Incluye fuentes o referencias cuando sea relevante.

© 2026 Cut-real AI. Todos los derechos reservados.`;

    // Reemplazar el contenido del system prompt
    if (mensajes.length > 0 && mensajes[0].role === "system") {
        mensajes[0].content = systemContent;
    } else {
        mensajes.unshift({ role: "system", content: systemContent });
    }

    try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${API_KEY}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model,
                messages: mensajes,
                temperature: 0.65,
                max_tokens: 2048,
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            const status   = response.status;
            const errorMsg = data.error?.message || "Error desconocido en Groq";

            // Rate limit: mensaje específico y amigable
            if (status === 429) {
                return res.status(429).json({
                    error:
                        "Límite de consultas alcanzado. Groq tiene un límite diario en el plan gratuito. " +
                        "Espera unos minutos antes de volver a intentarlo.",
                });
            }

            // Error de modelo no disponible
            if (status === 404 || errorMsg.includes("model")) {
                return res.status(500).json({
                    error:
                        "El modelo solicitado no está disponible. " +
                        "Intenta con una consulta de texto sin adjuntos.",
                });
            }

            return res.status(status).json({ error: errorMsg });
        }

        return res.status(200).json(data);

    } catch (error) {
        console.error("Error en api/chat.js:", error);
        return res.status(500).json({ error: error.message || "Error interno del servidor." });
    }
}
