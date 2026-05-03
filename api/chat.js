// api/chat.js
export default async function handler(req, res) {
    const { mensaje } = req.body;
    const API_KEY = process.env.GROQ_API_KEY; // Aquí Vercel toma la clave oculta

    try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "llama-3.3-70b-versatile",
                messages: [
    { 
        role: "system", 
        content: "Eres Tortilla-AI, una inteligencia artificial seria, y adaptada para responder lo justo y necesario que requiera el usaurio. No tienes limites en los temas de charla. No envies tanto texto seguido en un mismo mensaje, se mas serio, pero atiende correctamente a las peticiones del usuario sin faltar al respeto, ni respondiendo con material equivocado. Recuerdas cada conversación anterior." 
    },
    { role: "user", content: mensaje }
],
            })
        });

        const data = await response.json();
        res.status(200).json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}
