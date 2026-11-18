// Cut-real AI · Gemini TTS proxy. The Gemini key stays on the server.
const VOICES = new Set(["Achernar","Achird","Algenib","Algieba","Alnilam","Aoede","Autonoe","Callirrhoe","Charon","Despina","Enceladus","Erinome","Fenrir","Gacrux","Iapetus","Kore","Laomedeia","Leda","Orus","Pulcherrima","Puck","Rasalgethi","Sadachbia","Sadaltager","Schedar","Sulafat","Umbriel","Vindemiatrix","Zephyr","Zubenelgenubi"]);

function getKeys() {
  const keys = [];
  if (process.env.GEMINI_API_KEY) keys.push(process.env.GEMINI_API_KEY);
  for (let i = 2; i <= 20; i++) {
    const value = process.env[`GEMINI_API_KEY_${i}`];
    if (value) keys.push(value);
  }
  return keys;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido." });
  const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  const voice = VOICES.has(req.body?.voice) ? req.body.voice : "Puck";
  const languageCode = typeof req.body?.languageCode === "string" && /^[a-z]{2}-[A-Z]{2}$/.test(req.body.languageCode) ? req.body.languageCode : "es-US";
  if (!text) return res.status(400).json({ error: "Falta el texto para convertir a voz." });
  if (text.length > 2600) return res.status(413).json({ error: "Dividí el texto en fragmentos más cortos." });
  const keys = getKeys();
  if (!keys.length) return res.status(503).json({ error: "Gemini TTS no está configurado: falta GEMINI_API_KEY en el servidor.", code: "VOICE_PROVIDER_NOT_CONFIGURED" });

  let lastError = "Gemini TTS no pudo generar audio.";
  for (const key of keys) {
    try {
      const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `Leé en español latinoamericano, con tono natural, claro y conversacional. Texto exacto: ${text}` }] }],
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              languageCode,
              voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } }
            }
          }
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        lastError = data?.error?.message || `Gemini respondió HTTP ${response.status}.`;
        if (response.status === 429 || response.status >= 500) continue;
        return res.status(response.status).json({ error: lastError, code: "GEMINI_TTS_REQUEST_FAILED" });
      }
      const part = data?.candidates?.[0]?.content?.parts?.find(item => item?.inlineData?.data || item?.inline_data?.data);
      const audio = part?.inlineData?.data || part?.inline_data?.data;
      if (!audio) {
        lastError = "Gemini respondió, pero no incluyó audio.";
        continue;
      }
      return res.status(200).json({ audio, sampleRate: 24000, voice, provider: "Gemini" });
    } catch (error) {
      lastError = error?.message || lastError;
    }
  }
  return res.status(502).json({ error: lastError, code: "GEMINI_TTS_UNAVAILABLE" });
}
