import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3000;

// ⚠️ PONÉ TU API KEY ACÁ
const API_KEY = "TU_API_KEY_AQUI";

app.post("/chat", async (req, res) => {
  const { mensaje } = req.body;

  try {
    const respuesta = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: mensaje }]
      })
    });

    const data = await respuesta.json();

    res.json({
      reply: data.choices?.[0]?.message?.content || "Error en IA"
    });

  } catch (error) {
    res.status(500).json({ error: "Error del servidor" });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
