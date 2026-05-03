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
                    { role: "system", content: "Eres Tortilla-AI..." },
                    { role: "user", content: mensaje }
                ]
            })
        });

        const data = await response.json();
        res.status(200).json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}
