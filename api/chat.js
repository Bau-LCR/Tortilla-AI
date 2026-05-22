export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Método no permitido" });
    }

    const { mensajes, hasImage, model: modelPref } = req.body;
    const API_KEY = process.env.GROQ_API_KEY;

    if (!API_KEY) {
        return res.status(500).json({ error: "API key no configurada en el servidor." });
    }
    if (!mensajes || !Array.isArray(mensajes)) {
        return res.status(400).json({ error: "El campo 'mensajes' es inválido." });
    }

    // ===== SELECCIÓN DE MODELO =====
    let model;
    if (hasImage) {
        // Imágenes siempre usan modelo con visión
        model = "meta-llama/llama-4-scout-17b-16e-instruct";
    } else if (modelPref === "basic") {
        // Modelo básico: rápido y liviano
        model = "llama-3.1-8b-instant";
    } else {
        // Modelo pro (default): más inteligente
        model = "llama-3.3-70b-versatile";
    }

    // ===== SYSTEM PROMPT =====
    const modelName = hasImage
        ? "Llama 4 Scout 17B (visión)"
        : modelPref === "basic"
        ? "Llama 3.1 8B Instant"
        : "Llama 3.3 70B Versatile";

    const systemContent = `Eres Cut-real AI, una Inteligencia Artificial desarrollada por Bautista utilizando servicios y proveedores gratuitos. Eres impulsada por el modelo ${modelName} a través de los servicios de Groq.

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
- Usá bloques de código (\`\`\`lenguaje\n...\n\`\`\`) para código o comandos.
- Tono: profesional pero accesible, sin ser excesivamente formal.
- Incluí fuentes o referencias cuando sea relevante.

© 2026 Cut-real AI. Todos los derechos reservados.`;

    // Reemplazar system prompt
    if (mensajes.length > 0 && mensajes[0].role === "system") {
        mensajes[0].content = systemContent;
    } else {
        mensajes.unshift({ role: "system", content: systemContent });
    }

    // Temperatura según modelo
    const temperature = modelPref === "basic" ? 0.5 : 0.65;
    const max_tokens = hasImage ? 1024 : 2048;

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
                temperature,
                max_tokens,
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            const status   = response.status;
            const errorMsg = data.error?.message || "Error desconocido en Groq";

            if (status === 429) {
                return res.status(429).json({
                    error: "Límite de consultas alcanzado. Groq tiene un límite diario en el plan gratuito. Esperá unos minutos antes de volver a intentarlo.",
                });
            }
            if (status === 404 || errorMsg.includes("model")) {
                return res.status(500).json({
                    error: "El modelo solicitado no está disponible. Intentá con una consulta de texto sin adjuntos.",
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
